ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta';
UPDATE public.stores
SET timezone = 'Asia/Jakarta'
WHERE timezone IS NULL OR btrim(timezone) = '';
