import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const CRITICAL_STORAGE_BACKUP_KEY = 'kaffepos_local_backup_v1';
const CRITICAL_EXACT_KEYS = new Set([
  'kpos_app_theme',
  'kpos_app_theme_custom',
  'kpos_print_method',
  'kaffepos_bt_printer',
  'kaffepos_paper_size',
  'kpos_last_tab',
  'kaffepos_registered_email',
  'kaffepos_sub_v2',
  'kaffepos_tx_month',
  'kaffepos_active_user_id',
  'kpos_opening_offline_queue',
  'kpos_last_opening_date',
  'kaffepos_storage_meta',
  'kaffepos_update_report',
  'kaffepos_post_update_sync_pending',
]);
const CRITICAL_PREFIXES = [
  'kpos_last_tab:',
  'kpos_store_id_',
  'kaffepos_store_settings_',
  'kpos_pending_writes_',
  'kpos_cart_',
  'kpos_discount_',
];

let bridgeInitialized = false;
let backupTimer: ReturnType<typeof setTimeout> | null = null;

function isNativeRuntime() {
  return Capacitor.isNativePlatform();
}

function shouldBackupKey(key: string) {
  return CRITICAL_EXACT_KEYS.has(key) || CRITICAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function collectCriticalSnapshot() {
  const snapshot: Record<string, string> = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !shouldBackupKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      snapshot[key] = value;
    }
  } catch {
    // ignore
  }
  return snapshot;
}

export async function persistCriticalStorageBackup() {
  if (!isNativeRuntime()) return;
  try {
    const snapshot = collectCriticalSnapshot();
    await Preferences.set({
      key: CRITICAL_STORAGE_BACKUP_KEY,
      value: JSON.stringify({
        savedAt: new Date().toISOString(),
        snapshot,
      }),
    });
  } catch (error) {
    console.warn('[Upgrade] Failed to persist critical storage backup', error);
  }
}

export async function restoreCriticalStorageBackup() {
  if (!isNativeRuntime()) return [] as string[];

  try {
    const { value } = await Preferences.get({ key: CRITICAL_STORAGE_BACKUP_KEY });
    if (!value) return [] as string[];

    const parsed = JSON.parse(value) as { snapshot?: Record<string, string> };
    const snapshot = parsed.snapshot ?? {};
    const restoredKeys: string[] = [];

    for (const [key, storedValue] of Object.entries(snapshot)) {
      if (!shouldBackupKey(key)) continue;
      if (localStorage.getItem(key) !== null) continue;
      localStorage.setItem(key, storedValue);
      restoredKeys.push(key);
    }

    if (restoredKeys.length > 0) {
      console.info('[Upgrade] Restored critical storage from native backup', { restoredKeys });
    }

    return restoredKeys;
  } catch (error) {
    console.warn('[Upgrade] Failed to restore critical storage backup', error);
    return [] as string[];
  }
}

export function scheduleCriticalStorageBackup() {
  if (!isNativeRuntime()) return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    void persistCriticalStorageBackup();
  }, 250);
}

export function initCriticalStorageBackupBridge() {
  if (bridgeInitialized || typeof window === 'undefined') return;
  bridgeInitialized = true;

  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);
  const originalClear = localStorage.clear.bind(localStorage);

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (shouldBackupKey(key)) {
      scheduleCriticalStorageBackup();
    }
  };

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);
    if (shouldBackupKey(key)) {
      scheduleCriticalStorageBackup();
    }
  };

  localStorage.clear = () => {
    originalClear();
    scheduleCriticalStorageBackup();
  };
}
