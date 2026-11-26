-- VIOLET Lab — Phase 3B Multi-Agent Autonomous Software Development System Schema
-- Adds support for multi-agent runs, isolated Git worktrees, commits, artifacts, model token/cost tracking, and reviews.

-- 1. Extend agent_tasks table
alter table if exists public.agent_tasks
  add column if not exists repo_path text default '',
  add column if not exists base_commit text,
  add column if not exists integration_branch text,
  add column if not exists review_status text default 'pending'
    check (review_status in ('pending', 'approved', 'changes_requested', 'rejected', 'integrated'));

-- 2. agent_runs table
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_number integer not null default 1 check (run_number > 0),
  status text not null default 'queued'
    check (status in ('queued', 'planning', 'implementing', 'reviewing', 'testing', 'completed', 'failed', 'cancelled')),
  active_agents jsonb not null default '[]'::jsonb check (jsonb_typeof(active_agents) = 'array'),
  architect_model text,
  developer_model text,
  reviewer_model text,
  base_branch text not null default 'main',
  integration_branch text,
  started_at timestamptz,
  completed_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_user_task_idx on public.agent_runs (user_id, task_id, run_number desc);
create index if not exists agent_runs_status_idx on public.agent_runs (status, created_at desc);
alter table public.agent_runs enable row level security;

drop policy if exists "Users can read own agent runs" on public.agent_runs;
create policy "Users can read own agent runs"
  on public.agent_runs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent runs" on public.agent_runs;
create policy "Users can insert own agent runs"
  on public.agent_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own agent runs" on public.agent_runs;
create policy "Users can update own agent runs"
  on public.agent_runs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.agent_runs to authenticated;

-- 3. agent_events table
create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null check (agent_role in ('orchestrator', 'architect', 'developer', 'reviewer')),
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  message text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists agent_events_task_run_idx on public.agent_events (task_id, run_id, created_at asc);
create index if not exists agent_events_user_idx on public.agent_events (user_id, created_at desc);
alter table public.agent_events enable row level security;

drop policy if exists "Users can read own agent events" on public.agent_events;
create policy "Users can read own agent events"
  on public.agent_events for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent events" on public.agent_events;
create policy "Users can insert own agent events"
  on public.agent_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.agent_events to authenticated;

-- 4. agent_commits table
create table if not exists public.agent_commits (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null,
  branch_name text not null,
  worktree_path text,
  commit_sha text not null check (commit_sha ~ '^[a-f0-9]{7,40}$'),
  commit_message text not null,
  files_changed jsonb not null default '[]'::jsonb check (jsonb_typeof(files_changed) = 'array'),
  insertions integer not null default 0 check (insertions >= 0),
  deletions integer not null default 0 check (deletions >= 0),
  created_at timestamptz not null default now()
);

create index if not exists agent_commits_task_run_idx on public.agent_commits (task_id, run_id, created_at asc);
alter table public.agent_commits enable row level security;

drop policy if exists "Users can read own agent commits" on public.agent_commits;
create policy "Users can read own agent commits"
  on public.agent_commits for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent commits" on public.agent_commits;
create policy "Users can insert own agent commits"
  on public.agent_commits for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.agent_commits to authenticated;

-- 5. agent_artifacts table
create table if not exists public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null,
  artifact_type text not null check (artifact_type in ('plan', 'diff', 'test_report', 'review', 'code')),
  file_path text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists agent_artifacts_task_type_idx on public.agent_artifacts (task_id, artifact_type);
alter table public.agent_artifacts enable row level security;

drop policy if exists "Users can read own agent artifacts" on public.agent_artifacts;
create policy "Users can read own agent artifacts"
  on public.agent_artifacts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent artifacts" on public.agent_artifacts;
create policy "Users can insert own agent artifacts"
  on public.agent_artifacts for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.agent_artifacts to authenticated;

-- 6. model_usage table
create table if not exists public.model_usage (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null,
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(10, 6) not null default 0 check (estimated_cost_usd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists model_usage_task_run_idx on public.model_usage (task_id, run_id);
create index if not exists model_usage_provider_idx on public.model_usage (provider, model);
alter table public.model_usage enable row level security;

drop policy if exists "Users can read own model usage" on public.model_usage;
create policy "Users can read own model usage"
  on public.model_usage for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own model usage" on public.model_usage;
create policy "Users can insert own model usage"
  on public.model_usage for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.model_usage to authenticated;

-- 7. agent_reviews table
create table if not exists public.agent_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_agent_role text not null default 'reviewer',
  commit_sha text,
  verdict text not null check (verdict in ('approved', 'changes_requested', 'rejected')),
  review_notes text not null,
  automated_checks jsonb not null default '{}'::jsonb check (jsonb_typeof(automated_checks) = 'object'),
  test_results jsonb not null default '{}'::jsonb check (jsonb_typeof(test_results) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists agent_reviews_task_run_idx on public.agent_reviews (task_id, run_id);
alter table public.agent_reviews enable row level security;

drop policy if exists "Users can read own agent reviews" on public.agent_reviews;
create policy "Users can read own agent reviews"
  on public.agent_reviews for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own agent reviews" on public.agent_reviews;
create policy "Users can insert own agent reviews"
  on public.agent_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.agent_reviews to authenticated;
