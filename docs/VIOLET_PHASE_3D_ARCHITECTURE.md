# VIOLET LAB — Phase 3D: Autonomous Engineering Intelligence
## System Architecture & Technical Specification

**Version:** 1.0.0  
**Status:** Implemented & Production-Verified  
**Repository:** `Avenash005/Neuro`  
**Branch:** `feature/violet-operating-system-foundation`  
**Target Environment:** Windows 11 (Node.js 22+, Python 3.14+, Vite 6+, Vitest 4+)

---

## 1. Executive Summary & Vision

VIOLET Lab Phase 3D evolves the multi-agent software engineering system into a fully autonomous, intelligent engineering platform. Where Phase 3A established production multi-model access, Phase 3B provided agent coordination in isolated Git worktrees, and Phase 3C enabled independent cross-model code review with bounded correction cycles, **Phase 3D empowers the agent fleet with deep repository intelligence, peer-to-peer collaboration, dependency-aware subtask scheduling, and static engineering analysis.**

### Core Capabilities
1. **Repository Intelligence:** Automatically inspects repository structure, frameworks, and key dependencies; extracts AST-like code symbols (functions, classes, interfaces, types) into an inverted keyword index; and scores candidate related files before assigning tasks.
2. **Architectural Decision Records (ADRs):** Automatically formulates and stores ADRs documenting context, decisions, trade-offs, consequences, and consulted AI models.
3. **Structured Agent Collaboration Hub:** Implements peer-to-peer message exchanges (`AgentMessage`), an interactive Plan Challenge & Refinement protocol where Reviewers challenge proposed plans before execution, dynamic Assistance Requests between developers and architects, and a shared blackboard memory store (`TaskMemoryStore`).
4. **Subtask DAG Scheduler:** Decomposes complex user goals into subtasks with topological dependencies, resolves ready subtasks, prevents concurrent file collisions via `FileConflictGuard`, and executes independent subtasks concurrently up to concurrency limits.
5. **Static Engineering Intelligence:** Scans written files and Git diffs for hardcoded secrets (API keys, private keys, passwords), SQL injection patterns, path traversal risks, critical bugs (unchecked division by zero, floating unhandled promises), missing unit test coverage for public exports, and duplicated function logic.
6. **Live Multi-Agent Engineering Dashboard:** A multi-tabbed interface in `VioletMultiAgentLab.tsx` providing real-time visibility into Subtasks & DAG progress, agent conversation threads, static findings with actionable remediation, ADR records, and live SSE activity.

---

## 2. Target Architecture Diagram

```
                        ┌────────────────────────────────────────────────────────┐
                        │             VIOLET LAB FRONTEND (React)                │
                        │               VioletMultiAgentLab.tsx                  │
                        └──────────────────────────┬─────────────────────────────┘
                                                   │ SSE Events / REST
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           VIOLET AI MULTI-AGENT ORCHESTRATOR                           │
│                                 MultiAgentOrchestrator                                  │
├──────────────────────────┬───────────────────────────────┬──────────────────────────────┤
│  Repository Intelligence │    Agent Collaboration Hub    │    Subtask DAG Scheduler     │
│   • Structure Inspector  │    • Peer-to-Peer Messaging   │    • Goal Decomposition      │
│   • AST Symbol Indexer   │    • Plan Challenge Protocol  │    • Dependency Resolution   │
│   • Related File Scorer  │    • Dynamic Assistance Req   │    • File Lock Integration   │
│   • ADR Decision Tracker │    • Shared Task Memory Store │    • Concurrent Execution    │
├──────────────────────────┴───────────────────────────────┴──────────────────────────────┤
│                             Engineering Intelligence Engine                             │
│   • Secret & Credential Scanner (OpenAI, Anthropic, Passwords, RSA Private Keys)        │
│   • Vulnerability Detector (SQL Injection, Path Traversal Exposure)                     │
│   • Static Bug Scanner (Unchecked Division by Zero, Floating Promises)                  │
│   • Quality & Gap Analysis (Missing Unit Tests, Duplicated Function Logic)              │
│   • Executive Summary & Risk Level Calculator (Low / Medium / High / Critical)          │
└──────────────────────────┬───────────────────────────────┬──────────────────────────────┘
                           │                               │
              Git Worktree Manager               Model Gateway & Router
         (.violet/worktrees/task-{id})          (Claude, GPT, Gemini, Ollama)
```

---

## 3. Subsystem Breakdown

### 3.1 Repository Intelligence (`repositoryIntelligence.ts`)
- **Inspection:** Scans `package.json`, project dependencies, and file structures up to 6 levels deep (skipping `node_modules`, `.git`, `.violet`, `dist`, `.venv`). Identifies detected frameworks (`React`, `Vite`, `FastAPI`, `Supabase`, `TailwindCSS`).
- **AST Symbol Extraction:** Parses TypeScript, JavaScript, and Python files to extract function names, classes, interfaces, types, and exports along with their line numbers.
- **Inverted Keyword Index:** Tokenizes source code into 3-40 character tokens and maps them to containing files.
- **Relevance Scoring:** Computes weighted relevance scores:
  - Symbol match: `+15` points
  - File path match: `+8` points
  - Keyword token occurrence: `+2` points
- **ADR Management:** Tracks architectural decision records with ID, context, decision, consequences, and models consulted; persists to Supabase `architectural_decisions` table.

### 3.2 Agent Collaboration Hub (`agentCollaboration.ts`)
- **Blackboard Memory (`TaskMemoryStore`):** Task-scoped in-memory key-value store shared across agents during execution.
- **Structured Message Bus:** Emits and tracks structured messages between agents:
  - `PLAN_PROPOSAL`: Architect announces proposed architectural strategy.
  - `CHALLENGE_PLAN`: Reviewer or Developer challenges edge cases, missing test coverage, or security gaps.
  - `PLAN_ACCEPTED`: Architect publishes refined plan incorporating peer feedback.
  - `REQUEST_ASSISTANCE`: Developer queries Architect or Reviewer for guidance.
  - `ASSISTANCE_RESPONSE`: Peer provides actionable code or design recommendation.
  - `SYNC_STATE`: Status and state synchronization.

### 3.3 Subtask DAG Scheduler (`subtaskScheduler.ts`)
- **Registration:** Accepts `SubTaskDefinition` records (`title`, `description`, `assignedRole`, `targetFiles`, `dependencies`).
- **Dependency Resolution (`getReadySubtasks`):**
  1. Identifies subtasks with `status === "pending"`.
  2. Asserts all prerequisite IDs/titles are in `status === "completed"`.
  3. Validates that no currently executing subtask holds a lock on any of the target files.
- **DAG Concurrency (`executeDAG`):** Dispatches ready subtasks up to `maxConcurrency` (default 3), acquiring locks before execution and releasing them upon completion.

### 3.4 Static Engineering Intelligence (`engineeringIntelligence.ts`)
- **Security Vulnerability Scanner:**
  - Hardcoded API keys (OpenAI `sk-...`, Anthropic `sk-ant-...`, raw private keys, passwords).
  - SQL injection via dynamic string concatenation (`SELECT ... + req`).
  - Path traversal exposure (`fs.readFileSync("/data/" + userInput)`).
- **Bug & Regression Detector:**
  - Arithmetic division by non-constant variables without boundary/zero-check guards.
  - Unawaited asynchronous promises (`fetch`, `fs.writeFile`, `execFileAsync` missing `await`/`void`/`catch`).
- **Quality & Test Coverage Assessment:**
  - Flags public exported functions/classes lacking an accompanying `.test.ts` or `.spec.ts` file in the working tree.
  - Detects duplicate function bodies (>50 characters of identical normalized code) across multiple files.
- **Risk Evaluation:** Computes overall risk level (`low`, `medium`, `high`, `critical`) and generates an executive summary injected directly into the Reviewer agent's prompt.

---

## 4. Database Schema Migration

File: `supabase/migrations/20261121000300_violet_autonomous_engineering_intelligence.sql`

```sql
-- 1. agent_messages: Peer-to-peer structured collaboration
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  from_role TEXT NOT NULL,
  to_role TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. agent_subtasks: Subtask DAG tracking
CREATE TABLE IF NOT EXISTS public.agent_subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_role TEXT NOT NULL,
  assigned_model TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  dependencies JSONB DEFAULT '[]'::jsonb,
  target_files JSONB DEFAULT '[]'::jsonb,
  result_summary TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. engineering_findings: Automated static analysis findings
CREATE TABLE IF NOT EXISTS public.engineering_findings (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  suggested_remediation TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. architectural_decisions: Architectural Decision Records (ADRs)
CREATE TABLE IF NOT EXISTS public.architectural_decisions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  consequences TEXT NOT NULL,
  models_consulted JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

---

## 5. Security & Isolation Invariants

1. **Strict Worktree Isolation:** All agent coding occurs strictly in `.violet/worktrees/task-{taskId}/{role}`. The main working tree is never polluted.
2. **File Conflict Protection:** `FileConflictGuard` prevents two concurrent agents from modifying the same file path simultaneously.
3. **Owner Control of Publishing & Merging:** Integration branches (`violet/task-{taskId}/integration`) are prepared for owner inspection. VIOLET never pushes to remote or performs fast-forward merges into main branches without explicit owner action.
4. **Credential Safety:** All API tokens and credentials remain strictly in `.env` and are never exposed in task logs, events, or commit metadata.
