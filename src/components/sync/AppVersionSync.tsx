import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  checkRemoteAppVersion,
  CLIENT_APP_VERSION,
  logSafeUpdateEvent,
  readLastSeenServerVersion,
  rememberServerVersion,
} from '@/lib/appVersion';

type AppVersionSyncProps = {
  ready: boolean;
  storeId?: string | null | undefined;
  userId?: string | null | undefined;
  onSync: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
};

type BannerState =
  | { kind: 'idle' }
  | { kind: 'syncing'; message: string }
  | { kind: 'updated'; message: string }
  | { kind: 'hard'; message: string };

export default function AppVersionSync({ ready, storeId, userId, onSync, showToast }: AppVersionSyncProps) {
  const [banner, setBanner] = useState<BannerState>({ kind: 'idle' });
  const checkedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !userId) return undefined;
    let cancelled = false;
    const checkKey = `${userId}:${storeId || 'no-store'}:${CLIENT_APP_VERSION}`;

    const runCheck = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (checkedKeyRef.current === checkKey) return;
      checkedKeyRef.current = checkKey;
      try {
        const previousServerVersion = readLastSeenServerVersion();
        const { response, platform } = await checkRemoteAppVersion();
        if (cancelled) return;

        await logSafeUpdateEvent({
          storeId,
          eventName: 'version_checked',
          version: response,
          platform,
          metadata: { previousServerVersion, clientVersion: CLIENT_APP_VERSION },
        });

        const serverVersionChanged = Boolean(previousServerVersion && previousServerVersion !== response.appVersion);
        const shouldSync = serverVersionChanged || response.sync.postUpdateSyncRecommended;

        if (response.hardUpdateRequired) {
          setBanner({
            kind: 'hard',
            message: 'Versi aplikasi ini perlu diperbarui agar data tetap aman.',
          });
          await logSafeUpdateEvent({
            storeId,
            eventName: 'update_detected',
            version: response,
            platform,
            metadata: { previousServerVersion, hardUpdateRequired: true },
          });
          return;
        }

        if (!shouldSync) {
          rememberServerVersion(response.appVersion);
          return;
        }

        setBanner({ kind: 'syncing', message: 'Memperbarui data agar sesuai versi terbaru...' });
        showToast('Aplikasi telah diperbarui. Data sedang diselaraskan.', 'info');
        await logSafeUpdateEvent({
          storeId,
          eventName: 'post_update_sync_started',
          version: response,
          platform,
          metadata: { previousServerVersion },
        });

        try {
          await onSync();
          if (cancelled) return;
          rememberServerVersion(response.appVersion);
          setBanner({ kind: 'updated', message: 'Data lama aman dan sudah tersinkron.' });
          await logSafeUpdateEvent({
            storeId,
            eventName: 'post_update_sync_completed',
            version: response,
            platform,
            metadata: { previousServerVersion },
          });
          window.setTimeout(() => {
            if (!cancelled) setBanner({ kind: 'idle' });
          }, 5000);
        } catch (syncError) {
          if (cancelled) return;
          checkedKeyRef.current = null;
          setBanner({ kind: 'syncing', message: 'Menunggu koneksi stabil untuk menyelesaikan sinkronisasi update.' });
          await logSafeUpdateEvent({
            storeId,
            eventName: 'post_update_sync_failed',
            version: response,
            platform,
            metadata: { error: syncError instanceof Error ? syncError.message : 'Unknown sync error' },
          });
        }
      } catch {
        checkedKeyRef.current = null;
        // Version check should be silent when API is temporarily unavailable.
      }
    };

    void runCheck();
    const onOnline = () => void runCheck();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [onSync, ready, showToast, storeId, userId]);

  if (banner.kind === 'idle') return null;

  const isHard = banner.kind === 'hard';
  const isSyncing = banner.kind === 'syncing';
  return (
    <div className="px-3 pt-2 flex-shrink-0">
      <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
        isHard
          ? 'border-amber-100 bg-amber-50 text-amber-900'
          : 'border-orange-100 bg-orange-50/90 text-orange-900'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF6A00] ring-1 ring-orange-100">
              {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            </div>
            <div className="min-w-0">
              <p className="font-black">{isHard ? 'Update aplikasi diperlukan' : 'Update data aplikasi'}</p>
              <p className="mt-1 font-semibold leading-relaxed opacity-80">{banner.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBanner({ kind: 'idle' })}
            className="shrink-0 rounded-full p-1.5 text-orange-700 transition hover:bg-white/70"
            aria-label="Tutup notifikasi update aplikasi"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
