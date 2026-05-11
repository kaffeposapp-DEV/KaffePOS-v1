import type { SubscriptionPlanId } from '@/lib/subscriptionPlans';
import type { UpgradePromptEventPayload, SubscriptionUsageLimits } from '@/lib/backendApi';

export type UpgradePromptTrigger =
  | 'transaction_limit_80'
  | 'transaction_limit_blocked'
  | 'app_age_14_days'
  | 'ai_insight'
  | 'advanced_reports'
  | 'report_export'
  | 'multi_cashier'
  | 'thermal_printer'
  | 'browser_print'
  | 'loyalty_advanced'
  | 'gamification_full'
  | 'manual';

export type UpgradePromptRequest = {
  trigger: UpgradePromptTrigger | string;
  promptKey?: string;
  recommendedPlan?: Exclude<SubscriptionPlanId, 'secangkir'>;
  title?: string;
  description?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

const CACHE_PREFIX = 'kpos_subscription_usage_limits';
const DISMISS_PREFIX = 'kpos_upgrade_prompt_dismissed';
const VIEW_PREFIX = 'kpos_upgrade_prompt_viewed';
const FIRST_SEEN_PREFIX = 'kpos_upgrade_first_seen';
const DAY_MS = 86_400_000;

function safeStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function key(prefix: string, userOrStoreId?: string | null, promptKey = 'global') {
  return `${prefix}:${userOrStoreId || 'unknown'}:${promptKey}`;
}

export function dispatchUpgradePrompt(detail: UpgradePromptRequest) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<UpgradePromptRequest>('kaffepos-upgrade-prompt', { detail }));
}

export function cacheSubscriptionUsageLimits(storeId: string | null | undefined, usage: SubscriptionUsageLimits) {
  const storage = safeStorage();
  if (!storage || !storeId) return;
  try {
    storage.setItem(key(CACHE_PREFIX, storeId), JSON.stringify({ usage, cachedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export function readCachedSubscriptionUsageLimits(storeId: string | null | undefined): SubscriptionUsageLimits | null {
  const storage = safeStorage();
  if (!storage || !storeId) return null;
  try {
    const raw = storage.getItem(key(CACHE_PREFIX, storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { usage?: SubscriptionUsageLimits };
    return parsed.usage ?? null;
  } catch {
    return null;
  }
}

export function getOrCreateUpgradeFirstSeen(userId: string | null | undefined, fallback?: string | null) {
  const storage = safeStorage();
  if (!storage || !userId) return fallback ?? new Date().toISOString();
  const storageKey = key(FIRST_SEEN_PREFIX, userId);
  const existing = storage.getItem(storageKey);
  if (existing) return existing;
  const value = fallback ?? new Date().toISOString();
  try { storage.setItem(storageKey, value); } catch { /* ignore */ }
  return value;
}

export function daysSince(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

export function shouldThrottleUpgradePrompt(userOrStoreId: string | null | undefined, promptKey: string, cooldownDays: number) {
  const storage = safeStorage();
  if (!storage) return false;
  const raw = storage.getItem(key(DISMISS_PREFIX, userOrStoreId, promptKey)) || storage.getItem(key(VIEW_PREFIX, userOrStoreId, promptKey));
  if (!raw) return false;
  const last = new Date(raw).getTime();
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < cooldownDays * DAY_MS;
}

export function markUpgradePromptViewed(userOrStoreId: string | null | undefined, promptKey: string) {
  const storage = safeStorage();
  if (!storage) return;
  try { storage.setItem(key(VIEW_PREFIX, userOrStoreId, promptKey), new Date().toISOString()); } catch { /* ignore */ }
}

export function markUpgradePromptDismissed(userOrStoreId: string | null | undefined, promptKey: string) {
  const storage = safeStorage();
  if (!storage) return;
  try { storage.setItem(key(DISMISS_PREFIX, userOrStoreId, promptKey), new Date().toISOString()); } catch { /* ignore */ }
}

export function buildPromptEventPayload(
  eventType: UpgradePromptEventPayload['event_type'],
  params: {
    promptKey: string;
    trigger: string;
    recommendedPlan?: Exclude<SubscriptionPlanId, 'secangkir'>;
    currentPlan?: SubscriptionPlanId | string | null;
    storeId?: string | null;
    metadata?: Record<string, unknown>;
  },
): UpgradePromptEventPayload {
  return {
    event_type: eventType,
    prompt_key: params.promptKey,
    trigger: params.trigger,
    recommended_plan: params.recommendedPlan ?? 'signature',
    current_plan: params.currentPlan ?? null,
    store_id: params.storeId ?? null,
    metadata: params.metadata ?? {},
  };
}
