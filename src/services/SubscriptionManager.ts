// src/services/SubscriptionManager.ts — KaffePOS Subscription Engine
// Device-based subscription dengan Supabase sync + offline fallback

import { supabase } from '@/lib/supabase';

export type PlanType = 'freemium' | 'monthly' | 'pro' | 'yearly' | 'lifetime' | 'enterprise';

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
const DEVICE_KEY = 'kaffepos_device_id';
const TX_COUNT_KEY = 'kaffepos_tx_month';

// ── Device ID ─────────────────────────────────────────────────────
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `kfp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

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
  try { localStorage.setItem(LOCAL_KEY, raw); } catch {}
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
  try { localStorage.setItem(TX_COUNT_KEY, JSON.stringify({ count, month })); } catch {}
  return count;
}

function resetMonthlyTxCount(): void {
  const month = new Date().toISOString().substring(0, 7);
  try { localStorage.setItem(TX_COUNT_KEY, JSON.stringify({ count: 0, month })); } catch {}
}

// ── Default status ────────────────────────────────────────────────
function defaultStatus(): SubscriptionStatus {
  return {
    plan: 'freemium',
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
  private deviceId: string;
  private cachedStatus: SubscriptionStatus | null = null;
  private lastSyncTime: number = 0;
  private syncPromise: Promise<SubscriptionStatus> | null = null;

  private constructor() {
    this.deviceId = getDeviceId();
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
      const status = await this.syncWithSupabase();
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

  private async syncWithSupabase(): Promise<SubscriptionStatus> {
    // Cek dari profiles tabel (sudah ada di app)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return defaultStatus();

    const { data: profile } = await supabase
      .from('profiles')
      .select('tier, is_pro, pro_plan, pro_expires_at, pro_activated_at')
      .eq('id', user.id)
      .single();

    if (!profile) return defaultStatus();

    const hasPro = profile.tier === 'pro' || !!profile.is_pro;
    if (!hasPro) {
      return {
        plan: 'freemium',
        isActive: true,
        expiryDate: null,
        transactionCount: getMonthlyTxCount(),
        transactionLimit: TRANSACTION_LIMIT_FREEMIUM,
        daysRemaining: null,
      };
    }

    const planType = (profile.pro_plan as PlanType) || 'lifetime';
    let expiryDate: Date | null = null;
    let daysRemaining: number | null = null;

    if (planType !== 'lifetime' && profile.pro_expires_at) {
      expiryDate = new Date(profile.pro_expires_at);
      daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);
      if (daysRemaining <= 0) {
        return defaultStatus(); // expired → freemium
      }
    }

    return {
      plan: planType,
      isActive: true,
      expiryDate,
      transactionCount: getMonthlyTxCount(),
      transactionLimit: -1, // unlimited
      daysRemaining,
    };
  }

  async validateAndActivateLicense(licenseKey: string): Promise<{
    success: boolean;
    message: string;
    plan?: PlanType;
  }> {
    if (!licenseKey) return { success: false, message: 'Kode lisensi tidak boleh kosong.' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: 'Belum login. Silakan login terlebih dahulu.' };

    try {
      const { data: keyRow, error: keyErr } = await supabase
        .from('lisensi_key')
        .select('*')
        .eq('key', licenseKey)
        .maybeSingle();

      if (keyErr && keyErr.code !== 'PGRST116') {
        return { success: false, message: 'Gagal validasi. Coba lagi.' };
      }

      if (!keyRow) return { success: false, message: 'Kode lisensi tidak ditemukan.' };
      if (keyRow.is_used) return { success: false, message: 'Kode lisensi sudah pernah digunakan.' };
      if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
        return { success: false, message: 'Kode lisensi sudah kadaluarsa.' };
      }

      const planId: PlanType = (keyRow.plan as PlanType) || 'monthly';
      const expiresAt = new Date();
      if (planId === 'yearly')        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      else if (planId === 'lifetime') expiresAt.setFullYear(expiresAt.getFullYear() + 99);
      else                            expiresAt.setMonth(expiresAt.getMonth() + 1);

      const { error: updateErr } = await supabase.from('profiles').update({
        tier: 'pro', is_pro: true,
        pro_plan: planId,
        pro_order_id: licenseKey,
        pro_activated_at: new Date().toISOString(),
        pro_expires_at: expiresAt.toISOString(),
      }).eq('id', user.id);

      if (updateErr) return { success: false, message: `Gagal aktivasi: ${updateErr.message}` };

      await supabase.from('lisensi_key').update({
        is_used: true, used_by: user.id, used_at: new Date().toISOString(),
      }).eq('key', licenseKey);

      this.cachedStatus = null;
      await this.getStatus(true);

      const expStr = planId === 'lifetime' ? 'Seumur hidup' :
        expiresAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      return {
        success: true,
        message: `🎉 Paket ${planId.toUpperCase()} aktif hingga ${expStr}!`,
        plan: planId,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Terjadi kesalahan.';
      return { success: false, message: msg };
    }
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
    return s.plan !== 'freemium' && s.isActive;
  }

  clearCache(): void {
    this.cachedStatus = null;
    this.lastSyncTime = 0;
  }
}

export const subscriptionManager = SubscriptionManagerClass.getInstance();
