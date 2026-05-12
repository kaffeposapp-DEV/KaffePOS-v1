import { describe, expect, it } from 'vitest';
import { buildSubscriptionAccess, hasSubscriptionFeature } from '@/lib/subscriptionAccess';

describe('subscriptionAccess', () => {
  it('membatasi paket secangkir non-trial ke 100 transaksi dan tanpa fitur premium', () => {
    const access = buildSubscriptionAccess({
      id: 'user-1',
      tier: 'basic',
      is_pro: false,
      pro_plan: 'secangkir',
    });

    expect(access.plan).toBe('secangkir');
    expect(access.isTrial).toBe(false);
    expect(access.transactionLimit).toBe(100);
    expect(access.features.unlimited_transactions).toBe(false);
    expect(access.features.report_export).toBe(false);
    expect(access.features.ai_insight).toBe(false);
  });

  it('membuka full Signature access selama trial Secangkir aktif', () => {
    const access = buildSubscriptionAccess({
      id: 'user-trial',
      tier: 'pro',
      is_pro: true,
      pro_plan: 'secangkir',
      pro_expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    });

    expect(access.plan).toBe('secangkir');
    expect(access.accessPlan).toBe('signature');
    expect(access.isTrial).toBe(true);
    expect(access.transactionLimit).toBe(-1);
    expect(access.features.ai_insight).toBe(true);
    expect(access.features.gamification_full).toBe(true);
    expect(access.features.loyalty_advanced).toBe(true);
  });

  it('membuka fitur signature dengan benar', () => {
    const access = buildSubscriptionAccess({
      id: 'user-2',
      tier: 'pro',
      is_pro: true,
      pro_plan: 'signature',
      pro_expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    expect(access.plan).toBe('signature');
    expect(access.transactionLimit).toBe(-1);
    expect(hasSubscriptionFeature(access, 'thermal_print')).toBe(true);
    expect(hasSubscriptionFeature(access, 'ai_insight')).toBe(true);
    expect(hasSubscriptionFeature(access, 'priority_support')).toBe(true);
  });

  it('mengembalikan user expired ke secangkir', () => {
    const access = buildSubscriptionAccess({
      id: 'user-3',
      tier: 'pro',
      is_pro: true,
      pro_plan: 'founder',
      pro_expires_at: new Date(Date.now() - 86400000).toISOString(),
    });

    expect(access.plan).toBe('secangkir');
    expect(access.isPaid).toBe(false);
    expect(access.features.ai_insight).toBe(false);
  });
});
