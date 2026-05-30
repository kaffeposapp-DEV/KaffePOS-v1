alter table public.payment_orders
  add column if not exists provider text,
  add column if not exists provider_reference text,
  add column if not exists provider_order_id text,
  add column if not exists merchant_order_id text,
  add column if not exists va_number text,
  add column if not exists qr_string text,
  add column if not exists payment_method text,
  add column if not exists provider_status text,
  add column if not exists internal_status text,
  add column if not exists callback_received_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists metadata jsonb;

update public.payment_orders
set provider = coalesce(provider, payment_provider, 'midtrans'),
    merchant_order_id = coalesce(merchant_order_id, midtrans_order_id),
    provider_order_id = coalesce(provider_order_id, midtrans_order_id),
    internal_status = coalesce(internal_status, status),
    provider_status = coalesce(provider_status, transaction_status),
    metadata = coalesce(metadata, '{}'::jsonb)
where provider is null
   or merchant_order_id is null
   or internal_status is null
   or metadata is null;

alter table public.subscription_payment_sessions
  add column if not exists provider text,
  add column if not exists provider_reference text,
  add column if not exists merchant_order_id text,
  add column if not exists payment_url text,
  add column if not exists va_number text,
  add column if not exists qr_string text,
  add column if not exists payment_method text,
  add column if not exists provider_status text,
  add column if not exists internal_status text,
  add column if not exists callback_received_at timestamptz,
  add column if not exists expired_at timestamptz;

update public.subscription_payment_sessions
set provider = coalesce(provider, 'midtrans'),
    merchant_order_id = coalesce(merchant_order_id, midtrans_order_id),
    payment_url = coalesce(payment_url, redirect_url),
    payment_method = coalesce(payment_method, payment_type),
    provider_status = coalesce(provider_status, transaction_status),
    internal_status = coalesce(internal_status, transaction_status)
where provider is null
   or merchant_order_id is null
   or internal_status is null;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid,
  provider text not null,
  event_type text not null,
  provider_reference text,
  merchant_order_id text,
  raw_status text,
  internal_status text,
  payload jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_orders_provider_idx on public.payment_orders (provider);
create index if not exists payment_orders_provider_reference_idx on public.payment_orders (provider_reference);
create unique index if not exists payment_orders_merchant_order_id_key on public.payment_orders (merchant_order_id) where merchant_order_id is not null;
create index if not exists payment_orders_internal_status_idx on public.payment_orders (internal_status);
create index if not exists payment_orders_created_at_idx on public.payment_orders (created_at);
create index if not exists subscription_payment_sessions_provider_idx on public.subscription_payment_sessions (provider);
create index if not exists subscription_payment_sessions_provider_reference_idx on public.subscription_payment_sessions (provider_reference);
create unique index if not exists subscription_payment_sessions_merchant_order_id_key on public.subscription_payment_sessions (merchant_order_id) where merchant_order_id is not null;
create index if not exists subscription_payment_sessions_internal_status_idx on public.subscription_payment_sessions (internal_status);
create index if not exists payment_events_payment_id_idx on public.payment_events (payment_id);
create index if not exists payment_events_provider_idx on public.payment_events (provider);
create index if not exists payment_events_provider_reference_idx on public.payment_events (provider_reference);
create index if not exists payment_events_created_at_idx on public.payment_events (created_at);
