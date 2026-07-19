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
values (
  'memory-files',
  'memory-files',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own memory files" on storage.objects;
create policy "Users can upload their own memory files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'memory-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can read their own memory files" on storage.objects;
create policy "Users can read their own memory files" on storage.objects
for select to authenticated using (
  bucket_id = 'memory-files'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "Users can delete their own memory files" on storage.objects;
create policy "Users can delete their own memory files" on storage.objects
for delete to authenticated using (
  bucket_id = 'memory-files'
  and owner_id = (select auth.uid()::text)
);

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
    select 1 from public.memories
    where id = target_memory_id and user_id = (select auth.uid())
  ) then
    raise exception 'Memory not found';
  end if;

  update public.processing_jobs
  set status = 'queued', error_message = null, available_at = now(), locked_at = null
  where memory_id = target_memory_id and user_id = (select auth.uid());

  update public.memories
  set processing_status = 'pending'
  where id = target_memory_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.request_processing_retry(uuid) from public;
grant execute on function public.request_processing_retry(uuid) to authenticated;
