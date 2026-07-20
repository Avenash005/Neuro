-- Run this file in the Supabase SQL Editor for project wanonpqnfdhyvyjfrtrf.
create extension if not exists pgcrypto;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  content text not null default '',
  kind text not null default 'note' check (kind in ('note', 'upload', 'link', 'voice')),
  source_url text,
  summary text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}',
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  content_fingerprint text check (content_fingerprint is null or content_fingerprint ~ '^(file|link):[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;

insert into public.profiles (id, display_name, avatar_url)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email, ''), '@', 1), 'Neuron user'),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

create index if not exists memories_user_created_at_idx on public.memories (user_id, created_at desc);
create index if not exists memories_tags_idx on public.memories using gin (tags);

alter table public.memories enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Users can read their own memories" on public.memories;
create policy "Users can read their own memories" on public.memories for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own memories" on public.memories;
create policy "Users can create their own memories" on public.memories for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own memories" on public.memories;
create policy "Users can update their own memories" on public.memories for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own memories" on public.memories;
create policy "Users can delete their own memories" on public.memories for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'Neuron user'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at before update on public.memories
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Phase 2B: private universal capture and processing queue.
alter table public.memories add column if not exists content_fingerprint text
check (content_fingerprint is null or content_fingerprint ~ '^(file|link):[0-9a-f]{64}$');
create unique index if not exists memories_user_content_fingerprint_uidx
on public.memories (user_id, content_fingerprint)
where content_fingerprint is not null;
alter table public.memories add column if not exists storage_bucket text;
alter table public.memories add column if not exists storage_path text;
alter table public.memories add column if not exists original_filename text;
alter table public.memories add column if not exists mime_type text;
alter table public.memories add column if not exists file_size bigint check (file_size is null or file_size >= 0);

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  job_type text not null check (job_type in ('extract', 'ocr', 'transcribe', 'fetch_url', 'enrich', 'embed')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memory_id, job_type)
);

create index if not exists processing_jobs_queue_idx on public.processing_jobs (status, available_at, created_at);
create index if not exists processing_jobs_user_memory_idx on public.processing_jobs (user_id, memory_id);
alter table public.processing_jobs enable row level security;

drop policy if exists "Users can read their own processing jobs" on public.processing_jobs;
create policy "Users can read their own processing jobs" on public.processing_jobs
for select to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-files', 'memory-files', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'
])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own memory files" on storage.objects;
create policy "Users can upload their own memory files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'memory-files' and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can read their own memory files" on storage.objects;
create policy "Users can read their own memory files" on storage.objects
for select to authenticated using (
  bucket_id = 'memory-files' and owner_id = (select auth.uid()::text)
);

drop policy if exists "Users can delete their own memory files" on storage.objects;
create policy "Users can delete their own memory files" on storage.objects
for delete to authenticated using (
  bucket_id = 'memory-files' and owner_id = (select auth.uid()::text)
);

create or replace function public.enqueue_memory_processing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_job_type text;
begin
  next_job_type := case
    when new.kind = 'upload' and new.mime_type like 'image/%' then 'ocr'
    when new.kind = 'upload' and new.mime_type like 'audio/%' then 'transcribe'
    when new.kind = 'upload' then 'extract'
    when new.kind = 'link' then 'fetch_url'
    when new.kind = 'voice' then 'transcribe'
    else null
  end;
  if next_job_type is not null then
    insert into public.processing_jobs (user_id, memory_id, job_type)
    values (new.user_id, new.id, next_job_type)
    on conflict (memory_id, job_type) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists memories_enqueue_processing on public.memories;
create trigger memories_enqueue_processing after insert on public.memories
for each row execute function public.enqueue_memory_processing();

drop trigger if exists processing_jobs_set_updated_at on public.processing_jobs;
create trigger processing_jobs_set_updated_at before update on public.processing_jobs
for each row execute function public.set_updated_at();

create or replace function public.request_processing_retry(target_memory_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.memories where id = target_memory_id and user_id = (select auth.uid())
  ) then raise exception 'Memory not found';
  end if;
  update public.processing_jobs
  set status = 'queued', error_message = null, available_at = now(), locked_at = null
  where memory_id = target_memory_id and user_id = (select auth.uid());
  update public.memories set processing_status = 'pending'
  where id = target_memory_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.request_processing_retry(uuid) from public;
grant execute on function public.request_processing_retry(uuid) to authenticated;

-- Phase 2B worker schema. The versioned migration is the canonical deployment source.
alter table public.memories add column if not exists extracted_text text;
alter table public.memories add column if not exists extracted_at timestamptz;

create or replace function public.claim_processing_jobs(batch_limit integer default 1, target_memory_id uuid default null, target_user_id uuid default null)
returns setof public.processing_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query with claimable as (
    select jobs.id from public.processing_jobs as jobs
    where jobs.status = 'queued' and jobs.available_at <= now()
      and (target_memory_id is null or jobs.memory_id = target_memory_id)
      and (target_user_id is null or jobs.user_id = target_user_id)
    order by jobs.available_at, jobs.created_at for update skip locked
    limit greatest(1, least(coalesce(batch_limit, 1), 5))
  )
  update public.processing_jobs as jobs
  set status = 'running', attempts = jobs.attempts + 1, locked_at = now(), error_message = null
  from claimable where jobs.id = claimable.id returning jobs.*;
end;
$$;

create or replace function public.complete_processing_job(target_job_id uuid, result_text text, result_summary text, result_tags text[], result_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare target_memory uuid;
begin
  select memory_id into target_memory from public.processing_jobs where id = target_job_id and status = 'running' for update;
  if target_memory is null then raise exception 'Running processing job not found'; end if;
  update public.memories set extracted_text = nullif(result_text, ''), summary = nullif(result_summary, ''),
    tags = coalesce(result_tags, '{}'), metadata = metadata || coalesce(result_metadata, '{}'::jsonb),
    processing_status = 'ready', extracted_at = now() where id = target_memory;
  update public.processing_jobs set status = 'completed', error_message = null, locked_at = null, updated_at = now()
  where id = target_job_id;
end;
$$;

create or replace function public.fail_processing_job(target_job_id uuid, failure_message text, terminal boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare job_attempts integer; target_memory uuid; final_failure boolean;
begin
  select attempts, memory_id into job_attempts, target_memory from public.processing_jobs
  where id = target_job_id and status = 'running' for update;
  if target_memory is null then raise exception 'Running processing job not found'; end if;
  final_failure := terminal or job_attempts >= 3;
  update public.processing_jobs set status = case when final_failure then 'failed' else 'queued' end,
    error_message = left(coalesce(failure_message, 'Processing failed'), 1000),
    available_at = case when final_failure then available_at else now() + make_interval(secs => least(300, power(2, job_attempts)::integer * 15)) end,
    locked_at = null, updated_at = now() where id = target_job_id;
  update public.memories set processing_status = case when final_failure then 'failed' else 'pending' end where id = target_memory;
end;
$$;

revoke all on function public.claim_processing_jobs(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_processing_job(uuid, text, text, text[], jsonb) from public, anon, authenticated;
revoke all on function public.fail_processing_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_processing_jobs(integer, uuid, uuid) to service_role;
grant execute on function public.complete_processing_job(uuid, text, text, text[], jsonb) to service_role;
grant execute on function public.fail_processing_job(uuid, text, boolean) to service_role;

create or replace function public.recover_stale_processing_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
declare recovered integer;
begin
  with recovered_jobs as (
    update public.processing_jobs set status = 'queued', locked_at = null, available_at = now(),
      error_message = 'Worker timed out; queued for retry', updated_at = now()
    where status = 'running' and locked_at < now() - interval '5 minutes' returning id
  ) select count(*) into recovered from recovered_jobs;
  return recovered;
end;
$$;
revoke all on function public.recover_stale_processing_jobs() from public, anon, authenticated;
grant execute on function public.recover_stale_processing_jobs() to service_role;

-- Phase 2C: private full-text and semantic retrieval. Versioned migrations remain
-- the canonical source for changes to an existing database.
create extension if not exists vector with schema extensions;
alter table public.memories add column if not exists embedding extensions.vector(1024);
alter table public.memories add column if not exists embedding_model text;
alter table public.memories add column if not exists embedded_at timestamptz;
alter table public.memories add column if not exists search_document tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(extracted_text, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(content, '')), 'C')
) stored;
create index if not exists memories_search_document_idx on public.memories using gin (search_document);
create index if not exists memories_embedding_hnsw_idx
  on public.memories using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.store_memory_embedding(target_memory_id uuid, target_user_id uuid, embedding_input text, embedding_model_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.memories set embedding = embedding_input::extensions.vector(1024),
    embedding_model = left(embedding_model_name, 160), embedded_at = now()
  where id = target_memory_id and user_id = target_user_id;
  if not found then raise exception 'Memory not found'; end if;
end;
$$;

create or replace function public.complete_embedding_job(target_job_id uuid, embedding_input text, embedding_model_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_memory uuid; target_user uuid;
begin
  select memory_id, user_id into target_memory, target_user from public.processing_jobs
  where id = target_job_id and status = 'running' and job_type = 'embed' for update;
  if target_memory is null then raise exception 'Running embedding job not found'; end if;
  update public.memories set embedding = embedding_input::extensions.vector(1024),
    embedding_model = left(embedding_model_name, 160), embedded_at = now()
  where id = target_memory and user_id = target_user;
  update public.processing_jobs set status = 'completed', error_message = null,
    locked_at = null, updated_at = now() where id = target_job_id;
end;
$$;

create or replace function public.hybrid_search_memories(target_user_id uuid, query_text text,
  query_embedding_text text default null, match_count integer default 12, kind_filter text default null)
returns table (id uuid, title text, content text, kind text, source_url text, summary text,
  extracted_text text, processing_status text, storage_path text, original_filename text,
  mime_type text, file_size bigint, extracted_at timestamptz, created_at timestamptz,
  search_score double precision, keyword_rank bigint, semantic_rank bigint)
language sql stable security definer set search_path = '' as $$
  with parameters as (
    select websearch_to_tsquery('simple', left(coalesce(query_text, ''), 500)) as text_query,
      case when nullif(btrim(query_embedding_text), '') is null then null
        else query_embedding_text::extensions.vector(1024) end as query_vector,
      greatest(1, least(coalesce(match_count, 12), 50)) as result_limit
  ), keyword_candidates as (
    select memory.id, ts_rank_cd(memory.search_document, parameters.text_query) as relevance
    from public.memories memory cross join parameters
    where memory.user_id = target_user_id and (kind_filter is null or memory.kind = lower(kind_filter))
      and nullif(btrim(query_text), '') is not null and memory.search_document @@ parameters.text_query
    order by relevance desc, memory.created_at desc limit 50
  ), keyword_matches as (
    select id, row_number() over (order by relevance desc) as rank from keyword_candidates
  ), semantic_candidates as (
    select memory.id, memory.embedding operator(extensions.<=>) parameters.query_vector as distance
    from public.memories memory cross join parameters
    where memory.user_id = target_user_id and (kind_filter is null or memory.kind = lower(kind_filter))
      and parameters.query_vector is not null and memory.embedding is not null
    order by distance limit 50
  ), semantic_matches as (
    select id, row_number() over (order by distance) as rank from semantic_candidates
  ), combined as (
    select id from keyword_matches union select id from semantic_matches
  )
  select memory.id, memory.title, memory.content, memory.kind, memory.source_url, memory.summary,
    memory.extracted_text, memory.processing_status, memory.storage_path, memory.original_filename,
    memory.mime_type, memory.file_size, memory.extracted_at, memory.created_at,
    (coalesce(0.45 / (60 + keyword_matches.rank), 0) + coalesce(0.55 / (60 + semantic_matches.rank), 0))::double precision,
    keyword_matches.rank, semantic_matches.rank
  from combined join public.memories memory on memory.id = combined.id
  left join keyword_matches on keyword_matches.id = combined.id
  left join semantic_matches on semantic_matches.id = combined.id cross join parameters
  order by 15 desc, memory.created_at desc limit (select result_limit from parameters);
$$;

revoke all on function public.store_memory_embedding(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_embedding_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.hybrid_search_memories(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.store_memory_embedding(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_embedding_job(uuid, text, text) to service_role;
grant execute on function public.hybrid_search_memories(uuid, text, text, integer, text) to service_role;

create or replace function public.enqueue_memory_processing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_job_type text;
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
  values (new.user_id, new.id, next_job_type) on conflict (memory_id, job_type) do nothing;
  return new;
end;
$$;

create or replace function public.fail_processing_job(target_job_id uuid, failure_message text, terminal boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare job_attempts integer; target_memory uuid; target_job_type text; final_failure boolean;
begin
  select attempts, memory_id, job_type into job_attempts, target_memory, target_job_type
  from public.processing_jobs where id = target_job_id and status = 'running' for update;
  if target_memory is null then raise exception 'Running processing job not found'; end if;
  final_failure := terminal or job_attempts >= 3;
  update public.processing_jobs set status = case when final_failure then 'failed' else 'queued' end,
    error_message = left(coalesce(failure_message, 'Processing failed'), 1000),
    available_at = case when final_failure then available_at else now() + make_interval(secs => least(300, power(2, job_attempts)::integer * 15)) end,
    locked_at = null, updated_at = now() where id = target_job_id;
  if target_job_type <> 'embed' then
    update public.memories set processing_status = case when final_failure then 'failed' else 'pending' end
    where id = target_memory;
  end if;
end;
$$;
revoke all on function public.fail_processing_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_processing_job(uuid, text, boolean) to service_role;
