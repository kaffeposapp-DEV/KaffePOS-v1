type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class MemoryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly cleanupIntervalMs = 60_000) {
    this.startCleanup();
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  stop(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt <= now) this.store.delete(key);
      }
    }, this.cleanupIntervalMs);

    this.cleanupTimer.unref?.();
  }
}

export const cache = new MemoryCache();

export const cacheTtl = {
  storeSettings: 5 * 60 * 1000,
  menuItems: 2 * 60 * 1000,
  subscriptionPlans: 10 * 60 * 1000,
  dashboardSummary: 60 * 1000,
} as const;
