import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SyncConflictCenter from '@/components/sync/SyncConflictCenter';
import {
  getOfflineOutboxSummary,
  readOfflineOutbox,
  retryOfflineOutboxItem,
} from '@/lib/offlineQueue';
import type { OfflineOutboxItem } from '@/lib/offlineQueue';

vi.mock('@/lib/offlineQueue', () => ({
  OFFLINE_OUTBOX_EVENT: 'kaffepos-offline-outbox-change',
  getOfflineOutboxSummary: vi.fn(),
  readOfflineOutbox: vi.fn(),
  resolveOfflineOutboxItem: vi.fn(),
  retryOfflineOutboxItem: vi.fn(),
}));

const failedItem: OfflineOutboxItem = {
  id: 'outbox_1',
  store_id: 'store_123',
  operation: 'transaction.create',
  payload: { id: 'tx_failed' },
  idempotency_key: 'transaction:tx_failed',
  created_at: '2026-04-28T01:00:00.000Z',
  updated_at: '2026-04-28T01:01:00.000Z',
  retry_count: 1,
  sync_status: 'failed',
  last_error: 'Network down',
};

describe('SyncConflictCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readOfflineOutbox).mockResolvedValue([failedItem]);
    vi.mocked(getOfflineOutboxSummary).mockResolvedValue({
      total: 1,
      pending: 0,
      syncing: 0,
      failed: 1,
      conflicted: 0,
      resolved: 0,
    });
    vi.mocked(retryOfflineOutboxItem).mockResolvedValue({ ...failedItem, sync_status: 'pending', last_error: null });
  });

  it('shows failed sync items and lets the user retry from the center', async () => {
    const retryAll = vi.fn().mockResolvedValue(undefined);
    render(
      <SyncConflictCenter
        open
        onClose={vi.fn()}
        storeId="store_123"
        role="cashier"
        onRetryAll={retryAll}
      />,
    );

    expect(await screen.findByText('Sebagian data belum tersinkron')).toBeInTheDocument();
    expect(screen.getByText('Gagal sinkron')).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ulangi' }));

    await waitFor(() => {
      expect(retryOfflineOutboxItem).toHaveBeenCalledWith('store_123', 'outbox_1');
      expect(retryAll).toHaveBeenCalledTimes(1);
    });
  });
});
