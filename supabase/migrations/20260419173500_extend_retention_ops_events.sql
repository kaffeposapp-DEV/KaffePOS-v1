drop function if exists public.cleanup_operational_retention(integer, integer, integer, integer);

create or replace function public.cleanup_operational_retention(
  p_otp_days integer default 30,
  p_rate_limit_days integer default 7,
  p_edge_event_days integer default 30,
  p_notification_days integer default 90,
  p_ops_event_days integer default 90
)
returns table(
  deleted_otp integer,
  deleted_rate_limits integer,
  deleted_edge_events integer,
  deleted_notifications integer,
  deleted_ops_events integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_otp integer := 0;
  v_deleted_rate_limits integer := 0;
  v_deleted_edge_events integer := 0;
  v_deleted_notifications integer := 0;
  v_deleted_ops_events integer := 0;
begin
  delete from public.email_verification_codes
  where created_at < now() - make_interval(days => greatest(p_otp_days, 1));
  get diagnostics v_deleted_otp = row_count;

  delete from public.edge_rate_limits
  where updated_at < now() - make_interval(days => greatest(p_rate_limit_days, 1));
  get diagnostics v_deleted_rate_limits = row_count;

  delete from public.edge_function_events
  where created_at < now() - make_interval(days => greatest(p_edge_event_days, 1));
  get diagnostics v_deleted_edge_events = row_count;

  delete from public.notifications
  where created_at < now() - make_interval(days => greatest(p_notification_days, 1));
  get diagnostics v_deleted_notifications = row_count;

  delete from public.ops_event_logs
  where created_at < now() - make_interval(days => greatest(p_ops_event_days, 1));
  get diagnostics v_deleted_ops_events = row_count;

  return query
  select
    v_deleted_otp,
    v_deleted_rate_limits,
    v_deleted_edge_events,
    v_deleted_notifications,
    v_deleted_ops_events;
end;
$$;

revoke all on function public.cleanup_operational_retention(integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_operational_retention(integer, integer, integer, integer, integer)
  to service_role;
