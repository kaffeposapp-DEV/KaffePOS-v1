do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_pro_plan_check'
  ) then
    alter table public.profiles
      drop constraint profiles_pro_plan_check;
  end if;

  alter table public.profiles
    add constraint profiles_pro_plan_check
    check (
      pro_plan is null
      or pro_plan in (
        'monthly',
        'yearly',
        'lifetime',
        'secangkir',
        'kopi_susu',
        'signature',
        'founder'
      )
    );
end $$;
