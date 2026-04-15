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
      pro_plan = 'secangkir',
      pro_activated_at = NULL,
      pro_expires_at = NULL,
      tier_expires_at = NULL
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
