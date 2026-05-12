




/* eslint-disable react-hooks/exhaustive-deps */



/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/AppShell.tsx — KaffePOS v5 — FAST INIT: cache storeId, show instantly
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy, useMemo } from 'react';
import { ShoppingBag, Package, Tag, History, BarChart3, Settings, WifiOff, LayoutDashboard, ChefHat, RefreshCw, LogOut, Trophy, BadgePercent, Target } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/hooks/useStore';
import { createStore, getStores, getSubscriptionUsageLimits, type SubscriptionUsageLimits } from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import { getStoreCacheKey } from '@/utils/sessionIsolation';
import { ToastContainer, useToast } from './ui/Toast';
import DailyOpeningModal, { useNeedsOpeningCash } from './pos/DailyOpeningModal';
import SyncConflictCenter from './sync/SyncConflictCenter';
import type { Tab, ToastType } from '@/types';
import { isPostUpdateSyncPending, markPostUpdateSyncComplete, readUpgradeReport } from '@/lib/appUpgrade';
import { subscriptionManager } from '@/services/SubscriptionManager';
import { canAccessTab, getDefaultTabForRole, getVisibleTabs } from '@/lib/accessControl';
import { selectStoreForBootstrap } from '@/lib/storeContext';
import { trackClientError } from '@/lib/opsMetrics';
import { captureFrontendError } from '@/lib/errorTracking';
import UpgradeModal from './subscription/UpgradeModal';
import SmartUpgradeBanner from './subscription/SmartUpgradeBanner';
import NotificationBell from './notifications/NotificationBell';
import NotificationCenter from './notifications/NotificationCenter';
import CelebrationHost from './gamification/Celebration';
import BetaFeedbackButton from './beta/BetaFeedbackButton';
import {
  cacheSubscriptionUsageLimits,
  daysSince,
  dispatchUpgradePrompt,
  getOrCreateUpgradeFirstSeen,
  markUpgradePromptDismissed,
  readCachedSubscriptionUsageLimits,
  shouldThrottleUpgradePrompt,
  type UpgradePromptRequest,
} from '@/lib/upgradePrompts';
import LOGO_ICON from '@/assets/logo-kaffeposappicon.svg';

const DashboardTab = lazy(() => import('./dashboard/Dashboard'));
const StaffPersonalProfileTab = lazy(() => import('./gamification/StaffPersonalProfile'));
const ChallengesTab = lazy(() => import('./challenges/ChallengesPage'));
const POSTab       = lazy(() => import('./pos/POSTab'));
const LoyaltyTab   = lazy(() => import('./loyalty/LoyaltyTab'));
const KitchenTab   = lazy(() => import('./kitchen/KitchenTab'));
const WarehouseTab = lazy(() => import('./warehouse/WarehouseTab'));
const MenuTab      = lazy(() => import('./menu/MenuTab'));
const HistoryTab   = lazy(() => import('./history/HistoryTab'));
const ReportTab    = lazy(() => import('./report/ReportTab'));
const SettingsTab  = lazy(() => import('./settings/SettingsTab'));

const NAV = [
  { id: 'dashboard' as Tab, label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'performance' as Tab, label: 'Performa', icon: Trophy },
  { id: 'challenges' as Tab, label: 'Misi', icon: Target },
  { id: 'pos'       as Tab, label: 'Kasir',      icon: ShoppingBag },
  { id: 'loyalty'   as Tab, label: 'Loyalty',    icon: BadgePercent },
  { id: 'kitchen'   as Tab, label: 'Dapur',     icon: ChefHat },
  { id: 'warehouse' as Tab, label: 'Stok',       icon: Package     },
  { id: 'menu'      as Tab, label: 'Produk',     icon: Tag         },
  { id: 'history'   as Tab, label: 'Transaksi',  icon: History     },
  { id: 'report'    as Tab, label: 'Laporan',    icon: BarChart3   },
  { id: 'settings'  as Tab, label: 'Lainnya',    icon: Settings    },
] as const;

const LS_LAST_TAB  = 'kpos_last_tab';
const EXPLICIT_SIGNOUT_KEY = 'kaffepos_explicit_signout';

// ── Error boundary ────────────────────────────────────────────────
class TabError extends React.Component<{ name: string; children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: Error) {
    console.error('[TabError]', e);
    void trackClientError(e, {
      source: 'tab_error_boundary',
      metadata: { tabName: this.props.name },
    });
    captureFrontendError(e, {
      source: 'tab_error_boundary',
      metadata: { tabName: this.props.name },
    });
  }
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
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center gap-6">
      <div className="relative">
         <div className="text-6xl animate-bounce duration-2000">☕</div>
         <div className="absolute -inset-6 border-4 border-[#FF6A00]/5 border-t-[#FF6A00] rounded-full animate-spin" />
      </div>
      <p className="text-[12px] font-black text-slate-400 tracking-[0.3em] uppercase italic">{message || 'Memuat...'}</p>
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
    performance: initialTab === 'performance',
    challenges: initialTab === 'challenges',
    pos: initialTab === 'pos',
    loyalty: initialTab === 'loyalty',
    kitchen: initialTab === 'kitchen',
    warehouse: initialTab === 'warehouse',
    menu: initialTab === 'menu',
    history: initialTab === 'history',
    report: initialTab === 'report',
    settings: initialTab === 'settings',
  };
}

export default function AppShell() {
  const { user, profile, isPro, subscriptionAccess, refreshProfile, role, can } = useAuth();
  const {
    storeId,
    loadAll,
    cleanup,
    syncing,
    cashRegister,
    isOnline,
    saveCashRegister,
    syncStatus,
    pendingSyncCount,
    failedSyncCount,
    flushPending,
    transactions,
    activeChallenges,
    challengeProgress,
  } = useStore();

  const [tab, setTab] = useState<Tab>(() => {
    try {
      return getValidTab(localStorage.getItem(LS_LAST_TAB)) ?? 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [loadedTabs, setLoadedTabs] = useState<Record<Tab, boolean>>(() => createLoadedTabsState(tab));
  const hasOpenChallenge = activeChallenges.some((challenge) => (
    challenge.is_active && !challengeProgress.some((progress) => progress.challenge_id === challenge.id && progress.is_completed)
  ));

  const [ready,   setReady]   = useState(false);
  const [message, setMessage] = useState('Memuat...');
  const [postUpdateSyncing, setPostUpdateSyncing] = useState(false);
  const [postUpdateNotice, setPostUpdateNotice] = useState(() => readUpgradeReport());
  const [showSyncCenter, setShowSyncCenter] = useState(false);
  const [subscriptionUsage, setSubscriptionUsage] = useState<SubscriptionUsageLimits | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePromptRequest | null>(null);
  const [upgradeBannerDismissedAt, setUpgradeBannerDismissedAt] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'kaffepos-open-notifications') {
        setNotificationsOpen(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const handleUpgradePrompt = (event: Event) => {
      const detail = (event as CustomEvent<UpgradePromptRequest>).detail;
      if (!detail) return;
      setUpgradePrompt({
        recommendedPlan: 'signature',
        ...detail,
      });
    };

    window.addEventListener('kaffepos-upgrade-prompt', handleUpgradePrompt as EventListener);
    return () => window.removeEventListener('kaffepos-upgrade-prompt', handleUpgradePrompt as EventListener);
  }, []);

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

      setMessage('Menyiapkan toko...');
      try {
        const response = await getStores();
        const canCreateStore = can('can_manage_settings');
        const assignedStoreId = role === 'cashier' ? profile?.assigned_store_id ?? null : null;
        const decision = selectStoreForBootstrap({
          stores: response.items,
          cachedStoreId: cachedId,
          assignedStoreId,
          canCreateStore,
        });

        if (decision.shouldClearCachedStore) {
          localStorage.removeItem(getStoreCacheKey(uid));
        }

        let activeStore = decision.store;

        if (!activeStore) {
          if (!decision.needsOwnerStoreCreation) {
            setMessage('Akun kasir belum terhubung ke outlet.');
            showToast('Akun kasir belum terhubung ke outlet. Minta Owner/Admin menyiapkan akses kasir.', 'warning');
            if (isMounted.current) setReady(true);
            return;
          }
          setMessage('Membuat toko baru...');
          activeStore = await createStore({
            store_name: `Kedai ${profile?.username || user?.email?.split('@')[0] || 'Kopi'}`,
          });
        }

        if (!activeStore?.id) throw new Error('ID toko tidak ditemukan');

        setCachedStoreId(uid, activeStore.id);
        if (role === 'cashier' && assignedStoreId && activeStore.id !== assignedStoreId) {
          void refreshProfile();
        }
        console.info('[AppShell] Active store prepared', { storeId: activeStore.id, userId: uid });
        if (isMounted.current) setReady(true);
        loadAll(activeStore.id).catch(() => {});

      } catch (e:any) {
        console.error('[AppShell] init failed:', e);
        if (isMounted.current) {
          showToast(normalizeUserFacingError(e, 'Aplikasi belum bisa memuat data toko. Cek koneksi lalu coba lagi.'), 'error');
          // Jika gagal total, tampilkan UI kosong agar tidak stuck di spinner
          setReady(true);
        }
      }
    };

    init();
  }, [user?.id, profile?.id, profile?.assigned_store_id, role, refreshProfile]);

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
    if (!ready || !storeId || !user?.id) return;
    let cancelled = false;

    const cached = readCachedSubscriptionUsageLimits(storeId);
    if (cached) setSubscriptionUsage(cached);

    getSubscriptionUsageLimits(storeId)
      .then((usage) => {
        if (cancelled) return;
        setSubscriptionUsage(usage);
        cacheSubscriptionUsageLimits(storeId, usage);
      })
      .catch(() => {
        if (!cancelled && cached) setSubscriptionUsage(cached);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, storeId, user?.id, transactions.length]);

  const localMonthlyTransactionCount = useMemo(() => {
    const now = new Date();
    return transactions.filter((tx) => {
      if (tx.is_void) return false;
      const txDate = new Date(tx.date);
      return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    }).length;
  }, [transactions]);

  const effectiveUsage = useMemo(() => {
    if (subscriptionUsage) return subscriptionUsage;
    const limit = subscriptionAccess.transactionLimit;
    const percent = limit > 0 ? Math.min(100, Math.round((localMonthlyTransactionCount / limit) * 100)) : 0;
    const firstSeen = getOrCreateUpgradeFirstSeen(user?.id || profile?.id, profile?.created_at ?? null);
    return {
      storeId: storeId || '',
      ownerId: profile?.owner_id || profile?.id || '',
      currentPlan: subscriptionAccess.plan,
      transactionLimit: limit,
      transactionsUsed: localMonthlyTransactionCount,
      transactionsRemaining: limit > 0 ? Math.max(limit - localMonthlyTransactionCount, 0) : null,
      percentUsed: percent,
      period: { type: 'monthly' as const, startsAt: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() },
      firstActivityAt: firstSeen,
      daysSinceFirstActivity: daysSince(firstSeen),
      shouldShowTransactionLimitPrompt: limit > 0 && percent >= 80 && localMonthlyTransactionCount < limit,
      shouldShowAppAgePrompt: subscriptionAccess.plan === 'secangkir' && daysSince(firstSeen) >= 14,
      isTrial: subscriptionAccess.isTrial,
      trialEndsAt: subscriptionAccess.expiryDate,
      trialDaysRemaining: subscriptionAccess.isTrial ? subscriptionAccess.daysRemaining : null,
      shouldShowTrialUpgradePrompt: subscriptionAccess.isTrial && [4, 2, 1].includes(subscriptionAccess.daysRemaining ?? -1),
    };
  }, [localMonthlyTransactionCount, profile?.created_at, profile?.id, profile?.owner_id, storeId, subscriptionAccess.daysRemaining, subscriptionAccess.expiryDate, subscriptionAccess.isTrial, subscriptionAccess.plan, subscriptionAccess.transactionLimit, subscriptionUsage, user?.id]);

  const transactionLimitPromptKey = `transaction_limit_80:${storeId || 'local'}`;
  const appAgePromptKey = `app_age_14_days:${user?.id || profile?.id || 'local'}`;
  const showTransactionLimitBanner = useMemo(() => Boolean(
    effectiveUsage.transactionLimit > 0 &&
    effectiveUsage.percentUsed >= 80 &&
    effectiveUsage.transactionsUsed < effectiveUsage.transactionLimit &&
    !shouldThrottleUpgradePrompt(storeId, transactionLimitPromptKey, 3)
  ), [effectiveUsage.percentUsed, effectiveUsage.transactionLimit, effectiveUsage.transactionsUsed, storeId, transactionLimitPromptKey, upgradeBannerDismissedAt]);

  useEffect(() => {
    if (!ready || !user?.id || upgradePrompt) return;
    if (subscriptionAccess.isTrial) return;
    if (!effectiveUsage.shouldShowAppAgePrompt) return;
    if (shouldThrottleUpgradePrompt(user.id, appAgePromptKey, 14)) return;

    dispatchUpgradePrompt({
      trigger: 'app_age_14_days',
      promptKey: appAgePromptKey,
      recommendedPlan: 'signature',
      title: 'Sudah 14 hari memakai KaffePOS',
      description: role === 'cashier'
        ? 'Outlet ini sudah aktif dipakai. Minta Owner/Admin meninjau paket Signature saat fitur premium mulai dibutuhkan.'
        : 'Jika operasional sudah mulai rutin, paket Signature membuka AI Insight, multi kasir, laporan lanjutan, dan printer thermal dalam satu paket.',
      metadata: { daysSinceFirstActivity: effectiveUsage.daysSinceFirstActivity },
    });
  }, [appAgePromptKey, effectiveUsage.daysSinceFirstActivity, effectiveUsage.shouldShowAppAgePrompt, ready, role, subscriptionAccess.isTrial, upgradePrompt, user?.id]);

  useEffect(() => {
    if (!ready || !user?.id || upgradePrompt) return;
    if (!subscriptionAccess.isTrial || subscriptionAccess.daysRemaining === null) return;
    const daysLeft = subscriptionAccess.daysRemaining;
    const daysUsed = 14 - daysLeft;
    if (![10, 12, 13].includes(daysUsed)) return;
    const promptKey = `secangkir_trial_day_${daysUsed}:${user.id}`;
    if (shouldThrottleUpgradePrompt(user.id, promptKey, 1)) return;

    dispatchUpgradePrompt({
      trigger: `trial_day_${daysUsed}`,
      promptKey,
      recommendedPlan: 'signature',
      title: `Trial Signature tersisa ${daysLeft} hari`,
      description: role === 'cashier'
        ? 'Minta Owner/Admin memilih paket agar fitur premium tetap aktif setelah trial.'
        : 'Upgrade ke Signature kapan saja agar Gamification, Advanced Kopi Passport Loyalty, AI Insights, dan Notification Center tetap aktif setelah trial.',
      metadata: { daysUsed, daysLeft, trialEndsAt: subscriptionAccess.expiryDate },
    });
  }, [ready, role, subscriptionAccess.daysRemaining, subscriptionAccess.expiryDate, subscriptionAccess.isTrial, upgradePrompt, user?.id]);

  useEffect(() => {
    const userId = user?.id || profile?.id;
    if (!userId) return;
    try {
      const scopedTab = getValidTab(localStorage.getItem(getLastTabStorageKey(userId)));
      const fallbackTab = getValidTab(localStorage.getItem(LS_LAST_TAB));
      const requestedTab = scopedTab ?? fallbackTab ?? getDefaultTabForRole(role);
      const nextTab = canAccessTab(role, requestedTab) ? requestedTab : getDefaultTabForRole(role);
      setTab(nextTab);
      setLoadedTabs(createLoadedTabsState(nextTab));
    } catch {
      const defaultTab = getDefaultTabForRole(role);
      setTab(defaultTab);
      setLoadedTabs(createLoadedTabsState(defaultTab));
    }
  }, [user?.id, profile?.id, role]);

  useEffect(() => {
    setLoadedTabs((current) => {
      if (current[tab]) return current;
      return { ...current, [tab]: true };
    });
  }, [tab]);

  const changeTab = useCallback(async (t: Tab) => {
    if (!canAccessTab(role, t)) {
      showToast('Akses fitur ini hanya untuk Owner/Admin.', 'warning');
      const fallbackTab = getDefaultTabForRole(role);
      setTab(fallbackTab);
      return;
    }
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
  }, [user?.id, profile?.id, role, showToast],   );

  useEffect(() => {
    if (canAccessTab(role, tab)) return;
    void changeTab(getDefaultTabForRole(role));
  }, [changeTab, role, tab]);

  useEffect(() => {
    const openTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: Tab }>).detail;
      if (detail?.tab && NAV.some((entry) => entry.id === detail.tab) && canAccessTab(role, detail.tab)) {
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
    if (!canAccessTab(role, tabId)) return null;
    if (!loadedTabs[tabId]) return null;
    const isActive = tab === tabId;
    return (
      <section
        key={tabId}
        className={isActive ? 'kaffe-responsive-surface flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden' : 'hidden'}
        aria-hidden={!isActive}
      >
        <TabError name={name}>{node}</TabError>
      </section>
    );
  };

  if (!ready) return <AppLoading message={message} />;

  return (
    <div className="kaffe-app-bg kaffe-responsive-surface fixed inset-0 flex overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top,0px)' }}>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="kaffe-sidebar hidden lg:flex flex-col w-[232px] backdrop-blur-xl border-r z-50">
        <div className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 group cursor-pointer" onClick={() => changeTab('dashboard')}>
              <img src={LOGO_ICON} alt="" className="h-9 w-9 object-contain" />
              <span className="text-[18px] font-extrabold tracking-tight text-slate-900">
                Kaffe<span className="text-[#FF6A00]">POS</span>
              </span>
            </div>
            <NotificationBell onOpen={() => setNotificationsOpen(true)} className="h-10 w-10 rounded-xl" />
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto scrollbar-hide">
          {NAV.filter((entry) => getVisibleTabs(role).includes(entry.id)).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => changeTab(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 relative group ${
                  active ? 'bg-orange-50 text-[#FF6A00]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <div className="transition-all duration-200">
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                </div>
                <span className="font-bold text-[13px] transition-all">{label}</span>
                {active && (
                  <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#FF6A00]" />
                )}
                {id === 'pos' && syncing && (
                  <span className="ml-auto w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                )}
                {id === 'challenges' && hasOpenChallenge && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-[#FF6A00] shadow-[0_0_0_3px_rgba(255,106,0,0.12)]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
           <button
             onClick={() => {
                localStorage.setItem(EXPLICIT_SIGNOUT_KEY, '1');
                import('@/contexts/AuthContext').then(m => (m as any).useAuth.getState().signOut());
             }}
             className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-all font-bold text-[13px]"
           >
             <LogOut size={18} /> Keluar
           </button>
        </div>
      </aside>

      <div className="kaffe-responsive-surface flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="pointer-events-none absolute right-3 top-3 z-50 lg:hidden">
          <NotificationBell onOpen={() => setNotificationsOpen(true)} className="pointer-events-auto" />
        </div>

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

        {showTransactionLimitBanner && (
          <SmartUpgradeBanner
            used={effectiveUsage.transactionsUsed}
            limit={effectiveUsage.transactionLimit}
            percent={effectiveUsage.percentUsed}
            role={role}
            onDismiss={() => {
              markUpgradePromptDismissed(storeId, transactionLimitPromptKey);
              setUpgradeBannerDismissedAt(Date.now());
            }}
            onUpgrade={() => {
              dispatchUpgradePrompt({
                trigger: 'transaction_limit_80',
                promptKey: transactionLimitPromptKey,
                recommendedPlan: 'kopi_susu',
                title: 'Transaksi gratis hampir mencapai batas',
                description: role === 'cashier'
                  ? 'Paket gratis outlet ini hampir penuh. Minta Owner/Admin upgrade agar transaksi kasir tetap berjalan tanpa batas.'
                  : 'Upgrade ke Kopi Susu atau Signature untuk transaksi tanpa batas dan akses laporan yang lebih lengkap.',
                metadata: {
                  used: effectiveUsage.transactionsUsed,
                  limit: effectiveUsage.transactionLimit,
                  percent: effectiveUsage.percentUsed,
                },
              });
            }}
          />
        )}

        {/* ── Status Banner ───────────────────────────── */}
        {(!isOnline || syncStatus === 'syncing' || syncStatus === 'sync_failed' || syncStatus === 'sync_success') && (
          <div className={`kaffe-status-banner px-3 sm:px-4 py-2 flex items-center justify-center gap-2 sm:gap-3 flex-shrink-0 shadow-sm z-50 animate-in slide-up ${
            syncStatus === 'sync_failed'
              ? 'bg-rose-500'
              : syncStatus === 'sync_success'
                ? 'bg-emerald-500'
                : syncStatus === 'syncing'
                  ? 'bg-slate-900'
                  : 'bg-amber-500'
          }`}>
            {syncStatus === 'syncing' ? <RefreshCw size={12} className="text-white animate-spin" /> : <WifiOff size={12} className="text-white" />}
            <p className="min-w-0 break-words text-white text-[10px] font-black uppercase tracking-[0.16em] sm:tracking-widest leading-tight">
              {syncStatus === 'sync_failed'
                ? `${failedSyncCount || pendingSyncCount} data gagal sinkron`
                : syncStatus === 'sync_success'
                  ? 'Semua data tersinkron'
                  : syncStatus === 'syncing'
                    ? `Sinkronisasi ${pendingSyncCount || 1} data...`
                    : `Mode Offline Aktif${pendingSyncCount ? ` (${pendingSyncCount} pending)` : ''}`}
            </p>
            {syncStatus === 'sync_failed' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSyncCenter(true)}
                  className="rounded-lg bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/30 transition-all"
                >
                  Detail
                </button>
                <button
                  type="button"
                  onClick={() => void flushPending()}
                  className="rounded-lg bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/30 transition-all"
                >
                  Ulangi
                </button>
              </>
            )}
            {(pendingSyncCount > 0 && syncStatus !== 'sync_failed') && (
              <button
                type="button"
                onClick={() => setShowSyncCenter(true)}
                className="rounded-lg bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/30 transition-all"
              >
                Lihat
              </button>
            )}
          </div>
        )}

        <main className="kaffe-responsive-surface flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px))' }}>
          <Suspense fallback={<TabSpinner />}>
            {renderTabPanel('dashboard', 'Beranda', <DashboardTab />)}
            {renderTabPanel('performance', 'Performa', <StaffPersonalProfileTab profile={profile} role={role} />)}
            {renderTabPanel('challenges', 'Misi Harian', <ChallengesTab profile={profile} role={role} subscriptionAccess={subscriptionAccess} />)}
            {renderTabPanel('pos', 'POS', <POSTab toast={toast} profile={profile} subscriptionAccess={subscriptionAccess} />)}
            {renderTabPanel('loyalty', 'Loyalty', <LoyaltyTab toast={toast} profile={profile} role={role} subscriptionAccess={subscriptionAccess} />)}
            {renderTabPanel('kitchen', 'Dapur', <KitchenTab toast={toast} profile={profile} />)}
            {renderTabPanel('warehouse', 'Stok', <WarehouseTab toast={toast} />)}
            {renderTabPanel('menu', 'Menu', <MenuTab toast={toast} />)}
            {renderTabPanel('history', 'Riwayat', <HistoryTab toast={toast} subscriptionAccess={subscriptionAccess} />)}
            {renderTabPanel('report', 'Laporan', <ReportTab toast={toast} subscriptionAccess={subscriptionAccess} />)}
            {renderTabPanel('settings', 'Pengaturan', <SettingsTab toast={toast} isPro={isPro} profile={profile} subscriptionAccess={subscriptionAccess} />)}
          </Suspense>
        </main>

        {/* ── MOBILE NAV (Bottom) ── */}
        <nav className="kaffe-bottom-nav lg:hidden flex items-stretch justify-start overflow-x-auto bg-white/95 backdrop-blur-xl border-t border-orange-100/80 z-40 px-1 shadow-[0_-12px_32px_rgba(255,106,0,0.10)]"
          style={{ height: 'calc(64px + env(safe-area-inset-bottom,0px))', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
          {NAV.filter((entry) => getVisibleTabs(role).includes(entry.id)).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => changeTab(id)}
                className={`flex h-full w-[74px] flex-none flex-col items-center justify-center transition-all relative min-w-0 ${
                  active ? 'text-[#FF6A00]' : 'text-slate-400 hover:text-slate-600'
                }`}
                aria-label={`Buka tab ${label}`}
              >
                <div className="flex flex-col items-center gap-1 transition-all duration-200">
                  <div className="relative">
                    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                    {id === 'pos' && syncing && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping border border-white shadow-sm" />
                    )}
                    {id === 'challenges' && hasOpenChallenge && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full border border-white bg-[#FF6A00] shadow-sm" />
                    )}
                  </div>
                  <span className="max-w-full truncate px-1 text-[10px] font-semibold">
                    {label}
                  </span>
                </div>
                {active && (
                  <div className="absolute top-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-b-lg bg-[#FF6A00]" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <SyncConflictCenter
        open={showSyncCenter}
        onClose={() => setShowSyncCenter(false)}
        storeId={storeId}
        role={role}
        onRetryAll={flushPending}
      />
      <UpgradeModal
        open={Boolean(upgradePrompt)}
        onClose={() => setUpgradePrompt(null)}
        role={role}
        currentPlan={effectiveUsage.currentPlan || subscriptionAccess.plan}
        recommendedPlan={upgradePrompt?.recommendedPlan || 'signature'}
        trigger={upgradePrompt?.trigger}
        promptKey={upgradePrompt?.promptKey}
        title={upgradePrompt?.title}
        description={upgradePrompt?.description}
        storeId={storeId}
        toast={toast}
        metadata={upgradePrompt?.metadata}
      />
      <NotificationCenter
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        storeId={storeId}
      />
      <CelebrationHost />
      <BetaFeedbackButton storeId={storeId} toast={toast} />

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
