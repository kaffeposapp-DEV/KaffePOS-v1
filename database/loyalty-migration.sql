-- Digital Loyalty / Kopi Passport
create extension if not exists pgcrypto;

create table if not exists public.loyalty_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  stamps_required integer not null default 8 check (stamps_required between 2 and 20),
  points_per_rupiah numeric not null default 0.01 check (points_per_rupiah >= 0),
  minimum_transaction_amount integer not null default 0 check (minimum_transaction_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  type text not null check (type in ('discount_amount', 'discount_percent', 'free_item')),
  reward_value integer not null default 0 check (reward_value >= 0),
  points_or_stamps_needed integer not null default 0 check (points_or_stamps_needed >= 0),
  points_cost integer not null default 0 check (points_cost >= 0),
  stamps_cost integer not null default 0 check (stamps_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_rewards_store_active_idx
  on public.loyalty_rewards (store_id, is_active, created_at asc);

alter table public.loyalty_rewards
  add column if not exists points_or_stamps_needed integer not null default 0 check (points_or_stamps_needed >= 0);

create table if not exists public.loyalty_customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text,
  phone text not null,
  tier text not null default 'regular' check (tier in ('regular', 'kopi_lover', 'vvip')),
  total_points integer not null default 0 check (total_points >= 0),
  total_visits integer not null default 0 check (total_visits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, phone)
);

create index if not exists loyalty_customers_store_phone_idx
  on public.loyalty_customers (store_id, phone);

create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  min_visits integer not null default 0 check (min_visits >= 0),
  benefits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create index if not exists loyalty_tiers_store_min_visits_idx
  on public.loyalty_tiers (store_id, min_visits asc);

create table if not exists public.loyalty_passports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_name text,
  customer_phone text not null,
  tier text not null default 'regular' check (tier in ('regular', 'kopi_lover', 'vvip')),
  total_stamps integer not null default 0 check (total_stamps >= 0),
  available_stamps integer not null default 0 check (available_stamps >= 0),
  total_points integer not null default 0 check (total_points >= 0),
  available_points integer not null default 0 check (available_points >= 0),
  lifetime_spend integer not null default 0 check (lifetime_spend >= 0),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, customer_phone)
);

create index if not exists loyalty_passports_store_updated_idx
  on public.loyalty_passports (store_id, updated_at desc);

create index if not exists loyalty_passports_store_phone_idx
  on public.loyalty_passports (store_id, customer_phone);

create table if not exists public.loyalty_stamp_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  passport_id uuid not null references public.loyalty_passports(id) on delete cascade,
  transaction_id text references public.transactions(id) on delete set null,
  stamps integer not null default 1 check (stamps >= 0),
  points integer not null default 0 check (points >= 0),
  transaction_amount integer not null default 0 check (transaction_amount >= 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists loyalty_stamp_events_idempotency_idx
  on public.loyalty_stamp_events (store_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists loyalty_stamp_events_passport_created_idx
  on public.loyalty_stamp_events (passport_id, created_at desc);

create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.loyalty_customers(id) on delete cascade,
  transaction_id text references public.transactions(id) on delete set null,
  stamps_earned integer not null default 1 check (stamps_earned >= 0),
  created_at timestamptz not null default now()
);

create index if not exists loyalty_stamps_customer_created_idx
  on public.loyalty_stamps (customer_id, created_at desc);

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  passport_id uuid not null references public.loyalty_passports(id) on delete cascade,
  reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
  transaction_id text references public.transactions(id) on delete set null,
  points_spent integer not null default 0 check (points_spent >= 0),
  stamps_spent integer not null default 0 check (stamps_spent >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  status text not null default 'redeemed' check (status in ('pending', 'redeemed', 'void')),
  created_by uuid references public.profiles(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists loyalty_redemptions_idempotency_idx
  on public.loyalty_redemptions (store_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists loyalty_redemptions_passport_created_idx
  on public.loyalty_redemptions (passport_id, created_at desc);
