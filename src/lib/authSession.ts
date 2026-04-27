import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export type AuthUser = {
  id: string;
  email: string | null;
  email_verified_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

const AUTH_SESSION_KEY = 'kaffepos_auth_session';
const EXPLICIT_SIGNOUT_KEY = 'kaffepos_explicit_signout';

function isNativeRuntime() {
  return Capacitor.isNativePlatform();
}

async function readStorage(key: string) {
  if (isNativeRuntime()) {
    const { value } = await Preferences.get({ key });
    return value;
  }

  return localStorage.getItem(key);
}

async function writeStorage(key: string, value: string) {
  if (isNativeRuntime()) {
    await Preferences.set({ key, value });
    return;
  }

  localStorage.setItem(key, value);
}

async function removeStorage(key: string) {
  if (isNativeRuntime()) {
    await Preferences.remove({ key });
    return;
  }

  localStorage.removeItem(key);
}

function normalizeStoredUser(input: unknown): AuthUser | null {
  if (!input || typeof input !== 'object') return null;

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    return null;
  }

  return {
    id: candidate.id,
    email: typeof candidate.email === 'string' ? candidate.email : null,
    email_verified_at: typeof candidate.email_verified_at === 'string' ? candidate.email_verified_at : null,
    user_metadata: candidate.user_metadata && typeof candidate.user_metadata === 'object'
      ? candidate.user_metadata as Record<string, unknown>
      : null,
  };
}

export function normalizeStoredAuthSession(input: unknown): AuthSession | null {
  if (!input || typeof input !== 'object') return null;

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.accessToken !== 'string' || candidate.accessToken.trim().length === 0) {
    return null;
  }
  if (typeof candidate.expiresAt !== 'string' || candidate.expiresAt.trim().length === 0) {
    return null;
  }

  const user = normalizeStoredUser(candidate.user);
  if (!user) return null;

  return {
    accessToken: candidate.accessToken,
    expiresAt: candidate.expiresAt,
    user,
  };
}

export async function getStoredAuthSession(): Promise<AuthSession | null> {
  try {
    const raw = await readStorage(AUTH_SESSION_KEY);
    if (!raw) return null;
    return normalizeStoredAuthSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStoredAuthSession(session: AuthSession | null) {
  const normalized = normalizeStoredAuthSession(session);
  if (!normalized) {
    await removeStorage(AUTH_SESSION_KEY);
    return;
  }

  await writeStorage(AUTH_SESSION_KEY, JSON.stringify(normalized));
}

export async function clearStoredAuthSession() {
  await removeStorage(AUTH_SESSION_KEY);
}

export async function getStoredAccessToken() {
  const session = await getStoredAuthSession();
  return session?.accessToken ?? null;
}

export async function markExplicitSignOut() {
  await writeStorage(EXPLICIT_SIGNOUT_KEY, '1');
}

export async function clearExplicitSignOutMarker() {
  await removeStorage(EXPLICIT_SIGNOUT_KEY);
}

export async function hasExplicitSignOutMarker() {
  return (await readStorage(EXPLICIT_SIGNOUT_KEY)) === '1';
}

export async function ensureStoredAuthSessionShape(): Promise<'empty' | 'ok' | 'cleared'> {
  try {
    const raw = await readStorage(AUTH_SESSION_KEY);
    if (!raw) return 'empty';

    const normalized = normalizeStoredAuthSession(JSON.parse(raw));
    if (!normalized) {
      await removeStorage(AUTH_SESSION_KEY);
      return 'cleared';
    }

    await writeStorage(AUTH_SESSION_KEY, JSON.stringify(normalized));
    return 'ok';
  } catch {
    await removeStorage(AUTH_SESSION_KEY);
    return 'cleared';
  }
}

export function isSessionExpired(session: AuthSession | null | undefined) {
  if (!session?.expiresAt) return true;
  return new Date(session.expiresAt).getTime() <= Date.now();
}
