// Affiliate & Referral Types (Frontend)

export type AffiliateStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export type CommissionStatus = 'pending' | 'eligible' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  type?: 'customer_referral' | 'affiliate';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferralRegistration {
  id: string;
  status?: string;
  referral_type?: 'customer_referral' | 'affiliate' | string;
  eligible_at?: string | null;
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

export interface AffiliatePayoutInfo {
  payout_name?: string | null;
  payout_bank_name?: string | null;
  payout_account_holder?: string | null;
  payout_account_number_masked?: string | null;
}

export interface AffiliateProfile {
  id: string;
  total_revenue?: number;
  total_commission?: number;
  user_id: string;
  affiliate_code?: string;
  status: AffiliateStatus;
  commission_rate: number;
  payout_method?: string;
  payout_details?: Record<string, unknown>;
  payout_info?: AffiliatePayoutInfo;
  applied_at: string;
  approved_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  total_clicks: number;
  total_registrations: number;
  total_paid_conversions: number;
  total_commission_earned_idr: number;
  total_commission_paid_idr: number;
  created_at?: string;
  updated_at: string;
}

export interface CommissionTransaction {
  id: string;
  referrer_name?: string | null;
  referrer_email?: string | null;
  affiliate_user_id: string;
  referred_user_id: string;
  referral_registration_id: string;
  payment_order_id?: string;
  payment_id?: string | null;
  payment_amount_idr?: number;
  commission_rate?: number;
  commission_amount_idr?: number;
  type?: 'referral_credit' | 'affiliate_cash';
  amount?: number;
  currency?: string;
  rate?: number | null;
  status: CommissionStatus;
  eligible_at?: string;
  approved_at?: string;
  rejected_at?: string;
  paid_at?: string;
  cancelled_at?: string;
  rejection_reason?: string;
  notes?: string;
  first_payment_at?: string | null;
  referred_name?: string | null;
  referred_email?: string | null;
  referred_user?: { name?: string | null; email?: string | null } | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralHistoryItem {
  id: string;
  status: string;
  registered_at: string;
  trial_started_at?: string | null;
  first_payment_at?: string | null;
  eligible_at?: string | null;
  referred_user?: {
    email?: string | null;
    name?: string | null;
  } | null;
}

export interface ReferralStats {
  referral_code?: ReferralCode | null;
  referral_link?: string | null;
  total_clicks: number;
  total_registrations: number;
  total_trial_started: number;
  total_paid: number;
  total_paid_conversions?: number;
  total_reward_pending: number;
  total_reward_approved: number;
  total_reward_paid: number;
  total_rewards_earned_idr?: number;
  referral_history: ReferralHistoryItem[];
  recent_registrations?: Array<{
    id: string;
    referred_user_email: string;
    registered_at: string;
    first_payment_at?: string;
    reward_credited_at?: string;
  }>;
}

export interface AffiliateDashboard {
  affiliate_profile: AffiliateProfile;
  referral_code?: ReferralCode;
  pending_commission_idr: number;
  approved_commission_idr: number;
  paid_commission_idr: number;
  recent_commissions: CommissionTransaction[];
}

export interface AffiliateDashboardData {
  affiliate_profile: AffiliateProfile;
  affiliate_code?: string | null;
  affiliate_link?: string | null;
  commission_rate: number;
  total_clicks: number;
  total_registrations: number;
  total_paid_conversions: number;
  pending_commission: number;
  eligible_commission: number;
  approved_commission: number;
  paid_commission: number;
  commission_history: CommissionTransaction[];
  payout_info?: AffiliatePayoutInfo | null;
}

export interface AffiliatePayoutInput {
  payoutName: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountHolder: string;
}

export interface AffiliateApplyInput extends AffiliatePayoutInput {
  acceptedTerms: true;
  termsVersion: string;
}

export interface AdminAffiliateListItem extends AffiliateProfile {
  user_email: string;
  user_name: string;
}

export interface AdminCommissionListItem extends CommissionTransaction {
  affiliate_email: string;
  affiliate_name: string;
  referred_email: string;
  referred_name: string;
}

export interface AdminReferralListItem extends ReferralRegistration {
  referral_code?: string;
  referrer_email: string;
  referrer_name: string;
  referred_email: string;
  referred_name: string;
}

export interface AdminAffiliateDetail {
  affiliate_profile: AffiliateProfile;
  stats?: Record<string, unknown>;
  referral_registrations?: AdminReferralListItem[];
  commission_history?: CommissionTransaction[];
  payout_info?: AffiliatePayoutInfo | null;
  terms_acceptance?: Record<string, unknown> | null;
}

export interface AdminReferralDetail {
  referral_registration: AdminReferralListItem | ReferralRegistration;
  referral_code?: ReferralCode | null;
  click_summary?: Record<string, unknown> | null;
  related_commission?: CommissionTransaction | null;
  related_payment?: Record<string, unknown> | null;
}

export interface AdminCommissionDetail {
  commission: AdminCommissionListItem | CommissionTransaction;
  referral_registration?: AdminReferralListItem | ReferralRegistration | null;
  payment?: Record<string, unknown> | null;
  affiliate_profile?: AffiliateProfile | null;
  timeline?: Array<{ label: string; at?: string | null }>;
  admin_notes?: string | null;
}
