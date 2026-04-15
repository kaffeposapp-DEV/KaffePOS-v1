create extension if not exists "pgcrypto";

create or replace function public.is_admin_email()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['kaffeposapp@gmail.com']
  );
$$;

update public.email_verification_codes
set code = encode(extensions.digest(code, 'sha256'), 'hex')
where code ~ '^[0-9]{6}$';

alter table public.email_verification_codes enable row level security;
alter table public.email_verification_codes force row level security;
revoke all on table public.email_verification_codes from anon, authenticated, public;
grant all on table public.email_verification_codes to service_role;

alter table public.edge_rate_limits enable row level security;
alter table public.edge_rate_limits force row level security;
revoke all on table public.edge_rate_limits from anon, authenticated, public;
grant all on table public.edge_rate_limits to service_role;

alter table public.license_keys enable row level security;
alter table public.license_keys force row level security;
revoke all on table public.license_keys from anon, authenticated, public;
grant all on table public.license_keys to service_role;

drop policy if exists "Anyone can read unused key (for activation)" on public.license_keys;
drop policy if exists "System can update license key on use" on public.license_keys;
drop policy if exists "Admins can manage license keys" on public.license_keys;

create policy "Admins can manage license keys"
  on public.license_keys
  for all
  using (public.is_admin_email())
  with check (public.is_admin_email());
