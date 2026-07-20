-- Phase 2C: private full-text and semantic retrieval.
create extension if not exists vector with schema extensions;

alter table public.memories
  add column if not exists embedding extensions.vector(1024),
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz;

alter table public.memories
  add column if not exists search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(extracted_text, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'C')
  ) stored;

create index if not exists memories_search_document_idx
  on public.memories using gin (search_document);

create index if not exists memories_embedding_hnsw_idx
  on public.memories using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.store_memory_embedding(
  target_memory_id uuid,
  target_user_id uuid,
  embedding_input text,
  embedding_model_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  parsed_embedding extensions.vector(1024);
begin
  parsed_embedding := embedding_input::extensions.vector(1024);

  update public.memories
  set embedding = parsed_embedding,
      embedding_model = left(embedding_model_name, 160),
      embedded_at = now()
  where id = target_memory_id and user_id = target_user_id;

  if not found then
    raise exception 'Memory not found';
  end if;
end;
$$;

create or replace function public.complete_embedding_job(
  target_job_id uuid,
  embedding_input text,
  embedding_model_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_memory uuid;
  target_user uuid;
begin
  select memory_id, user_id into target_memory, target_user
  from public.processing_jobs
  where id = target_job_id and status = 'running' and job_type = 'embed'
  for update;

  if target_memory is null then
    raise exception 'Running embedding job not found';
  end if;

  update public.memories
  set embedding = embedding_input::extensions.vector(1024),
      embedding_model = left(embedding_model_name, 160),
      embedded_at = now()
  where id = target_memory and user_id = target_user;

  update public.processing_jobs
  set status = 'completed', error_message = null, locked_at = null, updated_at = now()
  where id = target_job_id;
end;
$$;

create or replace function public.hybrid_search_memories(
  target_user_id uuid,
  query_text text,
  query_embedding_text text default null,
  match_count integer default 12,
  kind_filter text default null
)
returns table (
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
language sql
stable
security definer
set search_path = ''
as $$
  with parameters as (
    select
      websearch_to_tsquery('simple', left(coalesce(query_text, ''), 500)) as text_query,
      case
        when nullif(btrim(query_embedding_text), '') is null then null
        else query_embedding_text::extensions.vector(1024)
      end as query_vector,
      greatest(1, least(coalesce(match_count, 12), 50)) as result_limit
  ),
  keyword_candidates as (
    select memory.id, ts_rank_cd(memory.search_document, parameters.text_query) as relevance
    from public.memories as memory
    cross join parameters
    where memory.user_id = target_user_id
      and (kind_filter is null or memory.kind = lower(kind_filter))
      and nullif(btrim(query_text), '') is not null
      and memory.search_document @@ parameters.text_query
    order by relevance desc, memory.created_at desc
    limit 50
  ),
  keyword_matches as (
    select keyword_candidates.id,
      row_number() over (order by keyword_candidates.relevance desc) as rank
    from keyword_candidates
  ),
  semantic_candidates as (
    select memory.id, memory.embedding operator(extensions.<=>) parameters.query_vector as distance
    from public.memories as memory
    cross join parameters
    where memory.user_id = target_user_id
      and (kind_filter is null or memory.kind = lower(kind_filter))
      and parameters.query_vector is not null
      and memory.embedding is not null
    order by distance asc
    limit 50
  ),
  semantic_matches as (
    select semantic_candidates.id,
      row_number() over (order by semantic_candidates.distance asc) as rank
    from semantic_candidates
  ),
  combined as (
    select keyword_matches.id from keyword_matches
    union
    select semantic_matches.id from semantic_matches
  )
  select
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
    )::double precision as search_score,
    keyword_matches.rank as keyword_rank,
    semantic_matches.rank as semantic_rank
  from combined
  join public.memories as memory on memory.id = combined.id
  left join keyword_matches on keyword_matches.id = combined.id
  left join semantic_matches on semantic_matches.id = combined.id
  cross join parameters
  order by search_score desc, memory.created_at desc
  limit (select result_limit from parameters);
$$;

-- Notes previously had no ingestion job. New notes are enriched automatically.
create or replace function public.enqueue_memory_processing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  next_job_type text;
begin
  next_job_type := case
    when new.kind = 'upload' and new.mime_type like 'image/%' then 'ocr'
    when new.kind = 'upload' and new.mime_type like 'audio/%' then 'transcribe'
    when new.kind = 'upload' then 'extract'
    when new.kind = 'link' then 'fetch_url'
    when new.kind = 'voice' then 'transcribe'
    else 'enrich'
  end;

  insert into public.processing_jobs (user_id, memory_id, job_type)
  values (new.user_id, new.id, next_job_type)
  on conflict (memory_id, job_type) do nothing;
  return new;
end;
$$;

insert into public.processing_jobs (user_id, memory_id, job_type)
select memory.user_id, memory.id, 'enrich'
from public.memories as memory
where memory.kind = 'note'
  and memory.extracted_at is null
on conflict (memory_id, job_type) do nothing;

insert into public.processing_jobs (user_id, memory_id, job_type)
select memory.user_id, memory.id, 'embed'
from public.memories as memory
where memory.processing_status = 'ready'
  and memory.embedding is null
  and nullif(btrim(coalesce(memory.extracted_text, memory.content)), '') is not null
on conflict (memory_id, job_type) do nothing;

revoke all on function public.store_memory_embedding(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_embedding_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.hybrid_search_memories(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.store_memory_embedding(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_embedding_job(uuid, text, text) to service_role;
grant execute on function public.hybrid_search_memories(uuid, text, text, integer, text) to service_role;
