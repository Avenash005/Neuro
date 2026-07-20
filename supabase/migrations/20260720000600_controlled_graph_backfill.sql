-- Cost-controlled, user-requested entity extraction for existing memories.
alter table public.memories
  add column if not exists graph_analyzed_at timestamptz;

create index if not exists memories_user_graph_backfill_idx
  on public.memories (user_id, created_at desc)
  where graph_analyzed_at is null and processing_status = 'ready';

create or replace function public.request_memory_reanalysis(target_memory_ids uuid[])
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
      and memory.graph_analyzed_at is null
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

revoke all on function public.request_memory_reanalysis(uuid[]) from public, anon;
grant execute on function public.request_memory_reanalysis(uuid[]) to authenticated;

create or replace function public.replace_memory_graph(
  target_job_id uuid,
  result_entities jsonb default '[]'::jsonb,
  result_relationships jsonb default '[]'::jsonb
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

  delete from public.entity_relationships where memory_id = target_memory and user_id = target_user;
  delete from public.memory_entities where memory_id = target_memory and user_id = target_user;

  with parsed as (
    select left(btrim(value ->> 'key'), 80) as entity_key,
      left(btrim(value ->> 'name'), 160) as display_name,
      left(lower(regexp_replace(btrim(value ->> 'name'), '\s+', ' ', 'g')), 160) as normalized_name,
      lower(value ->> 'type') as entity_type
    from jsonb_array_elements(coalesce(result_entities, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.entities (user_id, display_name, normalized_name, entity_type)
  select distinct target_user, display_name, normalized_name, entity_type from parsed
  where entity_key <> '' and display_name <> ''
    and entity_type in ('person', 'organization', 'technology', 'date', 'url', 'place', 'concept')
  on conflict (user_id, entity_type, normalized_name)
  do update set display_name = excluded.display_name, updated_at = now();

  with parsed as (
    select left(btrim(value ->> 'name'), 160) as display_name,
      left(lower(regexp_replace(btrim(value ->> 'name'), '\s+', ' ', 'g')), 160) as normalized_name,
      lower(value ->> 'type') as entity_type,
      greatest(0, least(1, coalesce((value ->> 'confidence')::real, 0.7))) as confidence,
      left(coalesce(value ->> 'evidence', ''), 300) as evidence
    from jsonb_array_elements(coalesce(result_entities, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.memory_entities (memory_id, entity_id, user_id, confidence, evidence)
  select target_memory, entity.id, target_user, parsed.confidence, parsed.evidence
  from parsed join public.entities entity
    on entity.user_id = target_user and entity.entity_type = parsed.entity_type
    and entity.normalized_name = parsed.normalized_name
  where parsed.display_name <> ''
  on conflict (memory_id, entity_id)
  do update set confidence = excluded.confidence, evidence = excluded.evidence;

  with entity_input as (
    select left(btrim(value ->> 'key'), 80) as entity_key,
      left(lower(regexp_replace(btrim(value ->> 'name'), '\s+', ' ', 'g')), 160) as normalized_name,
      lower(value ->> 'type') as entity_type
    from jsonb_array_elements(coalesce(result_entities, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  ), relationship_input as (
    select left(btrim(value ->> 'source'), 80) as source_key,
      left(btrim(value ->> 'target'), 80) as target_key,
      left(lower(regexp_replace(btrim(value ->> 'type'), '\s+', '_', 'g')), 80) as relationship_type,
      greatest(0, least(1, coalesce((value ->> 'confidence')::real, 0.7))) as confidence,
      left(coalesce(value ->> 'evidence', ''), 300) as evidence
    from jsonb_array_elements(coalesce(result_relationships, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.entity_relationships (user_id, memory_id, source_entity_id, target_entity_id, relationship_type, confidence, evidence)
  select target_user, target_memory, source_entity.id, target_entity.id,
    relationship.relationship_type, relationship.confidence, relationship.evidence
  from relationship_input relationship
  join entity_input source_input on source_input.entity_key = relationship.source_key
  join entity_input target_input on target_input.entity_key = relationship.target_key
  join public.entities source_entity on source_entity.user_id = target_user
    and source_entity.entity_type = source_input.entity_type and source_entity.normalized_name = source_input.normalized_name
  join public.entities target_entity on target_entity.user_id = target_user
    and target_entity.entity_type = target_input.entity_type and target_entity.normalized_name = target_input.normalized_name
  where relationship.relationship_type <> '' and source_entity.id <> target_entity.id
  on conflict (memory_id, source_entity_id, target_entity_id, relationship_type)
  do update set confidence = excluded.confidence, evidence = excluded.evidence;

  update public.memories set graph_analyzed_at = now() where id = target_memory and user_id = target_user;
  delete from public.entities entity where entity.user_id = target_user
    and not exists (select 1 from public.memory_entities link where link.entity_id = entity.id)
    and not exists (select 1 from public.entity_relationships relation where relation.source_entity_id = entity.id or relation.target_entity_id = entity.id);
end;
$$;

revoke all on function public.replace_memory_graph(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_memory_graph(uuid, jsonb, jsonb) to service_role;
