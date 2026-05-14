-- Affiliate & Referral Program Migration
-- Created: 2026-05-13
-- Purpose: Add referral codes, affiliate tracking, and commission management

-- ============================================================================
-- 1. Referral Codes Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_active ON referral_codes(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. Referral Clicks Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  referrer_url TEXT,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT referral_clicks_code_fkey FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE CASCADE
);

CREATE INDEX idx_referral_clicks_code_id ON referral_clicks(referral_code_id);
CREATE INDEX idx_referral_clicks_clicked_at ON referral_clicks(clicked_at);

-- ============================================================================
-- 3. Referral Registrations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS referral_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referrer_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  trial_started_at TIMESTAMPTZ,
  first_payment_at TIMESTAMPTZ,
  active_30_days_at TIMESTAMPTZ,
  reward_credited_at TIMESTAMPTZ,
  reward_amount_idr INTEGER DEFAULT 150000,
  CONSTRAINT referral_registrations_code_fkey FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE CASCADE,
  CONSTRAINT referral_registrations_referred_user_fkey FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT referral_registrations_referrer_user_fkey FOREIGN KEY (referrer_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT unique_referred_user UNIQUE(referred_user_id)
);

CREATE INDEX idx_referral_registrations_code_id ON referral_registrations(referral_code_id);
CREATE INDEX idx_referral_registrations_referred_user ON referral_registrations(referred_user_id);
CREATE INDEX idx_referral_registrations_referrer_user ON referral_registrations(referrer_user_id);
CREATE INDEX idx_referral_registrations_registered_at ON referral_registrations(registered_at);

-- ============================================================================
-- 4. Affiliate Profiles Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  commission_rate DECIMAL(5,2) DEFAULT 20.00,
  payout_method VARCHAR(50),
  payout_details JSONB,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  total_clicks INTEGER DEFAULT 0,
  total_registrations INTEGER DEFAULT 0,
  total_paid_conversions INTEGER DEFAULT 0,
  total_commission_earned_idr INTEGER DEFAULT 0,
  total_commission_paid_idr INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT affiliate_profiles_user_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_affiliate_profiles_user_id ON affiliate_profiles(user_id);
CREATE INDEX idx_affiliate_profiles_status ON affiliate_profiles(status);

-- ============================================================================
-- 5. Commission Transactions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referral_registration_id UUID NOT NULL REFERENCES referral_registrations(id) ON DELETE CASCADE,
  payment_order_id VARCHAR(100),
  payment_amount_idr INTEGER NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  commission_amount_idr INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'approved', 'rejected', 'paid', 'cancelled')),
  eligible_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT commission_transactions_affiliate_fkey FOREIGN KEY (affiliate_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT commission_transactions_referred_fkey FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT commission_transactions_registration_fkey FOREIGN KEY (referral_registration_id) REFERENCES referral_registrations(id) ON DELETE CASCADE,
  CONSTRAINT unique_commission_per_registration UNIQUE(referral_registration_id)
);

CREATE INDEX idx_commission_transactions_affiliate ON commission_transactions(affiliate_user_id);
CREATE INDEX idx_commission_transactions_referred ON commission_transactions(referred_user_id);
CREATE INDEX idx_commission_transactions_registration ON commission_transactions(referral_registration_id);
CREATE INDEX idx_commission_transactions_status ON commission_transactions(status);
CREATE INDEX idx_commission_transactions_order_id ON commission_transactions(payment_order_id);

-- ============================================================================
-- 6. Commission Payouts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payout_amount_idr INTEGER NOT NULL,
  payout_method VARCHAR(50) NOT NULL,
  payout_details JSONB,
  commission_ids UUID[] NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT commission_payouts_affiliate_fkey FOREIGN KEY (affiliate_user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_commission_payouts_affiliate ON commission_payouts(affiliate_user_id);
CREATE INDEX idx_commission_payouts_status ON commission_payouts(status);
CREATE INDEX idx_commission_payouts_requested_at ON commission_payouts(requested_at);

-- ============================================================================
-- 7. Affiliate Terms Acceptances Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliate_terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  terms_version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  CONSTRAINT affiliate_terms_user_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_affiliate_terms_user_id ON affiliate_terms_acceptances(user_id);
CREATE INDEX idx_affiliate_terms_accepted_at ON affiliate_terms_acceptances(accepted_at);

-- ============================================================================
-- 8. Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Force RLS
ALTER TABLE referral_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks FORCE ROW LEVEL SECURITY;
ALTER TABLE referral_registrations FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE commission_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_terms_acceptances FORCE ROW LEVEL SECURITY;

-- RLS Policies: referral_codes
CREATE POLICY referral_codes_select_own ON referral_codes FOR SELECT USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY referral_codes_insert_own ON referral_codes FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY referral_codes_update_own ON referral_codes FOR UPDATE USING (user_id = current_setting('app.current_user_id')::uuid);

-- RLS Policies: referral_clicks (read-only for code owner)
CREATE POLICY referral_clicks_select_own ON referral_clicks FOR SELECT USING (
  referral_code_id IN (SELECT id FROM referral_codes WHERE user_id = current_setting('app.current_user_id')::uuid)
);

-- RLS Policies: referral_registrations (referrer can see their referrals)
CREATE POLICY referral_registrations_select_own ON referral_registrations FOR SELECT USING (
  referrer_user_id = current_setting('app.current_user_id')::uuid
);

-- RLS Policies: affiliate_profiles
CREATE POLICY affiliate_profiles_select_own ON affiliate_profiles FOR SELECT USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY affiliate_profiles_insert_own ON affiliate_profiles FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY affiliate_profiles_update_own ON affiliate_profiles FOR UPDATE USING (user_id = current_setting('app.current_user_id')::uuid);

-- RLS Policies: commission_transactions
CREATE POLICY commission_transactions_select_own ON commission_transactions FOR SELECT USING (
  affiliate_user_id = current_setting('app.current_user_id')::uuid
);

-- RLS Policies: commission_payouts
CREATE POLICY commission_payouts_select_own ON commission_payouts FOR SELECT USING (
  affiliate_user_id = current_setting('app.current_user_id')::uuid
);
CREATE POLICY commission_payouts_insert_own ON commission_payouts FOR INSERT WITH CHECK (
  affiliate_user_id = current_setting('app.current_user_id')::uuid
);

-- RLS Policies: affiliate_terms_acceptances
CREATE POLICY affiliate_terms_select_own ON affiliate_terms_acceptances FOR SELECT USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY affiliate_terms_insert_own ON affiliate_terms_acceptances FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- ============================================================================
-- 9. Helper Functions
-- ============================================================================

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS VARCHAR(20) AS $$
DECLARE
  v_code VARCHAR(20);
  v_exists BOOLEAN;
  v_attempt INTEGER := 0;
BEGIN
  LOOP
    -- Generate code: KPOS + 6 random alphanumeric
    v_code := 'KPOS' || UPPER(substring(md5(random()::text || p_user_id::text || v_attempt::text) from 1 for 6));
    
    -- Check if exists
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    
    EXIT WHEN NOT v_exists OR v_attempt > 10;
    v_attempt := v_attempt + 1;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to update affiliate stats
CREATE OR REPLACE FUNCTION update_affiliate_stats(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE affiliate_profiles
  SET
    total_clicks = (
      SELECT COUNT(*) FROM referral_clicks rc
      JOIN referral_codes rco ON rc.referral_code_id = rco.id
      WHERE rco.user_id = p_user_id
    ),
    total_registrations = (
      SELECT COUNT(*) FROM referral_registrations
      WHERE referrer_user_id = p_user_id
    ),
    total_paid_conversions = (
      SELECT COUNT(*) FROM referral_registrations
      WHERE referrer_user_id = p_user_id AND first_payment_at IS NOT NULL
    ),
    total_commission_earned_idr = (
      SELECT COALESCE(SUM(commission_amount_idr), 0) FROM commission_transactions
      WHERE affiliate_user_id = p_user_id AND status IN ('approved', 'paid')
    ),
    total_commission_paid_idr = (
      SELECT COALESCE(SUM(commission_amount_idr), 0) FROM commission_transactions
      WHERE affiliate_user_id = p_user_id AND status = 'paid'
    ),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. Triggers
-- ============================================================================

-- Trigger to update affiliate stats on commission change
CREATE OR REPLACE FUNCTION trigger_update_affiliate_stats()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_affiliate_stats(NEW.affiliate_user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commission_transactions_update_stats
AFTER INSERT OR UPDATE ON commission_transactions
FOR EACH ROW
EXECUTE FUNCTION trigger_update_affiliate_stats();

-- ============================================================================
-- 11. Comments
-- ============================================================================

COMMENT ON TABLE referral_codes IS 'Stores unique referral codes for each user';
COMMENT ON TABLE referral_clicks IS 'Tracks clicks on referral links';
COMMENT ON TABLE referral_registrations IS 'Tracks successful registrations from referrals';
COMMENT ON TABLE affiliate_profiles IS 'Stores affiliate program participant profiles';
COMMENT ON TABLE commission_transactions IS 'Tracks commission transactions for affiliates';
COMMENT ON TABLE commission_payouts IS 'Tracks payout requests and completions';
COMMENT ON TABLE affiliate_terms_acceptances IS 'Records affiliate terms acceptance';

