-- VIOLET Local PostgreSQL Migration 005: Multi-Agent Collaboration (Tables 26 to 31)
-- Establishes multi-agent runs, execution events, git commits, artifacts, model token usage, and code reviews.

-- 26. Agent Runs
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_role text NOT NULL CHECK (agent_role IN ('lead', 'architect', 'developer', 'reviewer', 'tester')),
  model_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  step_number integer NOT NULL DEFAULT 1,
  tokens_used jsonb NOT NULL DEFAULT '{"prompt": 0, "completion": 0, "total": 0}'::jsonb CHECK (jsonb_typeof(tokens_used) = 'object'),
  worktree_path text,
  branch_name text,
  error_message text,
  review_cycles_count integer NOT NULL DEFAULT 0 CHECK (review_cycles_count >= 0),
  final_verdict text CHECK (final_verdict IN ('approved', 'changes_requested', 'rejected', null)),
  last_heartbeat timestamptz DEFAULT now(),
  is_paused boolean NOT NULL DEFAULT false,
  telemetry_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 27. Agent Events
CREATE TABLE IF NOT EXISTS public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('step_start', 'step_complete', 'tool_call', 'tool_result', 'commit', 'review_verdict', 'test_run', 'error', 'model_call')),
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 28. Agent Commits
CREATE TABLE IF NOT EXISTS public.agent_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  branch_name text NOT NULL,
  worktree_path text,
  commit_sha text NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{7,40}$'),
  commit_message text NOT NULL,
  files_changed jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(files_changed) = 'array'),
  insertions integer NOT NULL DEFAULT 0 CHECK (insertions >= 0),
  deletions integer NOT NULL DEFAULT 0 CHECK (deletions >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 29. Agent Artifacts
CREATE TABLE IF NOT EXISTS public.agent_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  artifact_type text NOT NULL CHECK (artifact_type IN ('plan', 'diff', 'test_report', 'review', 'code')),
  file_path text,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 30. Model Usage
CREATE TABLE IF NOT EXISTS public.model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model_name text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0.000000 CHECK (cost_usd >= 0),
  call_duration_ms integer NOT NULL DEFAULT 0 CHECK (call_duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 31. Agent Reviews
CREATE TABLE IF NOT EXISTS public.agent_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_role text NOT NULL DEFAULT 'reviewer',
  verdict text NOT NULL CHECK (verdict IN ('approved', 'changes_requested', 'rejected')),
  review_comments text NOT NULL,
  diff_reviewed text NOT NULL,
  test_results jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(test_results) = 'object'),
  cycle_number integer NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
  reviewer_model text,
  score integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(issues) = 'array'),
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommendations) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for Multi-Agent Collaboration
CREATE INDEX IF NOT EXISTS agent_runs_task_role_idx ON public.agent_runs (task_id, agent_role);
CREATE INDEX IF NOT EXISTS agent_runs_user_status_idx ON public.agent_runs (user_id, status);
CREATE INDEX IF NOT EXISTS agent_events_task_created_idx ON public.agent_events (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_events_run_created_idx ON public.agent_events (run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_commits_task_idx ON public.agent_commits (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_commits_sha_idx ON public.agent_commits (commit_sha);
CREATE INDEX IF NOT EXISTS agent_artifacts_task_type_idx ON public.agent_artifacts (task_id, artifact_type);
CREATE INDEX IF NOT EXISTS model_usage_task_idx ON public.model_usage (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS model_usage_user_provider_idx ON public.model_usage (user_id, provider, model_name);
CREATE INDEX IF NOT EXISTS agent_reviews_task_cycle_idx ON public.agent_reviews (task_id, cycle_number DESC);
