create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  transaction_id text,
  midtrans_order_id text not null unique,
  midtrans_transaction_id text,
  snap_token text,
  payment_url text,
  payment_provider text not null default 'midtrans',
  payment_type text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'completed', 'failed', 'cancelled')),
  transaction_status text not null default 'pending',
  fraud_status text,
  status_code text,
  currency_code text not null default 'IDR',
  subtotal integer not null default 0,
  discount_amount integer not null default 0,
  tax_amount integer not null default 0,
  gross_amount integer not null check (gross_amount > 0),
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  paid_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_orders
  add column if not exists discount_amount integer not null default 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'payment_orders_status_check'
      and conrelid = 'public.payment_orders'::regclass
  ) then
    alter table public.payment_orders drop constraint payment_orders_status_check;
  end if;
end $$;

alter table public.payment_orders
  add constraint payment_orders_status_check
  check (status in ('pending', 'paid', 'completed', 'failed', 'cancelled'));

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

create index if not exists payment_orders_store_status_idx
  on public.payment_orders (store_id, status, created_at desc);

create index if not exists payment_orders_midtrans_order_id_idx
  on public.payment_orders (midtrans_order_id);

create table if not exists public.payment_attempt_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  event_type text not null,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_attempt_logs_user_created_idx
  on public.payment_attempt_logs (user_id, created_at desc);

create table if not exists public.payment_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'midtrans',
  order_id text,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  signature_valid boolean not null default false,
  transaction_status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_webhook_logs_order_created_idx
  on public.payment_webhook_logs (order_id, created_at desc);
