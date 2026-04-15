-- Critical hotfix: data isolation between authenticated users

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stores') THEN
    ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_categories') THEN
    ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_items') THEN
    ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory') THEN
    ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions') THEN
    ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'expenses') THEN
    ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cash_flow') THEN
    ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cash_register') THEN
    ALTER TABLE public.cash_register ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_accounts') THEN
    ALTER TABLE public.store_accounts ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_history') THEN
    ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pro_orders') THEN
    ALTER TABLE public.pro_orders ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sync_log') THEN
    ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_insight_logs') THEN
    ALTER TABLE public.ai_insight_logs ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stores') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stores' AND policyname = 'Owners can CRUD their store') THEN
      DROP POLICY "Owners can CRUD their store" ON public.stores;
    END IF;
    CREATE POLICY "Owners can CRUD their store"
      ON public.stores FOR ALL
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_categories') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_categories' AND policyname = 'Store owner can CRUD categories') THEN
      DROP POLICY "Store owner can CRUD categories" ON public.menu_categories;
    END IF;
    CREATE POLICY "Store owner can CRUD categories"
      ON public.menu_categories FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_items') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_items' AND policyname = 'Store owner can CRUD menu') THEN
      DROP POLICY "Store owner can CRUD menu" ON public.menu_items;
    END IF;
    CREATE POLICY "Store owner can CRUD menu"
      ON public.menu_items FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory' AND policyname = 'Store owner can CRUD inventory') THEN
      DROP POLICY "Store owner can CRUD inventory" ON public.inventory;
    END IF;
    CREATE POLICY "Store owner can CRUD inventory"
      ON public.inventory FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'Store owner can CRUD transactions') THEN
      DROP POLICY "Store owner can CRUD transactions" ON public.transactions;
    END IF;
    CREATE POLICY "Store owner can CRUD transactions"
      ON public.transactions FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'expenses') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Store owner can CRUD expenses') THEN
      DROP POLICY "Store owner can CRUD expenses" ON public.expenses;
    END IF;
    CREATE POLICY "Store owner can CRUD expenses"
      ON public.expenses FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cash_flow') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_flow' AND policyname = 'Store owner can CRUD cash_flow') THEN
      DROP POLICY "Store owner can CRUD cash_flow" ON public.cash_flow;
    END IF;
    CREATE POLICY "Store owner can CRUD cash_flow"
      ON public.cash_flow FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cash_register') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_register' AND policyname = 'Store owner can CRUD cash_register') THEN
      DROP POLICY "Store owner can CRUD cash_register" ON public.cash_register;
    END IF;
    CREATE POLICY "Store owner can CRUD cash_register"
      ON public.cash_register FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_accounts') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'store_accounts' AND policyname = 'Store owner can CRUD accounts') THEN
      DROP POLICY "Store owner can CRUD accounts" ON public.store_accounts;
    END IF;
    CREATE POLICY "Store owner can CRUD accounts"
      ON public.store_accounts FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sync_log') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_log' AND policyname = 'Store owner can CRUD sync log') THEN
      DROP POLICY "Store owner can CRUD sync log" ON public.sync_log;
    END IF;
    CREATE POLICY "Store owner can CRUD sync log"
      ON public.sync_log FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
      DROP POLICY "Users can view own profile" ON public.profiles;
    END IF;
    CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT
      USING (id = auth.uid());

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
      DROP POLICY "Users can update own profile" ON public.profiles;
    END IF;
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
      DROP POLICY "Users can insert own profile" ON public.profiles;
    END IF;
    CREATE POLICY "Users can insert own profile"
      ON public.profiles FOR INSERT
      WITH CHECK (id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users can view own notifications') THEN
      DROP POLICY "Users can view own notifications" ON public.notifications;
    END IF;
    CREATE POLICY "Users can view own notifications"
      ON public.notifications FOR SELECT
      USING (user_id = auth.uid());

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users can update own notifications') THEN
      DROP POLICY "Users can update own notifications" ON public.notifications;
    END IF;
    CREATE POLICY "Users can update own notifications"
      ON public.notifications FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions') THEN
      DROP POLICY "Users can view own subscriptions" ON public.subscriptions;
    END IF;
    CREATE POLICY "Users can view own subscriptions"
      ON public.subscriptions FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_history') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_history' AND policyname = 'Users can view own payment_history') THEN
      DROP POLICY "Users can view own payment_history" ON public.payment_history;
    END IF;
    CREATE POLICY "Users can view own payment_history"
      ON public.payment_history FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pro_orders') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pro_orders' AND policyname = 'Users can CRUD own pro_orders') THEN
      DROP POLICY "Users can CRUD own pro_orders" ON public.pro_orders;
    END IF;
    CREATE POLICY "Users can CRUD own pro_orders"
      ON public.pro_orders FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_insight_logs') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_insight_logs' AND policyname = 'Users can read own logs') THEN
      DROP POLICY "Users can read own logs" ON public.ai_insight_logs;
    END IF;
    CREATE POLICY "Users can read own logs"
      ON public.ai_insight_logs FOR SELECT
      USING (user_id = auth.uid());

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_insight_logs' AND policyname = 'Authenticated users can insert own logs') THEN
      DROP POLICY "Authenticated users can insert own logs" ON public.ai_insight_logs;
    END IF;
    CREATE POLICY "Authenticated users can insert own logs"
      ON public.ai_insight_logs FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
