create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
alter table public.transactions
  add column if not exists customer_name text;
create table if not exists public.transaction_inventory_audit (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade not null,
  transaction_id text references public.transactions(id) on delete cascade not null,
  inventory_id uuid references public.inventory(id) on delete cascade not null,
  action text not null check (action in ('sale', 'void')),
  qty_delta numeric(12,3) not null,
  stock_before numeric(12,3) not null,
  stock_after numeric(12,3) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_transaction_inventory_audit_tx
  on public.transaction_inventory_audit(transaction_id, action, created_at desc);
alter table public.transaction_inventory_audit enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_inventory_audit'
      and policyname = 'Store owner can view inventory audit'
  ) then
    create policy "Store owner can view inventory audit"
      on public.transaction_inventory_audit for select
      using (store_id in (select id from public.stores where owner_id = auth.uid()));
  end if;
end $$;
create or replace function public.process_checkout(
  p_store_id uuid,
  p_transaction_id text,
  p_date timestamptz,
  p_items jsonb,
  p_subtotal integer,
  p_discount integer,
  p_discount_label text,
  p_tax integer,
  p_total integer,
  p_cogs integer,
  p_paid integer,
  p_change integer,
  p_method text,
  p_cashier text,
  p_note text,
  p_customer_name text default null
) returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_owner uuid;
  v_item jsonb;
  v_recipe_item jsonb;
  v_menu_id uuid;
  v_recipe jsonb;
  v_inventory_row public.inventory%rowtype;
  v_qty numeric(12,3);
  v_required_qty numeric(12,3);
  v_cogs numeric(12,2) := 0;
  v_safe_subtotal integer := greatest(coalesce(p_subtotal, 0), 0);
  v_safe_discount integer := 0;
  v_safe_tax integer := greatest(coalesce(p_tax, 0), 0);
  v_safe_total integer := 0;
  v_safe_paid integer := greatest(coalesce(p_paid, 0), 0);
  v_safe_change integer := 0;
  v_transaction public.transactions;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select owner_id
  into v_store_owner
  from public.stores
  where id = p_store_id;

  if v_store_owner is null then
    raise exception 'Store tidak ditemukan';
  end if;

  if v_store_owner <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1
    from public.transactions
    where id = p_transaction_id
      and store_id = p_store_id
  ) then
    raise exception 'ID transaksi sudah digunakan. Coba checkout lagi.';
  end if;

  v_safe_discount := least(greatest(coalesce(p_discount, 0), 0), v_safe_subtotal);
  v_safe_total := greatest(v_safe_subtotal - v_safe_discount, 0) + v_safe_tax;
  v_safe_change := greatest(v_safe_paid - v_safe_total, 0);

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := greatest(coalesce((v_item->>'qty')::numeric, 0), 0);
    if v_qty = 0 then
      continue;
    end if;

    v_menu_id := nullif(v_item->>'menu_item_id', '')::uuid;
    if v_menu_id is null then
      select id
      into v_menu_id
      from public.menu_items
      where store_id = p_store_id
        and name = coalesce(v_item->>'name', '')
      order by created_at asc
      limit 1;
    end if;

    if v_menu_id is null then
      continue;
    end if;

    select recipe
    into v_recipe
    from public.menu_items
    where id = v_menu_id
      and store_id = p_store_id;

    for v_recipe_item in
      select value
      from jsonb_array_elements(coalesce(v_recipe, '[]'::jsonb))
    loop
      v_required_qty := greatest(coalesce((v_recipe_item->>'qty')::numeric, 0), 0) * v_qty;
      if v_required_qty = 0 then
        continue;
      end if;

      select *
      into v_inventory_row
      from public.inventory
      where id = (v_recipe_item->>'matId')::uuid
        and store_id = p_store_id
      for update;

      if not found then
        raise exception 'Bahan inventory tidak ditemukan untuk menu yang dijual.';
      end if;

      if v_inventory_row.stock < v_required_qty then
        raise exception 'Stok % tidak cukup untuk checkout.', v_inventory_row.name;
      end if;

      update public.inventory
      set stock = stock - v_required_qty
      where id = v_inventory_row.id;

      insert into public.transaction_inventory_audit (
        store_id,
        transaction_id,
        inventory_id,
        action,
        qty_delta,
        stock_before,
        stock_after
      ) values (
        p_store_id,
        p_transaction_id,
        v_inventory_row.id,
        'sale',
        -v_required_qty,
        v_inventory_row.stock,
        v_inventory_row.stock - v_required_qty
      );

      v_cogs := v_cogs + (coalesce(v_inventory_row.cost_per_unit, 0) * v_required_qty);
    end loop;
  end loop;

  insert into public.transactions (
    id, store_id, date, items,
    subtotal, discount, discount_label, tax, total, cogs,
    paid, change, method, customer_name, cashier, note,
    is_void, void_reason, void_at, void_by, created_at
  ) values (
    p_transaction_id,
    p_store_id,
    coalesce(p_date, now()),
    coalesce(p_items, '[]'::jsonb),
    v_safe_subtotal,
    v_safe_discount,
    p_discount_label,
    v_safe_tax,
    v_safe_total,
    greatest(coalesce(p_cogs, round(v_cogs)::integer), round(v_cogs)::integer),
    v_safe_paid,
    v_safe_change,
    coalesce(p_method, 'Tunai'),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_cashier, 'Kasir')), ''),
    p_note,
    false,
    null,
    null,
    null,
    now()
  )
  returning *
  into v_transaction;

  return v_transaction;
end;
$$;
grant execute on function public.process_checkout(
  uuid, text, timestamptz, jsonb, integer, integer, text, integer, integer, integer, integer, integer, text, text, text, text
) to authenticated;
create or replace function public.void_transaction_secure(
  p_store_id uuid,
  p_transaction_id text,
  p_reason text,
  p_void_by text
) returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_owner uuid;
  v_transaction public.transactions;
  v_audit record;
  v_inventory_row public.inventory%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select owner_id
  into v_store_owner
  from public.stores
  where id = p_store_id;

  if v_store_owner is null then
    raise exception 'Store tidak ditemukan';
  end if;

  if v_store_owner <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  if v_transaction.is_void then
    return v_transaction;
  end if;

  for v_audit in
    select *
    from public.transaction_inventory_audit
    where transaction_id = p_transaction_id
      and action = 'sale'
    order by created_at asc, id asc
  loop
    select *
    into v_inventory_row
    from public.inventory
    where id = v_audit.inventory_id
      and store_id = p_store_id
    for update;

    if not found then
      continue;
    end if;

    update public.inventory
    set stock = stock + abs(v_audit.qty_delta)
    where id = v_inventory_row.id;

    insert into public.transaction_inventory_audit (
      store_id,
      transaction_id,
      inventory_id,
      action,
      qty_delta,
      stock_before,
      stock_after
    ) values (
      p_store_id,
      p_transaction_id,
      v_inventory_row.id,
      'void',
      abs(v_audit.qty_delta),
      v_inventory_row.stock,
      v_inventory_row.stock + abs(v_audit.qty_delta)
    );
  end loop;

  update public.transactions
  set
    is_void = true,
    void_reason = nullif(trim(coalesce(p_reason, '')), ''),
    void_at = now(),
    void_by = nullif(trim(coalesce(p_void_by, '')), '')
  where id = p_transaction_id
    and store_id = p_store_id
  returning *
  into v_transaction;

  return v_transaction;
end;
$$;
grant execute on function public.void_transaction_secure(uuid, text, text, text) to authenticated;
