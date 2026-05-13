import { Capacitor } from '@capacitor/core';
import { getAppVersion, logAppUpdateEvent, type AppVersionResponse } from '@/lib/backendApi';
import { readUpgradeReport } from '@/lib/appUpgrade';

export const CLIENT_APP_VERSION = import.meta.env.VITE_APP_VERSION || __APP_VERSION__ || '0.0.0';
export const LAST_SEEN_SERVER_VERSION_KEY = 'kaffepos_last_seen_server_version';
export const LAST_VERSION_CHECK_KEY = 'kaffepos_last_version_check';

export type AppPlatform = 'web' | 'apk' | 'android' | 'ios' | 'unknown';

export function getAppPlatform(): AppPlatform {
  if (!Capacitor.isNativePlatform()) return 'web';
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return 'apk';
  if (platform === 'ios') return 'ios';
  return 'unknown';
}

export function readLastSeenServerVersion() {
  try {
    return localStorage.getItem(LAST_SEEN_SERVER_VERSION_KEY);
  } catch {
    return null;
  }
}

export function rememberServerVersion(version: string) {
  try {
    localStorage.setItem(LAST_SEEN_SERVER_VERSION_KEY, version);
    localStorage.setItem(LAST_VERSION_CHECK_KEY, new Date().toISOString());
  } catch {
    // ignore storage write failure
  }
}

export async function checkRemoteAppVersion() {
  const platform = getAppPlatform();
  const response = await getAppVersion({ clientVersion: CLIENT_APP_VERSION, platform });
  return { response, platform };
}

export async function logSafeUpdateEvent(input: {
  storeId?: string | null | undefined;
  eventName:
    | 'version_checked'
    | 'update_detected'
    | 'client_storage_migrated'
    | 'post_update_sync_started'
    | 'post_update_sync_completed'
    | 'post_update_sync_failed';
  version: AppVersionResponse;
  platform: AppPlatform;
  metadata?: Record<string, unknown>;
}) {
  try {
    const migrationReport = readUpgradeReport();
    await logAppUpdateEvent({
      ...(input.storeId ? { store_id: input.storeId } : {}),
      event_name: input.eventName,
      client_version: CLIENT_APP_VERSION,
      server_version: input.version.appVersion,
      platform: input.platform,
      update_mode: input.version.updateMode,
      migration_report: migrationReport ? (migrationReport as unknown as Record<string, unknown>) : {},
      metadata: {
        databaseSchemaVersion: input.version.databaseSchemaVersion,
        releaseChannel: input.version.releaseChannel,
        ...input.metadata,
      },
    });
  } catch {
    // Update telemetry must never block app startup.
  }
}
