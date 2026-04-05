create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null default 'signup',
  code text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_codes_email_purpose_idx
  on public.email_verification_codes (email, purpose, created_at desc);

create index if not exists email_verification_codes_active_idx
  on public.email_verification_codes (email, expires_at desc)
  where consumed_at is null;

alter table public.email_verification_codes disable row level security;
