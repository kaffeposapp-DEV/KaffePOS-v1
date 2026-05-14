function readFlag(name: string) {
  return String(import.meta.env[name] ?? '').trim().toLowerCase() === 'true';
}

export function isAffiliateReferralEnabled() {
  return readFlag('VITE_AFFILIATE_REFERRAL_ENABLED');
}

export function isReferralEnabled() {
  return isAffiliateReferralEnabled() && readFlag('VITE_REFERRAL_ENABLED');
}

export function isAffiliateEnabled() {
  return isAffiliateReferralEnabled() && readFlag('VITE_AFFILIATE_ENABLED');
}

export function isAdminCommissionEnabled() {
  return isAffiliateReferralEnabled() && readFlag('VITE_ADMIN_COMMISSION_ENABLED');
}
