-- VIOLET AI & Lab — Phase 3F Extension: Issue Intelligence & Bug Tracking Schema
-- Adds support for autonomous error capture, deduplication fingerprints, intelligent agent routing, fix history, and verification.

-- 1. agent_issues table
create table if not exists public.agent_issues (
  id text primary key,
  fingerprint text not null,
  title text not null,
  description text not null default '',
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  priority text not null check (priority in ('p0', 'p1', 'p2', 'p3')),
  category text not null check (category in (
    'runtime_error', 'model_provider', 'ollama_connection', 'command_failure',
    'typescript_error', 'test_failure', 'build_failure', 'security_vulnerability',
    'review_finding', 'task_dependency', 'worker_crash', 'timeout'
  )),
  error_message text not null,
  stack_trace text,
  source_file text,
  line_number integer,
  detected_at timestamptz not null default now(),
  discovering_agent text not null,
  assigned_agent text,
  assigned_role text not null check (assigned_role in (
    'frontend', 'backend', 'database', 'qa', 'security', 'devops', 'architect', 'developer', 'reviewer'
  )),
  task_id text references public.agent_tasks(id) on delete set null,
  run_id text references public.agent_runs(id) on delete set null,
  worktree_branch text,
  worktree_path text,
  root_cause text,
  proposed_resolution text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed', 'reopened', 'blocked')),
  is_transient boolean not null default false,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  resolution_commit_sha text,
  resolution_commit_message text,
  verification_results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_issues_fingerprint_idx on public.agent_issues (fingerprint);
create index if not exists agent_issues_status_idx on public.agent_issues (status, severity, detected_at desc);
create index if not exists agent_issues_task_idx on public.agent_issues (task_id);
create index if not exists agent_issues_role_idx on public.agent_issues (assigned_role);

alter table public.agent_issues enable row level security;

drop policy if exists "Authenticated users can select issues" on public.agent_issues;
create policy "Authenticated users can select issues"
  on public.agent_issues for select to authenticated
  using (true);

drop policy if exists "Authenticated users can insert issues" on public.agent_issues;
create policy "Authenticated users can insert issues"
  on public.agent_issues for insert to authenticated
  with check (true);

drop policy if exists "Authenticated users can update issues" on public.agent_issues;
create policy "Authenticated users can update issues"
  on public.agent_issues for update to authenticated
  using (true);

grant select, insert, update on public.agent_issues to authenticated;

-- 2. issue_fix_attempts table
create table if not exists public.issue_fix_attempts (
  id uuid primary key default gen_random_uuid(),
  issue_id text not null references public.agent_issues(id) on delete cascade,
  attempt_number integer not null default 1,
  assigned_agent text not null,
  assigned_role text not null,
  worktree_branch text,
  commit_sha text,
  test_results jsonb not null default '{}'::jsonb,
  review_verdict text,
  is_successful boolean not null default false,
  logs text,
  created_at timestamptz not null default now()
);

create index if not exists issue_fix_attempts_issue_idx on public.issue_fix_attempts (issue_id, attempt_number desc);

alter table public.issue_fix_attempts enable row level security;

drop policy if exists "Authenticated users can select issue fix attempts" on public.issue_fix_attempts;
create policy "Authenticated users can select issue fix attempts"
  on public.issue_fix_attempts for select to authenticated
  using (true);

drop policy if exists "Authenticated users can insert issue fix attempts" on public.issue_fix_attempts;
create policy "Authenticated users can insert issue fix attempts"
  on public.issue_fix_attempts for insert to authenticated
  with check (true);

grant select, insert on public.issue_fix_attempts to authenticated;
