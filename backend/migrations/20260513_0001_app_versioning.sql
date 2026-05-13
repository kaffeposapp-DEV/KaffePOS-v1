create table if not exists public.app_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  release_channel text not null default 'stable'
    check (release_channel in ('development', 'beta', 'stable')),
  update_policy text not null default 'soft'
    check (update_policy in ('none', 'soft', 'hard')),
  min_supported_web_version text not null default '0.0.0',
  min_supported_apk_version text not null default '0.0.0',
  schema_version text,
  release_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deployed_at timestamptz
);

create table if not exists public.app_update_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  event_name text not null check (
    event_name in (
      'version_checked',
      'update_detected',
      'client_storage_migrated',
      'post_update_sync_started',
      'post_update_sync_completed',
      'post_update_sync_failed'
    )
  ),
  client_version text,
  server_version text,
  platform text not null default 'web'
    check (platform in ('web', 'android', 'apk', 'ios', 'unknown')),
  update_mode text not null default 'none'
    check (update_mode in ('none', 'soft', 'hard')),
  migration_report jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_versions_created_idx
  on public.app_versions (created_at desc);

create index if not exists app_update_events_user_created_idx
  on public.app_update_events (user_id, created_at desc);

create index if not exists app_update_events_store_created_idx
  on public.app_update_events (store_id, created_at desc)
  where store_id is not null;

insert into public.app_versions (
  version,
  release_channel,
  update_policy,
  min_supported_web_version,
  min_supported_apk_version,
  schema_version,
  release_notes,
  metadata,
  deployed_at
) values (
  '2.0.0',
  'beta',
  'soft',
  '0.0.0',
  '0.0.0',
  '20260513_0001_app_versioning',
  'Baseline safe-update release with schema version tracking and client update sync.',
  '{"safeUpdate": true, "backwardCompatible": true}'::jsonb,
  now()
)
on conflict (version) do update
set
  schema_version = excluded.schema_version,
  metadata = public.app_versions.metadata || excluded.metadata;
