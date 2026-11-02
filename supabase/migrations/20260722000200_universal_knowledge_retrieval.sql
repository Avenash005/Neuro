-- ============================================================================
-- Migration: Universal Knowledge Retrieval Infrastructure
-- Tables: integration_connections, knowledge_items, audit_log_entries
-- All tables enforce Row Level Security — users can only access their own data.
-- ============================================================================

-- ── integration_connections ───────────────────────────────────────────────
-- Stores OAuth tokens and connection state for each integration provider.

create table if not exists public.integration_connections (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  provider_id       text        not null,
  status            text        not null default 'disconnected'
                                check (status in ('disconnected','connecting','connected','error','expired','syncing')),
  display_name      text        not null default '',
  -- Tokens are encrypted at the application layer before storage
  access_token_enc  text,
  refresh_token_enc text,
  token_expires_at  timestamptz,
  scopes            text[]      not null default '{}',
  last_sync_at      timestamptz,
  last_sync_stats   jsonb,
  sync_cursor       text,
  error_message     text,
  metadata          jsonb       not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, provider_id)
);

create index if not exists integration_connections_user_idx
  on public.integration_connections (user_id);

create index if not exists integration_connections_status_idx
  on public.integration_connections (user_id, status);

alter table public.integration_connections enable row level security;

create policy "integration_connections_select_own"
  on public.integration_connections for select using (user_id = auth.uid());
create policy "integration_connections_insert_own"
  on public.integration_connections for insert with check (user_id = auth.uid());
create policy "integration_connections_update_own"
  on public.integration_connections for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "integration_connections_delete_own"
  on public.integration_connections for delete using (user_id = auth.uid());

-- ── knowledge_items ───────────────────────────────────────────────────────
-- Normalized knowledge items indexed from all connected sources.
-- One row per unique (user, provider, source_id).

create table if not exists public.knowledge_items (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  connection_id     uuid        references public.integration_connections (id) on delete cascade,
  source_provider   text        not null,
  source_type       text        not null,
  source_id         text        not null,
  title             text        not null default '',
  content           text        not null default '',
  snippet           text        not null default '',
  metadata          jsonb       not null default '{}',
  url               text,
  local_path        text,
  content_hash      text        not null default '',
  storage_mode      text        not null default 'cloud'
                                check (storage_mode in ('local', 'cloud', 'hybrid')),
  sync_status       text        not null default 'synced'
                                check (sync_status in ('synced', 'pending', 'error')),
  -- Full-text search vector
  search_document   tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(snippet, ''))
  ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  indexed_at        timestamptz,
  unique (user_id, source_provider, source_id)
);

create index if not exists knowledge_items_user_idx
  on public.knowledge_items (user_id);

create index if not exists knowledge_items_provider_idx
  on public.knowledge_items (user_id, source_provider);

create index if not exists knowledge_items_fts_idx
  on public.knowledge_items using gin (search_document);

create index if not exists knowledge_items_hash_idx
  on public.knowledge_items (user_id, content_hash);

alter table public.knowledge_items enable row level security;

create policy "knowledge_items_select_own"
  on public.knowledge_items for select using (user_id = auth.uid());
create policy "knowledge_items_insert_own"
  on public.knowledge_items for insert with check (user_id = auth.uid());
create policy "knowledge_items_update_own"
  on public.knowledge_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "knowledge_items_delete_own"
  on public.knowledge_items for delete using (user_id = auth.uid());

-- ── audit_log_entries ─────────────────────────────────────────────────────
-- Immutable record of all knowledge access events.
-- Insert-only from the application layer.

create table if not exists public.audit_log_entries (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  event_type    text        not null
                            check (event_type in ('search','sync','connect','disconnect','ai_access','export','delete')),
  actor         text        not null,     -- "user" | AI connection name | "system"
  query         text,
  provider_ids  text[],
  item_count    integer,
  summary       text        not null default '',
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_entries_user_idx
  on public.audit_log_entries (user_id, created_at desc);

create index if not exists audit_log_entries_type_idx
  on public.audit_log_entries (user_id, event_type);

alter table public.audit_log_entries enable row level security;

-- Users can read their own audit log
create policy "audit_log_entries_select_own"
  on public.audit_log_entries for select using (user_id = auth.uid());
-- Users can insert their own audit entries; system/edge functions can also insert
create policy "audit_log_entries_insert_own"
  on public.audit_log_entries for insert with check (user_id = auth.uid());
-- Audit entries are immutable — no update or delete

-- ── ai_connections ────────────────────────────────────────────────────────
-- API keys for external AI applications (Claude, ChatGPT, custom agents).

create table if not exists public.ai_connections (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  name                  text        not null,
  type                  text        not null default 'api_key'
                                    check (type in ('mcp', 'api_key', 'oauth')),
  -- Hashed API key — plain key is shown once and not stored
  api_key_hash          text,
  capabilities          jsonb       not null default '[]',
  allowed_provider_ids  text[]      not null default '{}',
  allow_local_files     boolean     not null default false,
  is_active             boolean     not null default true,
  last_used_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists ai_connections_user_idx
  on public.ai_connections (user_id);

alter table public.ai_connections enable row level security;

create policy "ai_connections_select_own"
  on public.ai_connections for select using (user_id = auth.uid());
create policy "ai_connections_insert_own"
  on public.ai_connections for insert with check (user_id = auth.uid());
create policy "ai_connections_update_own"
  on public.ai_connections for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ai_connections_delete_own"
  on public.ai_connections for delete using (user_id = auth.uid());

-- ── Full-text search RPC ──────────────────────────────────────────────────

create or replace function public.search_knowledge_items(
  target_user_id  uuid,
  query_text      text,
  provider_filter text default null,
  match_count     int  default 20
)
returns table (
  id              uuid,
  source_provider text,
  source_type     text,
  source_id       text,
  title           text,
  content         text,
  snippet         text,
  url             text,
  local_path      text,
  content_hash    text,
  storage_mode    text,
  updated_at      timestamptz,
  search_rank     float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ki.id,
    ki.source_provider,
    ki.source_type,
    ki.source_id,
    ki.title,
    ki.content,
    ki.snippet,
    ki.url,
    ki.local_path,
    ki.content_hash,
    ki.storage_mode,
    ki.updated_at,
    ts_rank(ki.search_document, plainto_tsquery('english', query_text)) as search_rank
  from public.knowledge_items ki
  where
    ki.user_id = target_user_id
    and (provider_filter is null or ki.source_provider = provider_filter)
    and ki.search_document @@ plainto_tsquery('english', query_text)
  order by search_rank desc
  limit match_count;
$$;

-- ── Grant permissions ─────────────────────────────────────────────────────

grant select, insert, update, delete on public.integration_connections to authenticated;
grant select, insert, update, delete on public.knowledge_items to authenticated;
grant select, insert on public.audit_log_entries to authenticated;
grant select, insert, update, delete on public.ai_connections to authenticated;
grant execute on function public.search_knowledge_items to authenticated;

-- ── Updated-at triggers ───────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists integration_connections_updated_at on public.integration_connections;
create trigger integration_connections_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

drop trigger if exists knowledge_items_updated_at on public.knowledge_items;
create trigger knowledge_items_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

drop trigger if exists ai_connections_updated_at on public.ai_connections;
create trigger ai_connections_updated_at
  before update on public.ai_connections
  for each row execute function public.set_updated_at();
