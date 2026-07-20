-- Private, source-backed flashcards generated during memory processing.
create table if not exists public.study_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 300),
  normalized_question text not null check (char_length(btrim(normalized_question)) between 1 and 300),
  answer text not null check (char_length(btrim(answer)) between 1 and 1200),
  distractors text[] not null default '{}'::text[] check (cardinality(distractors) <= 4),
  confidence real not null default 0.7 check (confidence between 0 and 1),
  evidence text not null default '' check (char_length(evidence) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memory_id, normalized_question)
);

create index if not exists study_cards_user_created_idx on public.study_cards (user_id, created_at desc);
alter table public.study_cards enable row level security;

drop policy if exists "Users can read their own study cards" on public.study_cards;
create policy "Users can read their own study cards" on public.study_cards
for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists study_cards_set_updated_at on public.study_cards;
create trigger study_cards_set_updated_at before update on public.study_cards
for each row execute function public.set_updated_at();

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
end;
$$;

revoke all on function public.replace_memory_study_cards(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_memory_study_cards(uuid, jsonb) to service_role;
grant select on public.study_cards to authenticated;
