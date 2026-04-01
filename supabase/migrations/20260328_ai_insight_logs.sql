-- Jalankan di Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → paste ini → Run

-- Tabel log untuk rate limiting AI Insight
CREATE TABLE IF NOT EXISTS ai_insight_logs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index untuk query rate limit yang cepat (per user per hari)
CREATE INDEX IF NOT EXISTS idx_ai_insight_logs_user_date
  ON ai_insight_logs(user_id, created_at DESC);

-- Row Level Security
ALTER TABLE ai_insight_logs ENABLE ROW LEVEL SECURITY;

-- Policy: user hanya bisa baca log sendiri
CREATE POLICY "Users can read own logs"
  ON ai_insight_logs FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Edge Function (service role) yang insert
-- Edge Function pakai service key, jadi bisa bypass RLS
-- Tapi jika pakai anon key, tambahkan:
CREATE POLICY "Authenticated users can insert own logs"
  ON ai_insight_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Verifikasi
SELECT 'Tabel ai_insight_logs berhasil dibuat!' AS status;
