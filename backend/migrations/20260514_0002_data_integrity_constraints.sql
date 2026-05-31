-- KaffePOS Data Integrity Constraints Migration
-- Date: 2026-05-14
-- Purpose: Add missing constraints for data integrity and safety

-- ============================================================================
-- SELF-REFERRAL PREVENTION
-- ============================================================================

-- Prevent users from referring themselves
ALTER TABLE public.referral_registrations
  DROP CONSTRAINT IF EXISTS referral_registrations_no_self_referral_check;

ALTER TABLE public.referral_registrations
  ADD CONSTRAINT referral_registrations_no_self_referral_check
  CHECK (referrer_user_id != referred_user_id);

-- ============================================================================
-- PAYMENT ORDER IDEMPOTENCY
-- ============================================================================

-- Ensure midtrans_order_id is unique (already exists, but verify)
-- This is critical for webhook idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'payment_orders' 
    AND indexname = 'payment_orders_midtrans_order_id_key'
  ) THEN
    CREATE UNIQUE INDEX payment_orders_midtrans_order_id_key 
    ON public.payment_orders(midtrans_order_id);
  END IF;
END $$;

-- ============================================================================
-- EMAIL UNIQUENESS
-- ============================================================================

-- Ensure email is unique in auth credentials
CREATE UNIQUE INDEX IF NOT EXISTS app_auth_credentials_email_unique_idx
  ON public.app_auth_credentials(LOWER(email));

-- ============================================================================
-- SESSION TOKEN UNIQUENESS
-- ============================================================================

-- Ensure session token_hash is unique
CREATE UNIQUE INDEX IF NOT EXISTS app_auth_sessions_token_hash_unique_idx
  ON public.app_auth_sessions(token_hash)
  WHERE revoked_at IS NULL;

-- ============================================================================
-- PASSWORD RESET TOKEN UNIQUENESS
-- ============================================================================

-- Ensure password reset token_hash is unique and not consumed
CREATE UNIQUE INDEX IF NOT EXISTS app_password_reset_tokens_token_hash_unique_idx
  ON public.app_password_reset_tokens(token_hash)
  WHERE consumed_at IS NULL;

-- ============================================================================
-- NUMERIC CONSTRAINTS - TRANSACTIONS
-- ============================================================================

-- Ensure transaction amounts are non-negative
DO $$
BEGIN
  -- Check if transactions table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    
    -- Add constraint for total >= 0
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transactions_total_nonnegative_check'
    ) THEN
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_total_nonnegative_check
        CHECK (total >= 0);
    END IF;
    
    -- Add constraint for subtotal >= 0
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transactions_subtotal_nonnegative_check'
    ) THEN
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_subtotal_nonnegative_check
        CHECK (subtotal >= 0);
    END IF;
    
    -- Add constraint for discount >= 0
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transactions_discount_nonnegative_check'
    ) THEN
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_discount_nonnegative_check
        CHECK (discount >= 0);
    END IF;
    
    -- Add constraint for tax >= 0
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transactions_tax_nonnegative_check'
    ) THEN
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_tax_nonnegative_check
        CHECK (tax >= 0);
    END IF;
    
    -- Add constraint for paid >= 0
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transactions_paid_nonnegative_check'
    ) THEN
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_paid_nonnegative_check
        CHECK (paid >= 0);
    END IF;
    
    -- Add constraint for change >= 0
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transactions_change_nonnegative_check'
    ) THEN
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_change_nonnegative_check
        CHECK (change >= 0);
    END IF;
    
  END IF;
END $$;

-- ============================================================================
-- NUMERIC CONSTRAINTS - TRANSACTION ITEMS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_items') THEN
    
    -- Quantity must be positive
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transaction_items_qty_positive_check'
    ) THEN
      ALTER TABLE public.transaction_items
        ADD CONSTRAINT transaction_items_qty_positive_check
        CHECK (qty > 0);
    END IF;
    
    -- Price must be non-negative
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'transaction_items_price_nonnegative_check'
    ) THEN
      ALTER TABLE public.transaction_items
        ADD CONSTRAINT transaction_items_price_nonnegative_check
        CHECK (price >= 0);
    END IF;
    
  END IF;
END $$;

-- ============================================================================
-- NUMERIC CONSTRAINTS - MENU ITEMS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'menu_items') THEN
    
    -- Price must be non-negative
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'menu_items_price_nonnegative_check'
    ) THEN
      ALTER TABLE public.menu_items
        ADD CONSTRAINT menu_items_price_nonnegative_check
        CHECK (price >= 0);
    END IF;
    
  END IF;
END $$;

-- ============================================================================
-- NUMERIC CONSTRAINTS - INVENTORY
-- ============================================================================

-- Stock can be negative for some use cases (backorders), so we don't constrain it
-- But we add a constraint for cost_per_unit >= 0
ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_cost_nonnegative_check;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_cost_nonnegative_check
  CHECK (cost_per_unit >= 0);

-- ============================================================================
-- NUMERIC CONSTRAINTS - PAYMENT ORDERS
-- ============================================================================

-- Already has gross_amount > 0 constraint
-- Add constraints for other amounts

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_subtotal_nonnegative_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_subtotal_nonnegative_check
  CHECK (subtotal >= 0);

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_discount_nonnegative_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_discount_nonnegative_check
  CHECK (discount_amount >= 0);

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_tax_nonnegative_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_tax_nonnegative_check
  CHECK (tax_amount >= 0);

-- ============================================================================
-- DATE CONSTRAINTS - SUBSCRIPTIONS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
    
    -- Ensure expires_at is after activated_at
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'subscriptions_dates_valid_check'
    ) THEN
      ALTER TABLE public.subscriptions
        ADD CONSTRAINT subscriptions_dates_valid_check
        CHECK (expires_at IS NULL OR activated_at IS NULL OR expires_at >= activated_at);
    END IF;
    
  END IF;
END $$;

-- ============================================================================
-- REFERRAL REGISTRATION DATE CONSTRAINTS
-- ============================================================================

-- Ensure date progression: registered -> trial_started -> first_payment -> eligible
ALTER TABLE public.referral_registrations
  DROP CONSTRAINT IF EXISTS referral_registrations_dates_valid_check;

ALTER TABLE public.referral_registrations
  ADD CONSTRAINT referral_registrations_dates_valid_check
  CHECK (
    (trial_started_at IS NULL OR trial_started_at >= registered_at) AND
    (first_payment_at IS NULL OR trial_started_at IS NULL OR first_payment_at >= trial_started_at) AND
    (eligible_at IS NULL OR first_payment_at IS NULL OR eligible_at >= first_payment_at)
  );

-- ============================================================================
-- COMMISSION TRANSACTION DATE CONSTRAINTS
-- ============================================================================

-- Ensure date progression: eligible -> approved -> paid
ALTER TABLE public.commission_transactions
  DROP CONSTRAINT IF EXISTS commission_transactions_dates_valid_check;

ALTER TABLE public.commission_transactions
  ADD CONSTRAINT commission_transactions_dates_valid_check
  CHECK (
    (approved_at IS NULL OR eligible_at IS NULL OR approved_at >= eligible_at) AND
    (paid_at IS NULL OR approved_at IS NULL OR paid_at >= approved_at)
  );

-- ============================================================================
-- INVENTORY UNIT CONVERSION CONSTRAINTS
-- ============================================================================

-- Ensure unit conversion ratio is positive.
-- Legacy drafts used conversion_ratio; current schema uses ratio.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_unit_conversions'
  ) THEN
    ALTER TABLE public.inventory_unit_conversions
      DROP CONSTRAINT IF EXISTS inventory_unit_conversions_ratio_positive_check;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inventory_unit_conversions'
        AND column_name = 'ratio'
    ) THEN
      ALTER TABLE public.inventory_unit_conversions
        ADD CONSTRAINT inventory_unit_conversions_ratio_positive_check
        CHECK (ratio > 0);
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inventory_unit_conversions'
        AND column_name = 'conversion_ratio'
    ) THEN
      ALTER TABLE public.inventory_unit_conversions
        ADD CONSTRAINT inventory_unit_conversions_ratio_positive_check
        CHECK (conversion_ratio > 0);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- LOYALTY CONSTRAINTS
-- ============================================================================

-- Ensure loyalty points/stamps are non-negative
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loyalty_passports') THEN
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'loyalty_passports_points_nonnegative_check'
    ) THEN
      ALTER TABLE public.loyalty_passports
        ADD CONSTRAINT loyalty_passports_points_nonnegative_check
        CHECK (points >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'loyalty_passports_stamps_nonnegative_check'
    ) THEN
      ALTER TABLE public.loyalty_passports
        ADD CONSTRAINT loyalty_passports_stamps_nonnegative_check
        CHECK (stamps >= 0);
    END IF;
    
  END IF;
END $$;

-- ============================================================================
-- CHALLENGE CONSTRAINTS
-- ============================================================================

-- Ensure challenge target values are positive
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_target_positive_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_target_positive_check
  CHECK (target_value > 0);

-- Ensure challenge progress is non-negative
ALTER TABLE public.user_challenge_progress
  DROP CONSTRAINT IF EXISTS user_challenge_progress_nonnegative_check;

ALTER TABLE public.user_challenge_progress
  ADD CONSTRAINT user_challenge_progress_nonnegative_check
  CHECK (current_value >= 0);

-- ============================================================================
-- NOTES
-- ============================================================================

-- This migration adds critical data integrity constraints:
-- 1. Self-referral prevention (business rule)
-- 2. Idempotency protections (payment, session, reset tokens)
-- 3. Numeric constraints (amounts >= 0, quantities > 0)
-- 4. Date constraints (logical progression)
-- 5. Email uniqueness (security)

-- All constraints use IF NOT EXISTS or DROP IF EXISTS to be idempotent
-- Constraints are added conditionally based on table existence

-- Rollback plan:
-- To rollback, drop each constraint individually:
-- ALTER TABLE table_name DROP CONSTRAINT constraint_name;

