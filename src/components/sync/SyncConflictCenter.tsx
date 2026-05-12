import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, WifiOff, X } from 'lucide-react';
import {
  getOfflineOutboxSummary,
  OFFLINE_OUTBOX_EVENT,
  readOfflineOutbox,
  resolveOfflineOutboxItem,
  retryOfflineOutboxItem,
  type OfflineOutboxItem,
  type OfflineOutboxSummary,
} from '@/lib/offlineQueue';
import { buildSyncCenterItems, getSyncAttentionState } from '@/lib/syncCenter';
import { useModalBehavior } from '@/hooks/useModalBehavior';

type SyncConflictCenterProps = {
  open: boolean;
  onClose: () => void;
  storeId: string | null;
  role: unknown;
  onRetryAll: () => Promise<void>;
};

const emptySummary: OfflineOutboxSummary = {
  total: 0,
  pending: 0,
  syncing: 0,
  failed: 0,
  conflicted: 0,
  resolved: 0,
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function SyncConflictCenter({ open, onClose, storeId, role, onRetryAll }: SyncConflictCenterProps) {
  const [items, setItems] = useState<OfflineOutboxItem[]>([]);
  const [summary, setSummary] = useState<OfflineOutboxSummary>(emptySummary);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!storeId) {
      setItems([]);
      setSummary(emptySummary);
      return;
    }
    setLoading(true);
    try {
      const [outboxItems, outboxSummary] = await Promise.all([
        readOfflineOutbox(storeId),
        getOfflineOutboxSummary(storeId),
      ]);
      setItems(outboxItems);
      setSummary(outboxSummary);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || !storeId) return;
    const handleOutboxChange = (event: Event) => {
      const detail = (event as CustomEvent<{ storeId?: string }>).detail;
      if (detail?.storeId === storeId) void refresh();
    };
    window.addEventListener(OFFLINE_OUTBOX_EVENT, handleOutboxChange);
    return () => window.removeEventListener(OFFLINE_OUTBOX_EVENT, handleOutboxChange);
  }, [open, refresh, storeId]);

  const viewItems = useMemo(() => buildSyncCenterItems(items, role), [items, role]);
  const attention = getSyncAttentionState(summary);
  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLDivElement>({
    open,
    onClose,
    disabled: Boolean(busyItemId),
  });
  const headline = attention === 'conflicted'
    ? 'Ada data yang perlu dicek'
    : attention === 'failed'
      ? 'Sebagian data belum tersinkron'
      : attention === 'pending'
        ? 'Data sedang menunggu sinkron'
        : 'Semua data aman';

  const retryItem = async (itemId: string) => {
    if (!storeId) return;
    setBusyItemId(itemId);
    try {
      await retryOfflineOutboxItem(storeId, itemId);
      await onRetryAll();
      await refresh();
    } finally {
      setBusyItemId(null);
    }
  };

  const resolveItem = async (itemId: string) => {
    if (!storeId) return;
    setBusyItemId(itemId);
    try {
      await resolveOfflineOutboxItem(storeId, itemId);
      await refresh();
    } finally {
      setBusyItemId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onBackdropClick}>
      <div
        ref={panelRef}
        className="w-full max-w-3xl overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"
        aria-labelledby="sync-conflict-title"
        {...dialogProps}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <WifiOff size={14} />
              Pusat Sinkronisasi
            </div>
            <h2 id="sync-conflict-title" className="text-xl font-black tracking-tight text-slate-900">{headline}</h2>
            <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
              Data offline tetap tersimpan di perangkat. Kamu bisa coba sinkron ulang saat koneksi stabil.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100"
            aria-label="Tutup pusat sinkronisasi"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-slate-100 text-center">
          <div className="px-3 py-4">
            <p className="text-2xl font-black text-slate-900">{summary.pending + summary.syncing}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending</p>
          </div>
          <div className="border-x border-slate-100 px-3 py-4">
            <p className="text-2xl font-black text-amber-600">{summary.failed}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gagal</p>
          </div>
          <div className="px-3 py-4">
            <p className="text-2xl font-black text-rose-600">{summary.conflicted}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perlu Cek</p>
          </div>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-sm font-bold text-slate-400">
              <RefreshCw size={16} className="animate-spin" />
              Membaca data sinkronisasi...
            </div>
          ) : viewItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={26} />
              </div>
              <p className="text-sm font-black text-slate-900">Tidak ada data bermasalah</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Semua perubahan lokal sudah aman atau belum ada antrean sync.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {viewItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[18px] border p-4 ${
                    item.tone === 'danger'
                      ? 'border-rose-100 bg-rose-50/70'
                      : item.tone === 'warning'
                        ? 'border-amber-100 bg-amber-50/70'
                        : item.tone === 'success'
                          ? 'border-emerald-100 bg-emerald-50/70'
                          : 'border-slate-100 bg-slate-50/70'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-slate-900">{item.operationLabel}</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                          {item.statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{item.detail}</p>
                      {item.lastError ? (
                        <p className="mt-2 flex items-center gap-2 text-xs font-bold text-rose-600">
                          <AlertTriangle size={14} />
                          {item.lastError}
                        </p>
                      ) : null}
                      <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-400">
                        <Clock3 size={13} />
                        Dibuat {formatDate(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {item.canRetry ? (
                        <button
                          type="button"
                          onClick={() => void retryItem(item.id)}
                          disabled={busyItemId === item.id}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800 disabled:opacity-50"
                        >
                          Ulangi
                        </button>
                      ) : null}
                      {item.canResolve ? (
                        <button
                          type="button"
                          onClick={() => void resolveItem(item.id)}
                          disabled={busyItemId === item.id}
                          className="rounded-xl bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 shadow-sm transition hover:text-slate-900 disabled:opacity-50"
                        >
                          Tandai Dicek
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-2xl bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-100"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void onRetryAll().then(refresh)}
            className="rounded-2xl bg-[#FF6A00] px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-premium transition hover:bg-[#c8742f]"
          >
            Sinkronkan Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
