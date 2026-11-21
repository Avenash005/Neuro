-- VIOLET Lab — Phase 3F Live Operations & Observability Center Schema
-- Extends agent runs, tasks, and events with heartbeat, stale worker detection, and owner control state.

-- 1. Extend agent_tasks table with pause, retry, and approval tracking
alter table if exists public.agent_tasks
  add column if not exists is_paused boolean not null default false,
  add column if not exists paused_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists integration_approved boolean default null,
  add column if not exists integration_approved_at timestamptz,
  add column if not exists integration_commit_sha text;

-- 2. Extend agent_runs table with heartbeat and telemetry tracking
alter table if exists public.agent_runs
  add column if not exists last_heartbeat timestamptz default now(),
  add column if not exists is_paused boolean not null default false,
  add column if not exists telemetry_metrics jsonb not null default '{}'::jsonb;

-- 3. Create agent_tool_executions table for deep tool observability
create table if not exists public.agent_tool_executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null check (agent_role in ('orchestrator', 'architect', 'developer', 'reviewer')),
  tool_name text not null,
  input_params jsonb not null default '{}'::jsonb,
  output_summary text,
  is_success boolean not null default true,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists agent_tool_exec_task_idx on public.agent_tool_executions (task_id, created_at desc);
create index if not exists agent_tool_exec_agent_idx on public.agent_tool_executions (agent_role, tool_name);
alter table public.agent_tool_executions enable row level security;

drop policy if exists "Users can read own tool executions" on public.agent_tool_executions;
create policy "Users can read own tool executions"
  on public.agent_tool_executions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own tool executions" on public.agent_tool_executions;
create policy "Users can insert own tool executions"
  on public.agent_tool_executions for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.agent_tool_executions to authenticated;
