-- Private, owner-scoped saved Sidekick prep sessions and manual meeting notes.
create table if not exists public.sidekick_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('conversation', 'meeting')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  context_label text not null default '' check (char_length(context_label) <= 120),
  goal text not null default '' check (char_length(goal) <= 1000),
  selected_memory_ids uuid[] not null default '{}'::uuid[],
  briefing jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sidekick_sessions_user_updated_idx
  on public.sidekick_sessions (user_id, updated_at desc);

alter table public.sidekick_sessions enable row level security;

drop policy if exists "Users can read their own sidekick sessions" on public.sidekick_sessions;
create policy "Users can read their own sidekick sessions"
  on public.sidekick_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own sidekick sessions" on public.sidekick_sessions;
create policy "Users can create their own sidekick sessions"
  on public.sidekick_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own sidekick sessions" on public.sidekick_sessions;
create policy "Users can update their own sidekick sessions"
  on public.sidekick_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own sidekick sessions" on public.sidekick_sessions;
create policy "Users can delete their own sidekick sessions"
  on public.sidekick_sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists sidekick_sessions_set_updated_at on public.sidekick_sessions;
create trigger sidekick_sessions_set_updated_at before update on public.sidekick_sessions
for each row execute function public.set_updated_at();

create table if not exists public.sidekick_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sidekick_sessions(id) on delete cascade,
  memory_id uuid references public.memories(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sidekick_notes_session_created_idx
  on public.sidekick_notes (session_id, created_at asc);

alter table public.sidekick_notes enable row level security;

drop policy if exists "Users can read their own sidekick notes" on public.sidekick_notes;
create policy "Users can read their own sidekick notes"
  on public.sidekick_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own sidekick notes" on public.sidekick_notes;
create policy "Users can create their own sidekick notes"
  on public.sidekick_notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own sidekick notes" on public.sidekick_notes;
create policy "Users can update their own sidekick notes"
  on public.sidekick_notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own sidekick notes" on public.sidekick_notes;
create policy "Users can delete their own sidekick notes"
  on public.sidekick_notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists sidekick_notes_set_updated_at on public.sidekick_notes;
create trigger sidekick_notes_set_updated_at before update on public.sidekick_notes
for each row execute function public.set_updated_at();
