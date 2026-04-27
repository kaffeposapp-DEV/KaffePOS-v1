 
 
 
 
 
 
// src/services/SubscriptionManager.ts — KaffePOS Subscription Engine
// Device-based subscription dengan backend API sync + offline fallback

import { getProfileMe } from '@/lib/backendApi';
import { buildSubscriptionAccess } from '@/lib/subscriptionAccess';
import type { Profile } from '@/types';
export type PlanType = 'secangkir' | 'kopi_susu' | 'signature' | 'founder';

export interface SubscriptionStatus {
  plan:             PlanType;
  isActive:         boolean;
  expiryDate:       Date | null;
  transactionCount: number;
  transactionLimit: number; // 50 freemium, -1 unlimited
  daysRemaining:    number | null;
}

const TRANSACTION_LIMIT_FREEMIUM = 50;
const SYNC_INTERVAL_MS = 1000 * 60 * 60 * 6; // sync setiap 6 jam
const LOCAL_KEY = 'kaffepos_sub_v2';
const TX_COUNT_KEY = 'kaffepos_tx_month';


// ── Local cache helpers ───────────────────────────────────────────
interface LocalCache {
  status: SubscriptionStatus;
  savedAt: number;
}

function saveLocal(status: SubscriptionStatus): void {
  const cache: LocalCache = {
    status: { ...status, expiryDate: null },
    savedAt: Date.now(),
  };
  // Simpan expiryDate sebagai string ISO
  const raw = JSON.stringify({
    ...cache,
    status: { ...status, expiryDate: status.expiryDate?.toISOString() ?? null },
  });
  try { localStorage.setItem(LOCAL_KEY, raw); } catch { /* ignore */ }
}

function loadLocal(): SubscriptionStatus | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { status: Record<string, unknown>; savedAt: number };
    return {
      ...(parsed.status as Omit<SubscriptionStatus, 'expiryDate'>),
      expiryDate: parsed.status.expiryDate
        ? new Date(parsed.status.expiryDate as string)
        : null,
    };
  } catch { return null; }
}

// ── Monthly tx count helpers ──────────────────────────────────────
function getMonthlyTxCount(): number {
  try {
    const raw = localStorage.getItem(TX_COUNT_KEY);
    if (!raw) return 0;
    const { count, month } = JSON.parse(raw) as { count: number; month: string };
    const nowMonth = new Date().toISOString().substring(0, 7); // "2026-03"
    if (month !== nowMonth) { resetMonthlyTxCount(); return 0; }
    return count;
  } catch { return 0; }
}

function incrementLocalTxCount(): number {
  const count = getMonthlyTxCount() + 1;
  const month = new Date().toISOString().substring(0, 7);
  try { localStorage.setItem(TX_COUNT_KEY, JSON.stringify({ count, month })); } catch { /* ignore */ }
  return count;
}

function resetMonthlyTxCount(): void {
  const month = new Date().toISOString().substring(0, 7);
  try { localStorage.setItem(TX_COUNT_KEY, JSON.stringify({ count: 0, month })); } catch { /* ignore */ }
}

// ── Default status ────────────────────────────────────────────────
function defaultStatus(): SubscriptionStatus {
  return {
    plan: 'secangkir',
    isActive: true,
    expiryDate: null,
    transactionCount: getMonthlyTxCount(),
    transactionLimit: TRANSACTION_LIMIT_FREEMIUM,
    daysRemaining: null,
  };
}

// ── Main SubscriptionManager class ───────────────────────────────
class SubscriptionManagerClass {
  private static instance: SubscriptionManagerClass;
  private cachedStatus: SubscriptionStatus | null = null;
  private lastSyncTime: number = 0;
  private syncPromise: Promise<SubscriptionStatus> | null = null;

  private constructor() {
  }

  static getInstance(): SubscriptionManagerClass {
    if (!SubscriptionManagerClass.instance) {
      SubscriptionManagerClass.instance = new SubscriptionManagerClass();
    }
    return SubscriptionManagerClass.instance;
  }

  async getStatus(forceSync = false): Promise<SubscriptionStatus> {
    const now = Date.now();
    const needSync = forceSync || now - this.lastSyncTime > SYNC_INTERVAL_MS;

    if (!needSync && this.cachedStatus) return this.cachedStatus;

    // Cegah parallel sync
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = this.doSync().finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  private async doSync(): Promise<SubscriptionStatus> {
    try {
      const status = await this.syncWithBackend();
      this.cachedStatus = status;
      this.lastSyncTime = Date.now();
      saveLocal(status);
      return status;
    } catch {
      // Network error → fallback ke local
      const local = loadLocal();
      if (local) { this.cachedStatus = local; return local; }
      return defaultStatus();
    }
  }

  private async syncWithBackend(): Promise<SubscriptionStatus> {
    const profile = await getProfileMe();
    if (!profile) return defaultStatus();

    const access = buildSubscriptionAccess(profile as Profile);
    const expiryDate = access.expiryDate ? new Date(access.expiryDate) : null;

    return {
      plan: access.plan as PlanType,
      isActive: access.isActive,
      expiryDate,
      transactionCount: getMonthlyTxCount(),
      transactionLimit: access.transactionLimit,
      daysRemaining: access.daysRemaining,
    };
  }

  async checkTransactionAllowed(): Promise<{ allowed: boolean; remaining: number | null }> {
    const status = await this.getStatus();
    if (status.transactionLimit === -1) return { allowed: true, remaining: null };

    const count = getMonthlyTxCount();
    if (count >= status.transactionLimit) return { allowed: false, remaining: 0 };
    return { allowed: true, remaining: status.transactionLimit - count };
  }

  async incrementTransaction(): Promise<void> {
    incrementLocalTxCount();
    if (this.cachedStatus) {
      this.cachedStatus.transactionCount = getMonthlyTxCount();
    }
  }

  isPro(): boolean {
    const s = this.cachedStatus;
    if (!s) return false;
    return s.plan !== 'secangkir' && s.isActive;
  }

  clearCache(): void {
    this.cachedStatus = null;
    this.lastSyncTime = 0;
  }
}

export const subscriptionManager = SubscriptionManagerClass.getInstance();
