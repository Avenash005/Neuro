-- VIOLET Local PostgreSQL Migration 002: Neuron Schema (17 Tables)
-- Creates the foundational Neuron personal intelligence memory and knowledge tables.

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text CHECK (char_length(display_name) <= 80),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Memories
CREATE TABLE IF NOT EXISTS public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'link', 'audio', 'file', 'image')),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  content text NOT NULL DEFAULT '',
  source_url text CHECK (source_url IS NULL OR char_length(source_url) <= 2048),
  summary text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  processing_status text NOT NULL DEFAULT 'draft' CHECK (processing_status IN ('draft', 'queued', 'processing', 'ready', 'failed')),
  processing_error text,
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  extracted_text text,
  extracted_at timestamptz,
  content_fingerprint text CHECK (content_fingerprint IS NULL OR content_fingerprint ~ '^(file|link):[0-9a-f]{64}$'),
  embedding float8[],
  embedding_model text,
  embedded_at timestamptz,
  search_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(extracted_text, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'C')
  ) STORED,
  is_favorite boolean NOT NULL DEFAULT false,
  graph_analyzed_at timestamptz,
  study_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Processing Jobs
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('extract', 'ocr', 'transcribe', 'fetch_url', 'enrich', 'embed', 'summarize', 'graph', 'study', 'pipeline')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_message text,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, job_type)
);

-- 4. Entities
CREATE TABLE IF NOT EXISTS public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  normalized_name text NOT NULL CHECK (char_length(btrim(normalized_name)) BETWEEN 1 AND 120),
  entity_type text NOT NULL CHECK (entity_type IN ('person', 'organization', 'project', 'topic', 'location', 'concept')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, normalized_name)
);

-- 5. Memory Entities
CREATE TABLE IF NOT EXISTS public.memory_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relevance real NOT NULL DEFAULT 0.5 CHECK (relevance BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, entity_id)
);

-- 6. Entity Relationships
CREATE TABLE IF NOT EXISTS public.entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (char_length(btrim(relationship_type)) BETWEEN 1 AND 64),
  memory_id uuid REFERENCES public.memories(id) ON DELETE CASCADE,
  confidence real NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_entity_id <> target_entity_id),
  UNIQUE (user_id, source_entity_id, target_entity_id, relationship_type)
);

-- 7. Action Items
CREATE TABLE IF NOT EXISTS public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  normalized_title text NOT NULL CHECK (char_length(btrim(normalized_title)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  item_type text NOT NULL DEFAULT 'task' CHECK (item_type IN ('task', 'reminder')),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'completed', 'dismissed')),
  due_at timestamptz,
  confidence real NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
  evidence text NOT NULL DEFAULT '' CHECK (char_length(evidence) <= 300),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, normalized_title)
);

-- 8. Collections
CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 400),
  icon text CHECK (icon IS NULL OR char_length(btrim(icon)) BETWEEN 1 AND 32),
  color text CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 9. Collection Memories
CREATE TABLE IF NOT EXISTS public.collection_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, memory_id)
);

-- 10. Study Cards
CREATE TABLE IF NOT EXISTS public.study_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 280),
  normalized_prompt text NOT NULL CHECK (char_length(btrim(normalized_prompt)) BETWEEN 1 AND 280),
  response text NOT NULL CHECK (char_length(btrim(response)) BETWEEN 1 AND 1000),
  explanation text NOT NULL DEFAULT '' CHECK (char_length(explanation) <= 600),
  card_type text NOT NULL DEFAULT 'flashcard' CHECK (card_type IN ('flashcard', 'qa', 'concept')),
  confidence real NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
  difficulty real NOT NULL DEFAULT 0.3 CHECK (difficulty BETWEEN 0 AND 1),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  repetition_count integer NOT NULL DEFAULT 0 CHECK (repetition_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, normalized_prompt)
);

-- 11. Sidekick Sessions
CREATE TABLE IF NOT EXISTS public.sidekick_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Session' CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  context_summary text NOT NULL DEFAULT '' CHECK (char_length(context_summary) <= 2000),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Sidekick Notes
CREATE TABLE IF NOT EXISTS public.sidekick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sidekick_sessions(id) ON DELETE CASCADE,
  memory_id uuid REFERENCES public.memories(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Local File Sync
CREATE TABLE IF NOT EXISTS public.local_file_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  content_hash text NOT NULL,
  storage_path text,
  extracted_text text,
  summary text,
  tags text[] NOT NULL DEFAULT '{}',
  storage_mode text NOT NULL DEFAULT 'hybrid' CHECK (storage_mode IN ('local', 'cloud', 'hybrid')),
  folder_id text NOT NULL,
  modified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_id)
);

-- 14. Integration Connections
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connecting','connected','error','expired','syncing')),
  display_name text NOT NULL DEFAULT '',
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  last_sync_stats jsonb,
  sync_cursor text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id)
);

-- 15. Knowledge Items
CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  source_provider text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}',
  url text,
  local_path text,
  content_hash text NOT NULL DEFAULT '',
  storage_mode text NOT NULL DEFAULT 'cloud' CHECK (storage_mode IN ('local', 'cloud', 'hybrid')),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error')),
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(snippet, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,
  UNIQUE (user_id, source_provider, source_id)
);

-- 16. Audit Log Entries
CREATE TABLE IF NOT EXISTS public.audit_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('search','sync','connect','disconnect','ai_access','export','delete')),
  actor text NOT NULL,
  query text,
  provider_ids text[],
  item_count integer,
  summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 17. AI Connections
CREATE TABLE IF NOT EXISTS public.ai_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'api_key' CHECK (type IN ('mcp', 'api_key', 'oauth')),
  api_key_hash text,
  capabilities jsonb NOT NULL DEFAULT '[]',
  allowed_provider_ids text[] NOT NULL DEFAULT '{}',
  allow_local_files boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for Neuron Schema
CREATE INDEX IF NOT EXISTS memories_user_created_at_idx ON public.memories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_tags_idx ON public.memories USING gin (tags);
CREATE INDEX IF NOT EXISTS memories_search_document_idx ON public.memories USING gin (search_document);
CREATE UNIQUE INDEX IF NOT EXISTS memories_user_content_fingerprint_uidx ON public.memories (user_id, content_fingerprint) WHERE content_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_user_graph_backfill_idx ON public.memories (user_id, created_at DESC) WHERE graph_analyzed_at IS NULL AND processing_status = 'ready';
CREATE INDEX IF NOT EXISTS memories_user_study_backfill_idx ON public.memories (user_id, created_at DESC) WHERE study_analyzed_at IS NULL AND processing_status = 'ready';

CREATE INDEX IF NOT EXISTS processing_jobs_queue_idx ON public.processing_jobs (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS processing_jobs_user_memory_idx ON public.processing_jobs (user_id, memory_id);

CREATE INDEX IF NOT EXISTS entities_user_type_idx ON public.entities (user_id, entity_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS memory_entities_user_entity_idx ON public.memory_entities (user_id, entity_id);
CREATE INDEX IF NOT EXISTS entity_relationships_user_source_idx ON public.entity_relationships (user_id, source_entity_id);
CREATE INDEX IF NOT EXISTS entity_relationships_user_target_idx ON public.entity_relationships (user_id, target_entity_id);

CREATE INDEX IF NOT EXISTS collections_user_updated_idx ON public.collections (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS collection_memories_user_memory_idx ON public.collection_memories (user_id, memory_id);

CREATE INDEX IF NOT EXISTS action_items_user_due_idx ON public.action_items (user_id, status, due_at);
CREATE INDEX IF NOT EXISTS study_cards_user_review_idx ON public.study_cards (user_id, next_review_at);

CREATE INDEX IF NOT EXISTS sidekick_sessions_user_status_idx ON public.sidekick_sessions (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS sidekick_notes_session_idx ON public.sidekick_notes (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS local_file_sync_user_idx ON public.local_file_sync (user_id);
CREATE INDEX IF NOT EXISTS local_file_sync_folder_idx ON public.local_file_sync (user_id, folder_id);
CREATE INDEX IF NOT EXISTS local_file_sync_hash_idx ON public.local_file_sync (user_id, content_hash);
CREATE INDEX IF NOT EXISTS local_file_sync_fts_idx ON public.local_file_sync USING gin (to_tsvector('english', coalesce(extracted_text, '') || ' ' || coalesce(summary, '') || ' ' || file_name));

CREATE INDEX IF NOT EXISTS integration_connections_user_idx ON public.integration_connections (user_id);
CREATE INDEX IF NOT EXISTS integration_connections_status_idx ON public.integration_connections (user_id, status);

CREATE INDEX IF NOT EXISTS knowledge_items_user_idx ON public.knowledge_items (user_id);
CREATE INDEX IF NOT EXISTS knowledge_items_provider_idx ON public.knowledge_items (user_id, source_provider);
CREATE INDEX IF NOT EXISTS knowledge_items_fts_idx ON public.knowledge_items USING gin (search_document);
CREATE INDEX IF NOT EXISTS knowledge_items_hash_idx ON public.knowledge_items (user_id, content_hash);

CREATE INDEX IF NOT EXISTS audit_log_entries_user_idx ON public.audit_log_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entries_type_idx ON public.audit_log_entries (user_id, event_type);

CREATE INDEX IF NOT EXISTS ai_connections_user_idx ON public.ai_connections (user_id);
