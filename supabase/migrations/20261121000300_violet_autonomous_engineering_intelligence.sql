-- VIOLET Lab — Phase 3D Autonomous Engineering Intelligence Schema
-- Adds support for agent-to-agent messaging, subtask DAGs, engineering findings, and architectural decision records.

-- 1. agent_messages table (Structured Agent-to-Agent Communication)
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_role text not null check (from_role in ('orchestrator', 'architect', 'developer', 'reviewer')),
  to_role text not null check (to_role in ('orchestrator', 'architect', 'developer', 'reviewer', 'all')),
  message_type text not null check (message_type in (
    'PLAN_PROPOSAL',
    'CHALLENGE_PLAN',
    'PLAN_ACCEPTED',
    'REQUEST_ASSISTANCE',
    'ASSISTANCE_RESPONSE',
    'CODE_QUESTION',
    'REVIEW_FEEDBACK',
    'STATUS_UPDATE'
  )),
  content text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_task_idx on public.agent_messages (task_id, created_at asc);
create index if not exists agent_messages_user_idx on public.agent_messages (user_id);
alter table public.agent_messages enable row level security;

drop policy if exists "Users can read own agent messages" on public.agent_messages;
create policy "Users can read own agent messages"
  on public.agent_messages for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent messages" on public.agent_messages;
create policy "Users can insert own agent messages"
  on public.agent_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.agent_messages to authenticated;

-- 2. agent_subtasks table (Dependency-Aware Subtasks)
create table if not exists public.agent_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  assigned_role text not null check (assigned_role in ('architect', 'developer', 'reviewer')),
  assigned_model text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'blocked')),
  dependencies jsonb not null default '[]'::jsonb check (jsonb_typeof(dependencies) = 'array'),
  target_files jsonb not null default '[]'::jsonb check (jsonb_typeof(target_files) = 'array'),
  result_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_subtasks_task_idx on public.agent_subtasks (task_id, created_at asc);
alter table public.agent_subtasks enable row level security;

drop policy if exists "Users can read own agent subtasks" on public.agent_subtasks;
create policy "Users can read own agent subtasks"
  on public.agent_subtasks for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent subtasks" on public.agent_subtasks;
create policy "Users can insert own agent subtasks"
  on public.agent_subtasks for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own agent subtasks" on public.agent_subtasks;
create policy "Users can update own agent subtasks"
  on public.agent_subtasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.agent_subtasks to authenticated;

-- 3. engineering_findings table (Automated Static & Architectural Analysis)
create table if not exists public.engineering_findings (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'regression', 'duplication', 'architecture', 'missing_test', 'security')),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  title text not null,
  description text not null,
  file_path text,
  line_number integer,
  suggested_remediation text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists engineering_findings_task_idx on public.engineering_findings (task_id, category);
alter table public.engineering_findings enable row level security;

drop policy if exists "Users can read own engineering findings" on public.engineering_findings;
create policy "Users can read own engineering findings"
  on public.engineering_findings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own engineering findings" on public.engineering_findings;
create policy "Users can insert own engineering findings"
  on public.engineering_findings for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.engineering_findings to authenticated;

-- 4. architectural_decisions table (ADR Tracking)
create table if not exists public.architectural_decisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'accepted' check (status in ('proposed', 'accepted', 'superseded', 'rejected')),
  context text not null,
  decision text not null,
  consequences text not null,
  models_consulted jsonb not null default '[]'::jsonb check (jsonb_typeof(models_consulted) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists architectural_decisions_task_idx on public.architectural_decisions (task_id);
alter table public.architectural_decisions enable row level security;

drop policy if exists "Users can read own architectural decisions" on public.architectural_decisions;
create policy "Users can read own architectural decisions"
  on public.architectural_decisions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own architectural decisions" on public.architectural_decisions;
create policy "Users can insert own architectural decisions"
  on public.architectural_decisions for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.architectural_decisions to authenticated;
