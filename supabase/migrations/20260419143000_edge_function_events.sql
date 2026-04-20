create extension if not exists pgcrypto;

create table if not exists public.edge_function_events (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  status text not null check (status in ('success', 'failure', 'alert_sent')),
  message text not null,
  request_email text,
  request_ip text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_edge_function_events_name_created
  on public.edge_function_events(function_name, created_at desc);

create index if not exists idx_edge_function_events_name_status_created
  on public.edge_function_events(function_name, status, created_at desc);

alter table public.edge_function_events enable row level security;
alter table public.edge_function_events force row level security;
revoke all on table public.edge_function_events from anon, authenticated, public;
grant all on table public.edge_function_events to service_role;
