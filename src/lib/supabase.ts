 
 
 
 
 
 
// src/lib/supabase.ts — KaffePOS v8 GOOGLE OAUTH FIX
// FIX: flowType 'implicit' → 'pkce'
//   - 'implicit' menanamkan token di URL fragment (#access_token=...)
//   - Fragment ini DI-STRIP oleh Android Intent system saat redirect ke kaffepos://
//   - 'pkce' menggunakan code exchange yang survive Intent redirect
// FIX: storage localStorage → CapacitorPreferences async adapter
//   - localStorage di Android WebView bisa dihapus OS
//   - Preferences disimpan di app-private SharedPreferences (persistent)
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export const SUPABASE_URL      = (import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '');
if (!SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL in .env');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env');

export function getAuthRedirectUrl(path = '/auth/callback') {
  if (!Capacitor.isNativePlatform()) {
    return `${window.location.origin}${path}`;
  }
  const normalizedPath = path.replace(/^\//, '');
  return `kaffepos://${normalizedPath}`;
}

export const AUTH_REDIRECT_URL = getAuthRedirectUrl();
export const PASSWORD_RESET_REDIRECT_URL = getAuthRedirectUrl('/reset-password');

const webStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

const nativeStorage = {
  async getItem(key: string) {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async setItem(key: string, value: string) {
    await Preferences.set({ key, value });
  },
  async removeItem(key: string) {
    await Preferences.remove({ key });
  },
};

const authStorage = Capacitor.isNativePlatform() ? nativeStorage : webStorage;

// ── Supabase client ──────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: authStorage
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    reconnectAfterMs: (tries: number) => Math.min(tries * 2000, 30000),
  },
  global: {
    headers: { 'X-Client-Info': 'kaffepos-android/8.0' },
  },
});

export default supabase;
