create extension if not exists pgcrypto;

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  liked text not null default '',
  improve text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists beta_feedback_store_created_idx
  on public.beta_feedback (store_id, created_at desc)
  where store_id is not null;

create index if not exists beta_feedback_user_created_idx
  on public.beta_feedback (user_id, created_at desc);
