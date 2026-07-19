-- Run this file in the Supabase SQL Editor for project wanonpqnfdhyvyjfrtrf.
create extension if not exists pgcrypto;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  content text not null default '',
  kind text not null default 'note' check (kind in ('note', 'upload', 'link', 'voice')),
  source_url text,
  summary text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}',
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;

insert into public.profiles (id, display_name, avatar_url)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email, ''), '@', 1), 'Neuron user'),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

create index if not exists memories_user_created_at_idx on public.memories (user_id, created_at desc);
create index if not exists memories_tags_idx on public.memories using gin (tags);

alter table public.memories enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Users can read their own memories" on public.memories;
create policy "Users can read their own memories" on public.memories for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own memories" on public.memories;
create policy "Users can create their own memories" on public.memories for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own memories" on public.memories;
create policy "Users can update their own memories" on public.memories for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own memories" on public.memories;
create policy "Users can delete their own memories" on public.memories for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'Neuron user'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at before update on public.memories
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
