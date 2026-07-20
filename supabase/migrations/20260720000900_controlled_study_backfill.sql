-- Cost-controlled, user-requested study-card generation for existing memories.
alter table public.memories
  add column if not exists study_analyzed_at timestamptz;

create index if not exists memories_user_study_backfill_idx
  on public.memories (user_id, created_at desc)
  where study_analyzed_at is null and processing_status = 'ready';

create or replace function public.request_study_reanalysis(target_memory_ids uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_memory uuid;
  target_job uuid;
begin
  if coalesce(cardinality(target_memory_ids), 0) < 1 then
    raise exception 'Select at least one memory';
  end if;
  if cardinality(target_memory_ids) > 3 then
    raise exception 'A maximum of 3 memories can be analyzed at once';
  end if;

  for target_memory in select distinct unnest(target_memory_ids)
  loop
    select jobs.id into target_job
    from public.memories memory
    join public.processing_jobs jobs
      on jobs.memory_id = memory.id
      and jobs.user_id = memory.user_id
      and jobs.job_type <> 'embed'
    where memory.id = target_memory
      and memory.user_id = (select auth.uid())
      and memory.processing_status = 'ready'
      and memory.study_analyzed_at is null
      and jobs.status <> 'running'
    order by jobs.created_at
    limit 1
    for update of jobs;

    if target_job is not null then
      update public.processing_jobs
      set status = 'queued', attempts = 0, error_message = null,
        available_at = now(), locked_at = null, updated_at = now()
      where id = target_job;
      update public.memories
      set processing_status = 'pending'
      where id = target_memory and user_id = (select auth.uid());
      return next target_memory;
    end if;
    target_job := null;
  end loop;
end;
$$;

revoke all on function public.request_study_reanalysis(uuid[]) from public, anon;
grant execute on function public.request_study_reanalysis(uuid[]) to authenticated;

create or replace function public.replace_memory_study_cards(
  target_job_id uuid,
  result_study_cards jsonb default '[]'::jsonb
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
  where id = target_job_id and status = 'running'
  for update;
  if target_memory is null then raise exception 'Running processing job not found'; end if;

  delete from public.study_cards card
  where card.memory_id = target_memory and card.user_id = target_user
    and not exists (
      select 1 from jsonb_array_elements(coalesce(result_study_cards, '[]'::jsonb)) candidate
      where left(lower(regexp_replace(btrim(candidate ->> 'question'), '\s+', ' ', 'g')), 300) = card.normalized_question
    );

  with parsed as (
    select
      left(btrim(value ->> 'question'), 300) as question,
      left(lower(regexp_replace(btrim(value ->> 'question'), '\s+', ' ', 'g')), 300) as normalized_question,
      left(btrim(value ->> 'answer'), 1200) as answer,
      array(
        select left(btrim(option_text), 300)
        from jsonb_array_elements_text(coalesce(value -> 'distractors', '[]'::jsonb)) as distractor(option_text)
        where btrim(option_text) <> ''
        limit 4
      ) as distractors,
      greatest(0, least(1, coalesce((value ->> 'confidence')::real, 0.7))) as confidence,
      left(coalesce(value ->> 'evidence', ''), 300) as evidence
    from jsonb_array_elements(coalesce(result_study_cards, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.study_cards (
    user_id, memory_id, question, normalized_question, answer, distractors, confidence, evidence
  )
  select target_user, target_memory, question, normalized_question, answer, distractors, confidence, evidence
  from parsed
  where question <> '' and answer <> ''
  on conflict (memory_id, normalized_question)
  do update set answer = excluded.answer, distractors = excluded.distractors,
    confidence = excluded.confidence, evidence = excluded.evidence, updated_at = now();

  update public.memories set study_analyzed_at = now()
  where id = target_memory and user_id = target_user;
end;
$$;

revoke all on function public.replace_memory_study_cards(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_memory_study_cards(uuid, jsonb) to service_role;
