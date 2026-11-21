-- VIOLET Lab — Phase 3C Multi-Model Collaboration Engine Schema
-- Extends agent_reviews and agent_tasks with cycle tracking, structured review issues, and model attribution.

-- 1. Extend agent_reviews table
alter table if exists public.agent_reviews
  add column if not exists cycle_number integer not null default 1 check (cycle_number > 0),
  add column if not exists reviewer_model text,
  add column if not exists score integer check (score is null or (score >= 0 and score <= 100)),
  add column if not exists issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  add column if not exists recommendations jsonb not null default '[]'::jsonb check (jsonb_typeof(recommendations) = 'array');

create index if not exists agent_reviews_task_cycle_idx on public.agent_reviews (task_id, cycle_number asc);

-- 2. Extend agent_tasks table
alter table if exists public.agent_tasks
  add column if not exists current_cycle integer not null default 1 check (current_cycle > 0),
  add column if not exists max_cycles integer not null default 3 check (max_cycles between 1 and 5),
  add column if not exists architect_model text,
  add column if not exists developer_model text,
  add column if not exists reviewer_model text;

-- 3. Extend agent_runs table
alter table if exists public.agent_runs
  add column if not exists review_cycles_count integer not null default 0 check (review_cycles_count >= 0),
  add column if not exists final_verdict text check (final_verdict in ('approved', 'changes_requested', 'rejected', null));
