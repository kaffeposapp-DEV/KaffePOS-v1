import type { Profile } from '@/types';
import type { SubscriptionPlanId } from '@/lib/subscriptionPlans';

export type SubscriptionFeature =
  | 'unlimited_transactions'
  | 'report_export'
  | 'report_advanced_periods'
  | 'browser_print'
  | 'thermal_print'
  | 'multi_cashier'
  | 'cashier_sessions'
  | 'ai_insight'
  | 'gamification_full'
  | 'notification_center'
  | 'multi_outlet'
  | 'loyalty_basic'
  | 'loyalty_advanced'
  | 'priority_support';

export type SubscriptionFeatureFlags = Record<SubscriptionFeature, boolean>;

export type SubscriptionAccess = {
  plan: SubscriptionPlanId;
  accessPlan: SubscriptionPlanId;
  isPaid: boolean;
  isTrial: boolean;
  isGracePeriod: boolean;
  isActive: boolean;
  expiryDate: string | null;
  daysRemaining: number | null;
  transactionLimit: number;
  features: SubscriptionFeatureFlags;
};

const PLAN_ORDER: SubscriptionPlanId[] = ['secangkir', 'kopi_susu', 'signature', 'founder'];
const FREE_TRANSACTION_LIMIT = 100;

const FEATURE_PLAN_REQUIREMENTS: Record<SubscriptionFeature, SubscriptionPlanId> = {
  unlimited_transactions: 'kopi_susu',
  report_export: 'kopi_susu',
  report_advanced_periods: 'kopi_susu',
  browser_print: 'kopi_susu',
  thermal_print: 'kopi_susu',
  multi_cashier: 'signature',
  cashier_sessions: 'signature',
  ai_insight: 'signature',
  gamification_full: 'signature',
  notification_center: 'signature',
  multi_outlet: 'signature',
  loyalty_basic: 'kopi_susu',
  loyalty_advanced: 'signature',
  priority_support: 'signature',
};

function getPlanRank(plan: SubscriptionPlanId) {
  return PLAN_ORDER.indexOf(plan);
}

export function isPlanAtLeast(currentPlan: SubscriptionPlanId, minimumPlan: SubscriptionPlanId) {
  return getPlanRank(currentPlan) >= getPlanRank(minimumPlan);
}

export function getRecommendedPlanForFeature(feature: SubscriptionFeature): SubscriptionPlanId {
  return FEATURE_PLAN_REQUIREMENTS[feature];
}

export function resolveSubscriptionPlan(profile: Profile | null | undefined): SubscriptionPlanId {
  const hasPaidTier = profile?.tier === 'pro' || profile?.is_pro === true;
  if (!hasPaidTier) {
    return 'secangkir';
  }

  const requestedPlan = profile?.pro_plan as SubscriptionPlanId | null | undefined;
  if (requestedPlan && PLAN_ORDER.includes(requestedPlan)) {
    return requestedPlan;
  }

  return 'founder';
}

export function isSubscriptionExpired(profile: Profile | null | undefined, now = new Date()) {
  const rawExpiry = profile?.pro_expires_at || profile?.tier_expires_at || null;
  if (!rawExpiry) return false;
  return new Date(rawExpiry).getTime() <= now.getTime();
}

export function buildSubscriptionAccess(profile: Profile | null | undefined, now = new Date()): SubscriptionAccess {
  const expired = isSubscriptionExpired(profile, now);
  const plan = expired ? 'secangkir' : resolveSubscriptionPlan(profile);
  const rawExpiry = profile?.pro_expires_at || profile?.tier_expires_at || null;
  const hasActiveTrial = !expired && plan === 'secangkir' && (profile?.tier === 'pro' || profile?.is_pro === true) && Boolean(rawExpiry);
  const isPaid = plan !== 'secangkir';
  const accessPlan: SubscriptionPlanId = hasActiveTrial ? 'signature' : plan;
  const expiryDate = !expired ? (profile?.pro_expires_at || profile?.tier_expires_at || null) : null;
  const daysRemaining = expiryDate
    ? Math.max(Math.ceil((new Date(expiryDate).getTime() - now.getTime()) / 86_400_000), 0)
    : null;

  const features = (Object.keys(FEATURE_PLAN_REQUIREMENTS) as SubscriptionFeature[]).reduce<SubscriptionFeatureFlags>(
    (acc, feature) => {
      acc[feature] = isPlanAtLeast(accessPlan, FEATURE_PLAN_REQUIREMENTS[feature]);
      return acc;
    },
    {
      unlimited_transactions: false,
      report_export: false,
      report_advanced_periods: false,
      browser_print: false,
      thermal_print: false,
      multi_cashier: false,
      cashier_sessions: false,
      ai_insight: false,
      gamification_full: false,
      notification_center: false,
      multi_outlet: false,
      loyalty_basic: false,
      loyalty_advanced: false,
      priority_support: false,
    },
  );

  return {
    plan,
    accessPlan,
    isPaid,
    isTrial: hasActiveTrial,
    isGracePeriod: false,
    isActive: !expired,
    expiryDate,
    daysRemaining,
    transactionLimit: features.unlimited_transactions ? -1 : FREE_TRANSACTION_LIMIT,
    features,
  };
}

export function hasSubscriptionFeature(
  profileOrAccess: Profile | SubscriptionAccess | null | undefined,
  feature: SubscriptionFeature,
) {
  if (!profileOrAccess) return false;
  if ('features' in profileOrAccess) {
    return profileOrAccess.features[feature];
  }
  return buildSubscriptionAccess(profileOrAccess).features[feature];
}
