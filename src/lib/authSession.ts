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

export async function getStoredAuthSession(): Promise<AuthSession | null> {
  try {
    const raw = await readStorage(AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function saveStoredAuthSession(session: AuthSession | null) {
  if (!session) {
    await removeStorage(AUTH_SESSION_KEY);
    return;
  }

  await writeStorage(AUTH_SESSION_KEY, JSON.stringify(session));
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

export function isSessionExpired(session: AuthSession | null | undefined) {
  if (!session?.expiresAt) return true;
  return new Date(session.expiresAt).getTime() <= Date.now();
}
