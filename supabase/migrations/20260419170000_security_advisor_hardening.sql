alter table public.profiles force row level security;
alter table public.stores force row level security;
alter table public.inventory force row level security;
alter table public.transactions force row level security;
alter table public.notifications force row level security;

alter table public.email_verification_codes force row level security;
alter table public.edge_rate_limits force row level security;
alter table public.edge_function_events force row level security;

drop policy if exists "Service role can manage email verification codes" on public.email_verification_codes;
create policy "Service role can manage email verification codes"
  on public.email_verification_codes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage edge rate limits" on public.edge_rate_limits;
create policy "Service role can manage edge rate limits"
  on public.edge_rate_limits
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage edge function events" on public.edge_function_events;
create policy "Service role can manage edge function events"
  on public.edge_function_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter function public.is_admin_email() set search_path = public;
alter function public.sync_profile_from_subscription() set search_path = public;
alter function public.create_free_subscription_for_new_profile() set search_path = public;
alter function public.recompute_profile_subscription(uuid) set search_path = public;
alter function public.set_cashier_sessions_updated_at() set search_path = public;
alter function public.update_updated_at() set search_path = public;
alter function public.is_pro(uuid) set search_path = public;
alter function public.get_store_id(uuid) set search_path = public;
