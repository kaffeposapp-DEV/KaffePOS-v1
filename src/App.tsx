 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/App.tsx — KaffePOS v13 PKCE CODE VERIFIER RESTORE FIX
// FIX v13: Restore PKCE code verifier dari Preferences sebelum exchangeCodeForSession
// ROOT CAUSE: Android kill WebView sandboxed process saat Custom Tab aktif → localStorage hilang
// SOLUSI: Backup code verifier ke Capacitor Preferences (persisten) sebelum Browser.open()
//   - Browser.open() menggantikan window.open(_system)
//   - browserFinished event sebagai signal OAuth selesai
//   - appUrlOpen (via onNewIntent) tetap handle PKCE code exchange
import { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Network } from '@capacitor/network';
import { supabase } from './lib/supabase';
import { useLocation } from 'react-router-dom';
import { useStore } from './hooks/useStore';
import { autoConnectOnResume } from './utils/bluetoothPrinter';
import { getAuthModeFromLocation, hasAuthCallbackParams, isAuthSurfacePath } from './utils/authFlow';
import GlobalErrorBoundary from './components/ui/GlobalErrorBoundary';
import type { EmailOtpType } from '@supabase/supabase-js';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppShell = lazy(() => import('./components/AppShell'));
const PlanConfirmation = lazy(() => import('./pages/PlanConfirmation'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

function SplashScreen() {
  return (
    <div style={{ position:'fixed', inset:0, background:'#0b121e', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
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
          <span className="s-w1" style={{ display:'inline-block', fontSize:38, fontWeight:900, color:'#ffffff', lineHeight:1.15 }}>Atur</span>
          {' '}
          <span className="s-w2" style={{ display:'inline-block', fontSize:38, fontWeight:900, color:'#d8823b', lineHeight:1.15 }}>Kafemu</span>
        </div>
        <div style={{ marginBottom:20 }}>
        <div className="s-dw" style={{ display:'flex', gap:9, justifyContent:'center' }}>
          <div className="s-d1" style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#C8843A' }} />
          <div className="s-d2" style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#C8843A' }} />
          <div className="s-d3" style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#C8843A' }} />
        </div>
      </div>
    </div>
  </div>
  );
}

function AuthLoading() {
  return (
    <div style={{ position:'fixed', inset:0, background:'#0b121e', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontSize:36 }}>☕</div>
      <div style={{ width:32, height:32, border:'3px solid #d8823b', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function getParamFromDeepLink(url: URL, key: string) {
  return url.searchParams.get(key) || new URLSearchParams(url.hash.replace(/^#/, '')).get(key);
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
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, maxWidth: 320, width: '100%' }}>
        <p style={{ fontWeight: 900, fontSize: 18, marginBottom: 8, color: '#1e293b' }}>Keluar dari KaffePOS?</p>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Semua data akan tetap tersimpan.</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: '12px 0', border: '2px solid #e2e8f0', borderRadius: 14, fontWeight: 700, fontSize: 14, color: '#475569', background: '#fff' }}>
            Batal
          </button>
          <button onClick={onConfirm}
            style={{ flex: 1, padding: '12px 0', background: '#ef4444', border: 'none', borderRadius: 14, fontWeight: 900, fontSize: 14, color: '#fff' }}>
            Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const requiresPasswordReset = typeof window !== 'undefined' && localStorage.getItem('kaffepos_password_reset_required') === '1';
  const currentAuthMode = getAuthModeFromLocation(location.pathname, location.search);
  const onAuthSurface = isAuthSurfacePath(location.pathname);
  if (loading) return <AuthLoading />;
  if (requiresPasswordReset && currentAuthMode !== 'reset') {
    return <Navigate to="/reset-password" replace />;
  }
  if (isAuthenticated && onAuthSurface && !requiresPasswordReset) {
    return <Navigate to="/" replace />;
  }
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <AppShell /> : <LandingPage />} />
      <Route path="/welcome" element={<LandingPage />} />
      <Route path="/plan-confirmation" element={<PlanConfirmation />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage />} />
      <Route path="/forgot-password" element={<AuthPage />} />
      <Route path="/reset-password" element={<AuthPage />} />
      <Route path="/admin" element={
        isAuthenticated ? <AdminPanel /> : <Navigate to="/login" replace />
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
  const { loading: authLoading } = useAuth();

  const handleAuthRedirect = useCallback(async (rawUrl: string) => {
    const processedUrl = rawUrl
      .replace('id.kaffeepos.app://', 'https://kaffepos.my.id/')
      .replace('kaffepos://', 'https://kaffepos.my.id/');

    const urlObj = new URL(processedUrl);
    if (!hasAuthCallbackParams(urlObj)) return false;

    try {
      const code = getParamFromDeepLink(urlObj, 'code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error('[OAuth] Exchange error:', error.message);
        if (data?.session) {
          localStorage.removeItem('kaffepos_pending_verification');
          localStorage.removeItem('kaffepos_registered_email');
          setSplashDone(true);
        }
      }

      const tokenHash = getParamFromDeepLink(urlObj, 'token_hash');
      const otpType = getParamFromDeepLink(urlObj, 'type') as EmailOtpType | null;
      if (tokenHash && otpType) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (error) console.error('[DeepLink] verifyOtp error:', error.message);
        if (data?.session) {
          if (otpType === 'recovery') {
            localStorage.setItem('kaffepos_password_reset_required', '1');
            window.history.replaceState({}, '', '/reset-password');
          } else {
            localStorage.removeItem('kaffepos_pending_verification');
            localStorage.removeItem('kaffepos_registered_email');
          }
          setSplashDone(true);
        } else if (otpType === 'signup') {
          localStorage.removeItem('kaffepos_pending_verification');
          localStorage.removeItem('kaffepos_registered_email');
          window.history.replaceState({}, '', '/login?verified=1');
        }
      }

      const accessToken = getParamFromDeepLink(urlObj, 'access_token');
      const refreshToken = getParamFromDeepLink(urlObj, 'refresh_token');
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) console.error('[DeepLink] setSession error:', error.message);
        if (data?.session) {
          const type = getParamFromDeepLink(urlObj, 'type');
          const looksLikeRecovery = type === 'recovery' || rawUrl.includes('reset-password');
          if (looksLikeRecovery) {
            localStorage.setItem('kaffepos_password_reset_required', '1');
            window.history.replaceState({}, '', '/reset-password');
          } else {
            localStorage.removeItem('kaffepos_pending_verification');
            localStorage.removeItem('kaffepos_registered_email');
          }
          setSplashDone(true);
        }
      }
    } catch (e) {
      console.error('[DeepLink] Global error:', e);
    } finally {
      setSplashDone(true);
      if (Capacitor.isNativePlatform()) {
        await Browser.close().catch(() => {});
      }
    }

    return true;
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

  // ── Deep link: Google OAuth PKCE callback & Email Confirmation ────────────────────────
  useEffect(() => {
    const urlListener = CapApp.addListener('appUrlOpen', async ({ url }) => {
      // Handle deep links for both Google OAuth and Email confirmation
      if (url.includes('login-callback') || 
          url.includes('email-confirmed') ||
          url.includes('reset-password') ||
          url.includes('access_token') ||
          url.includes('token_hash=') ||
          url.includes('type=signup') ||
          url.includes('type=recovery') ||
          url.includes('code=')) {
        await handleAuthRedirect(url);
      }
    });

    return () => {
      urlListener.then(l => l.remove());
    };
  }, [handleAuthRedirect],   );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    handleAuthRedirect(window.location.href).catch((error) => {
      console.error('[WebAuthCallback] Failed to process auth callback:', error);
    });
  }, [handleAuthRedirect]);

  // ── FIX 4: APP Lifecycle & Network Status ──────────────────────
  useEffect(() => {
    // Network status listener
    const statusListener = Network.addListener('networkStatusChange', async (status) => {
      setIsOffline(!status.connected);
      if (status.connected) {
        // syncOfflineQueue equivalent: flushPending writes
        import('./hooks/useStore').then(mod => {
          const state = mod.useStore.getState() as any;
          if (state.flushPending) state.flushPending();
        }).catch(() => {});
        // resubscribeRealtime equivalent: reload data (includes channel setup)
        const { storeId, loadAll } = useStore.getState();
        if (storeId) loadAll(storeId);
      }
    });

    // App state listener (Active/Background)
    const stateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        // syncDataFromSupabase equivalent: reload everything
        const { storeId, loadAll } = useStore.getState();
        if (storeId) loadAll(storeId);
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
  }, [],   );

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
