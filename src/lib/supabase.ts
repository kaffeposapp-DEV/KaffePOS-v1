// src/lib/supabase.ts — KaffePOS v8 GOOGLE OAUTH FIX
// FIX: flowType 'implicit' → 'pkce'
//   - 'implicit' menanamkan token di URL fragment (#access_token=...)
//   - Fragment ini DI-STRIP oleh Android Intent system saat redirect ke kaffepos://
//   - 'pkce' menggunakan code exchange yang survive Intent redirect
// FIX: storage localStorage → CapacitorPreferences async adapter
//   - localStorage di Android WebView bisa dihapus OS
//   - Preferences disimpan di app-private SharedPreferences (persistent)
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://edaurchznalqpaguxcyy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkYXVyY2h6bmFscXBhZ3V4Y3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTAzMzUsImV4cCI6MjA4Nzk2NjMzNX0.DVAYYwPJlf9uuWCcRhiG3fuPazeOBY1wF2_T6kvxfKE';

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

// ── Capacitor Preferences storage adapter untuk Supabase ─────────
// Ini memastikan auth token tersimpan di app-private storage Android
// (bukan localStorage WebView yang volatile)
// API harus sync (getItem/setItem/removeItem) — kita pakai localStorage
// sebagai cache sync + fire-and-forget write ke Preferences
let _prefModule: any = null;
const getPref = async () => {
  if (_prefModule) return _prefModule;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    _prefModule = Preferences;
    return Preferences;
  } catch {
    return null;
  }
};

// Hybrid storage: sync reads dari localStorage + async persist ke Preferences
const capacitorStorage = {
  getItem: (key: string): string | null => {
    // Fast sync read dari localStorage (selalu tersedia di WebView)
    return localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    // Sync write ke localStorage (agar Supabase langsung punya data)
    localStorage.setItem(key, value);
    // Async persist ke Preferences (survived app restart & OS kill)
    getPref().then(p => {
      if (p) p.set({ key: `sb_${key}`, value }).catch(() => {});
    });
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
    getPref().then(p => {
      if (p) p.remove({ key: `sb_${key}` }).catch(() => {});
    });
  },
};

// Preload: saat startup, copy nilai dari Preferences ke localStorage
// sehingga getItem sync akan mendapatkan data yang benar
export async function preloadAuthFromPreferences() {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { keys } = await Preferences.keys();
    const sbKeys = keys.filter(k => k.startsWith('sb_'));
    await Promise.all(sbKeys.map(async k => {
      const { value } = await Preferences.get({ key: k });
      if (value) localStorage.setItem(k.replace('sb_', ''), value);
    }));
  } catch {
    // Berjalan di web/dev — skip
  }
}

// ── Supabase client ──────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storage:            capacitorStorage,
    storageKey:         'kaffepos_auth',
    // FIX v8: PKCE adalah satu-satunya flow yang survive Android Intent redirect
    // 'implicit' mengirim token via URL fragment yang di-strip Android saat
    // menangkap deep link kaffepos://auth/callback
    flowType:           'pkce',
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
