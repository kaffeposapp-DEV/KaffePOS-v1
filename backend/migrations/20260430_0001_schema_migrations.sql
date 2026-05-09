create table if not exists public.schema_migrations (
  version text primary key,
  name text not null,
  checksum text,
  applied_at timestamptz not null default now()
);
