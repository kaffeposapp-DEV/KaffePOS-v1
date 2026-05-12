export type SubscriptionPlanId = 'secangkir' | 'kopi_susu' | 'signature' | 'founder';
export type BillingCycle = 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type SubscriptionStatusType = 'active' | 'expired' | 'cancelled' | 'pending';

export interface PlanPriceMap {
  free?: number;
  monthly?: number;
  quarterly?: number;
  semiannual?: number;
  yearly?: number;
}

export interface SubscriptionPlanDefinition {
  id: SubscriptionPlanId;
  name: string;
  shortName: string;
  badge: string;
  accentClass: string;
  accentSoftClass: string;
  gradient: string;
  prices: PlanPriceMap;
  features: string[];
  description: string;
  audience: string;
  isFree?: boolean;
}

export const INSTAGRAM_ADMIN_URL = 'https://instagram.com/kaffepos';
export const RENEWAL_URL = 'https://kaffepos.my.id/perpanjang';
export const TRIAL_DAYS = 14;
export const TRIAL_GRACE_DAYS = 3;
export const TRIAL_MESSAGE = 'Gratis 14 Hari • Full Akses Signature • Otomatis Rp49.000/bulan setelah trial berakhir';
export const PRICING_MAIN_HEADLINE = 'Coba KaffePOS Gratis 14 Hari Full Fitur Premium';
export const PRICING_SUB_HEADLINE = 'Rasakan Gamification, AI Insights, dan Kopi Passport Loyalty selama 14 hari tanpa bayar. Setelah itu hanya Rp49.000/bulan.';
export const SIGNATURE_TAGLINE = 'Paling Populer • Full Gamification + AI Insights + Advanced Loyalty';
export const ACTIVE_SUBSCRIPTION_PLAN_IDS: SubscriptionPlanId[] = ['secangkir', 'kopi_susu', 'signature'];

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanDefinition> = {
  secangkir: {
    id: 'secangkir',
    name: 'Secangkir',
    shortName: 'Secangkir',
    badge: 'TRIAL 14 HARI',
    accentClass: 'text-orange-700',
    accentSoftClass: 'bg-orange-50 border-orange-200',
    gradient: 'linear-gradient(135deg,#FF6A00 0%,#FF8A1C 100%)',
    prices: { free: 0 },
    description: TRIAL_MESSAGE,
    audience: 'Gratis 14 hari full fitur premium',
    isFree: true,
    features: [
      'Full access semua fitur Signature selama 14 hari',
      'POS, inventory + resep, KDS, dan laporan lengkap',
      'Full Gamification: Kopi Score, Badges, Leaderboard, Daily Challenges',
      'Advanced Kopi Passport Loyalty',
      'AI Insights pintar dan Notification Center',
      'Otomatis menjadi Kopi Susu Rp49.000/bulan setelah trial',
    ],
  },
  kopi_susu: {
    id: 'kopi_susu',
    name: 'Kopi Susu',
    shortName: 'Kopi Susu',
    badge: 'CAFE KECIL',
    accentClass: 'text-amber-700',
    accentSoftClass: 'bg-amber-50 border-amber-200',
    gradient: 'linear-gradient(135deg,#b45309 0%,#f59e0b 100%)',
    prices: { monthly: 49000, quarterly: 129000, semiannual: 249000, yearly: 449000 },
    description: 'Untuk Cafe Kecil yang Serius. Unlimited transaksi, cetak browser, loyalty dasar, dan laporan lengkap. Mulai Rp49.000/bulan.',
    audience: 'Paling cocok untuk cafe kecil',
    features: [
      'Transaksi tanpa batas',
      'Cetak browser',
      'Inventory + resep',
      'Kitchen Display',
      'Kopi Passport Loyalty dasar',
    ],
  },
  signature: {
    id: 'signature',
    name: 'Signature',
    shortName: 'Signature',
    badge: 'PALING POPULER',
    accentClass: 'text-orange-700',
    accentSoftClass: 'bg-orange-50 border-orange-200',
    gradient: 'linear-gradient(135deg,#9a3412 0%,#f97316 100%)',
    prices: { monthly: 129000, quarterly: 349000, semiannual: 649000, yearly: 1199000 },
    description: SIGNATURE_TAGLINE,
    audience: 'Recommended - paling populer',
    features: [
      'Semua fitur Kopi Susu',
      'Full Gamification',
      'Advanced Kopi Passport Loyalty',
      'AI Insights pintar',
      'Notification Center',
      'Multi kasir dan cashier session',
    ],
  },
  founder: {
    id: 'founder',
    name: 'Founder',
    shortName: 'Founder',
    badge: 'PREMIUM',
    accentClass: 'text-slate-100',
    accentSoftClass: 'bg-slate-900 border-slate-700',
    gradient: 'linear-gradient(135deg,#0f172a 0%,#334155 100%)',
    prices: { monthly: 249000, quarterly: 679000, semiannual: 1249000, yearly: 2299000 },
    description: 'Solusi profesional untuk cafe yang sedang berkembang. Semua fitur Signature + Multi Outlet, dedicated support, dan bantuan setup bisnis.',
    audience: 'Untuk cafe berkembang dan rantai',
    features: [
      'Semua fitur Signature',
      'Multi Outlet',
      'Dedicated support',
      'Bantuan setup bisnis',
      'Review operasional berkala',
      'Prioritas roadmap dan onboarding',
    ],
  },
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  free: 'Gratis',
  monthly: '1 Bulan',
  quarterly: '3 Bulan',
  semiannual: '6 Bulan',
  yearly: '12 Bulan',
};

export const PAID_BILLING_CYCLES: Exclude<BillingCycle, 'free'>[] = ['monthly', 'quarterly', 'semiannual', 'yearly'];
export const ACTIVE_PAID_PLAN_IDS: Exclude<SubscriptionPlanId, 'secangkir'>[] = ['kopi_susu', 'signature'];

export function getPlanDefinition(plan: string | null | undefined): SubscriptionPlanDefinition {
  return SUBSCRIPTION_PLANS[(plan as SubscriptionPlanId) || 'secangkir'] || SUBSCRIPTION_PLANS.secangkir;
}

export function getBillingCycleLabel(cycle: string | null | undefined): string {
  return BILLING_CYCLE_LABELS[(cycle as BillingCycle) || 'monthly'] || BILLING_CYCLE_LABELS.monthly;
}

export function formatRupiah(amount: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

export function getPlanPrice(plan: string | null | undefined, cycle: string | null | undefined): number {
  const planDef = getPlanDefinition(plan);
  const key = (cycle as BillingCycle) || (planDef.isFree ? 'free' : 'monthly');
  return planDef.prices[key] ?? 0;
}

export function getDurationDays(cycle: BillingCycle): number | null {
  if (cycle === 'free') return null;
  if (cycle === 'monthly') return 30;
  if (cycle === 'quarterly') return 90;
  if (cycle === 'semiannual') return 180;
  return 365;
}

export function getBillingCycleMonths(cycle: BillingCycle): number {
  if (cycle === 'quarterly') return 3;
  if (cycle === 'semiannual') return 6;
  if (cycle === 'yearly') return 12;
  return 1;
}

export function getMonthlyEquivalent(plan: SubscriptionPlanId, cycle: BillingCycle): number {
  const price = getPlanPrice(plan, cycle);
  return Math.round(price / getBillingCycleMonths(cycle));
}

export function getPlanSavingsPercent(plan: SubscriptionPlanId, cycle: BillingCycle): number {
  if (cycle === 'free' || cycle === 'monthly') return 0;
  const monthly = getPlanPrice(plan, 'monthly');
  const current = getPlanPrice(plan, cycle);
  const baseline = monthly * getBillingCycleMonths(cycle);
  if (!monthly || !baseline) return 0;
  return Math.max(0, Math.round(((baseline - current) / baseline) * 100));
}

export function calculateExpiryDate(cycle: BillingCycle, fromDate = new Date()): Date | null {
  const days = getDurationDays(cycle);
  if (!days) return null;
  const expiresAt = new Date(fromDate);
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export function formatDateId(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
