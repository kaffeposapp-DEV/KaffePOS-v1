import { normalizeUserRole, type UserRole } from '@/lib/accessControl';
import type { OfflineOperationType, OfflineOutboxItem, OfflineOutboxSummary, OfflineSyncStatus } from '@/lib/offlineQueue';

export type SyncAttentionState = 'idle' | 'pending' | 'failed' | 'conflicted';

export type SyncCenterItemView = {
  id: string;
  operationLabel: string;
  statusLabel: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  detail: string;
  lastError: string | null;
  canRetry: boolean;
  canResolve: boolean;
  createdAt: string;
  updatedAt: string;
};

const OPERATION_LABELS: Record<OfflineOperationType, string> = {
  'transaction.create': 'Transaksi POS',
  'loyalty.stamp.create': 'Stamp Kopi Passport',
  'loyalty.redemption.create': 'Redeem reward loyalty',
  'kitchen.order.update': 'Status order dapur',
  'kitchen.item.update': 'Status item dapur',
  'store.settings.update': 'Pengaturan toko',
  'legacy.pending_write': 'Data operasional lama',
};

const STATUS_LABELS: Record<OfflineSyncStatus, string> = {
  pending: 'Menunggu sinkron',
  syncing: 'Sedang sinkron',
  synced: 'Sudah sinkron',
  failed: 'Gagal sinkron',
  conflicted: 'Perlu dicek',
  resolved: 'Sudah ditandai beres',
};

export function getOperationLabel(operation: OfflineOperationType) {
  return OPERATION_LABELS[operation] ?? 'Data operasional';
}

export function getSyncAttentionState(summary: OfflineOutboxSummary): SyncAttentionState {
  if (summary.conflicted > 0) return 'conflicted';
  if (summary.failed > 0) return 'failed';
  if (summary.pending > 0 || summary.syncing > 0) return 'pending';
  return 'idle';
}

function getTone(status: OfflineSyncStatus): SyncCenterItemView['tone'] {
  if (status === 'conflicted') return 'danger';
  if (status === 'failed') return 'warning';
  if (status === 'resolved' || status === 'synced') return 'success';
  return 'neutral';
}

function buildHumanDetail(item: OfflineOutboxItem, role: UserRole) {
  const base = item.sync_status === 'pending'
    ? 'Data tersimpan lokal dan akan dikirim saat koneksi stabil.'
    : item.sync_status === 'conflicted'
      ? 'Data butuh pengecekan sebelum dianggap selesai.'
      : item.sync_status === 'failed'
        ? 'Data belum berhasil dikirim. Coba ulang saat koneksi stabil.'
        : 'Data sudah ditinjau.';

  if (role !== 'owner_admin') return base;
  return `${base} Kunci aman: ${item.idempotency_key}`;
}

export function buildSyncCenterItems(items: OfflineOutboxItem[], roleInput: unknown): SyncCenterItemView[] {
  const role = normalizeUserRole(roleInput);
  return items
    .filter((item) => item.sync_status !== 'synced')
    .sort((a, b) => {
      const severity = { conflicted: 0, failed: 1, pending: 2, syncing: 3, resolved: 4, synced: 5 } satisfies Record<OfflineSyncStatus, number>;
      const severityDiff = severity[a.sync_status] - severity[b.sync_status];
      if (severityDiff !== 0) return severityDiff;
      return a.created_at.localeCompare(b.created_at);
    })
    .map((item) => ({
      id: item.id,
      operationLabel: getOperationLabel(item.operation),
      statusLabel: STATUS_LABELS[item.sync_status],
      tone: getTone(item.sync_status),
      detail: buildHumanDetail(item, role),
      lastError: item.last_error ?? null,
      canRetry: item.sync_status === 'failed' || item.sync_status === 'conflicted',
      canResolve: item.sync_status === 'failed' || item.sync_status === 'conflicted',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
}
