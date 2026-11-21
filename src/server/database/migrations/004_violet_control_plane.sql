-- VIOLET Local PostgreSQL Migration 004: Agent Control Plane (Tables 18 to 25)
-- Establishes the agent control plane: tasks, steps, approvals, handoffs, devices, workflows, and events.

-- 18. Agent Tasks
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'executing', 'waiting_approval', 'paused', 'completed', 'failed', 'cancelled')),
  autonomy_mode text NOT NULL DEFAULT 'guided' CHECK (autonomy_mode IN ('interactive', 'guided', 'full_auto')),
  routing_tier text NOT NULL DEFAULT 'smart' CHECK (routing_tier IN ('local_only', 'smart', 'flagship')),
  active_plan jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(active_plan) = 'object'),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 2000),
  estimated_risk real NOT NULL DEFAULT 0.0 CHECK (estimated_risk BETWEEN 0 AND 1),
  repo_path text DEFAULT '',
  base_commit text,
  integration_branch text,
  review_status text DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'changes_requested', 'rejected', 'integrated')),
  current_cycle integer NOT NULL DEFAULT 1 CHECK (current_cycle > 0),
  max_cycles integer NOT NULL DEFAULT 3 CHECK (max_cycles BETWEEN 1 AND 5),
  architect_model text,
  developer_model text,
  reviewer_model text,
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  integration_approved boolean DEFAULT null,
  integration_approved_at timestamptz,
  integration_commit_sha text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 19. Agent Task Steps
CREATE TABLE IF NOT EXISTS public.agent_task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number > 0),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  operation text NOT NULL CHECK (char_length(btrim(operation)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'blocked')),
  risk_score real NOT NULL DEFAULT 0.0 CHECK (risk_score BETWEEN 0 AND 1),
  requires_approval boolean NOT NULL DEFAULT false,
  approval_state text NOT NULL DEFAULT 'not_required' CHECK (approval_state IN ('not_required', 'requested', 'approved', 'rejected')),
  tool_arguments jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tool_arguments) = 'object'),
  tool_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tool_result) = 'object'),
  verification jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verification) = 'object'),
  error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, step_number)
);

-- 20. Agent Approvals
CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.agent_task_steps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (char_length(btrim(operation)) BETWEEN 1 AND 160),
  consequence text NOT NULL CHECK (char_length(btrim(consequence)) BETWEEN 1 AND 1000),
  arguments_hash text NOT NULL CHECK (arguments_hash ~ '^[a-f0-9]{64}$'),
  arguments_preview jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(arguments_preview) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 21. Agent Handoffs
CREATE TABLE IF NOT EXISTS public.agent_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.agent_task_steps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 400),
  blocked_reason text NOT NULL CHECK (char_length(btrim(blocked_reason)) BETWEEN 1 AND 400),
  required_user_action text NOT NULL CHECK (char_length(btrim(required_user_action)) BETWEEN 1 AND 1000),
  suggested_fix text CHECK (suggested_fix IS NULL OR char_length(suggested_fix) <= 1000),
  resumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 22. Agent Devices
CREATE TABLE IF NOT EXISTS public.agent_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  platform text NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
  public_key_fingerprint text NOT NULL CHECK (char_length(public_key_fingerprint) BETWEEN 32 AND 160),
  scopes text[] NOT NULL DEFAULT '{}',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, public_key_fingerprint)
);

-- 23. Agent Workflows
CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  category text NOT NULL DEFAULT 'general' CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  dag_definition jsonb NOT NULL CHECK (jsonb_typeof(dag_definition) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 24. Agent Workflow Runs
CREATE TABLE IF NOT EXISTS public.agent_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused', 'cancelled')),
  dag_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dag_state) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 25. Agent Task Events
CREATE TABLE IF NOT EXISTS public.agent_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (char_length(btrim(event_type)) BETWEEN 1 AND 80),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for Agent Control Plane
CREATE INDEX IF NOT EXISTS agent_tasks_user_status_idx ON public.agent_tasks (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_task_steps_task_step_idx ON public.agent_task_steps (task_id, step_number ASC);
CREATE INDEX IF NOT EXISTS agent_task_steps_user_status_idx ON public.agent_task_steps (user_id, status);
CREATE INDEX IF NOT EXISTS agent_approvals_task_status_idx ON public.agent_approvals (task_id, status);
CREATE INDEX IF NOT EXISTS agent_approvals_expires_idx ON public.agent_approvals (status, expires_at);
CREATE INDEX IF NOT EXISTS agent_handoffs_task_idx ON public.agent_handoffs (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_devices_user_seen_idx ON public.agent_devices (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS agent_workflows_user_active_idx ON public.agent_workflows (user_id, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_workflow_runs_workflow_idx ON public.agent_workflow_runs (workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_task_events_task_created_idx ON public.agent_task_events (task_id, created_at ASC);

-- Triggers for Agent Control Plane
DROP TRIGGER IF EXISTS agent_tasks_set_updated_at ON public.agent_tasks;
CREATE TRIGGER agent_tasks_set_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agent_workflows_set_updated_at ON public.agent_workflows;
CREATE TRIGGER agent_workflows_set_updated_at
  BEFORE UPDATE ON public.agent_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
