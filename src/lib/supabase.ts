/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/supabase.ts — KaffePOS v8 GOOGLE OAUTH FIX
// FIX: flowType 'implicit' → 'pkce'
//   - 'implicit' menanamkan token di URL fragment (#access_token=...)
//   - Fragment ini DI-STRIP oleh Android Intent system saat redirect ke kaffepos://
//   - 'pkce' menggunakan code exchange yang survive Intent redirect
// FIX: storage localStorage → CapacitorPreferences async adapter
//   - localStorage di Android WebView bisa dihapus OS
//   - Preferences disimpan di app-private SharedPreferences (persistent)
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL      = (import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '');
if (!SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL in .env');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env');

// ── Custom fetch: timeout 15s + retry 3x dengan backoff ──────────
const customFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const MAX_RETRIES = 3;
  const TIMEOUT_MS  = 15_000;

  const attempt = (n: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    return fetch(input, { ...init, signal: controller.signal })
      .then(res => { clearTimeout(timer); return res; })
      .catch(err => {
        clearTimeout(timer);
        const shouldRetry =
          err.name === 'AbortError' ||
          err.message?.includes('Failed to fetch') ||
          err.message?.includes('Network request failed') ||
          err.message?.includes('net::ERR');
        if (shouldRetry && n < MAX_RETRIES) {
          return new Promise<Response>(res =>
            setTimeout(() => res(attempt(n + 1)), 1000 * n)
          );
        }
        throw err;
      });
  };

  return attempt(1);
};

// ── Supabase client ──────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
      removeItem: (k) => localStorage.removeItem(k),
    }
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    reconnectAfterMs: (tries: number) => Math.min(tries * 2000, 30000),
  },
  global: {
    fetch: customFetch,
    headers: { 'X-Client-Info': 'kaffepos-android/8.0' },
  },
});

export default supabase;
