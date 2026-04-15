-- KaffePOS manual subscription flow
-- Replace self-service payment gateway flow with manual admin activation.

DROP TABLE IF EXISTS public.pro_orders;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount INTEGER,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS xendit_invoice_id,
  DROP COLUMN IF EXISTS xendit_external_id;
UPDATE public.subscriptions
SET
  plan = COALESCE(
    plan,
    CASE
      WHEN tier = 'basic' THEN 'secangkir'
      WHEN period = 'monthly' THEN 'kopi_susu'
      WHEN period = 'yearly' THEN 'signature'
      WHEN period = 'lifetime' THEN 'founder'
      ELSE 'secangkir'
    END
  ),
  billing_cycle = COALESCE(
    billing_cycle,
    CASE
      WHEN tier = 'basic' THEN 'free'
      WHEN period = 'lifetime' THEN 'yearly'
      ELSE period
    END
  ),
  payment_amount = COALESCE(payment_amount, amount_paid),
  updated_at = NOW()
WHERE plan IS NULL OR billing_cycle IS NULL OR payment_amount IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_period_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_period_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_period_check
    CHECK (period IN ('free', 'monthly', 'quarterly', 'yearly', 'lifetime'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_plan_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_plan_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IN ('secangkir', 'kopi_susu', 'signature', 'founder'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_billing_cycle_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_billing_cycle_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('free', 'monthly', 'quarterly', 'yearly'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan TEXT NOT NULL CHECK (plan IN ('secangkir', 'kopi_susu', 'signature', 'founder')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('free', 'monthly', 'quarterly', 'yearly')),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'manual_transfer',
  payment_note TEXT,
  payment_ref TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.payment_history
  DROP COLUMN IF EXISTS xendit_invoice_id,
  DROP COLUMN IF EXISTS xendit_external_id;
CREATE INDEX IF NOT EXISTS idx_payment_history_user_paid_at
  ON public.payment_history(user_id, paid_at DESC);
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = ANY (
    ARRAY['kaffeposapp@gmail.com']
  );
$$;
CREATE OR REPLACE FUNCTION public.recompute_profile_subscription(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_sub RECORD;
BEGIN
  SELECT *
  INTO active_sub
  FROM public.subscriptions
  WHERE user_id = target_user_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY COALESCE(expires_at, 'infinity'::timestamptz) DESC, activated_at DESC
  LIMIT 1;

  IF active_sub.id IS NULL THEN
    UPDATE public.profiles
    SET
      tier = 'basic',
      is_pro = false,
      tier_expires_at = NULL,
      pro_expires_at = NULL
    WHERE id = target_user_id;
    RETURN;
  END IF;

  IF active_sub.plan = 'secangkir' THEN
    UPDATE public.profiles
    SET
      tier = 'basic',
      is_pro = false,
      pro_plan = 'secangkir',
      pro_order_id = COALESCE(active_sub.payment_ref, pro_order_id),
      pro_activated_at = active_sub.activated_at,
      pro_expires_at = NULL,
      tier_expires_at = NULL
    WHERE id = target_user_id;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    tier = 'pro',
    is_pro = true,
    pro_plan = active_sub.plan,
    pro_order_id = COALESCE(active_sub.payment_ref, pro_order_id),
    pro_activated_at = active_sub.activated_at,
    pro_expires_at = active_sub.expires_at,
    tier_expires_at = active_sub.expires_at
  WHERE id = target_user_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);
  PERFORM public.recompute_profile_subscription(target_user_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS sync_profile_from_subscription ON public.subscriptions;
CREATE TRIGGER sync_profile_from_subscription
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_subscription();
CREATE OR REPLACE FUNCTION public.create_free_subscription_for_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions WHERE user_id = NEW.id
  ) THEN
    INSERT INTO public.subscriptions (
      user_id,
      tier,
      period,
      plan,
      billing_cycle,
      status,
      activated_at,
      expires_at,
      payment_amount,
      payment_method,
      payment_note,
      payment_ref
    ) VALUES (
      NEW.id,
      'basic',
      'free',
      'secangkir',
      'free',
      'active',
      NOW(),
      NULL,
      0,
      'free',
      'Aktivasi otomatis paket gratis',
      'FREE-AUTO'
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS create_free_subscription_for_new_profile ON public.profiles;
CREATE TRIGGER create_free_subscription_for_new_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_free_subscription_for_new_profile();
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions'
  ) THEN
    DROP POLICY "Users can view own subscriptions" ON public.subscriptions;
  END IF;

  CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (user_id = auth.uid());

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Admins can manage subscriptions'
  ) THEN
    CREATE POLICY "Admins can manage subscriptions"
      ON public.subscriptions FOR ALL
      USING (public.is_admin_email())
      WITH CHECK (public.is_admin_email());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_history' AND policyname = 'Users can view own payment_history'
  ) THEN
    CREATE POLICY "Users can view own payment_history"
      ON public.payment_history FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_history' AND policyname = 'Admins can manage payment_history'
  ) THEN
    CREATE POLICY "Admins can manage payment_history"
      ON public.payment_history FOR ALL
      USING (public.is_admin_email())
      WITH CHECK (public.is_admin_email());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can view profiles'
  ) THEN
    CREATE POLICY "Admins can view profiles"
      ON public.profiles FOR SELECT
      USING (public.is_admin_email());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_history;
  END IF;
END $$;
