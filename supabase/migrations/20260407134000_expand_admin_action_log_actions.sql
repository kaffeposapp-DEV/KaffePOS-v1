do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_action_logs_action_check'
  ) then
    alter table public.admin_action_logs
      drop constraint admin_action_logs_action_check;
  end if;

  alter table public.admin_action_logs
    add constraint admin_action_logs_action_check
    check (
      action in (
        'status',
        'subscribers',
        'subscriber',
        'revenue',
        'expiring',
        'search',
        'exportsubscribers',
        'overview',
        'activate',
        'renew',
        'cancel',
        'delete_user'
      )
    );
end $$;
