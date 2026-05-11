export type LoyaltyTier = 'regular' | 'kopi_lover' | 'vvip';
export type LoyaltyRewardType = 'discount_amount' | 'discount_percent' | 'free_item';

export type LoyaltySettings = {
  store_id: string;
  stamps_required: number;
  points_per_rupiah: number;
  minimum_transaction_amount: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LoyaltyPassport = {
  id: string;
  store_id: string;
  customer_name: string | null;
  customer_phone: string;
  tier: LoyaltyTier;
  total_stamps: number;
  available_stamps: number;
  total_points: number;
  available_points: number;
  lifetime_spend: number;
  last_visit_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LoyaltyReward = {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  type: LoyaltyRewardType;
  reward_value: number;
  points_or_stamps_needed?: number;
  points_cost: number;
  stamps_cost: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LoyaltyStampEvent = {
  id: string;
  store_id: string;
  passport_id: string;
  transaction_id: string | null;
  stamps: number;
  points: number;
  transaction_amount: number;
  note: string | null;
  created_at?: string;
};

export type LoyaltyRedemption = {
  id: string;
  store_id: string;
  passport_id: string;
  reward_id: string;
  transaction_id: string | null;
  points_spent: number;
  stamps_spent: number;
  discount_amount: number;
  status: 'pending' | 'redeemed' | 'void';
  created_at?: string;
};

export type LoyaltyCustomer = {
  id: string;
  store_id: string;
  name: string | null;
  phone: string;
  tier: LoyaltyTier;
  total_points: number;
  total_visits: number;
  created_at?: string;
  updated_at?: string;
};

export type LoyaltyTierSetting = {
  id: string;
  store_id?: string | null;
  name: string;
  min_visits: number;
  benefits: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type LoyaltyOverview = {
  settings: LoyaltySettings;
  rewards: LoyaltyReward[];
  passports: LoyaltyPassport[];
  customers?: LoyaltyCustomer[];
  tiers?: LoyaltyTierSetting[];
};

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  store_id: '',
  stamps_required: 8,
  points_per_rupiah: 0.01,
  minimum_transaction_amount: 0,
  is_active: true,
};

export function normalizeLoyaltyPhone(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function getTierLabel(tier: LoyaltyTier) {
  if (tier === 'vvip') return 'VVIP';
  if (tier === 'kopi_lover') return 'Kopi Lover';
  return 'Regular';
}

export function getTierProgress(passport: LoyaltyPassport) {
  if (passport.tier === 'vvip') {
    return { label: 'VVIP aktif', current: 100, target: 100, percent: 100 };
  }
  const nextTarget = passport.tier === 'kopi_lover' ? 2_000_000 : 500_000;
  const current = Math.min(passport.lifetime_spend, nextTarget);
  return {
    label: passport.tier === 'kopi_lover' ? 'Menuju VVIP' : 'Menuju Kopi Lover',
    current,
    target: nextTarget,
    percent: Math.round((current / nextTarget) * 100),
  };
}

export function getStampProgress(passport: LoyaltyPassport, settings: LoyaltySettings) {
  const required = Math.max(2, settings.stamps_required || DEFAULT_LOYALTY_SETTINGS.stamps_required);
  const current = passport.available_stamps % required;
  return {
    current: current === 0 && passport.available_stamps > 0 ? required : current,
    required,
    completedCards: Math.floor(passport.available_stamps / required),
  };
}

export function calculateLoyaltyRewardDiscount(reward: LoyaltyReward, transactionAmount: number) {
  const safeAmount = Math.max(0, Math.round(transactionAmount || 0));
  if (!reward.is_active) return 0;
  if (reward.type === 'discount_percent') {
    return Math.min(safeAmount, Math.round(safeAmount * Math.max(0, reward.reward_value) / 100));
  }
  if (reward.type === 'discount_amount') {
    return Math.min(safeAmount, Math.max(0, reward.reward_value));
  }
  if (reward.type === 'free_item') {
    return Math.min(safeAmount, Math.max(0, reward.reward_value));
  }
  return 0;
}

export function canRedeemReward(passport: LoyaltyPassport | null, reward: LoyaltyReward) {
  if (!passport || !reward.is_active) return false;
  return passport.available_points >= reward.points_cost && passport.available_stamps >= reward.stamps_cost;
}

export function getLoyaltyCacheKey(storeId: string) {
  return `kpos_loyalty_${storeId}`;
}

export function readCachedLoyaltyOverview(storeId: string): LoyaltyOverview | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(getLoyaltyCacheKey(storeId)) || 'null') as LoyaltyOverview | null;
    return parsed?.settings ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedLoyaltyOverview(storeId: string, overview: LoyaltyOverview) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getLoyaltyCacheKey(storeId), JSON.stringify(overview));
  } catch {
    // cache is optional
  }
}
