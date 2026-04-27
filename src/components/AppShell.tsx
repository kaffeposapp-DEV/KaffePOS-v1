




/* eslint-disable react-hooks/exhaustive-deps */



/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/AppShell.tsx — KaffePOS v5 — FAST INIT: cache storeId, show instantly
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { ShoppingBag, Package, Tag, History, BarChart3, Settings, WifiOff, LayoutDashboard, ChefHat } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/hooks/useStore';
import { createStore, getStores } from '@/lib/backendApi';
import { getStoreCacheKey } from '@/utils/sessionIsolation';
import { ToastContainer, useToast } from './ui/Toast';
import DailyOpeningModal, { useNeedsOpeningCash } from './pos/DailyOpeningModal';
import type { Tab, ToastType } from '@/types';
import { isPostUpdateSyncPending, markPostUpdateSyncComplete, readUpgradeReport } from '@/lib/appUpgrade';
import { subscriptionManager } from '@/services/SubscriptionManager';

const DashboardTab = lazy(() => import('./dashboard/Dashboard'));
const POSTab       = lazy(() => import('./pos/POSTab'));
const KitchenTab   = lazy(() => import('./kitchen/KitchenTab'));
const WarehouseTab = lazy(() => import('./warehouse/WarehouseTab'));
const MenuTab      = lazy(() => import('./menu/MenuTab'));
const HistoryTab   = lazy(() => import('./history/HistoryTab'));
const ReportTab    = lazy(() => import('./report/ReportTab'));
const SettingsTab  = lazy(() => import('./settings/SettingsTab'));

const NAV = [
  { id: 'dashboard' as Tab, label: 'Beranda',    icon: LayoutDashboard },
  { id: 'pos'       as Tab, label: 'POS',       icon: ShoppingBag },
  { id: 'kitchen'   as Tab, label: 'Dapur',     icon: ChefHat },
  { id: 'warehouse' as Tab, label: 'Gudang',     icon: Package     },
  { id: 'menu'      as Tab, label: 'Menu',       icon: Tag         },
  { id: 'history'   as Tab, label: 'Riwayat',    icon: History     },
  { id: 'report'    as Tab, label: 'Laporan',    icon: BarChart3   },
  { id: 'settings'  as Tab, label: 'Pengaturan', icon: Settings    },
] as const;

const LS_LAST_TAB  = 'kpos_last_tab';
const EXPLICIT_SIGNOUT_KEY = 'kaffepos_explicit_signout';

// ── Error boundary ────────────────────────────────────────────────
class TabError extends React.Component<{ name: string; children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: Error) { console.error('[TabError]', e); }
  render() {
    if (this.state.err) return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-3xl mb-3">😵</p>
        <p className="font-bold text-slate-700">{this.props.name} mengalami error</p>
        <button onClick={() => this.setState({ err: false })}
          className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold active:scale-95">
          Coba Lagi
        </button>
      </div>
    );
    return this.props.children;
  }
}

function TabSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
}

function AppLoading({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center gap-3">
      <div className="text-4xl">☕</div>
      <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-slate-400">{message || 'Memuat...'}</p>
    </div>
  );
}

/** Cache storeId di localStorage */
function getCachedStoreId(userId: string): string | null {
  try { return localStorage.getItem(getStoreCacheKey(userId)); } catch { return null; }
}
function setCachedStoreId(userId: string, id: string) {
  try { localStorage.setItem(getStoreCacheKey(userId), id); } catch { /* ignore */ }
}

function getLastTabStorageKey(userId?: string) {
  return userId ? `${LS_LAST_TAB}:${userId}` : LS_LAST_TAB;
}

function getValidTab(value: string | null): Tab | null {
  if (!value) return null;
  return NAV.some((entry) => entry.id === value) ? (value as Tab) : null;
}

function createLoadedTabsState(initialTab: Tab): Record<Tab, boolean> {
  return {
    dashboard: initialTab === 'dashboard',
    pos: initialTab === 'pos',
    kitchen: initialTab === 'kitchen',
    warehouse: initialTab === 'warehouse',
    menu: initialTab === 'menu',
    history: initialTab === 'history',
    report: initialTab === 'report',
    settings: initialTab === 'settings',
  };
}

export default function AppShell() {
  const { user, profile, isPro, subscriptionAccess, refreshProfile } = useAuth();
  const { storeId, loadAll, cleanup, syncing, cashRegister, isOnline, saveCashRegister } = useStore();

  const [tab, setTab] = useState<Tab>(() => {
    try {
      return getValidTab(localStorage.getItem(LS_LAST_TAB)) ?? 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [loadedTabs, setLoadedTabs] = useState<Record<Tab, boolean>>(() => createLoadedTabsState(tab));

  const [ready,   setReady]   = useState(false);
  const [message, setMessage] = useState('Memuat...');
  const [postUpdateSyncing, setPostUpdateSyncing] = useState(false);
  const [postUpdateNotice, setPostUpdateNotice] = useState(() => readUpgradeReport());
  const { toasts, showToast, dismissToast, showDownloadSuccess, showDownloadError } = useToast();

  useEffect(() => {
    const handleGlobalToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        showToast(detail.message, detail.type);
      }
    };
    window.addEventListener('kaffepos-toast', handleGlobalToast);
    return () => window.removeEventListener('kaffepos-toast', handleGlobalToast);
  }, [showToast]);

  // ── Dialog saldo kasir harian ─────────────────────────────────
  // Tunggu data ready DAN syncing=false agar tidak false positive
  const needsOpening  = useNeedsOpeningCash(cashRegister, syncing, ready);
  const [showOpening, setShowOpening] = useState(false);
  useEffect(() => {
    if (needsOpening) {
      // Tampilkan setelah perlu (data sudah dikonfirmasi belum ada)
      setShowOpening(true);
    } else {
      setShowOpening(false);
    }
  }, [needsOpening]);

  // ── Sync offline queue saat online kembali ───────────────────
  useEffect(() => {
    if (!isOnline) return;
    const OFFLINE_KEY = 'kpos_opening_offline_queue';
    try {
      const queue = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
      if (queue.length === 0) return;
      // Sync semua antrian di background
      localStorage.removeItem(OFFLINE_KEY);
      queue.forEach((entry:any) => {
        saveCashRegister(entry as Partial<any>).catch(() => {});
      });
    } catch { /* ignore */ }
  }, [isOnline]);

  const initDone    = useRef(false);
  const isMounted   = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; cleanup(); };
  }, [],   );

  useEffect(() => {
    const uid = user?.id || profile?.id;
    if (!uid || initDone.current) return;
    initDone.current = true;

    const init = async () => {
      const uid = user?.id || profile?.id;
      if (!uid) return;
      const cachedId = uid ? getCachedStoreId(uid) : null;
      try { localStorage.removeItem(EXPLICIT_SIGNOUT_KEY); } catch { /* ignore */ }

      if (cachedId) {
        console.info('[AppShell] Restoring cached store context', { storeId: cachedId, userId: uid });
        if (isMounted.current) setReady(true);
        loadAll(cachedId).catch(() => {});

        // Background verify
        try {
          const response = await getStores();
          const exists = response.items.some((entry) => entry.id === cachedId);
          if (!exists) {
             console.warn('[AppShell] Cached store no longer exists for user');
             localStorage.removeItem(getStoreCacheKey(uid!));
             initDone.current = false;
             if (isMounted.current) setReady(false);
             setTimeout(init, 500);
          } else {
            console.info('[AppShell] Store context revalidated with backend', { storeId: cachedId, userId: uid });
          }
        } catch { /* ignore */ }
        return;
      }

      setMessage('Menyiapkan toko...');
      try {
        const response = await getStores();
        let activeStore = response.items[0] || null;

        if (!activeStore) {
          setMessage('Membuat toko baru...');
          activeStore = await createStore({
            store_name: `Kedai ${profile?.username || user?.email?.split('@')[0] || 'Kopi'}`,
          });
        }

        if (!activeStore?.id) throw new Error('ID toko tidak ditemukan');

        setCachedStoreId(uid, activeStore.id);
        console.info('[AppShell] Active store prepared', { storeId: activeStore.id, userId: uid });
        if (isMounted.current) setReady(true);
        loadAll(activeStore.id).catch(() => {});

      } catch (e:any) {
        console.error('[AppShell] init failed:', e);
        if (isMounted.current) {
          showToast(e instanceof Error ? e.message : 'Gagal memuat. Cek koneksi.', 'error');
          // Jika gagal total, tampilkan UI kosong agar tidak stuck di spinner
          setReady(true);
        }
      }
    };

    init();
  }, [user?.id, profile?.id]);

  // Reset tampilan saat logout; pembersihan cache dilakukan di AuthContext
  useEffect(() => {
    if (!user?.id) {
      initDone.current = false;
      setReady(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!ready || !user?.id || !storeId || !isPostUpdateSyncPending() || postUpdateSyncing) return;

    let cancelled = false;
    setPostUpdateSyncing(true);

    const runPostUpdateSync = async () => {
      const tasks = await Promise.allSettled([
        refreshProfile(),
        subscriptionManager.getStatus(true).then(() => undefined),
        loadAll(storeId),
      ]);

      if (cancelled) return;

      const hasFailure = tasks.some((task) => task.status === 'rejected');
      if (!hasFailure) {
        markPostUpdateSyncComplete();
        if (postUpdateNotice?.firstLaunchAfterUpdate || (postUpdateNotice?.recoveredKeys.length ?? 0) > 0) {
          showToast('Data lama berhasil dipulihkan dan disinkronkan setelah update.', 'success');
        }
      } else {
        console.warn('[Upgrade] Post-update sync still pending', tasks);
      }

      setPostUpdateSyncing(false);
    };

    void runPostUpdateSync();

    return () => {
      cancelled = true;
    };
  }, [loadAll, postUpdateNotice?.firstLaunchAfterUpdate, postUpdateNotice?.recoveredKeys.length, postUpdateSyncing, ready, refreshProfile, showToast, storeId, user?.id]);

  useEffect(() => {
    const userId = user?.id || profile?.id;
    if (!userId) return;
    try {
      const scopedTab = getValidTab(localStorage.getItem(getLastTabStorageKey(userId)));
      const fallbackTab = getValidTab(localStorage.getItem(LS_LAST_TAB));
      const nextTab = scopedTab ?? fallbackTab ?? 'dashboard';
      setTab(nextTab);
      setLoadedTabs(createLoadedTabsState(nextTab));
    } catch {
      setTab('dashboard');
      setLoadedTabs(createLoadedTabsState('dashboard'));
    }
  }, [user?.id, profile?.id]);

  useEffect(() => {
    setLoadedTabs((current) => {
      if (current[tab]) return current;
      return { ...current, [tab]: true };
    });
  }, [tab]);

  const changeTab = useCallback(async (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(LS_LAST_TAB, t);
      const userId = user?.id || profile?.id;
      if (userId) {
        localStorage.setItem(getLastTabStorageKey(userId), t);
      }
    } catch { /* ignore */ }
    if (Capacitor.isNativePlatform()) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch { /* ignore */ }
    }
  }, [user?.id, profile?.id],   );

  useEffect(() => {
    const openTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: Tab }>).detail;
      if (detail?.tab && NAV.some((entry) => entry.id === detail.tab)) {
        void changeTab(detail.tab);
      }
    };

    window.addEventListener('kaffepos-open-tab', openTab as EventListener);
    return () => window.removeEventListener('kaffepos-open-tab', openTab as EventListener);
  }, [changeTab]);

  const toast = {
    showToast: (m: string, t?: ToastType) => showToast(m, t),
    showDownloadSuccess,
    showDownloadError
  };

  const renderTabPanel = (tabId: Tab, name: string, node: React.ReactNode) => {
    if (!loadedTabs[tabId]) return null;
    const isActive = tab === tabId;
    return (
      <section
        key={tabId}
        className={isActive ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}
        aria-hidden={!isActive}
      >
        <TabError name={name}>{node}</TabError>
      </section>
    );
  };

  if (!ready) return <AppLoading message={message} />;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50 overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top,0px)' }}>
      {postUpdateNotice && (postUpdateNotice.firstLaunchAfterUpdate || postUpdateNotice.recoveredKeys.length > 0) ? (
        <div className="px-3 pt-2 flex-shrink-0">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Update berhasil dipulihkan</p>
                <p className="mt-1 text-emerald-800/90">
                  {postUpdateSyncing
                    ? 'Kami sedang menyelaraskan ulang data lama kamu dengan server agar aplikasi langsung siap dipakai.'
                    : 'Pengaturan penting, tema, dan konteks toko lama sudah dibaca kembali dengan aman.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPostUpdateNotice(null)}
                className="shrink-0 rounded-full px-2 py-1 text-emerald-700 transition hover:bg-emerald-100"
                aria-label="Tutup notifikasi update"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Offline Banner ───────────────────────────── */}
      {!isOnline && (
        <div className="bg-amber-500 px-3 py-2 flex items-center justify-center gap-2 flex-shrink-0 text-center">
          <WifiOff size={13} className="text-white" />
          <p className="text-white text-xs font-bold leading-tight">Offline — data disimpan lokal, sync otomatis saat online</p>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom,0px))' }}>
        <Suspense fallback={<TabSpinner />}>
          {renderTabPanel('dashboard', 'Beranda', <DashboardTab />)}
          {renderTabPanel('pos', 'POS', <POSTab toast={toast} profile={profile} subscriptionAccess={subscriptionAccess} />)}
          {renderTabPanel('kitchen', 'Dapur', <KitchenTab toast={toast} profile={profile} />)}
          {renderTabPanel('warehouse', 'Gudang', <WarehouseTab toast={toast} />)}
          {renderTabPanel('menu', 'Menu', <MenuTab toast={toast} />)}
          {renderTabPanel('history', 'Riwayat', <HistoryTab toast={toast} subscriptionAccess={subscriptionAccess} />)}
          {renderTabPanel('report', 'Laporan', <ReportTab toast={toast} subscriptionAccess={subscriptionAccess} />)}
          {renderTabPanel('settings', 'Pengaturan', <SettingsTab toast={toast} isPro={isPro} profile={profile} subscriptionAccess={subscriptionAccess} />)}
        </Suspense>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex items-stretch justify-center bg-white border-t border-slate-100 z-40 px-2"
        style={{ height: 'calc(65px + env(safe-area-inset-bottom,0px))', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => changeTab(id)}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full transition-all active:scale-95 relative ${
                active ? 'text-orange-500' : 'text-slate-400'
              }`}
            >
              <div className={`flex flex-col items-center gap-0.5 ${active ? 'scale-110' : ''} transition-transform duration-300`}>
                <div className="relative">
                  <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                  {id === 'pos' && syncing && (
                    <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse border-2 border-white shadow-sm" title="Menyinkronkan data..." />
                  )}
                  {id === 'settings' && isPro && (
                    <span className="absolute -top-1.5 -right-2.5 w-4 h-4 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                      <span className="text-[8px] font-black text-white">✓</span>
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-extrabold tracking-tight truncate max-w-full px-1`}>
                  {label}
                </span>
              </div>
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full bg-orange-500 shadow-[0_2px_8px_rgba(249,115,22,0.4)]" />
              )}
            </button>
          );
        })}
      </nav>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Dialog saldo kasir harian wajib */}
      {showOpening && (
        <DailyOpeningModal
          cashierName={profile?.display_name || profile?.username || 'Kasir'}
          toast={{ showToast }}
          onDone={() => setShowOpening(false)}
        />
      )}
    </div>
  );
}
