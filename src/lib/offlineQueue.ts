export type OfflineOperationType =
  | 'transaction.create'
  | 'loyalty.stamp.create'
  | 'loyalty.redemption.create'
  | 'kitchen.order.update'
  | 'kitchen.item.update'
  | 'store.settings.update'
  | 'legacy.pending_write';

export type OfflineSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflicted' | 'resolved';

export type OfflineOutboxItem = {
  id: string;
  store_id: string;
  operation: OfflineOperationType;
  payload: Record<string, unknown>;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  retry_count: number;
  sync_status: OfflineSyncStatus;
  last_error?: string | null;
};

export type OfflineOutboxSummary = {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  conflicted: number;
  resolved: number;
};

export type ConnectivityMode = 'online' | 'offline' | 'reconnecting' | 'syncing' | 'sync_failed' | 'sync_success';

const DB_NAME = 'kaffepos-offline';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox_items';
const META_STORE = 'sync_metadata';
const LEGACY_OUTBOX_PREFIX = 'kpos_offline_outbox';
const STALE_SYNCING_MS = 2 * 60 * 1000;

export const OFFLINE_OUTBOX_EVENT = 'kaffepos-offline-outbox-change';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memoryFallback = new Map<string, OfflineOutboxItem[]>();
const migratedStores = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function createLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getOfflineOutboxKey(storeId: string) {
  return `${LEGACY_OUTBOX_PREFIX}_${storeId}`;
}

export function resetOfflineQueueRuntimeForTests() {
  dbPromise = null;
  migratedStores.clear();
  memoryFallback.clear();
}

async function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        outbox.createIndex('store_id', 'store_id', { unique: false });
        outbox.createIndex('sync_status', 'sync_status', { unique: false });
        outbox.createIndex('idempotency_key', 'idempotency_key', { unique: false });
        outbox.createIndex('operation', 'operation', { unique: false });
        outbox.createIndex('updated_at', 'updated_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('IndexedDB offline store gagal dibuka.'));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('IndexedDB offline store sedang diblok tab lain.'));
    };
  }).catch(() => null);

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request gagal.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  const transaction = db.transaction(OUTBOX_STORE, mode);
  const store = transaction.objectStore(OUTBOX_STORE);
  const result = await runner(store);
  if (result instanceof IDBRequest) {
    return requestToPromise(result);
  }
  return result;
}

function emitOutboxChange(storeId: string, summary: OfflineOutboxSummary) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(OFFLINE_OUTBOX_EVENT, {
    detail: { storeId, summary },
  }));
}

function emptySummary(): OfflineOutboxSummary {
  return { total: 0, pending: 0, syncing: 0, failed: 0, conflicted: 0, resolved: 0 };
}

function summarize(items: OfflineOutboxItem[]): OfflineOutboxSummary {
  return items.reduce<OfflineOutboxSummary>((summary, item) => {
    if (item.sync_status !== 'resolved' && item.sync_status !== 'synced') summary.total += 1;
    if (item.sync_status === 'pending') summary.pending += 1;
    if (item.sync_status === 'syncing') summary.syncing += 1;
    if (item.sync_status === 'failed') summary.failed += 1;
    if (item.sync_status === 'conflicted') summary.conflicted += 1;
    if (item.sync_status === 'resolved') summary.resolved += 1;
    return summary;
  }, emptySummary());
}

function readLegacyOutbox(storeId: string): OfflineOutboxItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getOfflineOutboxKey(storeId)) || '[]') as OfflineOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function migrateLegacyOutbox(storeId: string) {
  if (migratedStores.has(storeId)) return;
  migratedStores.add(storeId);
  const legacyItems = readLegacyOutbox(storeId);
  if (legacyItems.length === 0) return;

  try {
    const existing = await readOfflineOutboxRaw(storeId);
    const existingKeys = new Set(existing.map((item) => item.idempotency_key));
    for (const item of legacyItems) {
      if (existingKeys.has(item.idempotency_key)) continue;
      await putOutboxItem({
        ...item,
        store_id: storeId,
        sync_status: item.sync_status === 'synced' ? 'resolved' : item.sync_status,
      });
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${getOfflineOutboxKey(storeId)}:migrated_at`, nowIso());
      localStorage.removeItem(getOfflineOutboxKey(storeId));
    }
  } catch {
    migratedStores.delete(storeId);
  }
}

async function readOfflineOutboxRaw(storeId: string): Promise<OfflineOutboxItem[]> {
  const result = await withStore('readonly', async (store) => {
    const index = store.index('store_id');
    return requestToPromise(index.getAll(storeId));
  });
  if (result) {
    return result.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return [...(memoryFallback.get(storeId) ?? [])];
}

async function putOutboxItem(item: OfflineOutboxItem) {
  const result = await withStore('readwrite', (store) => store.put(item));
  if (result === null) {
    const items = memoryFallback.get(item.store_id) ?? [];
    const next = [...items.filter((entry) => entry.id !== item.id), item];
    memoryFallback.set(item.store_id, next);
  }
}

async function deleteOutboxItem(storeId: string, itemId: string) {
  const result = await withStore('readwrite', (store) => store.delete(itemId));
  if (result === null) {
    memoryFallback.set(storeId, (memoryFallback.get(storeId) ?? []).filter((item) => item.id !== itemId));
  }
}

export async function readOfflineOutbox(storeId: string): Promise<OfflineOutboxItem[]> {
  await migrateLegacyOutbox(storeId);
  return readOfflineOutboxRaw(storeId);
}

export async function getOfflineOutboxSummary(storeId: string): Promise<OfflineOutboxSummary> {
  return summarize(await readOfflineOutbox(storeId));
}

export async function clearOfflineOutbox(storeId: string) {
  const items = await readOfflineOutbox(storeId);
  for (const item of items) {
    await deleteOutboxItem(storeId, item.id);
  }
  emitOutboxChange(storeId, emptySummary());
}

export async function enqueueOfflineOperation(
  storeId: string,
  input: {
    operation: OfflineOperationType;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    createdAt?: string;
  },
): Promise<OfflineOutboxItem> {
  const items = await readOfflineOutbox(storeId);
  const idempotencyKey = input.idempotencyKey || `${input.operation}:${String(input.payload.id || createLocalId('op'))}`;
  const existing = items.find((item) => item.idempotency_key === idempotencyKey && item.sync_status !== 'resolved');
  if (existing) return existing;

  const timestamp = input.createdAt || nowIso();
  const item: OfflineOutboxItem = {
    id: createLocalId('outbox'),
    store_id: storeId,
    operation: input.operation,
    payload: input.payload,
    idempotency_key: idempotencyKey,
    created_at: timestamp,
    updated_at: timestamp,
    retry_count: 0,
    sync_status: 'pending',
    last_error: null,
  };
  await putOutboxItem(item);
  emitOutboxChange(storeId, summarize([...(items.filter((entry) => entry.id !== item.id)), item]));
  return item;
}

export async function markOfflineOperationFailed(storeId: string, itemId: string, error: unknown): Promise<OfflineOutboxItem | null> {
  const items = await readOfflineOutbox(storeId);
  const current = items.find((item) => item.id === itemId);
  if (!current) return null;

  const updated: OfflineOutboxItem = {
    ...current,
    sync_status: isConflictError(error) ? 'conflicted' : 'failed',
    retry_count: current.retry_count + 1,
    last_error: error instanceof Error ? error.message : 'Sinkronisasi gagal.',
    updated_at: nowIso(),
  };
  await putOutboxItem(updated);
  emitOutboxChange(storeId, summarize(items.map((item) => item.id === itemId ? updated : item)));
  return updated;
}

export async function resolveOfflineOutboxItem(storeId: string, itemId: string) {
  const items = await readOfflineOutbox(storeId);
  const current = items.find((item) => item.id === itemId);
  if (!current) return null;
  const resolved: OfflineOutboxItem = {
    ...current,
    sync_status: 'resolved',
    updated_at: nowIso(),
  };
  await putOutboxItem(resolved);
  emitOutboxChange(storeId, summarize(items.map((item) => item.id === itemId ? resolved : item)));
  return resolved;
}

export async function retryOfflineOutboxItem(storeId: string, itemId: string) {
  const items = await readOfflineOutbox(storeId);
  const current = items.find((item) => item.id === itemId);
  if (!current) return null;
  const pending: OfflineOutboxItem = {
    ...current,
    sync_status: 'pending',
    last_error: null,
    updated_at: nowIso(),
  };
  await putOutboxItem(pending);
  emitOutboxChange(storeId, summarize(items.map((item) => item.id === itemId ? pending : item)));
  return pending;
}

export function deriveConnectivityMode(input: {
  isOnline: boolean;
  isSyncing: boolean;
  summary: OfflineOutboxSummary;
  lastSyncSucceeded?: boolean;
}): ConnectivityMode {
  if (!input.isOnline) return 'offline';
  if (input.isSyncing || input.summary.syncing > 0) return 'syncing';
  if (input.summary.failed > 0 || input.summary.conflicted > 0) return 'sync_failed';
  if (input.summary.pending > 0) return 'syncing';
  if (input.lastSyncSucceeded) return 'sync_success';
  return 'online';
}

export async function processOfflineOutbox(
  storeId: string,
  handlers: Partial<Record<OfflineOperationType, (item: OfflineOutboxItem) => Promise<void>>>,
): Promise<OfflineOutboxSummary> {
  const initialItems = await readOfflineOutbox(storeId);
  const now = Date.now();
  const queue = initialItems.filter((item) => {
    if (item.sync_status === 'pending' || item.sync_status === 'failed') return true;
    if (item.sync_status !== 'syncing') return false;
    const updatedAt = new Date(item.updated_at).getTime();
    return Number.isFinite(updatedAt) && now - updatedAt > STALE_SYNCING_MS;
  });
  if (queue.length === 0) return summarize(initialItems);

  for (const queued of queue) {
    const handler = handlers[queued.operation];
    if (!handler) {
      await markOfflineOperationFailed(storeId, queued.id, new Error(`Handler sync belum tersedia untuk ${queued.operation}.`));
      continue;
    }

    await setItemStatus(storeId, queued.id, 'syncing');
    try {
      await handler({ ...queued, sync_status: 'syncing' });
      await deleteOutboxItem(storeId, queued.id);
    } catch (error) {
      await markOfflineOperationFailed(storeId, queued.id, error);
    }
  }

  const summary = await getOfflineOutboxSummary(storeId);
  emitOutboxChange(storeId, summary);
  return summary;
}

async function setItemStatus(storeId: string, itemId: string, status: OfflineSyncStatus) {
  const items = await readOfflineOutbox(storeId);
  const current = items.find((item) => item.id === itemId);
  if (!current) return;
  await putOutboxItem({
    ...current,
    sync_status: status,
    updated_at: nowIso(),
  });
}

function isConflictError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeStatus = (error as { status?: unknown }).status;
  return maybeStatus === 409 || maybeStatus === 412;
}
