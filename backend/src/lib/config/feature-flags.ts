function readFlag(name: string) {
  return String(process.env[name] ?? '').trim().toLowerCase() === 'true';
}

export function isAffiliateReferralEnabled() {
  return readFlag('AFFILIATE_REFERRAL_ENABLED');
}

export function isReferralEnabled() {
  return isAffiliateReferralEnabled() && readFlag('REFERRAL_ENABLED');
}

export function isAffiliateEnabled() {
  return isAffiliateReferralEnabled() && readFlag('AFFILIATE_ENABLED');
}

export function isAdminCommissionEnabled() {
  return isAffiliateReferralEnabled() && readFlag('ADMIN_COMMISSION_ENABLED');
}

export function isReferralCommissionCreationEnabled() {
  return isAffiliateReferralEnabled() && readFlag('REFERRAL_COMMISSION_CREATION_ENABLED');
}
