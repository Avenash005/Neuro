-- Durable favorites and owner-scoped collections.
alter table public.memories
  add column if not exists is_favorite boolean not null default false;

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  color text not null default '#6657d9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists collections_user_name_uidx
  on public.collections (user_id, lower(btrim(name)));
create index if not exists collections_user_updated_idx
  on public.collections (user_id, updated_at desc);

create table if not exists public.collection_memories (
  collection_id uuid not null references public.collections(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, memory_id)
);

create index if not exists collection_memories_user_memory_idx
  on public.collection_memories (user_id, memory_id);

alter table public.collections enable row level security;
alter table public.collection_memories enable row level security;

drop policy if exists "Users can read their own collections" on public.collections;
create policy "Users can read their own collections" on public.collections
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own collections" on public.collections;
create policy "Users can create their own collections" on public.collections
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own collections" on public.collections;
create policy "Users can update their own collections" on public.collections
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own collections" on public.collections;
create policy "Users can delete their own collections" on public.collections
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own collection memberships" on public.collection_memories;
create policy "Users can read their own collection memberships" on public.collection_memories
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can organize their own memories" on public.collection_memories;
create policy "Users can organize their own memories" on public.collection_memories
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.collections
    where collections.id = collection_id and collections.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.memories
    where memories.id = memory_id and memories.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can remove their own collection memberships" on public.collection_memories;
create policy "Users can remove their own collection memberships" on public.collection_memories
for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at before update on public.collections
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, delete on public.collection_memories to authenticated;
