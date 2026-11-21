-- VIOLET Local PostgreSQL Migration 003: Neuron Functions & Triggers
-- Establishes all PL/pgSQL database functions, search helpers, job queue workers, and triggers.

-- 1. Updated At Trigger Helpers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- 2. New User Profile Auto-Creation Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  RETURN new;
END;
$$;

-- 3. Memory Processing Queue Trigger Function
CREATE OR REPLACE FUNCTION public.enqueue_memory_processing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_job_type text;
BEGIN
  next_job_type := CASE
    WHEN new.kind = 'file' AND new.mime_type LIKE 'image/%' THEN 'ocr'
    WHEN new.kind = 'file' AND new.mime_type LIKE 'audio/%' THEN 'transcribe'
    WHEN new.kind = 'file' THEN 'extract'
    WHEN new.kind = 'link' THEN 'fetch_url'
    ELSE 'enrich'
  END;

  INSERT INTO public.processing_jobs (user_id, memory_id, job_type)
  VALUES (new.user_id, new.id, next_job_type)
  ON CONFLICT (memory_id, job_type) DO NOTHING;
  RETURN new;
END;
$$;

-- 4. Processing Job Helpers
CREATE OR REPLACE FUNCTION public.request_processing_retry(
  target_job_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.processing_jobs
  SET status = 'queued',
      available_at = now(),
      locked_at = null,
      error_message = null,
      updated_at = now()
  WHERE id = target_job_id AND user_id = target_user_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_processing_jobs(
  batch_limit integer DEFAULT 1,
  target_memory_id uuid DEFAULT null,
  target_user_id uuid DEFAULT null
)
RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT jobs.id
    FROM public.processing_jobs AS jobs
    WHERE jobs.status = 'queued'
      AND jobs.available_at <= now()
      AND (target_memory_id IS NULL OR jobs.memory_id = target_memory_id)
      AND (target_user_id IS NULL OR jobs.user_id = target_user_id)
    ORDER BY jobs.available_at, jobs.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(batch_limit, 1), 5))
  )
  UPDATE public.processing_jobs AS jobs
  SET status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = now(),
      error_message = null,
      updated_at = now()
  FROM claimable
  WHERE jobs.id = claimable.id
  RETURNING jobs.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_processing_job(
  target_job_id uuid,
  result_text text,
  result_summary text,
  result_tags text[],
  result_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_memory uuid;
BEGIN
  SELECT memory_id INTO target_memory
  FROM public.processing_jobs
  WHERE id = target_job_id AND status = 'running'
  FOR UPDATE;

  IF target_memory IS NULL THEN
    RAISE EXCEPTION 'Running processing job not found';
  END IF;

  UPDATE public.memories
  SET extracted_text = coalesce(result_text, extracted_text),
      summary = CASE WHEN length(btrim(coalesce(result_summary, ''))) > 0 THEN result_summary ELSE summary END,
      tags = array_cat(tags, coalesce(result_tags, '{}'::text[])),
      extracted_at = CASE WHEN result_text IS NOT NULL THEN now() ELSE extracted_at END,
      processing_status = 'ready',
      updated_at = now()
  WHERE id = target_memory;

  UPDATE public.processing_jobs
  SET status = 'completed',
      locked_at = null,
      payload = payload || result_metadata,
      updated_at = now()
  WHERE id = target_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_processing_job(
  target_job_id uuid,
  error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_job public.processing_jobs%ROWTYPE;
BEGIN
  SELECT * INTO current_job
  FROM public.processing_jobs
  WHERE id = target_job_id AND status = 'running'
  FOR UPDATE;

  IF current_job.id IS NULL THEN
    RAISE EXCEPTION 'Running processing job not found';
  END IF;

  IF current_job.attempts >= 3 THEN
    UPDATE public.processing_jobs
    SET status = 'failed',
        locked_at = null,
        error_message = left(fail_processing_job.error_message, 1000),
        updated_at = now()
    WHERE id = target_job_id;

    UPDATE public.memories
    SET processing_status = 'failed',
        processing_error = left(fail_processing_job.error_message, 500),
        updated_at = now()
    WHERE id = current_job.memory_id;
  ELSE
    UPDATE public.processing_jobs
    SET status = 'queued',
        locked_at = null,
        available_at = now() + (interval '1 minute' * power(2, current_job.attempts - 1)),
        error_message = left(fail_processing_job.error_message, 1000),
        updated_at = now()
    WHERE id = target_job_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_processing_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recovered integer;
BEGIN
  WITH recovered_jobs AS (
    UPDATE public.processing_jobs
    SET status = 'queued',
        locked_at = null,
        available_at = now(),
        error_message = 'Worker timed out; queued for retry',
        updated_at = now()
    WHERE status = 'running' AND locked_at < now() - interval '5 minutes'
    RETURNING id
  )
  SELECT count(*) INTO recovered FROM recovered_jobs;
  RETURN recovered;
END;
$$;

-- 5. Memory Embedding Functions
CREATE OR REPLACE FUNCTION public.store_memory_embedding(
  target_memory_id uuid,
  target_user_id uuid,
  embedding_input text,
  embedding_model_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parsed_embedding float8[];
BEGIN
  IF left(btrim(embedding_input), 1) = '[' THEN
    SELECT array_agg(elem::float8) INTO parsed_embedding
    FROM jsonb_array_elements_text(embedding_input::jsonb) AS elem;
  ELSE
    parsed_embedding := embedding_input::float8[];
  END IF;

  UPDATE public.memories
  SET embedding = parsed_embedding,
      embedding_model = left(embedding_model_name, 160),
      embedded_at = now()
  WHERE id = target_memory_id AND user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Memory not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_embedding_job(
  target_job_id uuid,
  embedding_input text,
  embedding_model_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_memory uuid;
  target_user uuid;
BEGIN
  SELECT memory_id, user_id INTO target_memory, target_user
  FROM public.processing_jobs
  WHERE id = target_job_id AND status = 'running'
  FOR UPDATE;

  IF target_memory IS NULL THEN
    RAISE EXCEPTION 'Running processing job not found';
  END IF;

  PERFORM public.store_memory_embedding(
    target_memory,
    target_user,
    embedding_input,
    embedding_model_name
  );

  UPDATE public.processing_jobs
  SET status = 'completed',
      locked_at = null,
      updated_at = now()
  WHERE id = target_job_id;
END;
$$;

-- 6. Hybrid Search Memories
CREATE OR REPLACE FUNCTION public.hybrid_search_memories(
  target_user_id uuid,
  query_text text,
  query_embedding_text text DEFAULT null,
  match_count integer DEFAULT 12,
  kind_filter text DEFAULT null
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  kind text,
  source_url text,
  summary text,
  extracted_text text,
  processing_status text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint,
  extracted_at timestamptz,
  created_at timestamptz,
  search_score double precision,
  keyword_rank bigint,
  semantic_rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH parameters AS (
    SELECT
      websearch_to_tsquery('simple', left(coalesce(query_text, ''), 500)) AS text_query,
      CASE
        WHEN nullif(btrim(query_embedding_text), '') IS NULL THEN NULL
        WHEN left(btrim(query_embedding_text), 1) = '[' THEN
          (SELECT array_agg(elem::float8) FROM jsonb_array_elements_text(query_embedding_text::jsonb) AS elem)
        ELSE query_embedding_text::float8[]
      END AS query_vector,
      greatest(1, least(coalesce(match_count, 12), 50)) AS result_limit
  ),
  keyword_candidates AS (
    SELECT memory.id, ts_rank_cd(memory.search_document, parameters.text_query) AS relevance
    FROM public.memories AS memory
    CROSS JOIN parameters
    WHERE memory.user_id = target_user_id
      AND (kind_filter IS NULL OR memory.kind = lower(kind_filter))
      AND nullif(btrim(query_text), '') IS NOT NULL
      AND memory.search_document @@ parameters.text_query
    ORDER BY relevance DESC, memory.created_at DESC
    LIMIT 50
  ),
  keyword_matches AS (
    SELECT keyword_candidates.id,
      row_number() OVER (ORDER BY keyword_candidates.relevance DESC) AS rank
    FROM keyword_candidates
  ),
  semantic_candidates AS (
    SELECT memory.id, memory.embedding OPERATOR(extensions.<=>) parameters.query_vector AS distance
    FROM public.memories AS memory
    CROSS JOIN parameters
    WHERE memory.user_id = target_user_id
      AND (kind_filter IS NULL OR memory.kind = lower(kind_filter))
      AND parameters.query_vector IS NOT NULL
      AND memory.embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT 50
  ),
  semantic_matches AS (
    SELECT semantic_candidates.id,
      row_number() OVER (ORDER BY semantic_candidates.distance ASC) AS rank
    FROM semantic_candidates
  ),
  combined AS (
    SELECT keyword_matches.id FROM keyword_matches
    UNION
    SELECT semantic_matches.id FROM semantic_matches
  )
  SELECT
    memory.id,
    memory.title,
    memory.content,
    memory.kind,
    memory.source_url,
    memory.summary,
    memory.extracted_text,
    memory.processing_status,
    memory.storage_path,
    memory.original_filename,
    memory.mime_type,
    memory.file_size,
    memory.extracted_at,
    memory.created_at,
    (
      coalesce(0.45 / (60 + keyword_matches.rank), 0) +
      coalesce(0.55 / (60 + semantic_matches.rank), 0)
    )::double precision AS search_score,
    keyword_matches.rank AS keyword_rank,
    semantic_matches.rank AS semantic_rank
  FROM combined
  JOIN public.memories AS memory ON memory.id = combined.id
  LEFT JOIN keyword_matches ON keyword_matches.id = combined.id
  LEFT JOIN semantic_matches ON semantic_matches.id = combined.id
  CROSS JOIN parameters
  ORDER BY search_score DESC, memory.created_at DESC
  LIMIT (SELECT result_limit FROM parameters);
$$;

-- 7. Graph Analysis Helpers
CREATE OR REPLACE FUNCTION public.replace_memory_graph(
  target_job_id uuid,
  result_entities jsonb DEFAULT '[]'::jsonb,
  result_relationships jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_memory uuid;
  target_user uuid;
BEGIN
  SELECT memory_id, user_id INTO target_memory, target_user
  FROM public.processing_jobs
  WHERE id = target_job_id AND status = 'running'
  FOR UPDATE;
  IF target_memory IS NULL THEN RAISE EXCEPTION 'Running processing job not found'; END IF;

  DELETE FROM public.entity_relationships WHERE memory_id = target_memory AND user_id = target_user;
  DELETE FROM public.memory_entities WHERE memory_id = target_memory AND user_id = target_user;

  -- Upsert entities
  INSERT INTO public.entities (user_id, name, normalized_name, entity_type, description)
  SELECT
    target_user,
    btrim(elem->>'name'),
    lower(btrim(elem->>'name')),
    lower(btrim(elem->>'entity_type')),
    coalesce(elem->>'description', '')
  FROM jsonb_array_elements(result_entities) AS elem
  WHERE length(btrim(elem->>'name')) BETWEEN 1 AND 120
    AND lower(btrim(elem->>'entity_type')) IN ('person', 'organization', 'project', 'topic', 'location', 'concept')
  ON CONFLICT (user_id, entity_type, normalized_name) DO UPDATE
  SET description = CASE WHEN length(excluded.description) > 0 THEN excluded.description ELSE public.entities.description END,
      updated_at = now();

  -- Link memory entities
  INSERT INTO public.memory_entities (user_id, memory_id, entity_id, relevance)
  SELECT
    target_user,
    target_memory,
    e.id,
    coalesce((elem->>'relevance')::real, 0.5)
  FROM jsonb_array_elements(result_entities) AS elem
  JOIN public.entities e ON e.user_id = target_user
    AND e.entity_type = lower(btrim(elem->>'entity_type'))
    AND e.normalized_name = lower(btrim(elem->>'name'))
  ON CONFLICT (memory_id, entity_id) DO UPDATE
  SET relevance = excluded.relevance;

  -- Complete job and update memory
  UPDATE public.memories
  SET graph_analyzed_at = now(),
      updated_at = now()
  WHERE id = target_memory;

  UPDATE public.processing_jobs
  SET status = 'completed',
      locked_at = null,
      updated_at = now()
  WHERE id = target_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_memory_reanalysis(
  target_memory_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.processing_jobs (user_id, memory_id, job_type, status, available_at)
  VALUES (target_user_id, target_memory_id, 'graph', 'queued', now())
  ON CONFLICT (memory_id, job_type) DO UPDATE
  SET status = 'queued',
      available_at = now(),
      locked_at = null,
      error_message = null,
      updated_at = now();

  RETURN FOUND;
END;
$$;

-- 8. Action Items Helpers
CREATE OR REPLACE FUNCTION public.replace_memory_action_items(
  target_job_id uuid,
  result_action_items jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_memory uuid;
  target_user uuid;
BEGIN
  SELECT memory_id, user_id INTO target_memory, target_user
  FROM public.processing_jobs
  WHERE id = target_job_id AND status = 'running'
  FOR UPDATE;
  IF target_memory IS NULL THEN RAISE EXCEPTION 'Running processing job not found'; END IF;

  DELETE FROM public.action_items item
  WHERE item.memory_id = target_memory AND item.user_id = target_user AND item.status = 'suggested';

  INSERT INTO public.action_items (user_id, memory_id, title, normalized_title, description, item_type, status, due_at, confidence, evidence)
  SELECT
    target_user,
    target_memory,
    btrim(elem->>'title'),
    lower(btrim(elem->>'title')),
    coalesce(elem->>'description', ''),
    coalesce(elem->>'item_type', 'task'),
    'suggested',
    (elem->>'due_at')::timestamptz,
    coalesce((elem->>'confidence')::real, 0.7),
    coalesce(elem->>'evidence', '')
  FROM jsonb_array_elements(result_action_items) AS elem
  WHERE length(btrim(elem->>'title')) BETWEEN 1 AND 180
  ON CONFLICT (memory_id, normalized_title) DO NOTHING;

  UPDATE public.processing_jobs
  SET status = 'completed',
      locked_at = null,
      updated_at = now()
  WHERE id = target_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_action_item_status(
  target_action_item_id uuid,
  target_user_id uuid,
  target_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.action_items
  SET status = target_status,
      completed_at = CASE WHEN target_status = 'completed' THEN now() ELSE null END,
      updated_at = now()
  WHERE id = target_action_item_id AND user_id = target_user_id;

  RETURN FOUND;
END;
$$;

-- 9. Study Cards Helpers
CREATE OR REPLACE FUNCTION public.replace_memory_study_cards(
  target_job_id uuid,
  result_study_cards jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_memory uuid;
  target_user uuid;
BEGIN
  SELECT memory_id, user_id INTO target_memory, target_user
  FROM public.processing_jobs
  WHERE id = target_job_id AND status = 'running'
  FOR UPDATE;
  IF target_memory IS NULL THEN RAISE EXCEPTION 'Running processing job not found'; END IF;

  DELETE FROM public.study_cards card
  WHERE card.memory_id = target_memory AND card.user_id = target_user
    AND card.repetition_count = 0;

  INSERT INTO public.study_cards (user_id, memory_id, prompt, normalized_prompt, response, explanation, card_type, confidence, difficulty)
  SELECT
    target_user,
    target_memory,
    btrim(elem->>'prompt'),
    lower(btrim(elem->>'prompt')),
    btrim(elem->>'response'),
    coalesce(elem->>'explanation', ''),
    coalesce(elem->>'card_type', 'flashcard'),
    coalesce((elem->>'confidence')::real, 0.7),
    coalesce((elem->>'difficulty')::real, 0.3)
  FROM jsonb_array_elements(result_study_cards) AS elem
  WHERE length(btrim(elem->>'prompt')) BETWEEN 1 AND 280
    AND length(btrim(elem->>'response')) BETWEEN 1 AND 1000
  ON CONFLICT (memory_id, normalized_prompt) DO NOTHING;

  UPDATE public.memories
  SET study_analyzed_at = now(),
      updated_at = now()
  WHERE id = target_memory;

  UPDATE public.processing_jobs
  SET status = 'completed',
      locked_at = null,
      updated_at = now()
  WHERE id = target_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_study_reanalysis(
  target_memory_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.processing_jobs (user_id, memory_id, job_type, status, available_at)
  VALUES (target_user_id, target_memory_id, 'study', 'queued', now())
  ON CONFLICT (memory_id, job_type) DO UPDATE
  SET status = 'queued',
      available_at = now(),
      locked_at = null,
      error_message = null,
      updated_at = now();

  RETURN FOUND;
END;
$$;

-- 10. Search Local Files
CREATE OR REPLACE FUNCTION public.search_local_files(
  target_user_id  uuid,
  query_text      text,
  match_count     int DEFAULT 20,
  folder_filter   text DEFAULT null
)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
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
      to_tsvector('english', coalesce(lfs.file_name, '') || ' ' || coalesce(lfs.summary, '') || ' ' || coalesce(lfs.extracted_text, '')),
      plainto_tsquery('english', query_text)
    )::float AS search_rank
  FROM public.local_file_sync lfs
  WHERE lfs.user_id = target_user_id
    AND (folder_filter IS NULL OR lfs.folder_id = folder_filter)
    AND (
      query_text IS NULL OR query_text = ''
      OR to_tsvector('english', coalesce(lfs.file_name, '') || ' ' || coalesce(lfs.summary, '') || ' ' || coalesce(lfs.extracted_text, ''))
         @@ plainto_tsquery('english', query_text)
    )
  ORDER BY search_rank DESC, lfs.updated_at DESC
  LIMIT match_count;
$$;

-- 11. Search Knowledge Items
CREATE OR REPLACE FUNCTION public.search_knowledge_items(
  target_user_id  uuid,
  query_text      text,
  provider_filter text DEFAULT null,
  match_count     int  DEFAULT 20
)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
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
    ts_rank(
      ki.search_document,
      plainto_tsquery('english', query_text)
    )::float AS search_rank
  FROM public.knowledge_items ki
  WHERE ki.user_id = target_user_id
    AND (provider_filter IS NULL OR ki.source_provider = provider_filter)
    AND (
      query_text IS NULL OR query_text = ''
      OR ki.search_document @@ plainto_tsquery('english', query_text)
    )
  ORDER BY search_rank DESC, ki.updated_at DESC
  LIMIT match_count;
$$;

-- 12. Neuron Triggers
DROP TRIGGER IF EXISTS memories_set_updated_at ON public.memories;
CREATE TRIGGER memories_set_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS memories_enqueue_processing ON public.memories;
CREATE TRIGGER memories_enqueue_processing
  AFTER INSERT ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_memory_processing();

DROP TRIGGER IF EXISTS processing_jobs_set_updated_at ON public.processing_jobs;
CREATE TRIGGER processing_jobs_set_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS collections_set_updated_at ON public.collections;
CREATE TRIGGER collections_set_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS entities_set_updated_at ON public.entities;
CREATE TRIGGER entities_set_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS action_items_set_updated_at ON public.action_items;
CREATE TRIGGER action_items_set_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS study_cards_set_updated_at ON public.study_cards;
CREATE TRIGGER study_cards_set_updated_at
  BEFORE UPDATE ON public.study_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sidekick_sessions_set_updated_at ON public.sidekick_sessions;
CREATE TRIGGER sidekick_sessions_set_updated_at
  BEFORE UPDATE ON public.sidekick_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sidekick_notes_set_updated_at ON public.sidekick_notes;
CREATE TRIGGER sidekick_notes_set_updated_at
  BEFORE UPDATE ON public.sidekick_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS local_file_sync_updated_at ON public.local_file_sync;
CREATE TRIGGER local_file_sync_updated_at
  BEFORE UPDATE ON public.local_file_sync
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS integration_connections_updated_at ON public.integration_connections;
CREATE TRIGGER integration_connections_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS knowledge_items_updated_at ON public.knowledge_items;
CREATE TRIGGER knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS ai_connections_updated_at ON public.ai_connections;
CREATE TRIGGER ai_connections_updated_at
  BEFORE UPDATE ON public.ai_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
