import { describe, expect, it } from 'vitest';
import { buildSyncCenterItems, getOperationLabel, getSyncAttentionState } from '@/lib/syncCenter';
import type { OfflineOutboxItem, OfflineOutboxSummary } from '@/lib/offlineQueue';

const baseItem: OfflineOutboxItem = {
  id: 'outbox_1',
  store_id: 'store_123',
  operation: 'transaction.create',
  payload: { id: 'tx_1', total: 10000 },
  idempotency_key: 'transaction:tx_1',
  created_at: '2026-04-28T01:00:00.000Z',
  updated_at: '2026-04-28T01:00:00.000Z',
  retry_count: 0,
  sync_status: 'pending',
  last_error: null,
};

function summary(partial: Partial<OfflineOutboxSummary>): OfflineOutboxSummary {
  return {
    total: 0,
    pending: 0,
    syncing: 0,
    failed: 0,
    conflicted: 0,
    resolved: 0,
    ...partial,
  };
}

describe('sync conflict center helpers', () => {
  it('classifies summary into calm actionable attention states', () => {
    expect(getSyncAttentionState(summary({}))).toBe('idle');
    expect(getSyncAttentionState(summary({ pending: 2, total: 2 }))).toBe('pending');
    expect(getSyncAttentionState(summary({ failed: 1, total: 1 }))).toBe('failed');
    expect(getSyncAttentionState(summary({ conflicted: 1, failed: 1, total: 2 }))).toBe('conflicted');
  });

  it('uses business-friendly operation labels', () => {
    expect(getOperationLabel('transaction.create')).toBe('Transaksi POS');
    expect(getOperationLabel('kitchen.order.update')).toBe('Status order dapur');
    expect(getOperationLabel('store.settings.update')).toBe('Pengaturan toko');
  });

  it('hides technical identifiers from cashier but keeps owner detail useful', () => {
    const failedItem = {
      ...baseItem,
      sync_status: 'failed' as const,
      last_error: 'Network down',
      retry_count: 2,
    };

    const cashier = buildSyncCenterItems([failedItem], 'cashier')[0];
    const owner = buildSyncCenterItems([failedItem], 'owner_admin')[0];

    expect(cashier.detail).not.toContain('transaction:tx_1');
    expect(owner.detail).toContain('transaction:tx_1');
    expect(cashier.canRetry).toBe(true);
    expect(cashier.statusLabel).toBe('Gagal sinkron');
  });
});
