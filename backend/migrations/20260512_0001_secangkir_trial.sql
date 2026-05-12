alter table if exists public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists converted_from_subscription_id uuid references public.subscriptions(id) on delete set null;

create index if not exists subscriptions_user_plan_status_idx
  on public.subscriptions (user_id, plan, status, activated_at desc);

create index if not exists subscriptions_trial_ends_idx
  on public.subscriptions (trial_ends_at)
  where plan = 'secangkir' and status = 'active';
