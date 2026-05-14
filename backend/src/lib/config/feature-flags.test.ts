import { afterEach, describe, expect, it } from 'vitest';
import {
  isAdminCommissionEnabled,
  isAffiliateEnabled,
  isAffiliateReferralEnabled,
  isReferralCommissionCreationEnabled,
  isReferralEnabled,
} from './feature-flags';

const flagNames = [
  'AFFILIATE_REFERRAL_ENABLED',
  'REFERRAL_ENABLED',
  'AFFILIATE_ENABLED',
  'ADMIN_COMMISSION_ENABLED',
  'REFERRAL_COMMISSION_CREATION_ENABLED',
] as const;

afterEach(() => {
  for (const name of flagNames) delete process.env[name];
});

describe('backend affiliate referral feature flags', () => {
  it('defaults every rollout flag to disabled', () => {
    expect(isAffiliateReferralEnabled()).toBe(false);
    expect(isReferralEnabled()).toBe(false);
    expect(isAffiliateEnabled()).toBe(false);
    expect(isAdminCommissionEnabled()).toBe(false);
    expect(isReferralCommissionCreationEnabled()).toBe(false);
  });

  it('requires the master flag before child flags activate', () => {
    process.env.REFERRAL_ENABLED = 'true';
    process.env.AFFILIATE_ENABLED = 'true';
    process.env.ADMIN_COMMISSION_ENABLED = 'true';
    process.env.REFERRAL_COMMISSION_CREATION_ENABLED = 'true';
    expect(isReferralEnabled()).toBe(false);
    expect(isAffiliateEnabled()).toBe(false);
    expect(isAdminCommissionEnabled()).toBe(false);
    expect(isReferralCommissionCreationEnabled()).toBe(false);

    process.env.AFFILIATE_REFERRAL_ENABLED = 'true';
    expect(isReferralEnabled()).toBe(true);
    expect(isAffiliateEnabled()).toBe(true);
    expect(isAdminCommissionEnabled()).toBe(true);
    expect(isReferralCommissionCreationEnabled()).toBe(true);
  });
});
