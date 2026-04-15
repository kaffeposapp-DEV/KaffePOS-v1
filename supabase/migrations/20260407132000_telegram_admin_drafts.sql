create table if not exists public.telegram_admin_drafts (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('activate')),
  requested_by text not null,
  requested_chat_id text not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  target_email text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_telegram_admin_drafts_status
  on public.telegram_admin_drafts(status, expires_at desc);
alter table public.telegram_admin_drafts enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_admin_drafts'
      and policyname = 'Admins can view telegram admin drafts'
  ) then
    create policy "Admins can view telegram admin drafts"
      on public.telegram_admin_drafts for select
      using (public.is_admin_email());
  end if;
end $$;
drop trigger if exists telegram_admin_drafts_updated_at
  on public.telegram_admin_drafts;
create trigger telegram_admin_drafts_updated_at
  before update on public.telegram_admin_drafts
  for each row execute function public.update_updated_at();
