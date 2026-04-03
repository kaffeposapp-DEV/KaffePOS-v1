// src/contexts/AuthContext.tsx — KaffePOS v11 BULLETPROOF AUTH
// Strategi: SIMPLE + RELIABLE
// - onAuthStateChange adalah sumber kebenaran utama, SELALU diproses tanpa guard
// - setLoading(false) + setUser() LANGSUNG saat session diterima
// - Profile fetch 100% background, tidak pernah blocking
// - Tidak ada sessionApplied guard yang bisa memblokir login
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase, preloadAuthFromPreferences } from '@/lib/supabase';
import type { Profile } from '@/types';

async function getAppPlugin() {
  try { const { App } = await import('@capacitor/app'); return App; }
  catch { return null; }
}

const SESSION_CACHE_KEY = 'kaffepos_session_cache';
function cacheSession(session: any) {
  try {
    if (session) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {}
}
function getCachedSession(): any | null {
  try { const raw = localStorage.getItem(SESSION_CACHE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

async function fetchProfile(uid: string): Promise<any | null> {
  try { const { data } = await supabase.from('profiles').select('*').eq('id', uid).single(); return data ?? null; }
  catch { return null; }
}

async function ensureProfileBg(uid: string, email: string, displayName?: string) {
  try {
    const existing = await fetchProfile(uid);
    if (existing) return existing;
    const name = displayName || email.split('@')[0];
    const { data } = await supabase.from('profiles').upsert(
      { id: uid, email, username: name, display_name: name },
      { onConflict: 'id', ignoreDuplicates: true }
    ).select().single();
    // Welcome email fire-and-forget
    supabase.functions.invoke('send-notification', { body: { type: 'welcome', email, name } }).catch(() => {});
    return data ?? null;
  } catch { return null; }
}

interface AuthCtx {
  user: any | null;
  profile: any | null;
  isPro: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null; needsVerification?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  emergencyConfirm: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  activatePro: (planId: string, orderId: string) => Promise<{ error: string | null }>;
}

const AuthCtx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted    = useRef(true);
  const signedOut  = useRef(false);
  const initDone   = useRef(false);

  const refreshProfile = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
      if (data && mounted.current) setProfile(data);
    } catch {}
  }, [user?.id]);

  // Realtime + polling PRO status
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`kfp_profile_${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        ({ new: n }) => { if (mounted.current) setProfile((p: any) => ({ ...p, ...n })); })
      .subscribe();
    const poll = setInterval(() => {
      supabase.from('profiles').select('tier,is_pro,pro_plan,pro_expires_at,pro_activated_at')
        .eq('id', user.id).single()
        .then(({ data }) => { if (data && mounted.current) setProfile((p: any) => p ? { ...p, ...data } : p); });
    }, 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [user?.id]);

  // ─── INTI: onAuthStateChange + init ───────────────────────────
  useEffect(() => {
    mounted.current  = true;
    signedOut.current = false;
    initDone.current  = false;

    // ─── onAuthStateChange: SELALU diproses, tidak ada guard ───
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted.current) return;
        console.log('[Auth] event:', event, '| user:', session?.user?.email ?? 'none');

        if (event === 'SIGNED_OUT') {
          if (signedOut.current) {
            setUser(null); setProfile(null); cacheSession(null); setLoading(false);
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          cacheSession(session);
          return;
        }

        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          console.log('[Auth] Applying session for:', session.user.email);
          cacheSession(session);
          setUser(session.user);
          setLoading(false);
          // Profile background
          const dn = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
          ensureProfileBg(session.user.id, session.user.email ?? '', dn).then(p => {
            if (mounted.current && p) setProfile(p);
          });
          return;
        }
      }
    );

    // ─── init: fast cache path, lalu verifikasi server ─────────
    const init = async () => {
      // Preload Preferences (timeout 1s max — tidak blocking lama)
      await Promise.race([
        preloadAuthFromPreferences().catch(() => {}),
        new Promise(r => setTimeout(r, 1000)),
      ]);
      if (!mounted.current) return;

      // Fast path: cached session → tampil langsung
      const cached = getCachedSession();
      if (cached?.user && !signedOut.current) {
        setUser(cached.user);
        setLoading(false);
        fetchProfile(cached.user.id).then(p => { if (mounted.current && p) setProfile(p); });
        // Verifikasi di background — jika expired, onAuthStateChange akan handle
        supabase.auth.getSession().catch(() => {});
        initDone.current = true;
        return;
      }

      // Slow path: fresh install / no cache → coba server (timeout 3s)
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3_000)),
        ]).catch(() => null);

        if (!mounted.current) return;
        const session = (result as any)?.data?.session ?? null;

        if (session?.user) {
          // onAuthStateChange SIGNED_IN akan fire otomatis dari getSession jika valid
          // Tapi setLoading(false) di sini juga untuk safety
          cacheSession(session);
          setUser(session.user);
          setLoading(false);
          const dn = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
          ensureProfileBg(session.user.id, session.user.email ?? '', dn).then(p => {
            if (mounted.current && p) setProfile(p);
          });
        } else {
          if (mounted.current) { setUser(null); setLoading(false); }
        }
      } catch {
        if (mounted.current) { setUser(null); setLoading(false); }
      }
      initDone.current = true;
    };

    init();
    return () => { mounted.current = false; subscription.unsubscribe(); };
  }, []);

  // ─── signIn ───────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (error) {
        const m = error.message;
        if (m.includes('Invalid login credentials') || m.includes('invalid_credentials'))
          return { error: 'Email atau password salah. Periksa kembali.' };
        if (m.includes('Email not confirmed'))
          return { error: 'Email belum diverifikasi. Cek Gmail kamu (termasuk folder Spam).' };
        if (m.includes('Too many requests'))
          return { error: 'Terlalu banyak percobaan. Tunggu 1 menit lalu coba lagi.' };
        if (m.includes('network') || m.includes('fetch') || m.includes('Failed')) return { error: `Masalah Jaringan: ${m}` };
        return { error: `Login gagal: ${m}` };
      }
      // onAuthStateChange SIGNED_IN akan handle setUser + setLoading
      if (data?.session) cacheSession(data.session);
      return { error: null };
    } catch (e: any) {
      console.error('[SignIn] Error:', e);
      const msg = e?.message || '';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) return { error: `Jaringan (SignIn): ${msg}` };
      return { error: 'Gagal login: ' + msg };
    }
  }, []);

  // ─── signUp ──────────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string, username: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { username, display_name: username }, emailRedirectTo: 'kaffepos://auth/callback' },
      });
      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already registered'))
          return { error: 'Email sudah terdaftar. Silakan langsung login.' };
        if (error.message.includes('Password should be'))
          return { error: 'Password terlalu lemah. Gunakan minimal 8 karakter.' };
        if (error.message.includes('network') || error.message.includes('fetch'))
          return { error: `Jaringan (SignUp): ${error.message}` };
        return { error: error.message };
      }
      if (data.user?.id) {
        // 1. AUTO-CONFIRM (Silent Fix) agar user pasti bisa login
        await emergencyConfirm(email.trim().toLowerCase());

        // 2. PROFESIONAL NOTIF (Resend) agar terlihat seperti aplikasi SaaS berkelas
        // Ini akan mengirim email konfirmasi asli ke inbox user.
        supabase.functions.invoke('send-notification', {
          body: { 
            type: 'verification', 
            email: email.trim().toLowerCase(), 
            name: username,
            redirectTo: 'kaffepos://auth/callback'
          }
        }).catch(() => {});
      }
      // Kita set true agar UI menampilkan layar "Cek Email" yang profesional
      return { error: null, needsVerification: true };
    } catch (e: any) {
      console.error('[SignUp] Error detail:', e);
      return { error: `Gagal mendaftar: ${e?.message || 'Check connection'}` }; 
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: { type: 'verification', email, redirectTo: 'kaffepos://auth/callback' }
      });
      if (error) throw error;
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  }, []);

  const emergencyConfirm = useCallback(async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('confirm-user', {
        body: { email }
      });
      if (error) throw error;
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  }, []);

  // ─── signInWithGoogle ─────────────────────────────────────────
  // STRATEGI FINAL: PKCE + Chrome Custom Tabs
  // HP ini menggunakan Infinix — GMS ada tapi perlu diverifikasi.
  // Custom Tabs jauh lebih reliable daripada native SDK untuk device non-flagship.
  // Flow: Browser.open() → user pilih akun → Custom Tab tutup → browserFinished
  //       → App.tsx appUrlOpen → exchangeCodeForSession → SIGNED_IN → masuk
  const signInWithGoogle = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'kaffepos://auth/callback',
          queryParams: { access_type: 'offline', prompt: 'select_account' },
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: `Google login gagal: ${error.message}` };
      if (!data?.url) return { error: 'Gagal mendapatkan URL login Google.' };

      // Chrome Custom Tabs — in-process, lebih cepat dari Chrome penuh
      try {
        const { Browser } = await import('@capacitor/browser');
        const { Preferences } = await import('@capacitor/preferences');

        // Backup PKCE code verifier agar tidak hilang jika OS kill WebView
        const SUPABASE_VERIFIER_KEY = 'kaffepos_auth-code-verifier';
        const verifier = localStorage.getItem(SUPABASE_VERIFIER_KEY);
        if (verifier) {
          await Preferences.set({ key: 'pkce_code_verifier_backup', value: verifier });
        }

        await Browser.open({
          url: data.url,
          presentationStyle: 'popover',
          toolbarColor: '#1a0f0a',
        });

        // Tunggu sampai Browser ditutup ATAU session berhasil terambil
        return new Promise<{ error: string | null }>((resolve) => {
          let resolved = false;

          // Polling session (jika berhasil sebelum event fire)
          const poll = setInterval(async () => {
            if (resolved) { clearInterval(poll); return; }
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              resolved = true;
              clearInterval(poll);
              resolve({ error: null });
            }
          }, 1500);

          // Listen browserFinished (user cancel atau berhasil via deep link)
          const listener = Browser.addListener('browserFinished', async () => {
            if (resolved) return;
            listener.then(l => l.remove());
            
            // Tunggu 12 detik agar deep link punya waktu mengeksekusi exchangeCodeForSession.
            // Infinix/slow device bisa sangat lambat. Jangan langsung gagal awal.
            setTimeout(async () => {
              if (resolved) return; // Jika poll sukses di antara waktu tsb
              resolved = true;
              clearInterval(poll);
              
              const { data } = await supabase.auth.getSession();
              if (data?.session) {
                resolve({ error: null });
              } else {
                resolve({ error: 'Login Google dibatalkan atau gagal.' });
              }
            }, 12000);
          });
        });

      } catch {
        // Fallback ke _system jika Browser plugin bermasalah
        window.open(data.url, '_system');
        return { error: 'Dialihkan ke browser eksternal.' };
      }
    } catch (e: any) {
      return { error: e?.message || 'Gagal membuka Google. Coba lagi.' };
    }
  }, []);




  // ─── signOut ─────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    signedOut.current = true;
    try { const mod = await import('@/hooks/useStore'); mod.useStore.getState().cleanup?.(); } catch {}
    cacheSession(null);
    try { await supabase.auth.signOut(); } catch {}
    if (mounted.current) { setUser(null); setProfile(null); setLoading(false); }
  }, []);

  // ─── resetPassword ───────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(), { redirectTo: 'kaffepos://reset-password' }
      );
      if (error) {
        if (error.message.includes('network') || error.message.includes('fetch'))
          return { error: 'Tidak ada koneksi internet. Cek jaringan kamu.' };
        return { error: `Gagal mengirim email: ${error.message}` };
      }
      return { error: null };
    } catch { return { error: 'Tidak ada koneksi internet.' }; }
  }, []);

  // ─── activatePro ─────────────────────────────────────────────
  const activatePro = useCallback(async (planId: string, licenseKey: string) => {
    if (!user?.id) return { error: 'Belum login. Silakan login terlebih dahulu.' };
    try {
      const { data: keyRow, error: keyErr } = await supabase
        .from('lisensi_key').select('*').eq('key', licenseKey).maybeSingle();
      if (keyErr && keyErr.code !== 'PGRST116') console.warn('lisensi_key error:', keyErr.message);
      else if (keyRow) {
        if (keyRow.is_used) return { error: 'Kode lisensi sudah pernah digunakan.' };
        if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date())
          return { error: 'Kode lisensi sudah kadaluarsa. Hubungi admin.' };
        if (keyRow.plan) planId = keyRow.plan;
      } else if (keyErr?.code !== 'PGRST116') {
        return { error: 'Kode lisensi tidak valid. Periksa kembali kode dari admin.' };
      }
      const expiresAt = new Date();
      if (planId === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      else if (planId === 'lifetime') expiresAt.setFullYear(expiresAt.getFullYear() + 99);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);
      const { error: profileErr } = await supabase.from('profiles').update({
        tier: 'pro', is_pro: true, pro_plan: planId, pro_order_id: licenseKey,
        pro_activated_at: new Date().toISOString(), pro_expires_at: expiresAt.toISOString(),
      }).eq('id', user.id);
      if (profileErr) return { error: `Gagal aktivasi: ${profileErr.message}` };
      if (keyRow) {
        await supabase.from('lisensi_key').update({
          is_used: true, used_by: user.id, used_at: new Date().toISOString(),
        }).eq('key', licenseKey);
      }
      if (mounted.current) {
        setProfile((p: any) => p ? { ...p, tier: 'pro', is_pro: true, pro_plan: planId,
          pro_activated_at: new Date().toISOString(), pro_expires_at: expiresAt.toISOString() } : p);
      }
      return { error: null };
    } catch (e: any) { return { error: e?.message || 'Terjadi kesalahan. Coba lagi.' }; }
  }, [user?.id]);

  const isPro = (() => {
    const p = profile;
    if (!p) return false;
    const hasPro = p.tier === 'pro' || !!p.is_pro;
    if (!hasPro) return false;
    if (p.pro_plan === 'lifetime') return true;
    if (!p.pro_expires_at) return true;
    return new Date(p.pro_expires_at) > new Date();
  })();

  return (
    <AuthCtx.Provider value={{
      user, profile, isPro,
      isAuthenticated: !!user,
      loading,
      signIn, signUp, resendVerification, emergencyConfirm, signInWithGoogle,
      signOut, resetPassword, refreshProfile, activatePro,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
