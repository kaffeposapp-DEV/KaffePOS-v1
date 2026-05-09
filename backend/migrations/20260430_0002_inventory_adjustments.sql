create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  counted_stock numeric not null check (counted_stock >= 0),
  stock_before numeric not null,
  qty_delta numeric not null,
  reason text not null,
  note text,
  adjusted_by uuid references public.profiles(id) on delete set null,
  adjusted_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_adjustments_store_created_idx
  on public.inventory_adjustments (store_id, created_at desc);

create index if not exists inventory_adjustments_inventory_created_idx
  on public.inventory_adjustments (inventory_id, created_at desc);
