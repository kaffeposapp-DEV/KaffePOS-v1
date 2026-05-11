import type { Profile, Transaction } from '@/types';

export type ChallengeTargetType =
  | 'sell_drink'
  | 'average_checkout_time'
  | 'transactions_count'
  | 'upsell_value'
  | 'zero_voids';

export type ChallengeTargetValue = {
  drink_name?: string;
  cups?: number;
  seconds?: number;
  min_transactions?: number;
  transactions?: number;
  amount?: number;
  required_transactions?: number;
  target?: number;
};

export type Challenge = {
  id: string;
  store_id: string;
  title: string;
  description: string;
  target_type: ChallengeTargetType;
  target_value: ChallengeTargetValue;
  points_reward: number;
  is_active: boolean;
  valid_from: string;
  valid_to: string;
  created_at?: string;
  updated_at?: string;
};

export type UserChallengeProgress = {
  id: string | null;
  user_id: string | null;
  challenge_id: string | null;
  current_progress: number;
  is_completed: boolean;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChallengeProgressSummary = {
  active_count: number;
  completed_count: number;
  reward_points: number;
};

export type TeamChallengeCompletion = {
  active_challenges: Challenge[];
  staff_count: number;
  completed_count: number;
  total_slots: number;
  completion_rate: number;
};

export function getChallengesCacheKey(storeId: string) {
  return `kpos_challenges_${storeId}`;
}

export function getChallengeProgressCacheKey(storeId: string, userId?: string | null) {
  return `kpos_challenge_progress_${storeId}_${userId || 'me'}`;
}

export function getChallengeTargetNumber(challenge: Challenge) {
  const target = challenge.target_value || {};
  if (challenge.target_type === 'sell_drink') return Math.max(1, Math.round(Number(target.cups ?? target.target ?? 1)));
  if (challenge.target_type === 'average_checkout_time') {
    return Math.max(1, Math.round(Number(target.min_transactions ?? target.transactions ?? 1)));
  }
  if (challenge.target_type === 'transactions_count') return Math.max(1, Math.round(Number(target.transactions ?? target.target ?? 1)));
  if (challenge.target_type === 'upsell_value') return Math.max(1, Math.round(Number(target.amount ?? target.target ?? 1)));
  return 1;
}

export function getChallengeProgressLabel(challenge: Challenge, currentProgress: number) {
  const formatter = new Intl.NumberFormat('id-ID');
  if (challenge.target_type === 'upsell_value') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(currentProgress || 0);
  }
  return formatter.format(Math.round(currentProgress || 0));
}

function dayKey(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function normalizeName(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function resolveStaffAliases(profile?: Profile | null) {
  return new Set(
    [
      profile?.display_name,
      profile?.username,
      profile?.email?.split('@')[0],
      'Kasir',
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeName),
  );
}

function belongsToProfile(transaction: Transaction, profile?: Profile | null) {
  return resolveStaffAliases(profile).has(normalizeName(transaction.cashier || 'Kasir'));
}

function inChallengeWindow(transaction: Transaction, challenge: Challenge) {
  const txDay = dayKey(new Date(transaction.date));
  return txDay >= String(challenge.valid_from).slice(0, 10) && txDay <= String(challenge.valid_to).slice(0, 10);
}

export function deriveLocalChallengeProgress(params: {
  challenges: Challenge[];
  transactions: Transaction[];
  profile?: Profile | null | undefined;
  existingProgress?: UserChallengeProgress[];
}) {
  const existingByChallenge = new Map((params.existingProgress || []).map((item) => [item.challenge_id, item]));
  return params.challenges.map((challenge) => {
    const relevant = params.transactions.filter((transaction) => (
      belongsToProfile(transaction, params.profile) && inChallengeWindow(transaction, challenge)
    ));
    let current = existingByChallenge.get(challenge.id)?.current_progress || 0;

    if (challenge.target_type === 'sell_drink') {
      const drinkName = normalizeName(challenge.target_value.drink_name || '');
      current = relevant
        .filter((transaction) => !transaction.is_void)
        .flatMap((transaction) => transaction.items || [])
        .filter((item) => normalizeName(item.name).includes(drinkName))
        .reduce((sum, item) => sum + (item.qty || 0), 0);
    }

    if (challenge.target_type === 'transactions_count') {
      current = relevant.filter((transaction) => !transaction.is_void).length;
    }

    if (challenge.target_type === 'upsell_value') {
      const localUpsell = relevant
        .filter((transaction) => !transaction.is_void)
        .reduce((sum, transaction) => sum + Math.max((transaction.total || 0) - 50000, 0), 0);
      current = Math.max(current, localUpsell);
    }

    if (challenge.target_type === 'zero_voids') {
      const nonVoidCount = relevant.filter((transaction) => !transaction.is_void).length;
      const voidCount = relevant.filter((transaction) => transaction.is_void).length;
      current = nonVoidCount > 0 && voidCount === 0 ? 1 : 0;
    }

    const target = getChallengeTargetNumber(challenge);
    const existing = existingByChallenge.get(challenge.id);
    return {
      id: existing?.id ?? null,
      user_id: existing?.user_id ?? params.profile?.id ?? null,
      challenge_id: challenge.id,
      current_progress: Math.min(current, target),
      is_completed: current >= target || existing?.is_completed === true,
      completed_at: existing?.completed_at ?? null,
      created_at: existing?.created_at ?? null,
      updated_at: existing?.updated_at ?? null,
    } satisfies UserChallengeProgress;
  });
}
