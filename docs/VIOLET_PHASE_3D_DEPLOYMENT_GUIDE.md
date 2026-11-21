# VIOLET LAB — Phase 3D: Autonomous Engineering Intelligence
## Windows 11 Deployment & Operations Guide

**Repository:** `Avenash005/Neuro`  
**Branch:** `feature/violet-operating-system-foundation`  
**Target Environment:** Windows 11 (64-bit)

---

## 1. System Requirements

- **Operating System:** Windows 11 Pro / Enterprise (build 22621+ recommended)
- **Node.js:** v22.18.0 or higher
- **npm:** 10.9.0 or higher
- **Python:** 3.14.0 or higher (with virtual environment in `apps/violet-local-agent/.venv`)
- **Git:** 2.40.0 or higher (configured with `core.longpaths = true` on Windows)
- **Database:** Supabase PostgreSQL instance (or local PostgreSQL 15+)

---

## 2. Repository Setup & Branch Verification

Verify that you are on the correct branch and that your Git configuration permits long file paths on Windows:

```powershell
# Open PowerShell as Administrator or developer terminal
cd D:\violet\Neuro

# Verify branch
git branch --show-current
# Expected: feature/violet-operating-system-foundation

# Enable Git long paths on Windows (recommended for deep worktrees)
git config --system core.longpaths true
```

---

## 3. Database Schema Migration

Apply the Phase 3D database migration to create the tables for structured agent messages, subtask DAG scheduling, engineering findings, and architectural decisions (ADRs):

```powershell
# If using Supabase CLI
npx supabase db push

# Or execute the migration SQL directly in your Supabase SQL editor:
# File: supabase/migrations/20261121000300_violet_autonomous_engineering_intelligence.sql
```

The migration creates:
- `public.agent_messages` (peer-to-peer structured messaging)
- `public.agent_subtasks` (subtask DAG tracking)
- `public.engineering_findings` (automated static analysis findings)
- `public.architectural_decisions` (Architectural Decision Records)

---

## 4. Environment Variables Configuration

Ensure `.env` in the repository root has the required configuration:

```env
# Multi-Model AI API Keys (At least one cloud provider or Ollama is required)
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-v1-...

# Local Ollama Configuration (Optional for offline inference)
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Single-User Owner Authentication Secret
VIOLET_API_TOKEN=your-secure-local-agent-token
VIOLET_OWNER_ID=00000000-0000-0000-0000-000000000001
```

---

## 5. Local Agent Python Environment

```powershell
cd D:\violet\Neuro\apps\violet-local-agent

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Verify packages and dependencies
pip list

# Run Python regression tests
pytest tests -v
# Expected: 36 passed in ~7.7s
```

---

## 6. Frontend & API Server Execution

```powershell
cd D:\violet\Neuro

# Install Node dependencies (if not already installed)
npm install

# Run TypeScript strict typecheck
npm run typecheck
# Expected: 0 errors

# Run all 39 Vitest suites
npm test
# Expected: 39 passed (211 tests passed in ~2.6s)

# Start development server
npm run dev
# The application will launch at http://localhost:5173
```

---

## 7. Using the Multi-Agent Lab Dashboard

1. Open your browser and navigate to `http://localhost:5173`.
2. Navigate to the **Multi-Agent Lab** in the navigation sidebar.
3. Enter your task goal in the top prompt bar (e.g. *"Implement strict single-user authentication middleware and add isolated Git worktree tests"*).
4. *(Optional)* Click **Models** to allocate specific models for each role:
   - **Architect Agent:** High-reasoning model (e.g., Claude 3.5 Sonnet, GPT-4o, DeepSeek R1).
   - **Developer Agent:** Code generation model (e.g., GPT-4o, Claude 3.5 Sonnet, Qwen 2.5 Coder).
   - **Reviewer Agent:** Independent model (must differ from Developer whenever possible).
5. Click **Start Multi-Agent Run**.
6. Switch across the 6 specialized tabs:
   - **Overview & Execution:** Monitor active agent states, commits, review decisions, and copy the owner merge command.
   - **Subtasks & DAG:** Track decomposed subtasks, dependencies, and file collision locks.
   - **Agent Collaboration:** View peer-to-peer message exchanges, plan challenges, and assistance requests.
   - **Engineering Findings:** Review static bug, security, test gap, and duplication findings with remediation guidance.
   - **ADR Decisions:** Inspect formal Architectural Decision Records recorded during execution.
   - **Live Event Stream:** Follow the real-time SSE activity feed.

---

## 8. Owner Control: Reviewing & Merging Code

All agent commits remain safely contained in an isolated Git worktree:
- **Worktree Location:** `.violet/worktrees/task-{taskId}/developer`
- **Developer Branch:** `violet/task-{taskId}/developer`
- **Integration Branch:** `violet/task-{taskId}/integration`

To inspect the diff and merge into your working branch:
```powershell
# Inspect the diff
git diff main..violet/task-{taskId}/integration

# Merge into your base branch when satisfied
git checkout main
git merge --no-ff violet/task-{taskId}/integration
```
VIOLET never auto-merges or force-pushes to remote repositories without your explicit confirmation.
