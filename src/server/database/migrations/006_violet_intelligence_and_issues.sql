-- VIOLET Local PostgreSQL Migration 006: Autonomous Intelligence & Issues (Tables 32 to 38)
-- Establishes inter-agent messaging, subtask DAGs, engineering findings, architecture decisions, tool logs, and issue tracker.

-- 32. Agent Messages
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL,
  recipient_role text NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('proposal', 'critique', 'clarification', 'assistance_request', 'status_update', 'handoff', 'resolution')),
  content text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  reply_to_id uuid REFERENCES public.agent_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 33. Agent Subtasks
CREATE TABLE IF NOT EXISTS public.agent_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  assigned_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked')),
  dependencies uuid[] NOT NULL DEFAULT '{}',
  target_files text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 34. Engineering Findings
CREATE TABLE IF NOT EXISTS public.engineering_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discovered_by_role text NOT NULL,
  category text NOT NULL CHECK (category IN ('architecture', 'dependency', 'security', 'performance', 'convention', 'bug')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL,
  affected_files text[] NOT NULL DEFAULT '{}',
  suggested_action text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 35. Architectural Decisions
CREATE TABLE IF NOT EXISTS public.architectural_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  context text NOT NULL,
  decision text NOT NULL,
  rationale text NOT NULL,
  implications text NOT NULL DEFAULT '',
  decision_maker text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'superseded', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 36. Agent Tool Executions
CREATE TABLE IF NOT EXISTS public.agent_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(arguments) = 'object'),
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  is_success boolean NOT NULL DEFAULT true,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 37. Agent Issues
CREATE TABLE IF NOT EXISTS public.agent_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  priority text NOT NULL CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  category text NOT NULL CHECK (category IN ('execution_failure', 'model_error', 'ollama_error', 'terminal_failure', 'typescript_error', 'test_failure', 'build_failure', 'security_alert', 'review_finding', 'dependency_failure', 'crash_timeout')),
  original_error text NOT NULL,
  stack_trace text,
  source_file text,
  line_number integer,
  discovering_agent text NOT NULL,
  assigned_agent text,
  worktree_path text,
  branch_name text,
  root_cause text,
  proposed_resolution text,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'investigating', 'fixing', 'verifying', 'resolved', 'ignored', 'wont_fix')),
  resolution_commit text,
  verification_results jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verification_results) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- 38. Issue Fix Attempts
CREATE TABLE IF NOT EXISTS public.issue_fix_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.agent_issues(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  assigned_agent text NOT NULL,
  fix_description text NOT NULL,
  commit_sha text,
  test_results jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(test_results) = 'object'),
  is_successful boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for Intelligence & Issues
CREATE INDEX IF NOT EXISTS agent_messages_task_created_idx ON public.agent_messages (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_messages_sender_recipient_idx ON public.agent_messages (sender_role, recipient_role);
CREATE INDEX IF NOT EXISTS agent_subtasks_task_status_idx ON public.agent_subtasks (task_id, status);
CREATE INDEX IF NOT EXISTS engineering_findings_task_category_idx ON public.engineering_findings (task_id, category);
CREATE INDEX IF NOT EXISTS architectural_decisions_task_status_idx ON public.architectural_decisions (task_id, status);
CREATE INDEX IF NOT EXISTS agent_tool_executions_task_tool_idx ON public.agent_tool_executions (task_id, tool_name);
CREATE INDEX IF NOT EXISTS agent_issues_task_status_idx ON public.agent_issues (task_id, status);
CREATE INDEX IF NOT EXISTS agent_issues_severity_priority_idx ON public.agent_issues (severity, priority);
CREATE INDEX IF NOT EXISTS issue_fix_attempts_issue_attempt_idx ON public.issue_fix_attempts (issue_id, attempt_number ASC);
