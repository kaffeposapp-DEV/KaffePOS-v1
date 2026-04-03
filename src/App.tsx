// src/App.tsx — KaffePOS v13 PKCE CODE VERIFIER RESTORE FIX
// FIX v13: Restore PKCE code verifier dari Preferences sebelum exchangeCodeForSession
// ROOT CAUSE: Android kill WebView sandboxed process saat Custom Tab aktif → localStorage hilang
// SOLUSI: Backup code verifier ke Capacitor Preferences (persisten) sebelum Browser.open()
//   - Browser.open() menggantikan window.open(_system)
//   - browserFinished event sebagai signal OAuth selesai
//   - appUrlOpen (via onNewIntent) tetap handle PKCE code exchange
import React, { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Network } from '@capacitor/network';
import { supabase } from './lib/supabase';
import { useLocation } from 'react-router-dom';
import { useStore } from './hooks/useStore';
import { autoConnectOnResume } from './utils/bluetoothPrinter';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppShell = lazy(() => import('./components/AppShell'));

function SplashScreen() {
  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
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
          <span className="s-w1" style={{ display:'inline-block', fontSize:38, fontWeight:900, color:'#1a0f0a', lineHeight:1.15 }}>Atur</span>
          {' '}
          <span className="s-w2" style={{ display:'inline-block', fontSize:38, fontWeight:900, color:'#C8843A', lineHeight:1.15 }}>Kafemu</span>
        </div>
        <div style={{ marginBottom:20 }}>
          <span className="s-w3" style={{ display:'inline-block', fontSize:38, fontWeight:900, color:'#1a0f0a', lineHeight:1.15 }}>Tanpa Ampas.</span>
        </div>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:22 }}>
          <div className="s-lg" style={{ height:2.5, backgroundColor:'#C8843A', borderRadius:2 }} />
        </div>
        <p className="s-st" style={{ color:'#b08060', fontSize:11, fontWeight:600, textTransform:'uppercase', marginBottom:52, letterSpacing:'2px' }}>
          Dibuat dengan Secangkir Kopi
        </p>
        <div className="s-dw" style={{ display:'flex', gap:9, justifyContent:'center' }}>
          <div className="s-d1" style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#C8843A' }} />
          <div className="s-d2" style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#C8843A' }} />
          <div className="s-d3" style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#C8843A' }} />
        </div>
      </div>
    </div>
  );
}

function AuthLoading() {
  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontSize:36 }}>☕</div>
      <div style={{ width:32, height:32, border:'3px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
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
  if (loading) return <AuthLoading />;
  if (isAuthenticated && location.pathname === '/auth') {
    return <Navigate to="/" replace />;
  }
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/*" element={
        isAuthenticated ? <AppShell /> : <Navigate to="/auth" replace />
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

  // Splash: max 1.5 detik (cukup untuk animasi intro, tidak bikin bosen)
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1500);
    return () => clearTimeout(t);
  }, []);

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
  }, []);

  // ── Deep link: Google OAuth PKCE callback ─────────────────────────────────
  // v13 FIX: Restore PKCE code verifier dari Capacitor Preferences sebelum exchange
  // Background: Saat Browser.open() → Chrome Custom Tab dibuka, Android bisa kill
  // WebView sandboxed process (memory pressure). Ini menghapus localStorage termasuk
  // PKCE code verifier. exchangeCodeForSession akan gagal dengan 'invalid_grant'.
  // SOLUSI: signInWithGoogle backup code verifier ke Preferences, kita restore di sini.
  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      if (!url || !url.includes('kaffepos://')) return;
      try {
        // Parse URL — bisa dalam format:
        // kaffepos://auth/callback?code=xxx  (PKCE — ini yang benar)
        // kaffepos://auth/callback#access_token=xxx  (implicit — sudah deprecated)
        const urlObj = new URL(url.replace('kaffepos://', 'https://kaffepos.app/'));
        const code = urlObj.searchParams.get('code');

        if (code) {
          // ── PKCE flow: restore code verifier, lalu exchange code ─────────
          console.log('[OAuth v13] PKCE code received, restoring code verifier...');
          try {
            const { Preferences } = await import('@capacitor/preferences');
            // Key yang Supabase gunakan: storageKey + '-code-verifier'
            const VERIFIER_PREF_KEY = 'pkce_code_verifier_backup';
            const SUPABASE_VERIFIER_KEY = 'kaffepos_auth-code-verifier';

            // Cek apakah verifier sudah ada di localStorage
            const existingVerifier = localStorage.getItem(SUPABASE_VERIFIER_KEY);
            if (!existingVerifier) {
              // Tidak ada → restore dari Preferences (backup sebelum Browser.open)
              const { value: backedUpVerifier } = await Preferences.get({ key: VERIFIER_PREF_KEY });
              if (backedUpVerifier) {
                console.log('[OAuth v13] Verifier hilang dari localStorage, restore dari Preferences...');
                localStorage.setItem(SUPABASE_VERIFIER_KEY, backedUpVerifier);
                localStorage.setItem(`sb_${SUPABASE_VERIFIER_KEY}`, backedUpVerifier);
              } else {
                console.warn('[OAuth v13] Verifier tidak ada di Preferences juga — login mungkin gagal');
              }
            }
          } catch (prefErr) {
            console.warn('[OAuth v13] Preferences restore error:', prefErr);
          }

          console.log('[OAuth v13] Exchanging code for session...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn('[OAuth v13] exchangeCodeForSession error:', error.message);
            // Jika error 'invalid_grant', code sudah dipakai atau expired
            // Coba getSession() dulu — mungkin sebelumnya sudah berhasil
            const { data: existingSession } = await supabase.auth.getSession();
            if (existingSession?.session?.user) {
              console.log('[OAuth v13] Session sudah ada (sebelumnya berhasil):', existingSession.session.user.email);
              setSplashDone(true);
            }
          } else if (data?.session) {
            console.log('[OAuth v13] Session exchanged OK —', data.session.user?.email);
            setSplashDone(true);
          }
          return;
        }

        // ── Fallback: implicit flow (token di fragment) ──
        const hash = url.indexOf('#');
        if (hash !== -1) {
          const params = new URLSearchParams(url.slice(hash + 1));
          const access_token  = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            console.log('[OAuth v13] Implicit tokens in fragment, calling setSession...');
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (!error) setSplashDone(true);
          }
        }
      } catch (e) {
        console.warn('[OAuth v13] handleDeepLink error:', e);
      }
    };

    CapApp.getLaunchUrl().then(({ url }) => {
      if (url) handleDeepLink(url);
    }).catch(() => {});

    const urlListener = CapApp.addListener('appUrlOpen', ({ url }) => {
      handleDeepLink(url);
    });

    // ── browserFinished: Custom Tab ditutup ──────────────────────────────────
    // Ketika Chrome Custom Tab ditutup (karena redirect ke kaffepos://):
    // 1. appUrlOpen (via onNewIntent) sudah/sedang proses exchangeCodeForSession
    // 2. browserFinished kita gunakan sebagai FAIL-SAFE jika appUrlOpen miss
    const browserListener = Browser.addListener('browserFinished', async () => {
      console.log('[Browser] Custom Tab ditutup — aktif cek session...');

      // Cek apakah ada URL yang belum di-handle (untuk kasus appUrlOpen miss)
      try {
        const { url: launchUrl } = await CapApp.getLaunchUrl();
        if (launchUrl && launchUrl.includes('code=')) {
          console.log('[Browser] getLaunchUrl punya code, handle sekarang...');
          await handleDeepLink(launchUrl);
        }
      } catch {}

      // Tunggu sampai session terisi (exchange code butuh ~1-2 detik)
      // Retry 5x dengan interval 1.5 detik
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            console.log('[Browser] Session OK setelah', (i + 1) * 1.5, 'detik');
            return;
          }
        } catch {}
        console.log('[Browser] Session belum ada, retry', i + 1, '/ 5...');
      }
      console.warn('[Browser] Session tidak ditemukan setelah 7.5 detik');
    });

    return () => {
      urlListener.then(l => l.remove());
      browserListener.then(l => l.remove());
    };
  }, []);

  // Offline detection
  useEffect(() => {
    const checkInitial = async () => {
      try {
        const { connected } = await Network.getStatus();
        setIsOffline(!connected);
      } catch {}
    };
    checkInitial();

    const listener = Network.addListener('networkStatusChange', ({ connected }) => {
      setIsOffline(!connected);
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // FIX #4: Re-sync dan flush pending writes saat app kembali dari background (Android)
  useEffect(() => {
    const appResumeListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // App kembali ke foreground — flush pending offline writes & reload data
        const { storeId, loadAll } = useStore.getState();
        if (storeId) {
          // Flush pending writes dulu (transaksi offline), lalu sync data
          import('./hooks/useStore').then(mod => {
            const state = mod.useStore.getState() as any;
            if (state.flushPending) state.flushPending();
          }).catch(() => {});
          loadAll(storeId);
        }
        // FIX #2: Auto-reconnect printer saat resume (silent, tidak blocking)
        autoConnectOnResume().catch(() => {});
      }
    });
    return () => { appResumeListener.then(l => l.remove()); };
  }, []);

  if (!splashDone) return <SplashScreen />;

  return (
    <>
      <OfflineBanner show={isOffline} />
      <ExitConfirmDialog
        show={showExitDlg}
        onConfirm={() => CapApp.exitApp()}
        onCancel={() => setShowExitDlg(false)}
      />
      <Suspense fallback={<AuthLoading />}>
        <AppRoutes />
      </Suspense>
    </>
  );
}
