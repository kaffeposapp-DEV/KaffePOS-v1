create extension if not exists pgcrypto;

create table if not exists public.subscription_upgrade_prompt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  event_type text not null check (event_type in ('view', 'click', 'dismiss')),
  prompt_key text not null,
  trigger text not null,
  recommended_plan text not null default 'signature',
  current_plan text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_upgrade_prompt_events_user_idx
  on public.subscription_upgrade_prompt_events (user_id, created_at desc);

create index if not exists subscription_upgrade_prompt_events_store_trigger_idx
  on public.subscription_upgrade_prompt_events (store_id, trigger, created_at desc);
