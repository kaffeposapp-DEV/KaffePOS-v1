import express from 'express';
import { z } from 'zod';
import { env } from '../core/env';
import { pool, withTransaction } from '../core/db';
import { assertStoreOwned } from '../core/helpers';

const publicRouter = express.Router();
const authenticatedRouter = express.Router();

const platformSchema = z.enum(['web', 'android', 'apk', 'ios', 'unknown']).default('web');

const updateEventSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  event_name: z.enum([
    'version_checked',
    'update_detected',
    'client_storage_migrated',
    'post_update_sync_started',
    'post_update_sync_completed',
    'post_update_sync_failed',
  ]),
  client_version: z.string().trim().max(80).optional().nullable(),
  server_version: z.string().trim().max(80).optional().nullable(),
  platform: platformSchema,
  update_mode: z.enum(['none', 'soft', 'hard']).default('none'),
  migration_report: z.record(z.string(), z.unknown()).optional().default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

function parseVersion(value: string | null | undefined) {
  return String(value || '0.0.0')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => {
      const parsed = Number.parseInt(part.replace(/\D/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function compareVersions(left: string | null | undefined, right: string | null | undefined) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isApkPlatform(platform: string) {
  return platform === 'apk' || platform === 'android';
}

function resolveMinimumSupportedVersion(rowValue: unknown, envValue: string) {
  const dbValue = typeof rowValue === 'string' ? rowValue : '';
  return compareVersions(dbValue, envValue) >= 0 ? dbValue : envValue;
}

async function readVersionState() {
  const tables = await pool.query(`
    select
      to_regclass('public.schema_migrations') as schema_migrations_table,
      to_regclass('public.app_versions') as app_versions_table
  `);
  const hasSchemaMigrations = Boolean(tables.rows[0]?.schema_migrations_table);
  const hasAppVersions = Boolean(tables.rows[0]?.app_versions_table);
  const schemaResult = hasSchemaMigrations
    ? await pool.query('select version from public.schema_migrations order by applied_at desc limit 1')
    : { rows: [] };
  const appVersionResult = hasAppVersions
    ? await pool.query(`
        select
          version,
          update_policy,
          min_supported_web_version,
          min_supported_apk_version,
          release_channel,
          release_notes
        from public.app_versions
        order by created_at desc
        limit 1
      `)
    : { rows: [] };
  const row = appVersionResult.rows[0] || {};
  const schemaRow = schemaResult.rows[0] || {};
  const minSupportedWebVersion = resolveMinimumSupportedVersion(
    row.min_supported_web_version,
    env.MIN_SUPPORTED_WEB_VERSION,
  );
  const minSupportedApkVersion = resolveMinimumSupportedVersion(
    row.min_supported_apk_version,
    env.MIN_SUPPORTED_APK_VERSION,
  );
  return {
    appVersion: String(row.version || env.APP_VERSION),
    databaseSchemaVersion: typeof schemaRow.version === 'string' ? schemaRow.version : null,
    updatePolicy: (row.update_policy === 'hard' || row.update_policy === 'soft' || row.update_policy === 'none')
      ? row.update_policy
      : 'soft',
    minSupportedWebVersion,
    minSupportedApkVersion,
    releaseChannel: String(row.release_channel || env.APP_RELEASE_CHANNEL),
    releaseNotes: typeof row.release_notes === 'string' ? row.release_notes : null,
  };
}

function resolveUpdateMode(input: {
  clientVersion: string | null;
  platform: string;
  appVersion: string;
  updatePolicy: 'none' | 'soft' | 'hard';
  minSupportedWebVersion: string;
  minSupportedApkVersion: string;
}) {
  if (!input.clientVersion) return 'none';
  const minSupportedVersion = isApkPlatform(input.platform)
    ? input.minSupportedApkVersion
    : input.minSupportedWebVersion;
  if (compareVersions(input.clientVersion, minSupportedVersion) < 0) return 'hard';
  if (compareVersions(input.clientVersion, input.appVersion) < 0) {
    return input.updatePolicy === 'hard' ? 'hard' : 'soft';
  }
  return 'none';
}

publicRouter.get('/api/app/version', async (req, res, next) => {
  try {
    const platform = platformSchema.catch('web').parse(req.query.platform);
    const clientVersion = typeof req.query.clientVersion === 'string' ? req.query.clientVersion.trim() : null;
    const versionState = await readVersionState();
    const updateMode = resolveUpdateMode({
      clientVersion,
      platform,
      appVersion: versionState.appVersion,
      updatePolicy: versionState.updatePolicy,
      minSupportedWebVersion: versionState.minSupportedWebVersion,
      minSupportedApkVersion: versionState.minSupportedApkVersion,
    });

    res.json({
      ok: true,
      appVersion: versionState.appVersion,
      apiVersion: env.APP_VERSION,
      databaseSchemaVersion: versionState.databaseSchemaVersion,
      releaseChannel: versionState.releaseChannel,
      releaseNotes: versionState.releaseNotes,
      updateMode,
      hardUpdateRequired: updateMode === 'hard',
      softUpdateAvailable: updateMode === 'soft',
      minimumSupportedVersion: isApkPlatform(platform)
        ? versionState.minSupportedApkVersion
        : versionState.minSupportedWebVersion,
      sync: {
        postUpdateSyncRecommended: updateMode !== 'none',
        migrationEndpoint: '/api/app/update-events',
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

authenticatedRouter.post('/api/app/update-events', async (req, res, next) => {
  try {
    const payload = updateEventSchema.parse(req.body ?? {});
    await withTransaction(async (client) => {
      if (payload.store_id) {
        await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      }
      await client.query(
        `
          insert into public.app_update_events (
            user_id, store_id, event_name, client_version, server_version, platform, update_mode, migration_report, metadata
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb
          )
        `,
        [
          req.authUser!.id,
          payload.store_id ?? null,
          payload.event_name,
          payload.client_version ?? null,
          payload.server_version ?? null,
          payload.platform,
          payload.update_mode,
          JSON.stringify(payload.migration_report),
          JSON.stringify(payload.metadata),
        ],
      );
    });

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export { publicRouter as appVersionPublicRouter, authenticatedRouter as appVersionAuthenticatedRouter };
