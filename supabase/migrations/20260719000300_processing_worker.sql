alter table public.memories add column if not exists extracted_text text;
alter table public.memories add column if not exists extracted_at timestamptz;

create or replace function public.claim_processing_jobs(
  batch_limit integer default 1,
  target_memory_id uuid default null,
  target_user_id uuid default null
)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select jobs.id
    from public.processing_jobs as jobs
    where jobs.status = 'queued'
      and jobs.available_at <= now()
      and (target_memory_id is null or jobs.memory_id = target_memory_id)
      and (target_user_id is null or jobs.user_id = target_user_id)
    order by jobs.available_at, jobs.created_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_limit, 1), 5))
  )
  update public.processing_jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = now(),
      error_message = null
  from claimable
  where jobs.id = claimable.id
  returning jobs.*;
end;
$$;

create or replace function public.complete_processing_job(
  target_job_id uuid,
  result_text text,
  result_summary text,
  result_tags text[],
  result_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_memory uuid;
begin
  select memory_id into target_memory
  from public.processing_jobs
  where id = target_job_id and status = 'running'
  for update;

  if target_memory is null then
    raise exception 'Running processing job not found';
  end if;

  update public.memories
  set extracted_text = nullif(result_text, ''),
      summary = nullif(result_summary, ''),
      tags = coalesce(result_tags, '{}'),
      metadata = metadata || coalesce(result_metadata, '{}'::jsonb),
      processing_status = 'ready',
      extracted_at = now()
  where id = target_memory;

  update public.processing_jobs
  set status = 'completed',
      error_message = null,
      locked_at = null,
      updated_at = now()
  where id = target_job_id;
end;
$$;

create or replace function public.fail_processing_job(
  target_job_id uuid,
  failure_message text,
  terminal boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_attempts integer;
  target_memory uuid;
  final_failure boolean;
begin
  select attempts, memory_id into job_attempts, target_memory
  from public.processing_jobs
  where id = target_job_id and status = 'running'
  for update;

  if target_memory is null then
    raise exception 'Running processing job not found';
  end if;

  final_failure := terminal or job_attempts >= 3;

  update public.processing_jobs
  set status = case when final_failure then 'failed' else 'queued' end,
      error_message = left(coalesce(failure_message, 'Processing failed'), 1000),
      available_at = case
        when final_failure then available_at
        else now() + make_interval(secs => least(300, power(2, job_attempts)::integer * 15))
      end,
      locked_at = null,
      updated_at = now()
  where id = target_job_id;

  update public.memories
  set processing_status = case when final_failure then 'failed' else 'pending' end
  where id = target_memory;
end;
$$;

revoke all on function public.claim_processing_jobs(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_processing_job(uuid, text, text, text[], jsonb) from public, anon, authenticated;
revoke all on function public.fail_processing_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_processing_jobs(integer, uuid, uuid) to service_role;
grant execute on function public.complete_processing_job(uuid, text, text, text[], jsonb) to service_role;
grant execute on function public.fail_processing_job(uuid, text, boolean) to service_role;

-- Recover jobs left running by a terminated Edge Function.
create or replace function public.recover_stale_processing_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare recovered integer;
begin
  with recovered_jobs as (
    update public.processing_jobs
    set status = 'queued', locked_at = null, available_at = now(),
        error_message = 'Worker timed out; queued for retry', updated_at = now()
    where status = 'running' and locked_at < now() - interval '5 minutes'
    returning id
  )
  select count(*) into recovered from recovered_jobs;
  return recovered;
end;
$$;

revoke all on function public.recover_stale_processing_jobs() from public, anon, authenticated;
grant execute on function public.recover_stale_processing_jobs() to service_role;
