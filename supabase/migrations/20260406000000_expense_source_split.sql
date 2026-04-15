ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS source TEXT;
UPDATE public.expenses
SET source = CASE
  WHEN category = 'Bahan Baku' THEN 'inventory'
  ELSE 'cashier'
END
WHERE source IS NULL;
ALTER TABLE public.expenses
ALTER COLUMN source SET DEFAULT 'cashier';
ALTER TABLE public.expenses
ALTER COLUMN source SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_source_check'
  ) THEN
    ALTER TABLE public.expenses
    ADD CONSTRAINT expenses_source_check
    CHECK (source IN ('cashier', 'inventory'));
  END IF;
END $$;
