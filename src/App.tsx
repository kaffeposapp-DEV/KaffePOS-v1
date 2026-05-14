 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { useLocation } from 'react-router-dom';
import { useStore } from './hooks/useStore';
import { autoConnectOnResume } from './utils/bluetoothPrinter';
import { getAuthModeFromLocation, isAuthSurfacePath } from './utils/authFlow';
import { initAnalytics, trackPageView } from '@/lib/analytics';
import GlobalErrorBoundary from './components/ui/GlobalErrorBoundary';
import { isAdminCommissionEnabled } from '@/lib/config/feature-flags';
import Modal from './components/ui/Modal';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppShell = lazy(() => import('./components/AppShell'));
const PlanConfirmation = lazy(() => import('./pages/PlanConfirmation'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const AdminAffiliatePage = lazy(() => import('./pages/admin/AdminAffiliatePage'));
const AdminReferralPage = lazy(() => import('./pages/admin/AdminReferralPage'));
const AdminCommissionPage = lazy(() => import('./pages/admin/AdminCommissionPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const SystemStatusPage = lazy(() => import('./pages/SystemStatusPage'));
const IS_MOBILE_TARGET_BUILD = import.meta.env.VITE_APP_TARGET === 'mobile';
const LandingPage = IS_MOBILE_TARGET_BUILD
  ? (() => null)
  : lazy(() => import('./pages/LandingPage'));

function SplashScreen() {
  return (
    <div style={{ position:'fixed', inset:0, background:'#ffffff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <style>{`
        @keyframes ws{0%{opacity:0;transform:translateY(28px);filter:blur(4px)}100%{opacity:1;transform:none;filter:none}}
        @keyframes lg{0%{width:0;opacity:0}100%{width:48px;opacity:1}}
        @keyframes sf{0%{opacity:0;letter-spacing:6px}100%{opacity:1;letter-spacing:2px}}
        @keyframes dp{0%,80%,100%{transform:scale(.4);opacity:.15}40%{transform:scale(1.3);opacity:1}}
        .s-w1{animation:ws 1s cubic-bezier(.22,1,.36,1) .3s both}
        .s-w2{animation:ws 1s cubic-bezier(.22,1,.36,1) 1s both}
        .s-w3{animation:ws 1s cubic-bezier(.22,1,.36,1) 1.7s both}
        .s-lg{animation:lg .7s ease 2.6s both;width:0;opacity:0}
        .s-st{animation:sf 1.2s ease 3.2s both;opacity:0}
        .s-dw{animation:sf .8s ease 4.2s both;opacity:0}
        .s-d1{animation:dp 1.8s infinite 0s}
        .s-d2{animation:dp 1.8s infinite .35s}
        .s-d3{animation:dp 1.8s infinite .7s}
      `}</style>
      <div style={{ textAlign:'center', padding:'0 36px' }}>
        <div style={{ marginBottom:6 }}>
          <span className="s-w1" style={{ display:'inline-block', fontSize:42, fontStyle: 'italic', fontWeight:900, color:'#1e293b', lineHeight:1.15, textTransform: 'uppercase', letterSpacing: 0 }}>Kaffe</span>
          {' '}
          <span className="s-w2" style={{ display:'inline-block', fontSize:42, fontStyle: 'italic', fontWeight:900, color:'#FF6A00', lineHeight:1.15, textTransform: 'uppercase', letterSpacing: 0 }}>POS</span>
        </div>
        <div style={{ marginBottom:20 }}>
        <div className="s-dw" style={{ display:'flex', gap:9, justifyContent:'center' }}>
          <div className="s-d1" style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#FF6A00' }} />
          <div className="s-d2" style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#FF6A00' }} />
          <div className="s-d3" style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#FF6A00' }} />
        </div>
      </div>
    </div>
  </div>
  );
}

function AuthLoading() {
  return (
    <div style={{ position:'fixed', inset:0, background:'#ffffff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontSize:42 }}>☕</div>
      <div style={{ width:32, height:32, border:'4px solid #FF6A0010', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Offline Banner ─────────────────────────────────────────────
function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1e293b', color: '#fff',
      padding: '8px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontSize: 12, fontWeight: 700,
      paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
    }}>
      <span>📶</span> Mode Offline — Data disimpan lokal, sync saat online kembali
    </div>
  );
}

// ── Exit Confirm Dialog ────────────────────────────────────────
function ExitConfirmDialog({ show, onConfirm, onCancel }: { show: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      open={show}
      onClose={onCancel}
      labelledBy="exit-confirm-title"
      overlayClassName="z-[99999]"
      panelClassName="w-full max-w-[320px] rounded-[24px] p-6"
    >
        <p id="exit-confirm-title" className="mb-2 text-lg font-black text-slate-800">Keluar dari KaffePOS?</p>
        <p className="mb-5 text-[13px] font-medium leading-relaxed text-slate-500">Semua data akan tetap tersimpan.</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 active:scale-95"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-2xl bg-rose-500 py-3 text-sm font-black text-white active:scale-95"
          >
            Keluar
          </button>
        </div>
    </Modal>
  );
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const isNative = Capacitor.isNativePlatform() || IS_MOBILE_TARGET_BUILD;
  const currentAuthMode = getAuthModeFromLocation(location.pathname, location.search);
  const onAuthSurface = isAuthSurfacePath(location.pathname);

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  if (loading) return <AuthLoading />;
  if (isAuthenticated && onAuthSurface && currentAuthMode !== 'reset') {
    return <Navigate to="/" replace />;
  }
  return (
    <Routes>
      <Route path="/" element={
        isAuthenticated ? <AppShell /> : (isNative ? <Navigate to="/login" replace /> : <LandingPage />)
      } />
      <Route path="/welcome" element={isNative ? <Navigate to="/login" replace /> : <LandingPage />} />
      <Route path="/plan-confirmation" element={<PlanConfirmation />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage />} />
      <Route path="/forgot-password" element={<AuthPage />} />
      <Route path="/reset-password" element={<AuthPage />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/terms-of-service" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/privacy-policy" element={<LegalPage kind="privacy" />} />
      <Route path="/system-status" element={<SystemStatusPage />} />
      <Route path="/admin" element={
        isAuthenticated ? <AdminPanel /> : <Navigate to="/login" replace />
      } />
      <Route path="/admin/affiliates" element={
        isAuthenticated ? (isAdminCommissionEnabled() ? <AdminAffiliatePage /> : <Navigate to="/admin" replace />) : <Navigate to="/login" replace />
      } />
      <Route path="/admin/referrals" element={
        isAuthenticated ? (isAdminCommissionEnabled() ? <AdminReferralPage /> : <Navigate to="/admin" replace />) : <Navigate to="/login" replace />
      } />
      <Route path="/admin/commissions" element={
        isAuthenticated ? (isAdminCommissionEnabled() ? <AdminCommissionPage /> : <Navigate to="/admin" replace />) : <Navigate to="/login" replace />
      } />
      <Route path="/*" element={
        isAuthenticated ? <AppShell /> : <Navigate to="/" replace />
      } />
    </Routes>
  );
}

export default function App() {
  const [splashDone,   setSplashDone]   = useState(false);
  const [isOffline,    setIsOffline]    = useState(false);
  const [showExitDlg,  setShowExitDlg]  = useState(false);
  const backPressTime  = useRef<number>(0);
  const reloadInFlightRef = useRef(false);
  const lastReloadAtRef = useRef(0);
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    initAnalytics();
  }, []);

  const reloadStoreData = useCallback(async (reason: 'network-online' | 'app-active') => {
    const now = Date.now();
    // Hindari storm request saat event lifecycle menembak beruntun di Android.
    if (reloadInFlightRef.current || now - lastReloadAtRef.current < 5000) return;

    const { storeId, loadAll } = useStore.getState();
    if (!storeId) return;

    reloadInFlightRef.current = true;
    lastReloadAtRef.current = now;
    try {
      await loadAll(storeId);
      if (reason === 'network-online') {
        import('./hooks/useStore').then((mod) => {
          const state = mod.useStore.getState() as any;
          if (state.flushPending) state.flushPending();
        }).catch(() => {});
      }
    } catch {
      // no-op: flow existing tetap berjalan meski reload gagal.
    } finally {
      reloadInFlightRef.current = false;
    }
  }, []);

  // Splash singkat agar launch terasa responsif seperti aplikasi produksi.
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 700);
    return () => clearTimeout(t);
  }, [],   );

  // Jika auth resolve lebih cepat (misal cache fast path), tutup splash segera
  useEffect(() => {
    if (!authLoading && !splashDone) setSplashDone(true);
  }, [authLoading, splashDone]);

  // Back button Android
  useEffect(() => {
    const handler = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }
      // Double tap back untuk keluar (atau tampilkan dialog)
      const now = Date.now();
      if (now - backPressTime.current < 2000) {
        CapApp.exitApp();
      } else {
        backPressTime.current = now;
        setShowExitDlg(true);
        // Auto hide setelah 3 detik
        setTimeout(() => setShowExitDlg(false), 3000);
      }
    });
    return () => { handler.then(h => h.remove()); };
  }, [],   );

  // ── FIX 4: APP Lifecycle & Network Status ──────────────────────
  useEffect(() => {
    // Network status listener
    const statusListener = Network.addListener('networkStatusChange', async (status) => {
      setIsOffline(!status.connected);
      if (status.connected) {
        await reloadStoreData('network-online');
      }
    });

    // App state listener (Active/Background)
    const stateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        await reloadStoreData('app-active');
        // printerService.autoReconnect equivalent
        autoConnectOnResume().catch(() => {});
      }
    });

    // Initial check
    Network.getStatus().then(s => setIsOffline(!s.connected)).catch(() => {});

    return () => {
      statusListener.then(l => l.remove());
      stateListener.then(l => l.remove());
    };
  }, [reloadStoreData],   );

  if (!splashDone) return <SplashScreen />;

  return (
    <GlobalErrorBoundary>
      <OfflineBanner show={isOffline} />
      <ExitConfirmDialog
        show={showExitDlg}
        onConfirm={() => CapApp.exitApp()}
        onCancel={() => setShowExitDlg(false)}
      />
      <Suspense fallback={<AuthLoading />}>
        <AppRoutes />
      </Suspense>
    </GlobalErrorBoundary>
  );
}
