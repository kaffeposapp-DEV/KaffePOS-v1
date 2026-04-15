-- KaffePOS v2 schema alignment audit
-- Menyelaraskan migration dengan field/table yang sudah dipakai frontend saat ini.

-- ── STORES: tambahkan kolom pengaturan struk/branding yang dipakai UI ──
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS paper_width TEXT DEFAULT '58mm',
  ADD COLUMN IF NOT EXISTS receipt_font_size TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS receipt_show_address BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_whatsapp BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_tax BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_cashier BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_trx_id BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_divider TEXT DEFAULT 'dash',
  ADD COLUMN IF NOT EXISTS receipt_custom_line1 TEXT,
  ADD COLUMN IF NOT EXISTS receipt_custom_line2 TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stores_paper_width_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_paper_width_check
      CHECK (paper_width IN ('58mm', '80mm'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stores_receipt_font_size_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_receipt_font_size_check
      CHECK (receipt_font_size IN ('small', 'medium', 'large'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stores_receipt_divider_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_receipt_divider_check
      CHECK (receipt_divider IN ('dash', 'equal', 'star', 'dot'));
  END IF;
END $$;
-- ── PROFILES: legacy/pro columns yang masih dipakai frontend ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_plan TEXT,
  ADD COLUMN IF NOT EXISTS pro_order_id TEXT,
  ADD COLUMN IF NOT EXISTS pro_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_pro_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pro_plan_check
      CHECK (
        pro_plan IS NULL
        OR pro_plan IN ('monthly', 'yearly', 'lifetime', 'secangkir', 'kopi_susu', 'signature', 'founder')
      );
  END IF;
END $$;
UPDATE public.profiles
SET
  is_pro = CASE
    WHEN tier = 'pro' AND (tier_expires_at IS NULL OR tier_expires_at > NOW()) THEN true
    ELSE COALESCE(is_pro, false)
  END,
  pro_plan = COALESCE(pro_plan, CASE WHEN tier = 'pro' THEN 'lifetime' ELSE NULL END),
  pro_expires_at = COALESCE(pro_expires_at, tier_expires_at),
  pro_activated_at = COALESCE(pro_activated_at, created_at)
WHERE is_pro IS NULL OR pro_plan IS NULL OR pro_expires_at IS NULL OR pro_activated_at IS NULL;
-- ── CASH REGISTER: dipakai untuk saldo buka kas harian ──
CREATE TABLE IF NOT EXISTS public.cash_register (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note TEXT,
  opened_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_register_store_date
  ON public.cash_register(store_id, date DESC);
ALTER TABLE public.cash_register ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cash_register' AND policyname = 'Store owner can CRUD cash_register'
  ) THEN
    CREATE POLICY "Store owner can CRUD cash_register"
      ON public.cash_register FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;
END $$;
-- ── PERIOD checks: app mendukung yearly ──
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

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'license_keys_period_check'
  ) THEN
    ALTER TABLE public.license_keys DROP CONSTRAINT license_keys_period_check;
  END IF;

  ALTER TABLE public.license_keys
    ADD CONSTRAINT license_keys_period_check
    CHECK (period IN ('monthly', 'quarterly', 'yearly', 'lifetime'));
END $$;
-- ── Realtime publications yang dipakai frontend ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'stores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cash_register'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register;
  END IF;
END $$;
-- ── Policies: konsisten pakai WITH CHECK untuk write ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'license_keys' AND policyname = 'System can update license key on use'
  ) THEN
    DROP POLICY "System can update license key on use" ON public.license_keys;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stores' AND policyname = 'Owners can CRUD their store'
  ) THEN
    DROP POLICY "Owners can CRUD their store" ON public.stores;
  END IF;

  CREATE POLICY "Owners can CRUD their store"
    ON public.stores FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories' AND policyname = 'Store owner can CRUD categories'
  ) THEN
    DROP POLICY "Store owner can CRUD categories" ON public.menu_categories;
  END IF;

  CREATE POLICY "Store owner can CRUD categories"
    ON public.menu_categories FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items' AND policyname = 'Store owner can CRUD menu'
  ) THEN
    DROP POLICY "Store owner can CRUD menu" ON public.menu_items;
  END IF;

  CREATE POLICY "Store owner can CRUD menu"
    ON public.menu_items FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory' AND policyname = 'Store owner can CRUD inventory'
  ) THEN
    DROP POLICY "Store owner can CRUD inventory" ON public.inventory;
  END IF;

  CREATE POLICY "Store owner can CRUD inventory"
    ON public.inventory FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'Store owner can CRUD transactions'
  ) THEN
    DROP POLICY "Store owner can CRUD transactions" ON public.transactions;
  END IF;

  CREATE POLICY "Store owner can CRUD transactions"
    ON public.transactions FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Store owner can CRUD expenses'
  ) THEN
    DROP POLICY "Store owner can CRUD expenses" ON public.expenses;
  END IF;

  CREATE POLICY "Store owner can CRUD expenses"
    ON public.expenses FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cash_flow' AND policyname = 'Store owner can CRUD cash_flow'
  ) THEN
    DROP POLICY "Store owner can CRUD cash_flow" ON public.cash_flow;
  END IF;

  CREATE POLICY "Store owner can CRUD cash_flow"
    ON public.cash_flow FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_accounts' AND policyname = 'Store owner can CRUD accounts'
  ) THEN
    DROP POLICY "Store owner can CRUD accounts" ON public.store_accounts;
  END IF;

  CREATE POLICY "Store owner can CRUD accounts"
    ON public.store_accounts FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sync_log' AND policyname = 'Store owner can CRUD sync log'
  ) THEN
    DROP POLICY "Store owner can CRUD sync log" ON public.sync_log;
  END IF;

  CREATE POLICY "Store owner can CRUD sync log"
    ON public.sync_log FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
END $$;
