create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  code varchar not null,
  type varchar not null check (type in ('customer_referral', 'affiliate')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists referral_codes_code_unique_idx
  on public.referral_codes (code);

create unique index if not exists referral_codes_user_type_unique_idx
  on public.referral_codes (user_id, type);

create index if not exists referral_codes_user_id_idx
  on public.referral_codes (user_id);

create index if not exists referral_codes_type_idx
  on public.referral_codes (type);

create index if not exists referral_codes_is_active_idx
  on public.referral_codes (is_active);

create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  ip_hash varchar,
  user_agent text,
  landing_page text,
  utm_source varchar,
  utm_medium varchar,
  utm_campaign varchar,
  clicked_at timestamptz not null default now(),
  constraint referral_clicks_ip_hash_format_check
    check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists referral_clicks_referral_code_id_idx
  on public.referral_clicks (referral_code_id);

create index if not exists referral_clicks_clicked_at_idx
  on public.referral_clicks (clicked_at);

create index if not exists referral_clicks_utm_source_idx
  on public.referral_clicks (utm_source);

create table if not exists public.referral_registrations (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  referral_type varchar not null check (referral_type in ('customer_referral', 'affiliate')),
  status varchar not null default 'registered'
    check (status in ('registered', 'trial_started', 'paid', 'eligible', 'rewarded', 'rejected', 'cancelled')),
  registered_at timestamptz not null default now(),
  trial_started_at timestamptz,
  first_payment_at timestamptz,
  eligible_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists referral_registrations_referred_user_unique_idx
  on public.referral_registrations (referred_user_id);

create index if not exists referral_registrations_referral_code_id_idx
  on public.referral_registrations (referral_code_id);

create index if not exists referral_registrations_referrer_user_id_idx
  on public.referral_registrations (referrer_user_id);

create index if not exists referral_registrations_status_idx
  on public.referral_registrations (status);

create index if not exists referral_registrations_eligible_at_idx
  on public.referral_registrations (eligible_at);

create table if not exists public.affiliate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  affiliate_code varchar not null,
  status varchar not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'rejected')),
  payout_name varchar,
  payout_bank_name varchar,
  payout_account_number_encrypted text,
  payout_account_holder varchar,
  commission_rate numeric(5,2) not null default 20.00 check (commission_rate >= 0 and commission_rate <= 100),
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists affiliate_profiles_user_id_unique_idx
  on public.affiliate_profiles (user_id);

create unique index if not exists affiliate_profiles_affiliate_code_unique_idx
  on public.affiliate_profiles (affiliate_code);

create index if not exists affiliate_profiles_status_idx
  on public.affiliate_profiles (status);

create table if not exists public.commission_transactions (
  id uuid primary key default gen_random_uuid(),
  referral_registration_id uuid not null references public.referral_registrations(id) on delete restrict,
  affiliate_profile_id uuid references public.affiliate_profiles(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  payment_id uuid,
  type varchar not null check (type in ('referral_credit', 'affiliate_cash')),
  amount numeric(14,2) not null check (amount >= 0),
  currency varchar not null default 'IDR',
  rate numeric(5,2) check (rate is null or (rate >= 0 and rate <= 100)),
  status varchar not null default 'pending'
    check (status in ('pending', 'eligible', 'approved', 'rejected', 'paid', 'cancelled')),
  eligible_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commission_transactions_referral_payment_type_unique_idx
  on public.commission_transactions (referral_registration_id, payment_id, type)
  where payment_id is not null;

create unique index if not exists commission_transactions_referral_type_null_payment_unique_idx
  on public.commission_transactions (referral_registration_id, type)
  where payment_id is null;

create index if not exists commission_transactions_referral_registration_id_idx
  on public.commission_transactions (referral_registration_id);

create index if not exists commission_transactions_affiliate_profile_id_idx
  on public.commission_transactions (affiliate_profile_id);

create index if not exists commission_transactions_referrer_user_id_idx
  on public.commission_transactions (referrer_user_id);

create index if not exists commission_transactions_referred_user_id_idx
  on public.commission_transactions (referred_user_id);

create index if not exists commission_transactions_payment_id_idx
  on public.commission_transactions (payment_id);

create index if not exists commission_transactions_status_idx
  on public.commission_transactions (status);

create index if not exists commission_transactions_eligible_at_idx
  on public.commission_transactions (eligible_at);

create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_profile_id uuid not null references public.affiliate_profiles(id) on delete restrict,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  status varchar not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed')),
  payout_method varchar,
  payout_reference varchar,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commission_payouts_affiliate_profile_id_idx
  on public.commission_payouts (affiliate_profile_id);

create index if not exists commission_payouts_status_idx
  on public.commission_payouts (status);

create index if not exists commission_payouts_paid_at_idx
  on public.commission_payouts (paid_at);

create table if not exists public.affiliate_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  affiliate_profile_id uuid references public.affiliate_profiles(id) on delete restrict,
  terms_version varchar not null,
  accepted_at timestamptz not null default now(),
  ip_hash varchar,
  constraint affiliate_terms_acceptances_ip_hash_format_check
    check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists affiliate_terms_acceptances_user_id_idx
  on public.affiliate_terms_acceptances (user_id);

create index if not exists affiliate_terms_acceptances_affiliate_profile_id_idx
  on public.affiliate_terms_acceptances (affiliate_profile_id);

create index if not exists affiliate_terms_acceptances_terms_version_idx
  on public.affiliate_terms_acceptances (terms_version);

create index if not exists affiliate_terms_acceptances_accepted_at_idx
  on public.affiliate_terms_acceptances (accepted_at);
