-- KaffePOS Kitchen / Order Checker migration
-- Safe to run multiple times on PostgreSQL production.
-- Run this before deploying backend code that writes kitchen orders.

create extension if not exists pgcrypto;

create table if not exists public.kitchen_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  transaction_id text references public.transactions(id) on delete set null,
  order_number text not null,
  source text not null default 'cashier',
  customer_name text,
  table_number text,
  overall_status text not null default 'pending'
    check (overall_status in ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  status_version integer not null default 1,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, transaction_id)
);

create index if not exists kitchen_orders_store_status_created_idx
  on public.kitchen_orders (store_id, overall_status, created_at desc);

create index if not exists kitchen_orders_store_updated_idx
  on public.kitchen_orders (store_id, updated_at desc);

create table if not exists public.kitchen_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.kitchen_orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  qty numeric not null check (qty > 0),
  note text,
  station text not null default 'other'
    check (station in ('kitchen', 'bar', 'dessert', 'other')),
  item_status text not null default 'pending'
    check (item_status in ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
  status_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kitchen_order_items_order_idx
  on public.kitchen_order_items (order_id, created_at asc);

create index if not exists kitchen_order_items_station_status_idx
  on public.kitchen_order_items (station, item_status);

create table if not exists public.kitchen_order_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.kitchen_orders(id) on delete cascade,
  order_item_id uuid references public.kitchen_order_items(id) on delete set null,
  event_type text not null,
  old_status text,
  new_status text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kitchen_order_events_store_created_idx
  on public.kitchen_order_events (store_id, created_at desc);

create index if not exists kitchen_order_events_order_created_idx
  on public.kitchen_order_events (order_id, created_at asc);

select
  'kitchen_order_checker_ready' as migration,
  to_regclass('public.kitchen_orders') as kitchen_orders,
  to_regclass('public.kitchen_order_items') as kitchen_order_items,
  to_regclass('public.kitchen_order_events') as kitchen_order_events;
