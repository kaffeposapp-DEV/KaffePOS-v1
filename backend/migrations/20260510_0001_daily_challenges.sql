create extension if not exists pgcrypto;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  title text not null,
  description text not null default '',
  target_type text not null check (
    target_type in (
      'sell_drink',
      'average_checkout_time',
      'transactions_count',
      'upsell_value',
      'zero_voids'
    )
  ),
  target_value jsonb not null default '{}'::jsonb,
  points_reward integer not null default 0 check (points_reward >= 0),
  is_active boolean not null default true,
  valid_from date not null default current_date,
  valid_to date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists challenges_store_active_valid_idx
  on public.challenges (store_id, is_active, valid_from, valid_to);

create unique index if not exists challenges_store_title_day_idx
  on public.challenges (store_id, title, valid_from);

create table if not exists public.user_challenge_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  current_progress numeric not null default 0 check (current_progress >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create index if not exists user_challenge_progress_user_idx
  on public.user_challenge_progress (user_id, updated_at desc);

create index if not exists user_challenge_progress_challenge_idx
  on public.user_challenge_progress (challenge_id, is_completed);
