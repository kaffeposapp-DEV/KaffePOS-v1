create extension if not exists pgcrypto;

create table if not exists public.ai_insights_cache (
  store_id uuid primary key references public.stores(id) on delete cascade,
  generated_by uuid references public.profiles(id) on delete set null,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists ai_insights_cache_expires_idx
  on public.ai_insights_cache (expires_at);
