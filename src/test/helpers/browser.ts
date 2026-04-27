import type { AuthSession } from '@/lib/authSession';

export function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

export function installMemoryStorage(target: 'localStorage' | 'sessionStorage' = 'localStorage') {
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, target, {
    value: storage,
    configurable: true,
  });
  return storage;
}

export function seedStoredAuthSession(overrides: Partial<AuthSession> = {}) {
  const session: AuthSession = {
    accessToken: 'test-access-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: {
      id: 'user_test',
      email: 'owner@kaffepos.test',
    },
    ...overrides,
  };

  localStorage.setItem('kaffepos_auth_session', JSON.stringify(session));
  return session;
}

