create table if not exists public.ops_event_logs (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('login', 'checkout')),
  status text not null check (status in ('success', 'failure')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  store_id uuid references public.stores(id) on delete set null,
  transaction_id text,
  source text not null default 'app',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ops_event_logs_event_date
  on public.ops_event_logs(event_name, created_at desc);

create index if not exists idx_ops_event_logs_store_date
  on public.ops_event_logs(store_id, created_at desc);

alter table public.ops_event_logs enable row level security;
alter table public.ops_event_logs force row level security;
revoke all on table public.ops_event_logs from anon, authenticated, public;
grant all on table public.ops_event_logs to service_role;

drop policy if exists "Service role can manage ops event logs" on public.ops_event_logs;
create policy "Service role can manage ops event logs"
  on public.ops_event_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace view public.ops_daily_metrics as
with login_metrics as (
  select
    date_trunc('day', created_at)::date as metric_date,
    count(*) filter (where status = 'success') as login_success_count,
    count(*) filter (where status = 'failure') as login_failure_count
  from public.ops_event_logs
  where event_name = 'login'
  group by 1
),
checkout_metrics as (
  select
    date_trunc('day', created_at)::date as metric_date,
    count(*) filter (where status = 'success') as checkout_success_count,
    count(*) filter (where status = 'failure') as checkout_failure_count
  from public.ops_event_logs
  where event_name = 'checkout'
  group by 1
),
otp_metrics as (
  select
    date_trunc('day', created_at)::date as metric_date,
    count(*) filter (where status = 'success') as otp_success_count,
    count(*) filter (where status = 'failure') as otp_failure_count
  from public.edge_function_events
  where function_name = 'verify-email-code'
    and status in ('success', 'failure')
  group by 1
),
days as (
  select metric_date from login_metrics
  union
  select metric_date from checkout_metrics
  union
  select metric_date from otp_metrics
)
select
  d.metric_date,
  coalesce(l.login_success_count, 0) as login_success_count,
  coalesce(l.login_failure_count, 0) as login_failure_count,
  case
    when coalesce(l.login_success_count, 0) + coalesce(l.login_failure_count, 0) > 0
      then round((coalesce(l.login_success_count, 0)::numeric * 100.0) / (coalesce(l.login_success_count, 0) + coalesce(l.login_failure_count, 0)), 2)
    else null
  end as login_success_rate_pct,
  coalesce(c.checkout_success_count, 0) as checkout_success_count,
  coalesce(c.checkout_failure_count, 0) as checkout_failure_count,
  case
    when coalesce(c.checkout_success_count, 0) + coalesce(c.checkout_failure_count, 0) > 0
      then round((coalesce(c.checkout_success_count, 0)::numeric * 100.0) / (coalesce(c.checkout_success_count, 0) + coalesce(c.checkout_failure_count, 0)), 2)
    else null
  end as checkout_success_rate_pct,
  coalesce(o.otp_success_count, 0) as otp_success_count,
  coalesce(o.otp_failure_count, 0) as otp_failure_count,
  case
    when coalesce(o.otp_success_count, 0) + coalesce(o.otp_failure_count, 0) > 0
      then round((coalesce(o.otp_success_count, 0)::numeric * 100.0) / (coalesce(o.otp_success_count, 0) + coalesce(o.otp_failure_count, 0)), 2)
    else null
  end as otp_success_rate_pct
from days d
left join login_metrics l on l.metric_date = d.metric_date
left join checkout_metrics c on c.metric_date = d.metric_date
left join otp_metrics o on o.metric_date = d.metric_date
order by d.metric_date desc;

revoke all on table public.ops_daily_metrics from anon, authenticated, public;
grant select on table public.ops_daily_metrics to service_role;
