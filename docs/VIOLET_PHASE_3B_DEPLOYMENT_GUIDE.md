# VIOLET Lab — Phase 3B Deployment & Operations Guide
## Running the Autonomous Multi-AI Software Engineering Platform

---

## 1. System Prerequisites

Before launching VIOLET Lab, ensure the following components are installed on your Windows 11 workstation:

| Prerequisite | Minimum Version | Recommended Version | Verification Command |
|---|---|---|---|
| **Windows OS** | Windows 11 (Build 22000+) | Windows 11 Pro 23H2+ | `cmd /c ver` |
| **Node.js** | Node.js 20.x | Node.js 22.x LTS | `node -v` |
| **npm** | npm 10.x | npm 10.x | `npm -v` |
| **Git CLI** | Git 2.38+ (supports worktrees) | Git 2.45+ | `git --version` |
| **Python** | Python 3.11+ | Python 3.12 / 3.14 | `python --version` |
| **Ollama (Optional)** | Ollama 0.3.0+ | Latest (for local models) | `ollama --version` |

---

## 2. Environment Configuration

Copy the example environment template if you haven't already:

```powershell
Copy-Item .env.example .env
```

Open `.env` and configure your settings:

### A. Private Single-User Owner Configuration
```env
# Single-User Owner Credentials
VIOLET_OWNER_ID=your-supabase-user-uuid-here
VIOLET_OWNER_EMAIL=your-email@example.com
VIOLET_API_TOKEN=your-random-high-entropy-api-token-here
```
> **Security Note:** When `VIOLET_OWNER_ID` or `VIOLET_OWNER_EMAIL` is configured, all API endpoints strictly verify the caller's identity and reject unauthorized access.

### B. Multi-Model Provider API Keys
```env
# Local AI (Ollama)
VIOLET_OLLAMA_HOST=http://127.0.0.1:11434

# Cloud AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-...
```

### C. Git & Local Repository Settings
```env
# Optional: explicitly set repo root (defaults to current working directory)
VIOLET_REPO_ROOT=D:\violet\Neuro
VIOLET_DEFAULT_BASE_BRANCH=main
```

---

## 3. Database Migration Deployment

Deploy the multi-agent schema to your Supabase PostgreSQL instance:

```powershell
# Using Supabase CLI
npx supabase db push

# Or apply migration directly via Supabase SQL Editor:
# Copy and execute: supabase/migrations/20261121000100_violet_multi_agent_system.sql
```

The migration creates:
- `agent_tasks` (Task tracking and goals)
- `agent_runs` (Run history and agent allocations)
- `agent_events` (Live SSE audit events)
- `agent_commits` (Real Git commits recorded by the Developer agent)
- `agent_artifacts` (Architecture plans, review notes)
- `model_usage` (Token counts and USD costs)
- `agent_reviews` (Automated review verdicts and test results)

---

## 4. Starting the VIOLET AI System

### Step 1: Start the Windows PC Agent (Background Service)
```powershell
cd apps\violet-local-agent
.\.venv\Scripts\Activate.ps1
python -m uvicorn violet_agent.main:app --host 127.0.0.1 --port 8765
```

### Step 2: Start the VIOLET Web Platform & API Server
In a separate terminal:
```powershell
npm run dev
```
The application will start at `http://localhost:5173`.

---

## 5. Using the Multi-Agent Lab

1. **Open VIOLET Command Center:** Navigate to `http://localhost:5173`.
2. **Access the Multi-Agent Lab:** Click on the **"Multi-Agent Lab"** tab in the navigation bar.
3. **Configure Your Task:**
   - **Task Goal:** Enter a clear engineering goal (e.g., *"Add a utility function for computing SHA-256 hashes and export it"*).
   - **Base Branch:** Select or type the target base branch (default: `main` or active branch).
   - **Model Selection:** Choose models for each agent tier:
     - **Architect:** `anthropic:claude-3-5-sonnet` or `openai:gpt-4o` (or local reasoning model).
     - **Developer:** `openai:gpt-4o` or `ollama:deepseek-coder` (or code-optimized model).
     - **Reviewer:** `gemini:gemini-2.0-flash` (or fast verification model).
4. **Launch Task:** Click **"Launch Multi-Agent Task"**.
5. **Monitor Live Execution:**
   - **Agent Status Cards:** Watch each agent transition through `idle` -> `running` -> `completed`.
   - **Live SSE Event Feed:** Stream real-time logs directly from the backend orchestrator.
   - **Git Commits:** Inspect newly minted Git commits with full SHA hashes, branch names, and diff statistics.
   - **Token & Cost Counter:** Monitor real-time USD expenditures and token usage.
6. **Integration & Owner Review:**
   - Once all 3 agents finish, the Reviewer will deliver a verdict (`APPROVED` or `CHANGES_REQUESTED`).
   - The orchestrator will output the integration branch name:
     `violet/task-{taskId}/integration`
   - You can review the changes safely in your terminal or IDE:
     ```powershell
     git diff main..violet/task-{taskId}/integration
     ```
   - When satisfied, merge into your target branch:
     ```powershell
     git checkout main
     git merge --no-ff violet/task-{taskId}/integration
     ```

---

## 6. Verification & Health Checks

Run the automated test suites at any time to verify system integrity:

```powershell
# 1. TypeScript compilation check
npm run typecheck

# 2. Complete Vitest test suite (165 tests)
npm test

# 3. Production Vite build
npm run build

# 4. Python Local Agent unit tests (36 tests)
apps\violet-local-agent\.venv\Scripts\python.exe -m pytest apps/violet-local-agent/tests -v
```

---

## 7. Troubleshooting & FAQs

- **Q: Are my unstaged changes safe while agents are running?**
  - **A:** Yes. Agents never operate in your working directory. They create isolated Git worktrees inside `.violet/worktrees/` and operate strictly on separate branches.
- **Q: What happens if an agent fails or takes too long?**
  - **A:** You can click the **"Cancel"** button at any time in the UI. The orchestrator will abort the active execution and automatically unmount and clean up all worktrees.
- **Q: Can I use 100% local models with no internet connection?**
  - **A:** Yes. Select `ollama` as the provider for all three agents and configure your local models (e.g., `deepseek-r1`, `qwen2.5-coder`). Cost will automatically track as `$0.00`.
