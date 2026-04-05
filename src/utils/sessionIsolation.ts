const APP_STORAGE_PREFIXES = ['kpos_', 'kaffepos_', 'kaffe_'];
const ACTIVE_USER_KEY = 'kaffepos_active_user_id';

function matchesAppKey(key: string) {
  return APP_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function getActiveUserId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

export function setActiveUserId(userId: string | null) {
  try {
    if (userId) localStorage.setItem(ACTIVE_USER_KEY, userId);
    else localStorage.removeItem(ACTIVE_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoreCacheKey(userId: string) {
  return `kpos_store_id_${userId}`;
}

export function getStoreSettingsKey(storeId: string) {
  return `kaffepos_store_settings_${storeId}`;
}

export function getPendingWritesKey(storeId: string) {
  return `kpos_pending_writes_${storeId}`;
}

export function clearSessionStorage() {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

export function clearAppLocalStorage(preserveKeys: string[] = []) {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (matchesAppKey(key) && !preserveKeys.includes(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export function clearIndexedDbCache(userId?: string | null) {
  if (typeof indexedDB === 'undefined') return;
  const names = ['kaffepos-db'];
  if (userId) names.push(`kaffepos-db-${userId}`);
  names.forEach(name => {
    try {
      indexedDB.deleteDatabase(name);
    } catch {
      /* ignore */
    }
  });
}

export function clearUserCache(userId?: string | null, preserveKeys: string[] = []) {
  clearIndexedDbCache(userId);
  clearAppLocalStorage(preserveKeys);
  clearSessionStorage();
}

export function redirectToLogin(forceReload = true) {
  if (typeof window === 'undefined') return;
  if (forceReload) {
    window.location.href = '/auth';
    return;
  }
  window.location.assign('/auth');
}
