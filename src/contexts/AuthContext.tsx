/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/contexts/AuthContext.tsx — KaffePOS v11 BULLETPROOF AUTH
// Strategi: SIMPLE + RELIABLE
// - onAuthStateChange adalah sumber kebenaran utama, SELALU diproses tanpa guard
// - setLoading(false) + setUser() LANGSUNG saat session diterima
// - Profile fetch 100% background, tidak pernah blocking
// - Tidak ada sessionApplied guard yang bisa memblokir login
import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { AUTH_REDIRECT_URL, PASSWORD_RESET_REDIRECT_URL, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { Profile } from '@/types';
import { clearUserCache, redirectToLogin, setActiveUserId, getActiveUserId } from '@/utils/sessionIsolation';
import { loginSchema, signUpSchema } from '@/utils/validation';

// Removed unused getAppPlugin

const SESSION_CACHE_KEY = 'kaffepos_session_cache';
const EXPLICIT_SIGNOUT_KEY = 'kaffepos_explicit_signout';

async function cacheSession(session: Session | null) {
  try {
    if (Capacitor.isNativePlatform()) {
      if (session) await Preferences.set({ key: SESSION_CACHE_KEY, value: JSON.stringify(session) });
      else await Preferences.remove({ key: SESSION_CACHE_KEY });
      return;
    }
    if (session) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_CACHE_KEY);
  } catch { /* ignore */ }
}
async function getCachedSession(): Promise<Session | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: SESSION_CACHE_KEY });
      return value ? JSON.parse(value) as Session : null;
    }
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? JSON.parse(raw) as Session : null;
  } catch {
    return null;
  }
}

async function fetchProfile(uid: string): Promise<Profile | null> {
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

async function sendVerificationEmailViaEdge(email: string, name?: string) {
  const { status, data } = await invokeEdgeFunctionJson('send-notification', {
    type: 'verification',
    email,
    name: name || email.split('@')[0],
    redirectTo: AUTH_REDIRECT_URL,
  });

  if (status >= 400) {
    throw new Error(String(data?.error || 'Gagal mengirim email verifikasi.'));
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type NativeAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: Session['user'] | null;
  code?: string | null;
  msg?: string | null;
  error_code?: string | null;
  error_description?: string | null;
};

function isNativeRuntime() {
  return Capacitor.isNativePlatform();
}

function isNetworkLikeError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('internet') ||
    lower.includes('timeout') ||
    lower.includes('failed')
  );
}

function normalizeAuthError(payload: NativeAuthPayload | null | undefined, fallback = 'Auth gagal.') {
  return (
    payload?.msg ||
    payload?.error_description ||
    payload?.code ||
    payload?.error_code ||
    fallback
  );
}

async function nativeAuthPost(path: string, data: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  const response = await CapacitorHttp.post({
    url: `${SUPABASE_URL}${path}`,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    data,
    connectTimeout: 12000,
    readTimeout: 12000,
  });

  return {
    status: response.status,
    data: (response.data ?? null) as NativeAuthPayload | null,
  };
}

async function nativeFunctionPost(functionName: string, body: Record<string, unknown>) {
  const response = await CapacitorHttp.post({
    url: `${SUPABASE_URL}/functions/v1/${functionName}`,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    data: body,
    connectTimeout: 12000,
    readTimeout: 12000,
  });

  return {
    status: response.status,
    data: (response.data ?? null) as Record<string, unknown> | null,
  };
}

async function invokeEdgeFunctionJson(functionName: string, body: Record<string, unknown>) {
  if (isNativeRuntime()) {
    return nativeFunctionPost(functionName, body);
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> | null = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
  };
}

interface AuthCtx {
  user: Session['user'] | null;
  profile: Profile | null;
  isPro: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null; needsVerification?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ error: string | null }>;
  emergencyConfirm: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthCtx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<Session['user'] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted    = useRef(true);
  const signedOut  = useRef(false);
  const initDone   = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);

  const resetClientState = useCallback(async (opts?: { preserveKeys?: string[]; redirect?: boolean }) => {
    const currentUserId = activeUserIdRef.current;
    try {
      const mod = await import('@/hooks/useStore');
      mod.useStore.getState().cleanup?.();
      mod.useStore.getState().resetState?.();
    } catch { /* ignore */ }
    clearUserCache(currentUserId, opts?.preserveKeys || []);
    activeUserIdRef.current = null;
    setActiveUserId(null);
    if (mounted.current) {
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
    if (opts?.redirect) redirectToLogin(true);
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
      if (data && mounted.current) setProfile(data);
    } catch { /* ignore */ }
  }, [user?.id]);

  const applyAuthenticatedSession = useCallback((session: Session | null) => {
    if (!mounted.current) return;
    if (!session?.user) {
      activeUserIdRef.current = null;
      setActiveUserId(null);
      setUser(null);
      setProfile(null);
      void cacheSession(null);
      setLoading(false);
      return;
    }

    const incomingUserId = session.user.id;
    const previousUserId = activeUserIdRef.current || getActiveUserId();
    if (previousUserId && previousUserId !== incomingUserId) {
      clearUserCache(previousUserId, [SESSION_CACHE_KEY]);
      void import('@/hooks/useStore').then(mod => mod.useStore.getState().resetState?.()).catch(() => {});
    }

    localStorage.removeItem('kaffepos_pending_verification');
    localStorage.removeItem('kaffepos_registered_email');
    void cacheSession(session);
    activeUserIdRef.current = incomingUserId;
    setActiveUserId(incomingUserId);
    setUser(session.user);
    setLoading(false);
    const dn = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
    ensureProfileBg(session.user.id, session.user.email ?? '', dn).then(p => {
      if (mounted.current && p) setProfile(p);
    });
  }, []);

  // Realtime + polling PRO status
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`kfp_profile_${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        ({ new: n }) => { if (mounted.current) setProfile((p:any) => ({ ...p, ...n })); })
      .subscribe();
    const poll = setInterval(() => {
      supabase.from('profiles').select('tier,tier_expires_at,is_pro,pro_plan,pro_expires_at,pro_activated_at')
        .eq('id', user.id).single()
        .then(({ data }) => { if (data && mounted.current) setProfile((p:any) => p ? { ...p, ...data } : p); });
    }, 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [user?.id]);

  // ─── INTI: onAuthStateChange + init ───────────────────────────
  useEffect(() => {
    mounted.current  = true;
    signedOut.current = false;
    initDone.current  = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted.current) return;

        if (event === 'SIGNED_OUT') {
          void cacheSession(null);
          void resetClientState({ redirect: true });
          return;
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          void cacheSession(session);
          return;
        }

        if (event === 'USER_UPDATED') {
          applyAuthenticatedSession(session);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          applyAuthenticatedSession(session);
        }
      }
    );

    const init = async () => {
      if (!mounted.current) return;

      const cached = await getCachedSession();
      if (cached?.user && !signedOut.current) {
        setUser(cached.user);
        setLoading(false);
        fetchProfile(cached.user.id).then(p => { if (mounted.current && p) setProfile(p); });
      }

      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), cached?.user ? 1200 : 3000)),
        ]);

        if (!mounted.current) return;
        const session = (result as { data?: { session: Session | null } } | null)?.data?.session ?? null;
        applyAuthenticatedSession(session);
      } catch {
        if (!cached?.user && mounted.current) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }

      initDone.current = true;
    };

    init();
    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [applyAuthenticatedSession]);

  // ─── signIn ───────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    // ── Input Sanitization ──
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      return { error: validation.error.issues[0].message };
    }
    const cleanEmail = email.trim().toLowerCase();

    const applyNativeSession = async (payload: NativeAuthPayload) => {
      if (!payload.access_token || !payload.refresh_token) {
        return { error: normalizeAuthError(payload, 'Login gagal: session tidak lengkap.') };
      }
      const { data, error } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (error) return { error: error.message };
      if (data.session) applyAuthenticatedSession(data.session);
      return { error: null };
    };

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: cleanEmail, password,
        }),
        9000,
        'Login terlalu lama. Periksa koneksi internet lalu coba lagi.'
      );
      if (error) {
        const m = error.message;
        const s = (error as any).status;
        console.error('[SignIn] Supabase Error:', m, 'Status:', s);

        if (m.toLowerCase().includes('email not confirmed') || m.toLowerCase().includes('email_not_confirmed') || m.toLowerCase().includes('email not verified') || m.toLowerCase().includes('not confirmed'))
          return { error: 'email_not_confirmed' };
        if (s === 401 || m.includes('Invalid login credentials') || m.includes('invalid_credentials'))
          return { error: 'Email atau password salah. Periksa kembali.' };
        if (m.includes('Too many requests') || s === 429 || m.includes('rate limit') || m.includes('too many attempts'))
          return { error: 'Akun terkunci sementara (lockout). Tunggu 1 menit lalu coba lagi demi keamanan.' };
        if (m.toLowerCase().includes('locked') || m.includes('locked_at'))
          return { error: 'Akun Anda terkunci (Locked). Silakan hubungi admin atau reset password.' };
        if (m.toLowerCase().includes('network') || m.toLowerCase().includes('fetch') || m.toLowerCase().includes('failed') || m.toLowerCase().includes('internet')) 
          return { error: 'Masalah Jaringan: Periksa koneksi internet Anda.' };
        return { error: `Login gagal: ${m} (${s})` };
      }
      // onAuthStateChange SIGNED_IN akan handle setUser + setLoading
      if (data?.session) applyAuthenticatedSession(data.session);
      return { error: null };
    } catch (e:any) {
      console.error('[SignIn] Error:', e);
      const msg = e?.message || '';
      if (isNativeRuntime() && isNetworkLikeError(msg)) {
        try {
          console.info('[KPOS_AUTH] signIn native fallback');
          const { status, data } = await nativeAuthPost('/auth/v1/token?grant_type=password', {
            email: cleanEmail,
            password,
          });
          if (status >= 400 || !data) {
            const nativeError = normalizeAuthError(data, 'Login gagal.');
            if (nativeError.toLowerCase().includes('invalid login credentials')) {
              return { error: 'Email atau password salah. Periksa kembali.' };
            }
            if (nativeError.toLowerCase().includes('email not confirmed')) {
              return { error: 'email_not_confirmed' };
            }
            return { error: nativeError };
          }
          return await applyNativeSession(data);
        } catch (nativeError: any) {
          console.error('[SignIn] Native fallback failed:', nativeError);
        }
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) return { error: `Jaringan (SignIn): ${msg}` };
      return { error: 'Gagal login: ' + msg };
    }
  }, [applyAuthenticatedSession], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  // ─── signUp ──────────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string, username: string) => {
    // ── Input Sanitization ──
    const validation = signUpSchema.safeParse({ email, password, username });
    if (!validation.success) {
      return { error: validation.error.issues[0].message };
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    const finalizeNativeSignup = async (payload: NativeAuthPayload | null) => {
      const needsVerification = !payload?.access_token && !!payload?.user;
      if (payload?.access_token && payload.refresh_token) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        });
        if (sessionError) return { error: sessionError.message };
        if (sessionData.session) applyAuthenticatedSession(sessionData.session);
      }
      if (payload?.user?.id && needsVerification) {
        localStorage.setItem('kaffepos_pending_verification', cleanEmail);
        localStorage.setItem('kaffepos_registered_email', cleanEmail);
      }
      return { error: null, needsVerification };
    };
    try {
      const { data: existingUsername, error: usernameCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (!usernameCheckError && existingUsername) {
        return { error: 'Nama toko / username sudah digunakan. Pakai nama lain ya.' };
      }

      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { username: cleanUsername, display_name: cleanUsername },
            emailRedirectTo: AUTH_REDIRECT_URL,
          },
        }),
        9000,
        'Pendaftaran terlalu lama. Periksa koneksi internet lalu coba lagi.'
      );

      if (error) {
        const m = error.message;
        const s = (error as any).status;
        console.error('[SignUp] API Error:', m, 'Status:', s);

        if (s === 404) {
          return { error: 'Endpoint pendaftaran (404) tidak ditemukan. Periksa konfigurasi Supabase Anda.' };
        }
        if (m.includes('already registered') || m.includes('User already registered'))
          return { error: 'Email sudah terdaftar. Silakan langsung login.' };
        if (m.includes('profiles_username_key') || m.includes('duplicate key value violates unique constraint')) {
          return { error: 'Nama toko / username sudah digunakan. Pakai nama lain ya.' };
        }
        if (m.includes('Password should be'))
          return { error: 'Password terlalu lemah. Gunakan minimal 8 karakter.' };
        if (m.includes('network') || m.includes('fetch'))
          return { error: `Jaringan (SignUp): ${m}` };
        return { error: m };
      }

      // Deteksi apakah verifikasi diperlukan:
      // Jika data.session ada, artinya Supabase "Confirm Email" dinonaktifkan (langsung login).
      // Jika data.session null tapi data.user ada, artinya verifikasi diperlukan.
      const needsVerification = !data.session && !!data.user;

      if (data.session) {
        applyAuthenticatedSession(data.session);
      }

      if (data.user?.id && needsVerification) {
        // Simpan sementara untuk polling di atas
        localStorage.setItem('kaffepos_pending_verification', cleanEmail);
        localStorage.setItem('kaffepos_registered_email', cleanEmail);
        try {
          await withTimeout(
            sendVerificationEmailViaEdge(cleanEmail, cleanUsername),
            12000,
            'Pengiriman email verifikasi terlalu lama. Coba lagi sebentar.'
          );
        } catch (mailError: any) {
          console.error('[SignUp] Custom verification send failed:', mailError);
          return { error: `Akun dibuat, tapi email verifikasi gagal dikirim: ${mailError?.message || 'Coba lagi sebentar.'}` };
        }
      }

      return { error: null, needsVerification };
    } catch (e:any) {
      console.error('[SignUp] Error detail:', e);
      const msg = e?.message || '';
      if (isNativeRuntime() && isNetworkLikeError(msg)) {
        try {
          console.info('[KPOS_AUTH] signUp native fallback');
          const { status, data } = await nativeAuthPost(
            '/auth/v1/signup',
            {
              email: cleanEmail,
              password,
              data: { username: cleanUsername, display_name: cleanUsername },
            },
            { redirect_to: AUTH_REDIRECT_URL }
          );

          if (status >= 400 || !data) {
            const nativeError = normalizeAuthError(data, 'Pendaftaran gagal.');
            if (nativeError.includes('already registered')) {
              return { error: 'Email sudah terdaftar. Silakan langsung login.' };
            }
            if (nativeError.includes('profiles_username_key') || nativeError.includes('duplicate key value')) {
              return { error: 'Nama toko / username sudah digunakan. Pakai nama lain ya.' };
            }
            return { error: nativeError };
          }

          return await finalizeNativeSignup(data);
        } catch (nativeError: any) {
          console.error('[SignUp] Native fallback failed:', nativeError);
        }
      }
      return { error: `Gagal mendaftar: ${e?.message || 'Check connection'}` }; 
    }
  }, [applyAuthenticatedSession], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  // ── resendVerification ───────────────────────────────────────
  const resendVerification = useCallback(async (email: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();

      try {
        await withTimeout(
          sendVerificationEmailViaEdge(cleanEmail),
          12000,
          'Pengiriman email verifikasi terlalu lama. Coba lagi sebentar.'
        );
        return { error: null };
      } catch (edgeErr: any) {
        console.error('[Auth] Custom resend failed:', edgeErr);
        return { error: edgeErr?.message || 'Gagal mengirim ulang email.' };
      }
    } catch (e:any) {
      console.error('[Auth] Resend process failed:', e);
      if (isNativeRuntime() && isNetworkLikeError(e?.message || '')) {
        try {
          const { status, data } = await nativeFunctionPost(
            'send-notification',
            {
              type: 'verification',
              email: email.trim().toLowerCase(),
              redirectTo: AUTH_REDIRECT_URL,
            }
          );
          if (status < 400) return { error: null };
          return { error: (data as any)?.error || 'Gagal mengirim ulang email.' };
        } catch (nativeError: any) {
          console.error('[Auth] Native resend fallback failed:', nativeError);
        }
      }
      return { error: e.message || 'Gagal mengirim ulang email.' };
    }
  }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.replace(/\D/g, '');

    if (!cleanEmail) return { error: 'Email tidak boleh kosong.' };
    if (cleanCode.length !== 6) return { error: 'Kode verifikasi harus 6 digit.' };

    try {
      const { status, data } = await withTimeout(
        invokeEdgeFunctionJson('verify-email-code', {
          email: cleanEmail,
          code: cleanCode,
        }),
        9000,
        'Verifikasi kode terlalu lama. Periksa koneksi internet lalu coba lagi.'
      );
      if (status >= 400) {
        return { error: String(data?.error || 'Kode verifikasi gagal diproses.') };
      }
      localStorage.removeItem('kaffepos_pending_verification');
      localStorage.setItem('kaffepos_registered_email', cleanEmail);
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Kode verifikasi gagal diproses.' };
    }
  }, []);

  const emergencyConfirm = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.functions.invoke('confirm-user', {
        body: { email }
      });
      if (error) throw error;
      return { error: null };
    } catch (e:any) {
      return { error: e.message };
    }
  }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  // ─── signInWithGoogle ─────────────────────────────────────────
  // STRATEGI FINAL: PKCE + Chrome Custom Tabs
  // HP ini menggunakan Infinix — GMS ada tapi perlu diverifikasi.
  // Custom Tabs jauh lebih reliable daripada native SDK untuk device non-flagship.
  // Flow: Browser.open() → user pilih akun → Custom Tab tutup → browserFinished
  //       → App.tsx appUrlOpen → exchangeCodeForSession → SIGNED_IN → masuk
  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'id.kaffeepos.app://login-callback',
          skipBrowserRedirect: false,
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) return { error: `Google login gagal: ${error.message}` };
      return { error: null };
    } catch (e:any) {
      return { error: e?.message || 'Gagal membuka Google. Coba lagi.' };
    }
  }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );




  // ─── signOut ─────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    signedOut.current = true;
    try {
      localStorage.setItem(EXPLICIT_SIGNOUT_KEY, '1');
    } catch { /* ignore */ }
    await resetClientState({ preserveKeys: [EXPLICIT_SIGNOUT_KEY] });
    await cacheSession(null);
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    redirectToLogin(true);
  }, [resetClientState], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  // ─── resetPassword ───────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await withTimeout(
        supabase.functions.invoke('send-notification', {
          body: {
            type: 'password_reset',
            email: email.trim().toLowerCase(),
            redirectTo: PASSWORD_RESET_REDIRECT_URL,
          },
        }),
        9000,
        'Pengiriman email reset terlalu lama. Coba lagi sebentar.'
      );
      if (error) return { error: `Gagal mengirim email: ${error.message}` };
      return { error: null };
    } catch (e:any) {
      if (isNativeRuntime() && isNetworkLikeError(e?.message || '')) {
        try {
          const { status, data } = await nativeFunctionPost(
            'send-notification',
            {
              type: 'password_reset',
              email: email.trim().toLowerCase(),
              redirectTo: PASSWORD_RESET_REDIRECT_URL,
            }
          );
          if (status < 400) return { error: null };
          return { error: (data as any)?.error || 'Gagal mengirim email reset.' };
        } catch (nativeError) {
          console.error('[Auth] Native recover fallback failed:', nativeError);
        }
      }
      return { error: 'Tidak ada koneksi internet.' };
    }
  }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  const isPro = (() => {
    const p = profile;
    if (!p) return false;
    const hasPro = p.tier === 'pro' || !!p.is_pro;
    if (!hasPro) return false;
    if (p.pro_plan === 'lifetime') return true;
    const expiresAt = p.pro_expires_at || p.tier_expires_at;
    if (!expiresAt) return true;
    return new Date(expiresAt) > new Date();
  })();

  return (
    <AuthCtx.Provider value={{
      user, profile, isPro,
      isAuthenticated: !!user,
      loading,
      signIn, signUp, resendVerification, verifyEmailCode, emergencyConfirm, signInWithGoogle,
      signOut, resetPassword, refreshProfile,
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
