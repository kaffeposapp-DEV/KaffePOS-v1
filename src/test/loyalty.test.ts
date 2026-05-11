import { describe, expect, it } from 'vitest';
import {
  calculateLoyaltyRewardDiscount,
  canRedeemReward,
  getStampProgress,
  getTierLabel,
  getTierProgress,
  normalizeLoyaltyPhone,
  type LoyaltyPassport,
  type LoyaltyReward,
  type LoyaltySettings,
} from '@/lib/loyalty';

const settings: LoyaltySettings = {
  store_id: 'store_1',
  stamps_required: 8,
  points_per_rupiah: 0.01,
  minimum_transaction_amount: 0,
  is_active: true,
};

function passport(partial: Partial<LoyaltyPassport> = {}): LoyaltyPassport {
  return {
    id: 'passport_1',
    store_id: 'store_1',
    customer_name: 'Rina',
    customer_phone: '08123456789',
    tier: 'regular',
    total_stamps: 0,
    available_stamps: 0,
    total_points: 0,
    available_points: 0,
    lifetime_spend: 0,
    ...partial,
  };
}

function reward(partial: Partial<LoyaltyReward> = {}): LoyaltyReward {
  return {
    id: 'reward_1',
    store_id: 'store_1',
    name: 'Diskon',
    description: null,
    type: 'discount_amount',
    reward_value: 10000,
    points_cost: 1000,
    stamps_cost: 0,
    is_active: true,
    ...partial,
  };
}

describe('Kopi Passport loyalty utilities', () => {
  it('normalizes phone input for stable customer lookup', () => {
    expect(normalizeLoyaltyPhone('0812-3456 789')).toBe('08123456789');
    expect(normalizeLoyaltyPhone('+62 812 3456')).toBe('+628123456');
  });

  it('calculates stamp card progress with completed cards', () => {
    expect(getStampProgress(passport({ available_stamps: 3 }), settings)).toMatchObject({
      current: 3,
      required: 8,
      completedCards: 0,
    });
    expect(getStampProgress(passport({ available_stamps: 8 }), settings)).toMatchObject({
      current: 8,
      completedCards: 1,
    });
  });

  it('labels tiers and tier progress safely', () => {
    expect(getTierLabel('kopi_lover')).toBe('Kopi Lover');
    expect(getTierProgress(passport({ lifetime_spend: 250000 })).percent).toBe(50);
    expect(getTierProgress(passport({ tier: 'vvip', lifetime_spend: 5_000_000 })).percent).toBe(100);
  });

  it('checks reward eligibility using both points and stamps', () => {
    expect(canRedeemReward(passport({ available_points: 999 }), reward())).toBe(false);
    expect(canRedeemReward(passport({ available_points: 1000 }), reward())).toBe(true);
    expect(canRedeemReward(passport({ available_stamps: 7 }), reward({ points_cost: 0, stamps_cost: 8 }))).toBe(false);
    expect(canRedeemReward(passport({ available_stamps: 8 }), reward({ points_cost: 0, stamps_cost: 8 }))).toBe(true);
  });

  it('caps reward discount to transaction total', () => {
    expect(calculateLoyaltyRewardDiscount(reward({ reward_value: 10000 }), 25000)).toBe(10000);
    expect(calculateLoyaltyRewardDiscount(reward({ reward_value: 30000 }), 25000)).toBe(25000);
    expect(calculateLoyaltyRewardDiscount(reward({ type: 'discount_percent', reward_value: 10 }), 50000)).toBe(5000);
    expect(calculateLoyaltyRewardDiscount(reward({ type: 'free_item', reward_value: 22000 }), 50000)).toBe(22000);
  });
});
