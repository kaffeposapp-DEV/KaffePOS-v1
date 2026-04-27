/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, getAuthSession, getProfileMe, loginRequest, logoutRequest, registerRequest, resendVerificationRequest, resetPasswordRequest, forgotPasswordRequest, verifyEmailCodeRequest } from '@/lib/backendApi';
import {
  clearExplicitSignOutMarker,
  clearStoredAuthSession,
  getStoredAuthSession,
  hasExplicitSignOutMarker,
  isSessionExpired,
  markExplicitSignOut,
  saveStoredAuthSession,
  type AuthSession,
  type AuthUser,
} from '@/lib/authSession';
import type { Profile } from '@/types';
import { clearUserCache, redirectToLogin, setActiveUserId } from '@/utils/sessionIsolation';
import { getPasswordResetParams, normalizeRequestedUsername, normalizeSignupErrorMessage } from '@/utils/authFlow';
import { loginSchema, signUpSchema } from '@/utils/validation';
import { buildSubscriptionAccess, hasSubscriptionFeature, type SubscriptionAccess, type SubscriptionFeature } from '@/lib/subscriptionAccess';
import type { SubscriptionPlanId } from '@/lib/subscriptionPlans';
import { APP_PRESERVED_STORAGE_KEYS } from '@/lib/appUpgrade';

type AuthCtx = {
  user: AuthUser | null;
  profile: Profile | null;
  isPro: boolean;
  subscriptionPlan: SubscriptionPlanId;
  subscriptionAccess: SubscriptionAccess;
  hasFeature: (feature: SubscriptionFeature) => boolean;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null; needsVerification?: boolean; message?: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
};

const AuthCtx = createContext<AuthCtx | null>(null);
const PRESERVED_LOCAL_KEYS = ['kpos_app_theme', 'kpos_app_theme_custom', ...APP_PRESERVED_STORAGE_KEYS];

function buildUser(profile: Profile, fallbackEmail?: string | null): AuthUser {
  return {
    id: profile.id,
    email: profile.email ?? fallbackEmail ?? null,
    user_metadata: {
      display_name: profile.display_name ?? null,
      username: profile.username ?? null,
    },
  };
}

function getResetPayload() {
  if (typeof window === 'undefined') {
    return { email: null, token: null };
  }

  return getPasswordResetParams(new URL(window.location.href));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const resetClientState = useCallback(async (opts?: { redirect?: boolean; userId?: string | null }) => {
    const currentUserId = opts?.userId ?? user?.id ?? profile?.id ?? null;

    try {
      const mod = await import('@/hooks/useStore');
      mod.useStore.getState().cleanup?.();
      mod.useStore.getState().resetState?.();
    } catch {
      // ignore
    }

    clearUserCache(currentUserId, PRESERVED_LOCAL_KEYS);
    setActiveUserId(null);
      await clearStoredAuthSession();
    if (mounted.current) {
      setUser(null);
      setProfile(null);
      setLoading(false);
    }

    if (opts?.redirect) {
      redirectToLogin(true);
    }
  }, [profile?.id, user?.id]);

  const applySession = useCallback(async (session: AuthSession, profileOverride?: Profile | null) => {
    await saveStoredAuthSession(session);
    await clearExplicitSignOutMarker();
    setActiveUserId(session.user.id);

    if (!mounted.current) return;

    setUser(session.user);
    if (profileOverride) {
      setProfile(profileOverride);
      return;
    }

    try {
      const freshProfile = await getProfileMe();
      if (!mounted.current) return;
      setProfile(freshProfile as Profile);
      setUser(buildUser(freshProfile as Profile, session.user.email));
    } catch {
      if (mounted.current) {
        setProfile(null);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const freshProfile = await getProfileMe();
      if (!mounted.current) return;
      setProfile(freshProfile as Profile);
      setUser((current) => current ? buildUser(freshProfile as Profile, current.email) : current);
    } catch (error) {
      console.error('[Auth] refreshProfile failed', error);
    }
  }, [user?.id]);

  useEffect(() => {
    mounted.current = true;

    const boot = async () => {
      try {
        const explicitSignOut = await hasExplicitSignOutMarker();
        if (explicitSignOut) {
          setLoading(false);
          return;
        }

        const cached = await getStoredAuthSession();
        if (!cached || isSessionExpired(cached)) {
          await clearStoredAuthSession();
          setLoading(false);
          return;
        }

        if (mounted.current) {
          setActiveUserId(cached.user.id);
          setUser(cached.user);
        }
        console.info('[Auth] Restoring cached session', { userId: cached.user.id });

        try {
          const current = await getAuthSession();
          const resolvedProfile = current.profile as Profile;
          await applySession(
            {
              accessToken: cached.accessToken,
              expiresAt: current.sessionExpiresAt,
              user: {
                ...current.user,
                user_metadata: {
                  display_name: resolvedProfile.display_name ?? null,
                  username: resolvedProfile.username ?? null,
                },
              },
            },
            resolvedProfile,
          );
          console.info('[Auth] Session restore synced with backend', { userId: cached.user.id });
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            console.warn('[Auth] Cached session rejected by backend', { userId: cached.user.id, status: error.status });
            await resetClientState({ userId: cached.user.id });
            return;
          }

          console.warn('[Auth] Session validation skipped, keeping cached session', error);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
        }
      }
    };

    void boot();

    return () => {
      mounted.current = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const parsed = loginSchema.parse({
        email: email.trim().toLowerCase(),
        password,
      });

      const result = await loginRequest(parsed);
      const resolvedProfile = result.profile as Profile;
      await applySession(
        {
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
          user: result.user,
        },
        resolvedProfile,
      );

      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login gagal.';
      if (message === 'email_not_confirmed') {
        return { error: 'email_not_confirmed' };
      }
      return { error: message };
    }
  }, [applySession]);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    try {
      const normalizedUsername = normalizeRequestedUsername(username);
      if (!normalizedUsername) {
        return { error: 'Nama bisnis minimal 3 karakter dan hanya boleh huruf, angka, atau underscore.' };
      }

      const parsed = signUpSchema.parse({
        email: email.trim().toLowerCase(),
        password,
        username: normalizedUsername,
      });

      const result = await registerRequest(parsed);
      localStorage.setItem('kaffepos_registered_email', parsed.email);
      return {
        error: null,
        needsVerification: result.needsVerification,
        message: result.message,
      };
    } catch (error) {
      const normalized = normalizeSignupErrorMessage(
        error instanceof Error ? { message: error.message } : { message: 'Pendaftaran gagal.' },
      );
      return { error: normalized || 'Pendaftaran gagal.' };
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    try {
      await resendVerificationRequest({ email: email.trim().toLowerCase() });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Gagal mengirim ulang kode verifikasi.' };
    }
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    try {
      await verifyEmailCodeRequest({
        email: email.trim().toLowerCase(),
        code: code.trim(),
      });
      localStorage.removeItem('kaffepos_registered_email');
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Kode verifikasi tidak valid.' };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    return { error: 'Masuk dengan Google sudah dinonaktifkan. Gunakan email dan password.' };
  }, []);

  const signOut = useCallback(async () => {
    await markExplicitSignOut();
    try {
      await logoutRequest();
    } catch {
      // ignore
    }
    await resetClientState({ redirect: true, userId: user?.id ?? profile?.id ?? null });
  }, [profile?.id, resetClientState, user?.id]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await forgotPasswordRequest({ email: email.trim().toLowerCase() });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Gagal mengirim email reset password.' };
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { email, token } = getResetPayload();
    if (!email || !token) {
      return { error: 'Tautan reset password tidak valid atau sudah kedaluwarsa.' };
    }

    try {
      await resetPasswordRequest({
        email,
        token,
        password,
      });

      if (typeof window !== 'undefined') {
        const target = new URL(window.location.href);
        target.searchParams.delete('email');
        target.searchParams.delete('token');
        window.history.replaceState({}, '', `${target.pathname}?mode=login`);
      }

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Gagal memperbarui password.' };
    }
  }, []);

  const subscriptionAccess = useMemo(() => buildSubscriptionAccess(profile), [profile]);

  const value = useMemo<AuthCtx>(() => ({
    user,
    profile,
    isPro: subscriptionAccess.isPaid,
    subscriptionPlan: subscriptionAccess.plan,
    subscriptionAccess,
    hasFeature: (feature) => hasSubscriptionFeature(subscriptionAccess, feature),
    isAuthenticated: Boolean(user),
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    resendVerification,
    verifyEmailCode,
    refreshProfile,
  }), [
    loading,
    profile,
    refreshProfile,
    resendVerification,
    resetPassword,
    signIn,
    signInWithGoogle,
    signOut,
    signUp,
    subscriptionAccess,
    updatePassword,
    user,
    verifyEmailCode,
  ]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
