-- Durable background job queue (replaces the in-memory queue that lost jobs on restart).
create table if not exists public.background_jobs (
  id uuid primary key,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists background_jobs_ready_idx
  on public.background_jobs (status, run_after);
