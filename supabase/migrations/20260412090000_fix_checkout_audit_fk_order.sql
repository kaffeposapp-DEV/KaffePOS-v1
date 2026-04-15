do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'transaction_inventory_audit'
      and constraint_name = 'transaction_inventory_audit_transaction_id_fkey'
  ) then
    alter table public.transaction_inventory_audit
      drop constraint transaction_inventory_audit_transaction_id_fkey,
      add constraint transaction_inventory_audit_transaction_id_fkey
        foreign key (transaction_id)
        references public.transactions(id)
        on delete cascade
        deferrable initially deferred;
  end if;
end $$;
