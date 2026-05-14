// Affiliate & Referral Types

export type AffiliateStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export type CommissionStatus = 'pending' | 'eligible' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferralClick {
  id: string;
  referral_code_id: string;
  ip_address?: string;
  user_agent?: string;
  referrer_url?: string;
  clicked_at: string;
}

export interface ReferralRegistration {
  id: string;
  referral_code_id: string;
  referred_user_id: string;
  referrer_user_id: string;
  registered_at: string;
  trial_started_at?: string;
  first_payment_at?: string;
  active_30_days_at?: string;
  reward_credited_at?: string;
  reward_amount_idr: number;
}

export interface AffiliateProfile {
  id: string;
  user_id: string;
  status: AffiliateStatus;
  commission_rate: number;
  payout_method?: string;
  payout_details?: Record<string, any>;
  applied_at: string;
  approved_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  total_clicks: number;
  total_registrations: number;
  total_paid_conversions: number;
  total_commission_earned_idr: number;
  total_commission_paid_idr: number;
  updated_at: string;
}

export interface CommissionTransaction {
  id: string;
  affiliate_user_id: string;
  referred_user_id: string;
  referral_registration_id: string;
  payment_order_id?: string;
  payment_amount_idr: number;
  commission_rate: number;
  commission_amount_idr: number;
  status: CommissionStatus;
  eligible_at?: string;
  approved_at?: string;
  rejected_at?: string;
  paid_at?: string;
  cancelled_at?: string;
  rejection_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionPayout {
  id: string;
  affiliate_user_id: string;
  payout_amount_idr: number;
  payout_method: string;
  payout_details?: Record<string, any>;
  commission_ids: string[];
  status: PayoutStatus;
  requested_at: string;
  processed_at?: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AffiliateTermsAcceptance {
  id: string;
  user_id: string;
  terms_version: string;
  accepted_at: string;
  ip_address?: string;
  user_agent?: string;
}

// API Request/Response types
export interface GenerateReferralCodeRequest {
  // No body needed
}

export interface GenerateReferralCodeResponse {
  code: string;
  referral_link: string;
}

export interface GetReferralStatsResponse {
  referral_code?: ReferralCode;
  total_clicks: number;
  total_registrations: number;
  total_paid_conversions: number;
  total_rewards_earned_idr: number;
  recent_registrations: Array<{
    id: string;
    referred_user_email: string;
    registered_at: string;
    first_payment_at?: string;
    reward_credited_at?: string;
  }>;
}

export interface ApplyAffiliateRequest {
  terms_version: string;
  payout_method?: string;
  payout_details?: Record<string, any>;
}

export interface ApplyAffiliateResponse {
  affiliate_profile: AffiliateProfile;
}

export interface GetAffiliateDashboardResponse {
  affiliate_profile: AffiliateProfile;
  referral_code?: ReferralCode;
  pending_commission_idr: number;
  approved_commission_idr: number;
  paid_commission_idr: number;
  recent_commissions: CommissionTransaction[];
}

export interface UpdateAffiliatePayoutRequest {
  payout_method: string;
  payout_details: Record<string, any>;
}

export interface AdminUpdateAffiliateStatusRequest {
  status: AffiliateStatus;
  rejection_reason?: string;
}

export interface AdminUpdateCommissionRequest {
  status: CommissionStatus;
  rejection_reason?: string;
  notes?: string;
}

export interface TrackReferralClickRequest {
  code: string;
  ip_address?: string;
  user_agent?: string;
  referrer_url?: string;
}
