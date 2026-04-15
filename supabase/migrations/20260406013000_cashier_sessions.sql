CREATE TABLE IF NOT EXISTS public.cashier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT (timezone('Asia/Jakarta', now()))::date,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  opening_note TEXT,
  cashier_name TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_cash INTEGER CHECK (expected_cash IS NULL OR expected_cash >= 0),
  counted_cash INTEGER CHECK (counted_cash IS NULL OR counted_cash >= 0),
  variance_amount INTEGER,
  close_reason TEXT,
  close_note TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_store_status
  ON public.cashier_sessions(store_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_store_date
  ON public.cashier_sessions(store_id, session_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_sessions_open_per_store
  ON public.cashier_sessions(store_id)
  WHERE status = 'open';
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cashier_sessions'
      AND policyname = 'Store owner can CRUD cashier_sessions'
  ) THEN
    CREATE POLICY "Store owner can CRUD cashier_sessions"
      ON public.cashier_sessions FOR ALL
      USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
      WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_cashier_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cashier_sessions_updated_at ON public.cashier_sessions;
CREATE TRIGGER trg_cashier_sessions_updated_at
BEFORE UPDATE ON public.cashier_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_cashier_sessions_updated_at();
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cashier_sessions'
  ) THEN
    RETURN;
  END IF;

  ALTER PUBLICATION supabase_realtime ADD TABLE public.cashier_sessions;
END $$;
