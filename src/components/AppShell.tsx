 
 
 
 
 
/* eslint-disable react-hooks/exhaustive-deps */
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/AppShell.tsx — KaffePOS v5 — FAST INIT: cache storeId, show instantly
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { ShoppingBag, Package, Tag, History, BarChart3, Settings, WifiOff, LayoutDashboard } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/hooks/useStore';
import { supabase } from '@/lib/supabase';
import { getStoreCacheKey } from '@/utils/sessionIsolation';
import { ToastContainer, useToast } from './ui/Toast';
import DailyOpeningModal, { useNeedsOpeningCash } from './pos/DailyOpeningModal';
import type { Tab, ToastType } from '@/types';

const DashboardTab = lazy(() => import('./dashboard/Dashboard'));
const POSTab       = lazy(() => import('./pos/POSTab'));
const WarehouseTab = lazy(() => import('./warehouse/WarehouseTab'));
const MenuTab      = lazy(() => import('./menu/MenuTab'));
const HistoryTab   = lazy(() => import('./history/HistoryTab'));
const ReportTab    = lazy(() => import('./report/ReportTab'));
const SettingsTab  = lazy(() => import('./settings/SettingsTab'));

const NAV = [
  { id: 'dashboard' as Tab, label: 'Beranda',    icon: LayoutDashboard },
  { id: 'pos'       as Tab, label: 'POS',       icon: ShoppingBag },
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
    warehouse: initialTab === 'warehouse',
    menu: initialTab === 'menu',
    history: initialTab === 'history',
    report: initialTab === 'report',
    settings: initialTab === 'settings',
  };
}

export default function AppShell() {
  const { user, profile, isPro } = useAuth();
  const { loadAll, cleanup, syncing, cashRegister, isOnline, saveCashRegister } = useStore();

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
        if (isMounted.current) setReady(true);
        loadAll(cachedId).catch(() => {});
        
        // Background verify
        try {
          const { data, error } = await supabase.from('stores')
            .select('id').eq('id', cachedId).eq('owner_id', uid).maybeSingle();
          if (error || !data) {
             console.warn('[AppShell] Cache mismatch or RLS error:', error);
             // Don't reset if it's just a network error
             if (error && !error.message.includes('fetch')) {
                localStorage.removeItem(getStoreCacheKey(uid!));
                initDone.current = false;
                if (isMounted.current) setReady(false);
                setTimeout(init, 500);
             }
          }
        } catch { /* ignore */ }
        return;
      }

      setMessage('Menyiapkan toko...');
      try {
        const { data: store, error: fetchError } = await supabase
          .from('stores').select('id').eq('owner_id', uid).maybeSingle();

        if (fetchError) {
           console.error('[AppShell] fetchStore error:', fetchError);
           throw new Error(`Gagal memuat data toko: ${fetchError.message}`);
        }

        let activeStore = store;

        if (!activeStore) {
          setMessage('Membuat toko baru...');
          const { data: ns, error: insError } = await supabase.from('stores').insert({
            owner_id:   uid,
            store_name: `Kedai ${profile?.username || user?.email?.split('@')[0] || 'Kopi'}`,
          }).select('id').single();
          
          if (insError) {
             console.error('[AppShell] createStore error:', insError);
             throw new Error(`Gagal membuat toko baru: ${insError.message}`);
          }
          activeStore = ns;
        }

        if (!activeStore?.id) throw new Error('ID toko tidak ditemukan');

        setCachedStoreId(uid, activeStore.id);
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

      {/* ── Offline Banner ───────────────────────────── */}
      {!isOnline && (
        <div className="bg-amber-500 px-4 py-1.5 flex items-center justify-center gap-2 flex-shrink-0">
          <WifiOff size={13} className="text-white" />
          <p className="text-white text-xs font-bold">Offline — data disimpan lokal, sync otomatis saat online</p>
        </div>
      )}

      <main className="flex-1 overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom,0px))' }}>
        <Suspense fallback={<TabSpinner />}>
          {renderTabPanel('dashboard', 'Beranda', <DashboardTab />)}
          {renderTabPanel('pos', 'POS', <POSTab toast={toast} profile={profile} />)}
          {renderTabPanel('warehouse', 'Gudang', <WarehouseTab toast={toast} />)}
          {renderTabPanel('menu', 'Menu', <MenuTab toast={toast} />)}
          {renderTabPanel('history', 'Riwayat', <HistoryTab toast={toast} />)}
          {renderTabPanel('report', 'Laporan', <ReportTab toast={toast} isPro={isPro} />)}
          {renderTabPanel('settings', 'Pengaturan', <SettingsTab toast={toast} isPro={isPro} profile={profile} />)}
        </Suspense>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex items-start justify-around bg-white border-t border-slate-100 z-40"
        style={{ height: 'calc(60px + env(safe-area-inset-bottom,0px))', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => changeTab(id)}
              className={`flex flex-col items-center justify-center flex-1 h-full pt-1.5 pb-1 gap-0.5 transition-all active:scale-90 active:bg-orange-50 rounded-lg mx-0.5 ${
                active ? 'text-orange-500' : 'text-slate-400'
              }`}>
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                {id === 'pos' && syncing && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-green-400 rounded-full animate-pulse border border-white" title="Menyinkronkan data..." />
                )}
                {id === 'settings' && isPro && (
                  <span className="absolute -top-1.5 -right-2.5 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center">
                    <span style={{ fontSize: 7, fontWeight: 900, color: 'white' }}>✓</span>
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-bold tracking-tight ${active ? 'text-orange-500' : 'text-slate-400'}`}>{label}</span>
              {active && <div className="w-4 h-0.5 rounded-full bg-orange-500" />}
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
