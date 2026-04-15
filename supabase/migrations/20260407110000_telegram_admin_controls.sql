-- Telegram admin controls
-- Audit trail and confirmation queue for Telegram-based admin actions.

CREATE TABLE IF NOT EXISTS public.telegram_admin_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK (action IN ('activate', 'renew', 'cancel', 'delete_user')),
  requested_by TEXT NOT NULL,
  requested_chat_id TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_email TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'failed')),
  error_message TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_actions_token
  ON public.telegram_admin_pending_actions(token);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_actions_status
  ON public.telegram_admin_pending_actions(status, expires_at DESC);
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'web_admin', 'system')),
  action TEXT NOT NULL CHECK (action IN ('status', 'activate', 'renew', 'cancel', 'delete_user')),
  actor_identifier TEXT NOT NULL,
  actor_display TEXT,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_email TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result TEXT NOT NULL CHECK (result IN ('requested', 'confirmed', 'success', 'failed', 'cancelled', 'expired')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at
  ON public.admin_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target_email
  ON public.admin_action_logs(target_email, created_at DESC);
ALTER TABLE public.telegram_admin_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telegram_admin_pending_actions'
      AND policyname = 'Admins can view telegram pending actions'
  ) THEN
    CREATE POLICY "Admins can view telegram pending actions"
      ON public.telegram_admin_pending_actions FOR SELECT
      USING (public.is_admin_email());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_action_logs'
      AND policyname = 'Admins can view admin action logs'
  ) THEN
    CREATE POLICY "Admins can view admin action logs"
      ON public.admin_action_logs FOR SELECT
      USING (public.is_admin_email());
  END IF;
END $$;
DROP TRIGGER IF EXISTS telegram_admin_pending_actions_updated_at
  ON public.telegram_admin_pending_actions;
CREATE TRIGGER telegram_admin_pending_actions_updated_at
  BEFORE UPDATE ON public.telegram_admin_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
