export type SubscriptionPlanId = 'secangkir' | 'kopi_susu' | 'signature' | 'founder';
export type BillingCycle = 'free' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatusType = 'active' | 'expired' | 'cancelled' | 'pending';

export interface PlanPriceMap {
  free?: number;
  monthly?: number;
  quarterly?: number;
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
  isFree?: boolean;
}

export const INSTAGRAM_ADMIN_URL = 'https://instagram.com/kaffepos';
export const RENEWAL_URL = 'https://kaffepos.my.id/perpanjang';

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanDefinition> = {
  secangkir: {
    id: 'secangkir',
    name: 'Secangkir',
    shortName: 'Secangkir',
    badge: 'GRATIS',
    accentClass: 'text-emerald-700',
    accentSoftClass: 'bg-emerald-50 border-emerald-200',
    gradient: 'linear-gradient(135deg,#166534 0%,#22c55e 100%)',
    prices: { free: 0 },
    description: 'Mulai tanpa biaya untuk operasional dasar harian.',
    isFree: true,
    features: [
      'POS kasir untuk transaksi harian',
      'Manajemen menu dan kategori',
      'Riwayat transaksi dasar',
      'Laporan harian',
      'Limit penggunaan sesuai paket gratis',
    ],
  },
  kopi_susu: {
    id: 'kopi_susu',
    name: 'Kopi Susu',
    shortName: 'Kopi Susu',
    badge: 'POPULER',
    accentClass: 'text-amber-700',
    accentSoftClass: 'bg-amber-50 border-amber-200',
    gradient: 'linear-gradient(135deg,#b45309 0%,#f59e0b 100%)',
    prices: { monthly: 49000, quarterly: 139000, yearly: 499000 },
    description: 'Cocok untuk kedai yang mulai butuh laporan dan operasional lebih rapi.',
    features: [
      'Semua fitur Secangkir',
      'Export PDF dan Excel',
      'Laporan mingguan dan bulanan',
      'Cetak browser/WiFi tanpa batas',
      'Support prioritas via Instagram',
    ],
  },
  signature: {
    id: 'signature',
    name: 'Signature',
    shortName: 'Signature',
    badge: 'BEST VALUE',
    accentClass: 'text-orange-700',
    accentSoftClass: 'bg-orange-50 border-orange-200',
    gradient: 'linear-gradient(135deg,#9a3412 0%,#f97316 100%)',
    prices: { monthly: 99000, quarterly: 279000, yearly: 999000 },
    description: 'Untuk bisnis yang butuh automasi lebih banyak dan tim yang berkembang.',
    features: [
      'Semua fitur Kopi Susu',
      'Multi kasir / multi pengguna',
      'Thermal printer Bluetooth & USB',
      'AI Insight penjualan',
      'Backup data otomatis',
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
    prices: { monthly: 199000, quarterly: 549000, yearly: 1999000 },
    description: 'Paket tertinggi untuk operasional intensif dan dukungan paling prioritas.',
    features: [
      'Semua fitur Signature',
      'Pendampingan setup prioritas',
      'Review operasional berkala',
      'Dukungan admin lebih cepat',
      'Cocok untuk outlet dengan traffic tinggi',
    ],
  },
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  free: 'Gratis',
  monthly: 'Bulanan',
  quarterly: '3 Bulan',
  yearly: 'Tahunan',
};

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
  return 365;
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
