import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  clearOfflineOutbox,
  deriveConnectivityMode,
  enqueueOfflineOperation,
  getOfflineOutboxSummary,
  processOfflineOutbox,
  readOfflineOutbox,
  resetOfflineQueueRuntimeForTests,
  resolveOfflineOutboxItem,
  retryOfflineOutboxItem,
} from '@/lib/offlineQueue';

describe('offline outbox queue', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetOfflineQueueRuntimeForTests();
    await clearOfflineOutbox('store_123');
  });

  it('queues offline mutations with stable idempotency keys and dedupes retries', async () => {
    const first = await enqueueOfflineOperation('store_123', {
      operation: 'transaction.create',
      payload: { id: 'tx_1', total: 10000 },
      idempotencyKey: 'transaction:tx_1',
    });
    const second = await enqueueOfflineOperation('store_123', {
      operation: 'transaction.create',
      payload: { id: 'tx_1', total: 10000 },
      idempotencyKey: 'transaction:tx_1',
    });

    expect(second.id).toBe(first.id);
    await expect(readOfflineOutbox('store_123')).resolves.toHaveLength(1);
    await expect(getOfflineOutboxSummary('store_123')).resolves.toMatchObject({
      total: 1,
      pending: 1,
      failed: 0,
    });
  });

  it('processes queued items and removes them only after sync success', async () => {
    await enqueueOfflineOperation('store_123', {
      operation: 'transaction.create',
      payload: { id: 'tx_1', total: 10000 },
    });
    const handler = vi.fn().mockResolvedValue(undefined);

    const summary = await processOfflineOutbox('store_123', {
      'transaction.create': handler,
    });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'transaction.create',
      sync_status: 'syncing',
    }));
    expect(summary.total).toBe(0);
    await expect(readOfflineOutbox('store_123')).resolves.toEqual([]);
  });

  it('keeps failed sync items with retry count and last error', async () => {
    await enqueueOfflineOperation('store_123', {
      operation: 'store.settings.update',
      payload: { store_name: 'Outlet Offline' },
    });

    await processOfflineOutbox('store_123', {
      'store.settings.update': vi.fn().mockRejectedValue(new Error('Network down')),
    });

    await expect(readOfflineOutbox('store_123')).resolves.toEqual([
      expect.objectContaining({
        sync_status: 'failed',
        retry_count: 1,
        last_error: 'Network down',
      }),
    ]);
  });

  it('marks duplicate/conflict failures clearly instead of silently dropping them', async () => {
    await enqueueOfflineOperation('store_123', {
      operation: 'transaction.create',
      payload: { id: 'tx_1' },
    });
    const conflict = new Error('Duplicate transaction') as Error & { status: number };
    conflict.status = 409;

    await processOfflineOutbox('store_123', {
      'transaction.create': vi.fn().mockRejectedValue(conflict),
    });

    const items = await readOfflineOutbox('store_123');
    expect(items[0]).toMatchObject({
      sync_status: 'conflicted',
      retry_count: 1,
    });
  });

  it('derives clear connectivity modes from network and queue state', () => {
    expect(deriveConnectivityMode({
      isOnline: false,
      isSyncing: false,
      summary: { total: 1, pending: 1, syncing: 0, failed: 0, conflicted: 0, resolved: 0 },
    })).toBe('offline');
    expect(deriveConnectivityMode({
      isOnline: true,
      isSyncing: true,
      summary: { total: 1, pending: 1, syncing: 0, failed: 0, conflicted: 0, resolved: 0 },
    })).toBe('syncing');
    expect(deriveConnectivityMode({
      isOnline: true,
      isSyncing: false,
      summary: { total: 1, pending: 0, syncing: 0, failed: 1, conflicted: 0, resolved: 0 },
    })).toBe('sync_failed');
    expect(deriveConnectivityMode({
      isOnline: true,
      isSyncing: false,
      summary: { total: 0, pending: 0, syncing: 0, failed: 0, conflicted: 0, resolved: 0 },
      lastSyncSucceeded: true,
    })).toBe('sync_success');
  });

  it('migrates legacy localStorage queue into IndexedDB without losing items', async () => {
    localStorage.setItem('kpos_offline_outbox_store_123', JSON.stringify([
      {
        id: 'legacy_1',
        store_id: 'store_123',
        operation: 'transaction.create',
        payload: { id: 'tx_legacy' },
        idempotency_key: 'transaction:tx_legacy',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        retry_count: 0,
        sync_status: 'pending',
        last_error: null,
      },
    ]));
    resetOfflineQueueRuntimeForTests();

    const items = await readOfflineOutbox('store_123');

    expect(items).toEqual([
      expect.objectContaining({
        id: 'legacy_1',
        operation: 'transaction.create',
      }),
    ]);
    expect(localStorage.getItem('kpos_offline_outbox_store_123')).toBeNull();
    expect(localStorage.getItem('kpos_offline_outbox_store_123:migrated_at')).toBeTruthy();
  });

  it('can clear an outbox after manual cleanup in staging/tests', async () => {
    await enqueueOfflineOperation('store_123', {
      operation: 'transaction.create',
      payload: { id: 'tx_1' },
    });
    await clearOfflineOutbox('store_123');

    await expect(readOfflineOutbox('store_123')).resolves.toEqual([]);
  });

  it('keeps resolved items for audit without counting them as pending work', async () => {
    const item = await enqueueOfflineOperation('store_123', {
      operation: 'transaction.create',
      payload: { id: 'tx_reviewed' },
    });

    await resolveOfflineOutboxItem('store_123', item.id);

    const summary = await getOfflineOutboxSummary('store_123');
    expect(summary).toMatchObject({
      total: 0,
      pending: 0,
      resolved: 1,
    });
    await expect(readOfflineOutbox('store_123')).resolves.toEqual([
      expect.objectContaining({
        id: item.id,
        sync_status: 'resolved',
      }),
    ]);
  });

  it('can move a failed/conflicted item back to pending for an explicit retry', async () => {
    await enqueueOfflineOperation('store_123', {
      operation: 'store.settings.update',
      payload: { store_name: 'Outlet Offline' },
    });
    await processOfflineOutbox('store_123', {
      'store.settings.update': vi.fn().mockRejectedValue(new Error('Network down')),
    });
    const [failed] = await readOfflineOutbox('store_123');

    const retried = await retryOfflineOutboxItem('store_123', failed.id);

    expect(retried).toMatchObject({
      sync_status: 'pending',
      last_error: null,
    });
  });
});
