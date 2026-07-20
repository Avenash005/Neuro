-- Source-backed task and reminder suggestions requiring explicit user confirmation.
create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  normalized_title text not null check (char_length(btrim(normalized_title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 600),
  item_type text not null default 'task' check (item_type in ('task', 'reminder')),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'completed', 'dismissed')),
  due_at timestamptz,
  confidence real not null default 0.7 check (confidence between 0 and 1),
  evidence text not null default '' check (char_length(evidence) <= 300),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memory_id, normalized_title)
);

create index if not exists action_items_user_status_idx on public.action_items (user_id, status, due_at, created_at desc);
alter table public.action_items enable row level security;

drop policy if exists "Users can read their own action items" on public.action_items;
create policy "Users can read their own action items" on public.action_items
for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists action_items_set_updated_at on public.action_items;
create trigger action_items_set_updated_at before update on public.action_items
for each row execute function public.set_updated_at();

create or replace function public.replace_memory_action_items(
  target_job_id uuid,
  result_action_items jsonb default '[]'::jsonb
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

  delete from public.action_items item
  where item.memory_id = target_memory and item.user_id = target_user and item.status = 'suggested'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(result_action_items, '[]'::jsonb)) candidate
      where left(lower(regexp_replace(btrim(candidate ->> 'title'), '\s+', ' ', 'g')), 180) = item.normalized_title
    );

  with parsed as (
    select
      left(btrim(value ->> 'title'), 180) as title,
      left(lower(regexp_replace(btrim(value ->> 'title'), '\s+', ' ', 'g')), 180) as normalized_title,
      left(coalesce(value ->> 'description', ''), 600) as description,
      lower(coalesce(value ->> 'type', 'task')) as item_type,
      case when nullif(value ->> 'due_at', '') is null then null else (value ->> 'due_at')::timestamptz end as due_at,
      greatest(0, least(1, coalesce((value ->> 'confidence')::real, 0.7))) as confidence,
      left(coalesce(value ->> 'evidence', ''), 300) as evidence
    from jsonb_array_elements(coalesce(result_action_items, '[]'::jsonb))
    where jsonb_typeof(value) = 'object'
  )
  insert into public.action_items (
    user_id, memory_id, title, normalized_title, description, item_type, due_at, confidence, evidence
  )
  select target_user, target_memory, title, normalized_title, description, item_type, due_at, confidence, evidence
  from parsed where title <> '' and item_type in ('task', 'reminder')
  on conflict (memory_id, normalized_title)
  do update set title = excluded.title, description = excluded.description,
    item_type = excluded.item_type, due_at = excluded.due_at,
    confidence = excluded.confidence, evidence = excluded.evidence, updated_at = now()
  where action_items.status = 'suggested';
end;
$$;

create or replace function public.update_action_item_status(
  target_action_item_id uuid,
  next_status text
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.action_items;
  updated_item public.action_items;
begin
  select * into current_item from public.action_items
  where id = target_action_item_id and user_id = (select auth.uid())
  for update;
  if current_item.id is null then raise exception 'Action item not found'; end if;

  if not (
    (current_item.status = 'suggested' and next_status in ('accepted', 'dismissed'))
    or (current_item.status = 'accepted' and next_status = 'completed')
    or (current_item.status = 'completed' and next_status = 'accepted')
  ) then raise exception 'Invalid action item status transition';
  end if;

  update public.action_items
  set status = next_status,
    completed_at = case when next_status = 'completed' then now() else null end,
    updated_at = now()
  where id = current_item.id
  returning * into updated_item;
  return updated_item;
end;
$$;

revoke all on function public.replace_memory_action_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_memory_action_items(uuid, jsonb) to service_role;
revoke all on function public.update_action_item_status(uuid, text) from public, anon;
grant execute on function public.update_action_item_status(uuid, text) to authenticated;
grant select on public.action_items to authenticated;
