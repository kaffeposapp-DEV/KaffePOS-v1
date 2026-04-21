/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscriptionManager } from '@/services/SubscriptionManager';
import { getProfileMe } from '@/lib/backendApi';

vi.mock('@/lib/backendApi', () => ({
  getProfileMe: vi.fn().mockResolvedValue({
    tier: 'pro',
    is_pro: true,
    pro_plan: 'kopi_susu',
    pro_expires_at: new Date(Date.now() + 86400000).toISOString(),
  }),
}));

describe('Subscription Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    subscriptionManager.clearCache();
  });

  it('incrementTransaction secangkir -> blocked setelah 50', async () => {
    vi.mocked(getProfileMe).mockResolvedValue({
      tier: 'basic',
      is_pro: false,
      pro_plan: 'secangkir',
    } as any);

    // Reset tx count
    localStorage.setItem('kaffepos_tx_month', JSON.stringify({ count: 50, month: new Date().toISOString().substring(0, 7) }));

    const res = await subscriptionManager.checkTransactionAllowed();
    expect(res.allowed).toBe(false);
  });

  it('isPro() return benar sesuai plan', async () => {
    vi.mocked(getProfileMe).mockResolvedValue({
      tier: 'pro',
      is_pro: true,
      pro_plan: 'kopi_susu',
      pro_expires_at: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    const status = await subscriptionManager.getStatus(true);
    expect(status.plan).toBe('kopi_susu');
    expect(subscriptionManager.isPro()).toBe(true);
  });
});
