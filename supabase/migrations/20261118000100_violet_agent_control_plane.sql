-- VIOLET task orchestration, approvals, human handoffs and paired devices.
-- Browser clients may read their own records. Trusted Edge/worker services perform writes.

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null check (char_length(btrim(goal)) between 1 and 4000),
  source text not null default 'web'
    check (source in ('desktop', 'web', 'mobile', 'voice', 'messaging')),
  status text not null default 'requested'
    check (status in ('requested', 'classified', 'planned', 'awaiting_approval', 'queued',
                      'running', 'awaiting_human', 'validating', 'completed', 'failed', 'cancelled')),
  plan jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array'),
  constraints jsonb not null default '{}'::jsonb check (jsonb_typeof(constraints) = 'object'),
  execution_budget jsonb not null default '{}'::jsonb check (jsonb_typeof(execution_budget) = 'object'),
  error_code text,
  error_summary text check (error_summary is null or char_length(error_summary) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists agent_tasks_user_created_idx
  on public.agent_tasks (user_id, created_at desc);
create index if not exists agent_tasks_user_status_idx
  on public.agent_tasks (user_id, status, updated_at desc);
alter table public.agent_tasks enable row level security;

drop policy if exists "Users can read their own agent tasks" on public.agent_tasks;
create policy "Users can read their own agent tasks"
  on public.agent_tasks for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_tasks to authenticated;

drop trigger if exists agent_tasks_set_updated_at on public.agent_tasks;
create trigger agent_tasks_set_updated_at before update on public.agent_tasks
for each row execute function public.set_updated_at();


create table if not exists public.agent_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_order integer not null check (step_order >= 0),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  tool_name text not null check (char_length(btrim(tool_name)) between 1 and 120),
  risk text not null check (risk in ('read_only', 'reversible', 'external_side_effect', 'destructive', 'financial')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_approval', 'running', 'completed', 'failed', 'skipped')),
  arguments_hash text check (arguments_hash is null or arguments_hash ~ '^[a-f0-9]{64}$'),
  arguments_preview jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments_preview) = 'object'),
  result_summary text check (result_summary is null or char_length(result_summary) <= 2000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (task_id, step_order)
);
create index if not exists agent_task_steps_user_task_idx
  on public.agent_task_steps (user_id, task_id, step_order);
alter table public.agent_task_steps enable row level security;

drop policy if exists "Users can read their own agent task steps" on public.agent_task_steps;
create policy "Users can read their own agent task steps"
  on public.agent_task_steps for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_task_steps to authenticated;


create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  step_id uuid not null references public.agent_task_steps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (char_length(btrim(operation)) between 1 and 160),
  consequence text not null check (char_length(btrim(consequence)) between 1 and 1000),
  arguments_hash text not null check (arguments_hash ~ '^[a-f0-9]{64}$'),
  arguments_preview jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments_preview) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_approvals_user_status_idx
  on public.agent_approvals (user_id, status, expires_at);
create index if not exists agent_approvals_task_idx
  on public.agent_approvals (task_id, created_at desc);
alter table public.agent_approvals enable row level security;

drop policy if exists "Users can read their own agent approvals" on public.agent_approvals;
create policy "Users can read their own agent approvals"
  on public.agent_approvals for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_approvals to authenticated;


create table if not exists public.agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  step_id uuid references public.agent_task_steps(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null
    check (reason in ('captcha', 'otp', 'mfa', 'permission', 'consent', 'ambiguous_state', 'manual_takeover')),
  instructions text not null check (char_length(btrim(instructions)) between 1 and 1500),
  visible_client text not null check (visible_client in ('browser', 'desktop')),
  status text not null default 'waiting' check (status in ('waiting', 'resumed', 'cancelled', 'timed_out')),
  created_at timestamptz not null default now(),
  resumed_at timestamptz,
  expires_at timestamptz
);
create index if not exists agent_handoffs_user_status_idx
  on public.agent_handoffs (user_id, status, created_at desc);
alter table public.agent_handoffs enable row level security;

drop policy if exists "Users can read their own agent handoffs" on public.agent_handoffs;
create policy "Users can read their own agent handoffs"
  on public.agent_handoffs for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_handoffs to authenticated;


create table if not exists public.agent_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  platform text not null check (platform in ('windows', 'macos', 'linux')),
  public_key_fingerprint text not null check (char_length(public_key_fingerprint) between 32 and 160),
  scopes text[] not null default '{}',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, public_key_fingerprint)
);
create index if not exists agent_devices_user_idx
  on public.agent_devices (user_id, created_at desc);
alter table public.agent_devices enable row level security;

drop policy if exists "Users can read their own agent devices" on public.agent_devices;
create policy "Users can read their own agent devices"
  on public.agent_devices for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_devices to authenticated;


create table if not exists public.agent_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  version integer not null default 1 check (version > 0),
  enabled boolean not null default false,
  trigger_type text not null default 'manual' check (trigger_type in ('manual', 'schedule', 'event')),
  trigger_config jsonb not null default '{}'::jsonb check (jsonb_typeof(trigger_config) = 'object'),
  definition jsonb not null default '{}'::jsonb check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_workflows_user_updated_idx
  on public.agent_workflows (user_id, updated_at desc);
alter table public.agent_workflows enable row level security;

drop policy if exists "Users can read their own agent workflows" on public.agent_workflows;
create policy "Users can read their own agent workflows"
  on public.agent_workflows for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own agent workflows" on public.agent_workflows;
create policy "Users can create their own agent workflows"
  on public.agent_workflows for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own agent workflows" on public.agent_workflows;
create policy "Users can update their own agent workflows"
  on public.agent_workflows for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own agent workflows" on public.agent_workflows;
create policy "Users can delete their own agent workflows"
  on public.agent_workflows for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.agent_workflows to authenticated;

drop trigger if exists agent_workflows_set_updated_at on public.agent_workflows;
create trigger agent_workflows_set_updated_at before update on public.agent_workflows
for each row execute function public.set_updated_at();


create table if not exists public.agent_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.agent_workflows(id) on delete cascade,
  task_id uuid references public.agent_tasks(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_version integer not null check (workflow_version > 0),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_approval', 'awaiting_human', 'completed', 'failed', 'cancelled')),
  trigger_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(trigger_payload) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_workflow_runs_user_created_idx
  on public.agent_workflow_runs (user_id, created_at desc);
alter table public.agent_workflow_runs enable row level security;

drop policy if exists "Users can read their own agent workflow runs" on public.agent_workflow_runs;
create policy "Users can read their own agent workflow runs"
  on public.agent_workflow_runs for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_workflow_runs to authenticated;


create table if not exists public.agent_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  summary text not null check (char_length(btrim(summary)) between 1 and 1000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists agent_task_events_user_task_idx
  on public.agent_task_events (user_id, task_id, created_at asc);
alter table public.agent_task_events enable row level security;

drop policy if exists "Users can read their own agent task events" on public.agent_task_events;
create policy "Users can read their own agent task events"
  on public.agent_task_events for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.agent_task_events to authenticated;

-- Trusted service_role workers own task execution, device pairing, approvals,
-- handoff transitions and event writes. Browser clients receive read access only.
