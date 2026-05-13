import { DEFAULT_CUSTOM_THEME, THEME_PRESETS, evaluateCustomTheme, type CustomThemeConfig, type ThemePresetId } from '@/lib/theme';
import { ensureStoredAuthSessionShape } from '@/lib/authSession';

export const STORAGE_SCHEMA_VERSION = 3;
export const STORAGE_META_KEY = 'kaffepos_storage_meta';
export const APP_UPDATE_REPORT_KEY = 'kaffepos_update_report';
export const POST_UPDATE_SYNC_PENDING_KEY = 'kaffepos_post_update_sync_pending';
export const APP_PRESERVED_STORAGE_KEYS = [STORAGE_META_KEY, APP_UPDATE_REPORT_KEY, POST_UPDATE_SYNC_PENDING_KEY];

const APP_DATA_PREFIXES = ['kpos_', 'kaffepos_', 'kaffe_'];
const RECOVERY_PREFIX = 'kaffepos_recovery_';
const LEGACY_BT_MAC_KEY = 'kpos_bt_mac';
const BT_PRINTER_KEY = 'kaffepos_bt_printer';
const PAPER_SIZE_KEY = 'kaffepos_paper_size';
const PRINT_METHOD_KEY = 'kpos_print_method';
const THEME_KEY = 'kpos_app_theme';
const CUSTOM_THEME_KEY = 'kpos_app_theme_custom';
const SUBSCRIPTION_CACHE_KEY = 'kaffepos_sub_v2';
const SUBSCRIPTION_TX_KEY = 'kaffepos_tx_month';
const VALID_THEME_IDS = new Set<ThemePresetId>(THEME_PRESETS.map((theme) => theme.id));
const VALID_PRINT_METHODS = new Set(['browser', 'bluetooth', 'usb']);
const CURRENT_APP_VERSION = import.meta.env.VITE_APP_VERSION || __APP_VERSION__ || '0.0.0';

type StorageMeta = {
  schemaVersion: number;
  appVersion: string | null;
  previousAppVersion: string | null;
  lastMigrationAt: string | null;
  lastMigrationError: string | null;
  updatedAt: string | null;
};

export type AppUpgradeReport = {
  currentAppVersion: string;
  previousAppVersion: string | null;
  schemaVersionBefore: number;
  schemaVersionAfter: number;
  firstLaunchAfterUpdate: boolean;
  syncRecommended: boolean;
  migrationsRun: number[];
  migratedKeys: string[];
  recoveredKeys: string[];
  errors: string[];
};

let lastUpgradeReport: AppUpgradeReport | null = null;

function createDefaultMeta(): StorageMeta {
  return {
    schemaVersion: 0,
    appVersion: null,
    previousAppVersion: null,
    lastMigrationAt: null,
    lastMigrationError: null,
    updatedAt: null,
  };
}

function readMeta(): StorageMeta {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY);
    if (!raw) return createDefaultMeta();
    const parsed = JSON.parse(raw) as Partial<StorageMeta>;
    return {
      schemaVersion: typeof parsed.schemaVersion === 'number' && Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 0,
      appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null,
      previousAppVersion: typeof parsed.previousAppVersion === 'string' ? parsed.previousAppVersion : null,
      lastMigrationAt: typeof parsed.lastMigrationAt === 'string' ? parsed.lastMigrationAt : null,
      lastMigrationError: typeof parsed.lastMigrationError === 'string' ? parsed.lastMigrationError : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return createDefaultMeta();
  }
}

function writeMeta(meta: StorageMeta) {
  localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
}

function persistReport(report: AppUpgradeReport) {
  try {
    localStorage.setItem(APP_UPDATE_REPORT_KEY, JSON.stringify({ ...report, updatedAt: new Date().toISOString() }));
  } catch {
    // ignore
  }
}

function setPostUpdateSyncPending(pending: boolean) {
  try {
    if (pending) localStorage.setItem(POST_UPDATE_SYNC_PENDING_KEY, '1');
    else localStorage.removeItem(POST_UPDATE_SYNC_PENDING_KEY);
  } catch {
    // ignore
  }
}

function archiveCorruptedKey(key: string, reason: string, recoveredKeys: string[]) {
  const raw = localStorage.getItem(key);
  if (raw === null) return;
  try {
    localStorage.setItem(`${RECOVERY_PREFIX}${key}`, JSON.stringify({
      key,
      raw,
      reason,
      archivedAt: new Date().toISOString(),
      appVersion: CURRENT_APP_VERSION,
    }));
  } catch {
    // ignore archival write failure
  }
  localStorage.removeItem(key);
  recoveredKeys.push(key);
}

function backupCriticalLocalStorage(report: AppUpgradeReport) {
  try {
    const snapshot: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!APP_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
    if (Object.keys(snapshot).length === 0) return;
    localStorage.setItem(`${RECOVERY_PREFIX}pre_migration_snapshot`, JSON.stringify({
      appVersion: CURRENT_APP_VERSION,
      schemaVersionBefore: report.schemaVersionBefore,
      createdAt: new Date().toISOString(),
      keys: snapshot,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup local storage gagal.';
    report.errors.push(message);
  }
}

function hasPersistedAppData() {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (APP_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  return false;
}

function normalizeThemePreferences(report: AppUpgradeReport) {
  const rawTheme = localStorage.getItem(THEME_KEY);
  const normalizedTheme = VALID_THEME_IDS.has(rawTheme as ThemePresetId) ? (rawTheme as ThemePresetId) : 'classic';
  if (rawTheme !== normalizedTheme) {
    localStorage.setItem(THEME_KEY, normalizedTheme);
    report.migratedKeys.push(THEME_KEY);
  }

  const rawCustomTheme = localStorage.getItem(CUSTOM_THEME_KEY);
  if (!rawCustomTheme) {
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(DEFAULT_CUSTOM_THEME));
    report.migratedKeys.push(CUSTOM_THEME_KEY);
    return;
  }

  try {
    const parsed = JSON.parse(rawCustomTheme) as Partial<CustomThemeConfig>;
    const normalized = evaluateCustomTheme(parsed).theme;
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(normalized));
      report.migratedKeys.push(CUSTOM_THEME_KEY);
    }
  } catch {
    archiveCorruptedKey(CUSTOM_THEME_KEY, 'Invalid custom theme JSON', report.recoveredKeys);
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(DEFAULT_CUSTOM_THEME));
    report.migratedKeys.push(CUSTOM_THEME_KEY);
  }
}

function normalizePrinterPreferences(report: AppUpgradeReport) {
  const legacyMac = localStorage.getItem(LEGACY_BT_MAC_KEY);
  const rawPrinter = localStorage.getItem(BT_PRINTER_KEY);

  if (!rawPrinter && legacyMac) {
    localStorage.setItem(BT_PRINTER_KEY, JSON.stringify({
      name: 'Printer Tersimpan',
      address: legacyMac,
    }));
    report.migratedKeys.push(BT_PRINTER_KEY);
  }

  if (rawPrinter) {
    try {
      const parsed = JSON.parse(rawPrinter) as { name?: unknown; address?: unknown };
      if (typeof parsed.address !== 'string' || parsed.address.trim().length === 0) {
        throw new Error('Missing printer address');
      }
      const normalized = {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Printer Tersimpan',
        address: parsed.address.trim(),
      };
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        localStorage.setItem(BT_PRINTER_KEY, JSON.stringify(normalized));
        report.migratedKeys.push(BT_PRINTER_KEY);
      }
    } catch {
      archiveCorruptedKey(BT_PRINTER_KEY, 'Invalid bluetooth printer payload', report.recoveredKeys);
      if (legacyMac) {
        localStorage.setItem(BT_PRINTER_KEY, JSON.stringify({
          name: 'Printer Tersimpan',
          address: legacyMac,
        }));
        report.migratedKeys.push(BT_PRINTER_KEY);
      }
    }
  }

  const paperSize = localStorage.getItem(PAPER_SIZE_KEY);
  if (paperSize !== '58' && paperSize !== '80') {
    localStorage.setItem(PAPER_SIZE_KEY, '58');
    report.migratedKeys.push(PAPER_SIZE_KEY);
  }

  const printMethod = localStorage.getItem(PRINT_METHOD_KEY);
  if (printMethod && !VALID_PRINT_METHODS.has(printMethod)) {
    localStorage.setItem(PRINT_METHOD_KEY, 'browser');
    report.migratedKeys.push(PRINT_METHOD_KEY);
  }
}

function normalizeSubscriptionCache(report: AppUpgradeReport) {
  const rawSubscriptionCache = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
  if (rawSubscriptionCache) {
    try {
      const parsed = JSON.parse(rawSubscriptionCache) as {
        status?: Record<string, unknown>;
        savedAt?: unknown;
      };
      const status = parsed.status ?? {};
      const normalized = {
        savedAt: typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : Date.now(),
        status: {
          plan: typeof status.plan === 'string' ? status.plan : 'secangkir',
          isActive: Boolean(status.isActive),
          expiryDate: typeof status.expiryDate === 'string' ? status.expiryDate : null,
          transactionCount: Number.isFinite(status.transactionCount) ? Math.max(0, Math.trunc(Number(status.transactionCount))) : 0,
          transactionLimit: Number.isFinite(status.transactionLimit) ? Number(status.transactionLimit) : 50,
          daysRemaining: Number.isFinite(status.daysRemaining) ? Number(status.daysRemaining) : null,
        },
      };
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(normalized));
        report.migratedKeys.push(SUBSCRIPTION_CACHE_KEY);
      }
    } catch {
      archiveCorruptedKey(SUBSCRIPTION_CACHE_KEY, 'Invalid subscription cache payload', report.recoveredKeys);
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const rawTxCounter = localStorage.getItem(SUBSCRIPTION_TX_KEY);
  if (!rawTxCounter) {
    localStorage.setItem(SUBSCRIPTION_TX_KEY, JSON.stringify({ count: 0, month: currentMonth }));
    report.migratedKeys.push(SUBSCRIPTION_TX_KEY);
    return;
  }

  try {
    const parsed = JSON.parse(rawTxCounter) as { count?: unknown; month?: unknown };
    const normalized = {
      count: Number.isFinite(parsed.count) ? Math.max(0, Math.trunc(Number(parsed.count))) : 0,
      month: typeof parsed.month === 'string' && /^\d{4}-\d{2}$/.test(parsed.month) ? parsed.month : currentMonth,
    };
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      localStorage.setItem(SUBSCRIPTION_TX_KEY, JSON.stringify(normalized));
      report.migratedKeys.push(SUBSCRIPTION_TX_KEY);
    }
  } catch {
    archiveCorruptedKey(SUBSCRIPTION_TX_KEY, 'Invalid monthly transaction cache', report.recoveredKeys);
    localStorage.setItem(SUBSCRIPTION_TX_KEY, JSON.stringify({ count: 0, month: currentMonth }));
    report.migratedKeys.push(SUBSCRIPTION_TX_KEY);
  }
}

async function normalizeAuthSession(report: AppUpgradeReport) {
  const result = await ensureStoredAuthSessionShape();
  if (result === 'cleared') {
    report.recoveredKeys.push('kaffepos_auth_session');
  }
}

const migrations = [
  { version: 1, run: normalizeThemePreferences },
  { version: 2, run: normalizePrinterPreferences },
  { version: 3, run: normalizeSubscriptionCache },
] as const;

export async function runAppUpgradeBootstrap(): Promise<AppUpgradeReport> {
  const metaBefore = readMeta();
  const previousAppVersion = metaBefore.appVersion ?? (hasPersistedAppData() ? 'legacy' : null);
  const firstLaunchAfterUpdate = Boolean(previousAppVersion && previousAppVersion !== CURRENT_APP_VERSION);
  const report: AppUpgradeReport = {
    currentAppVersion: CURRENT_APP_VERSION,
    previousAppVersion,
    schemaVersionBefore: metaBefore.schemaVersion,
    schemaVersionAfter: metaBefore.schemaVersion,
    firstLaunchAfterUpdate,
    syncRecommended: false,
    migrationsRun: [],
    migratedKeys: [],
    recoveredKeys: [],
    errors: [],
  };

  let schemaVersion = metaBefore.schemaVersion;

  try {
    backupCriticalLocalStorage(report);
    for (const migration of migrations) {
      if (schemaVersion >= migration.version) continue;
      migration.run(report);
      report.migrationsRun.push(migration.version);
      schemaVersion = migration.version;
    }

    await normalizeAuthSession(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage migration error';
    report.errors.push(message);
    console.error('[Upgrade] storage migration failed', error);
  }

  report.schemaVersionAfter = schemaVersion;
  report.syncRecommended = report.firstLaunchAfterUpdate || report.migrationsRun.length > 0 || report.recoveredKeys.length > 0;
  setPostUpdateSyncPending(report.syncRecommended);

  const nowIso = new Date().toISOString();
  writeMeta({
    schemaVersion,
    appVersion: CURRENT_APP_VERSION,
    previousAppVersion: report.firstLaunchAfterUpdate ? previousAppVersion : metaBefore.previousAppVersion,
    lastMigrationAt: nowIso,
    lastMigrationError: report.errors[0] ?? null,
    updatedAt: nowIso,
  });
  persistReport(report);

  if (report.firstLaunchAfterUpdate) {
    console.info('[Upgrade] detected app update', {
      previousAppVersion: report.previousAppVersion,
      currentAppVersion: report.currentAppVersion,
      schemaVersionBefore: report.schemaVersionBefore,
      schemaVersionAfter: report.schemaVersionAfter,
    });
  }

  if (report.migrationsRun.length > 0 || report.recoveredKeys.length > 0) {
    console.info('[Upgrade] storage bootstrap completed', {
      migrationsRun: report.migrationsRun,
      migratedKeys: report.migratedKeys,
      recoveredKeys: report.recoveredKeys,
      errors: report.errors,
    });
  }

  lastUpgradeReport = report;
  return report;
}

export function getLastUpgradeReport() {
  return lastUpgradeReport;
}

export function readUpgradeReport(): AppUpgradeReport | null {
  if (lastUpgradeReport) return lastUpgradeReport;

  try {
    const raw = localStorage.getItem(APP_UPDATE_REPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUpgradeReport;
    lastUpgradeReport = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function isPostUpdateSyncPending() {
  try {
    return localStorage.getItem(POST_UPDATE_SYNC_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPostUpdateSyncComplete() {
  setPostUpdateSyncPending(false);
}
