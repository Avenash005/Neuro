-- Typed, source-linked knowledge entities derived during memory processing.
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 160),
  entity_type text not null check (entity_type in ('person', 'organization', 'technology', 'date', 'url', 'place', 'concept')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, normalized_name)
);

create table if not exists public.memory_entities (
  memory_id uuid not null references public.memories(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confidence real not null default 0.7 check (confidence between 0 and 1),
  evidence text not null default '' check (char_length(evidence) <= 300),
  created_at timestamptz not null default now(),
  primary key (memory_id, entity_id)
);

create table if not exists public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  source_entity_id uuid not null references public.entities(id) on delete cascade,
  target_entity_id uuid not null references public.entities(id) on delete cascade,
  relationship_type text not null check (char_length(btrim(relationship_type)) between 1 and 80),
  confidence real not null default 0.7 check (confidence between 0 and 1),
  evidence text not null default '' check (char_length(evidence) <= 300),
  created_at timestamptz not null default now(),
  check (source_entity_id <> target_entity_id),
  unique (memory_id, source_entity_id, target_entity_id, relationship_type)
);

create index if not exists entities_user_type_idx on public.entities (user_id, entity_type, updated_at desc);
create index if not exists memory_entities_user_entity_idx on public.memory_entities (user_id, entity_id);
create index if not exists entity_relationships_user_source_idx on public.entity_relationships (user_id, source_entity_id);
create index if not exists entity_relationships_user_target_idx on public.entity_relationships (user_id, target_entity_id);

alter table public.entities enable row level security;
alter table public.memory_entities enable row level security;
alter table public.entity_relationships enable row level security;

drop policy if exists "Users can read their own entities" on public.entities;
create policy "Users can read their own entities" on public.entities
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own memory entities" on public.memory_entities;
create policy "Users can read their own memory entities" on public.memory_entities
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own entity relationships" on public.entity_relationships;
create policy "Users can read their own entity relationships" on public.entity_relationships
for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists entities_set_updated_at on public.entities;
create trigger entities_set_updated_at before update on public.entities
for each row execute function public.set_updated_at();

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

  if target_memory is null then
    raise exception 'Running processing job not found';
  end if;

  delete from public.entity_relationships where memory_id = target_memory and user_id = target_user;
  delete from public.memory_entities where memory_id = target_memory and user_id = target_user;

  with parsed as (
    select
      left(btrim(value ->> 'key'), 80) as entity_key,
      left(btrim(value ->> 'name'), 160) as display_name,
      left(lower(regexp_replace(btrim(value ->> 'name'), '\s+', ' ', 'g')), 160) as normalized_name,
      lower(value ->> 'type') as entity_type
    from jsonb_array_elements(coalesce(result_entities, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.entities (user_id, display_name, normalized_name, entity_type)
  select distinct target_user, display_name, normalized_name, entity_type
  from parsed
  where entity_key <> '' and display_name <> ''
    and entity_type in ('person', 'organization', 'technology', 'date', 'url', 'place', 'concept')
  on conflict (user_id, entity_type, normalized_name)
  do update set display_name = excluded.display_name, updated_at = now();

  with parsed as (
    select
      left(btrim(value ->> 'name'), 160) as display_name,
      left(lower(regexp_replace(btrim(value ->> 'name'), '\s+', ' ', 'g')), 160) as normalized_name,
      lower(value ->> 'type') as entity_type,
      greatest(0, least(1, coalesce((value ->> 'confidence')::real, 0.7))) as confidence,
      left(coalesce(value ->> 'evidence', ''), 300) as evidence
    from jsonb_array_elements(coalesce(result_entities, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.memory_entities (memory_id, entity_id, user_id, confidence, evidence)
  select target_memory, entity.id, target_user, parsed.confidence, parsed.evidence
  from parsed
  join public.entities entity
    on entity.user_id = target_user
    and entity.entity_type = parsed.entity_type
    and entity.normalized_name = parsed.normalized_name
  where parsed.display_name <> ''
  on conflict (memory_id, entity_id)
  do update set confidence = excluded.confidence, evidence = excluded.evidence;

  with entity_input as (
    select
      left(btrim(value ->> 'key'), 80) as entity_key,
      left(lower(regexp_replace(btrim(value ->> 'name'), '\s+', ' ', 'g')), 160) as normalized_name,
      lower(value ->> 'type') as entity_type
    from jsonb_array_elements(coalesce(result_entities, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  ), relationship_input as (
    select
      left(btrim(value ->> 'source'), 80) as source_key,
      left(btrim(value ->> 'target'), 80) as target_key,
      left(lower(regexp_replace(btrim(value ->> 'type'), '\s+', '_', 'g')), 80) as relationship_type,
      greatest(0, least(1, coalesce((value ->> 'confidence')::real, 0.7))) as confidence,
      left(coalesce(value ->> 'evidence', ''), 300) as evidence
    from jsonb_array_elements(coalesce(result_relationships, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.entity_relationships (
    user_id, memory_id, source_entity_id, target_entity_id, relationship_type, confidence, evidence
  )
  select target_user, target_memory, source_entity.id, target_entity.id,
    relationship.relationship_type, relationship.confidence, relationship.evidence
  from relationship_input relationship
  join entity_input source_input on source_input.entity_key = relationship.source_key
  join entity_input target_input on target_input.entity_key = relationship.target_key
  join public.entities source_entity
    on source_entity.user_id = target_user
    and source_entity.entity_type = source_input.entity_type
    and source_entity.normalized_name = source_input.normalized_name
  join public.entities target_entity
    on target_entity.user_id = target_user
    and target_entity.entity_type = target_input.entity_type
    and target_entity.normalized_name = target_input.normalized_name
  where relationship.relationship_type <> '' and source_entity.id <> target_entity.id
  on conflict (memory_id, source_entity_id, target_entity_id, relationship_type)
  do update set confidence = excluded.confidence, evidence = excluded.evidence;

  delete from public.entities entity
  where entity.user_id = target_user
    and not exists (select 1 from public.memory_entities link where link.entity_id = entity.id)
    and not exists (select 1 from public.entity_relationships relation where relation.source_entity_id = entity.id or relation.target_entity_id = entity.id);
end;
$$;

revoke all on function public.replace_memory_graph(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_memory_graph(uuid, jsonb, jsonb) to service_role;

grant select on public.entities to authenticated;
grant select on public.memory_entities to authenticated;
grant select on public.entity_relationships to authenticated;
