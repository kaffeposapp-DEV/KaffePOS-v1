create extension if not exists pgcrypto;

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  rating integer check (rating between 1 and 5),
  category text not null default 'Lainnya' check (category in ('Bug', 'Saran Fitur', 'Lainnya')),
  description text not null default '',
  screenshot_data text,
  liked text not null default '',
  improve text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.beta_feedback
  add column if not exists rating integer check (rating between 1 and 5),
  add column if not exists category text not null default 'Lainnya',
  add column if not exists description text not null default '',
  add column if not exists screenshot_data text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'beta_feedback_category_check'
      and conrelid = 'public.beta_feedback'::regclass
  ) then
    alter table public.beta_feedback
      add constraint beta_feedback_category_check
      check (category in ('Bug', 'Saran Fitur', 'Lainnya'));
  end if;
end $$;

create index if not exists beta_feedback_store_created_idx
  on public.beta_feedback (store_id, created_at desc)
  where store_id is not null;

create index if not exists beta_feedback_user_created_idx
  on public.beta_feedback (user_id, created_at desc);
