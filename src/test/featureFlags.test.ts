import { afterEach, describe, expect, it } from 'vitest';
import { canAccessTab, getVisibleTabs } from '@/lib/accessControl';
import {
  isAdminCommissionEnabled,
  isAffiliateEnabled,
  isAffiliateReferralEnabled,
  isReferralEnabled,
} from '@/lib/config/feature-flags';

const flagNames = [
  'VITE_AFFILIATE_REFERRAL_ENABLED',
  'VITE_REFERRAL_ENABLED',
  'VITE_AFFILIATE_ENABLED',
  'VITE_ADMIN_COMMISSION_ENABLED',
] as const;

function setFlag(name: typeof flagNames[number], value: string) {
  (import.meta.env as Record<string, string>)[name] = value;
}

afterEach(() => {
  for (const name of flagNames) delete (import.meta.env as Record<string, string>)[name];
});

describe('frontend affiliate referral feature flags', () => {
  it('defaults rollout flags and nav tabs to disabled', () => {
    expect(isAffiliateReferralEnabled()).toBe(false);
    expect(isReferralEnabled()).toBe(false);
    expect(isAffiliateEnabled()).toBe(false);
    expect(isAdminCommissionEnabled()).toBe(false);
    expect(getVisibleTabs('owner_admin')).not.toContain('referrals');
    expect(getVisibleTabs('owner_admin')).not.toContain('affiliate');
    expect(canAccessTab('owner_admin', 'referrals')).toBe(false);
    expect(canAccessTab('owner_admin', 'affiliate')).toBe(false);
  });

  it('shows referral and affiliate tabs only when master and child flags are enabled', () => {
    setFlag('VITE_REFERRAL_ENABLED', 'true');
    setFlag('VITE_AFFILIATE_ENABLED', 'true');
    expect(isReferralEnabled()).toBe(false);
    expect(isAffiliateEnabled()).toBe(false);

    setFlag('VITE_AFFILIATE_REFERRAL_ENABLED', 'true');
    expect(isReferralEnabled()).toBe(true);
    expect(isAffiliateEnabled()).toBe(true);
    expect(getVisibleTabs('owner_admin')).toEqual(expect.arrayContaining(['referrals', 'affiliate']));
  });
});
