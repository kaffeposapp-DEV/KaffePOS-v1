create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create table if not exists public.edge_rate_limits (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  hits integer not null default 1 check (hits >= 0),
  last_ip text,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_edge_rate_limits_key_window
  on public.edge_rate_limits(rate_key, window_started_at desc);
alter table public.inventory
  alter column stock set default 0,
  alter column min_stock set default 0,
  alter column cost_per_unit set default 0;
alter table public.inventory
  drop constraint if exists inventory_stock_check,
  drop constraint if exists inventory_min_stock_check,
  drop constraint if exists inventory_cost_per_unit_check;
alter table public.inventory
  add constraint inventory_stock_check check (stock >= 0),
  add constraint inventory_min_stock_check check (min_stock >= 0),
  add constraint inventory_cost_per_unit_check check (cost_per_unit >= 0);
alter table public.transactions
  drop constraint if exists transactions_subtotal_check,
  drop constraint if exists transactions_discount_check,
  drop constraint if exists transactions_tax_check,
  drop constraint if exists transactions_total_check,
  drop constraint if exists transactions_cogs_check,
  drop constraint if exists transactions_paid_check,
  drop constraint if exists transactions_change_check,
  drop constraint if exists transactions_discount_lte_subtotal_check,
  drop constraint if exists transactions_total_formula_check;
alter table public.transactions
  add constraint transactions_subtotal_check check (subtotal >= 0),
  add constraint transactions_discount_check check (discount >= 0),
  add constraint transactions_tax_check check (tax >= 0),
  add constraint transactions_total_check check (total >= 0),
  add constraint transactions_cogs_check check (cogs >= 0),
  add constraint transactions_paid_check check (paid >= 0),
  add constraint transactions_change_check check (change >= 0),
  add constraint transactions_discount_lte_subtotal_check check (discount <= subtotal),
  add constraint transactions_total_formula_check check (total = greatest(subtotal - discount, 0) + tax);
