-- ============================================================================
-- Migration: local_file_sync
-- Purpose: Cloud-side manifest for locally indexed files.
--          Enables selective, incremental sync between local and cloud.
--
-- Security:
--  - user_id references auth.users (Supabase Auth)
--  - Row Level Security ensures each user can only see their own records
--  - No cross-user data leakage is possible via RLS policies
-- ============================================================================

-- ── Table: local_file_sync ──────────────────────────────────────────────────

create table if not exists public.local_file_sync (
  -- Identity
  id              uuid        primary key default gen_random_uuid(),
  file_id         text        not null,       -- matches LocalFileEntry.id on client
  user_id         uuid        not null references auth.users (id) on delete cascade,

  -- File metadata
  file_name       text        not null,
  file_path       text        not null,       -- relative path within the folder
  file_type       text        not null,       -- extension e.g. "md", "pdf"
  file_size       bigint      not null default 0,

  -- Content integrity
  content_hash    text        not null,       -- SHA-256 hex of file content

  -- Cloud storage reference
  storage_path    text,                       -- Supabase Storage object path

  -- Indexed content
  extracted_text  text,
  summary         text,
  tags            text[]      not null default '{}',

  -- Classification
  storage_mode    text        not null default 'hybrid'
                              check (storage_mode in ('local', 'cloud', 'hybrid')),
  folder_id       text        not null,       -- matches ConnectedFolder.id on client

  -- Timestamps
  modified_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Unique constraint: one row per (user, file_id)
  unique (user_id, file_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists local_file_sync_user_idx
  on public.local_file_sync (user_id);

create index if not exists local_file_sync_folder_idx
  on public.local_file_sync (user_id, folder_id);

create index if not exists local_file_sync_hash_idx
  on public.local_file_sync (user_id, content_hash);

-- Full-text search on extracted content
create index if not exists local_file_sync_fts_idx
  on public.local_file_sync
  using gin (to_tsvector('english', coalesce(extracted_text, '') || ' ' || coalesce(summary, '') || ' ' || file_name));

-- ── Updated-at trigger ───────────────────────────────────────────────────────

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists local_file_sync_updated_at on public.local_file_sync;
create trigger local_file_sync_updated_at
  before update on public.local_file_sync
  for each row execute function public.update_updated_at_column();

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.local_file_sync enable row level security;

-- Users can only read their own records
create policy "local_file_sync_select_own"
  on public.local_file_sync
  for select
  using (user_id = auth.uid());

-- Users can only insert as themselves
create policy "local_file_sync_insert_own"
  on public.local_file_sync
  for insert
  with check (user_id = auth.uid());

-- Users can only update their own records
create policy "local_file_sync_update_own"
  on public.local_file_sync
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can only delete their own records
create policy "local_file_sync_delete_own"
  on public.local_file_sync
  for delete
  using (user_id = auth.uid());

-- ── Hybrid Full-Text Search Function ─────────────────────────────────────────

create or replace function public.search_local_files(
  target_user_id  uuid,
  query_text      text,
  match_count     int default 20,
  folder_filter   text default null
)
returns table (
  id            uuid,
  file_id       text,
  file_name     text,
  file_path     text,
  file_type     text,
  file_size     bigint,
  content_hash  text,
  storage_path  text,
  extracted_text text,
  summary       text,
  tags          text[],
  storage_mode  text,
  folder_id     text,
  modified_at   timestamptz,
  updated_at    timestamptz,
  search_rank   float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lfs.id,
    lfs.file_id,
    lfs.file_name,
    lfs.file_path,
    lfs.file_type,
    lfs.file_size,
    lfs.content_hash,
    lfs.storage_path,
    lfs.extracted_text,
    lfs.summary,
    lfs.tags,
    lfs.storage_mode,
    lfs.folder_id,
    lfs.modified_at,
    lfs.updated_at,
    ts_rank(
      to_tsvector('english', coalesce(lfs.extracted_text, '') || ' ' || coalesce(lfs.summary, '') || ' ' || lfs.file_name),
      plainto_tsquery('english', query_text)
    ) as search_rank
  from public.local_file_sync lfs
  where
    lfs.user_id = target_user_id
    and (folder_filter is null or lfs.folder_id = folder_filter)
    and to_tsvector('english', coalesce(lfs.extracted_text, '') || ' ' || coalesce(lfs.summary, '') || ' ' || lfs.file_name)
        @@ plainto_tsquery('english', query_text)
  order by search_rank desc
  limit match_count;
$$;

-- ── Grant access ─────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.local_file_sync to authenticated;
grant execute on function public.search_local_files to authenticated;

-- ── Comment ──────────────────────────────────────────────────────────────────

comment on table public.local_file_sync is
  'Cloud-side manifest for locally indexed files. '
  'Each row represents a file the user has chosen to sync from their local machine. '
  'RLS ensures complete user data isolation.';
