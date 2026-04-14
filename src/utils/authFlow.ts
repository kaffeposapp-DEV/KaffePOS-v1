import type { AuthError } from '@supabase/supabase-js';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const AUTH_MODE_BY_PATH: Record<string, AuthMode> = {
  '/auth': 'login',
  '/login': 'login',
  '/register': 'register',
  '/forgot-password': 'forgot',
  '/reset-password': 'reset',
};

const AUTH_PATH_BY_MODE: Record<AuthMode, string> = {
  login: '/login',
  register: '/register',
  forgot: '/forgot-password',
  reset: '/reset-password',
};

export function getAuthModeFromLocation(pathname: string, search: string) {
  const requestedMode = new URLSearchParams(search).get('mode');
  if (
    requestedMode === 'login' ||
    requestedMode === 'register' ||
    requestedMode === 'forgot' ||
    requestedMode === 'reset'
  ) {
    return requestedMode;
  }

  return AUTH_MODE_BY_PATH[pathname] ?? 'login';
}

export function getAuthPathForMode(mode: AuthMode) {
  return AUTH_PATH_BY_MODE[mode];
}

export function isAuthSurfacePath(pathname: string) {
  return pathname in AUTH_MODE_BY_PATH || pathname === '/auth/callback';
}

export function hasAuthCallbackParams(url: URL) {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  return Boolean(
    url.searchParams.get('code') ||
      url.searchParams.get('token_hash') ||
      url.searchParams.get('access_token') ||
      hashParams.get('access_token') ||
      hashParams.get('refresh_token') ||
      hashParams.get('token_hash') ||
      hashParams.get('type')
  );
}

export function isExistingSignupAttempt(data: {
  session?: unknown | null;
  user?: { identities?: unknown[] | null } | null;
} | null | undefined) {
  if (!data || data.session || !data.user) return false;
  return Array.isArray(data.user.identities) && data.user.identities.length === 0;
}

export function isAlreadyRegisteredMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('already registered') ||
    lower.includes('user already registered') ||
    lower.includes('email sudah terdaftar') ||
    lower.includes('akun sudah terdaftar')
  );
}

export function normalizeRequestedUsername(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (base.length < 3) return '';
  return base.slice(0, 30);
}

export function normalizeSignupErrorMessage(error: Pick<AuthError, 'message'> & { status?: number | undefined } | null | undefined) {
  if (!error) return null;

  const message = error.message || '';
  const lower = message.toLowerCase();

  if (error.status === 404) {
    return 'Endpoint pendaftaran tidak ditemukan. Periksa konfigurasi Supabase.';
  }

  if (isAlreadyRegisteredMessage(message)) {
    return 'Email sudah terdaftar. Silakan login atau kirim ulang email verifikasi.';
  }

  if (
    lower.includes('profiles_username_key') ||
    lower.includes('duplicate key value violates unique constraint')
  ) {
    return 'Nama toko / username sudah digunakan. Pakai nama lain ya.';
  }

  if (lower.includes('invalid email')) {
    return 'Format email tidak valid.';
  }

  if (lower.includes('password should be')) {
    return 'Password terlalu lemah. Gunakan minimal 10 karakter dengan huruf besar, huruf kecil, dan angka.';
  }

  if (
    error.status === 500 ||
    lower.includes('server error') ||
    lower.includes('unexpected_failure') ||
    lower.includes('database error saving new user') ||
    lower.includes('failed to fetch')
  ) {
    return 'Server pendaftaran sedang bermasalah. Akun belum dibuat. Coba lagi beberapa saat.';
  }

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return `Jaringan (SignUp): ${message}`;
  }

  return message;
}
