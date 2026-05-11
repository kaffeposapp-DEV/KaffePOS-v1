create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'system',
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications
  alter column type set default 'system';

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read, created_at desc);

create index if not exists notifications_store_created_idx
  on public.notifications (store_id, created_at desc)
  where store_id is not null;

create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  channel text not null check (channel in ('web_push', 'capacitor_android')),
  endpoint text not null,
  payload jsonb not null default '{}'::jsonb,
  platform text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel, endpoint)
);

create index if not exists notification_push_subscriptions_user_idx
  on public.notification_push_subscriptions (user_id, is_active, updated_at desc);
