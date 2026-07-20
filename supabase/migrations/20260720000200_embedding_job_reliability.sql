-- Embedding retries are derived-data work and must not hide an otherwise ready memory.
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
  target_job_type text;
  final_failure boolean;
begin
  select attempts, memory_id, job_type into job_attempts, target_memory, target_job_type
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

  if target_job_type <> 'embed' then
    update public.memories
    set processing_status = case when final_failure then 'failed' else 'pending' end
    where id = target_memory;
  end if;
end;
$$;

revoke all on function public.fail_processing_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_processing_job(uuid, text, boolean) to service_role;
