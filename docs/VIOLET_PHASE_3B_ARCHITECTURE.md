# VIOLET Lab — Phase 3B Architecture Specification
## Autonomous Multi-Agent Software Development Platform

---

## 1. Executive Summary & Vision

**VIOLET Lab** is a private, single-user, autonomous multi-AI software development platform. Built as part of VIOLET AI (Personal AI Operating System), Phase 3B extends VIOLET's multi-model intelligence foundation into an autonomous software engineering engine.

### Core Capabilities
- **Natural Language Task Intake:** The user enters a single engineering instruction (e.g., *"Implement rate limiting middleware for the API endpoints and write unit tests"*).
- **Automated Task Decomposition & Planning:** The Architect agent analyzes repository architecture, identifies file dependencies, and constructs a structured implementation plan.
- **Git Worktree Isolation:** The Developer agent creates and operates within an isolated Git worktree (`violet/task-{taskId}/developer`), ensuring zero contamination of the user's working tree or uncommitted changes.
- **Real Git Commits:** The Developer writes clean code and produces real, verified Git commits with comprehensive metadata (SHA, commit message, insertions, deletions).
- **Independent QA Review & Testing:** The Reviewer/Tester agent inspects the diff, executes automated checks (`git status`, linters, tests), and provides a formal review verdict (`APPROVED` or `CHANGES_REQUESTED`).
- **Owner-Controlled Integration:** Changes are consolidated into an integration branch (`violet/task-{taskId}/integration`). The platform strictly avoids auto-merging or force-pushing without explicit owner approval.
- **Live Real-Time Dashboard:** Progress is streamed over Server-Sent Events (SSE) to a live multi-agent workspace in the VIOLET Command Center.

---

## 2. High-Level System Architecture

```
+-----------------------------------------------------------------------------------------+
|                                    VIOLET Command Center                                |
|           [Overview]  [Multi-Model]  [Multi-Agent Lab]  [Timeline]  [PC Agent]          |
|                                                                                         |
|   +--------------------------+  +-------------------------+  +-----------------------+  |
|   |  Architect (Anthropic)   |  |   Developer (OpenAI)    |  |    Reviewer (Gemini)  |  |
|   |  [Completed - Plan Ready]|  |  [Committed: a1b2c3d]   |  |  [Verdict: APPROVED]  |  |
|   +--------------------------+  +-------------------------+  +-----------------------+  |
|                                                                                         |
|   [ Live SSE Event Feed ]         [ Git Commits & Diffs ]        [ Model Cost & Tokens] |
+--------------------------------------------+--------------------------------------------+
                                             | HTTP / REST & SSE (EventStream)
                                             v
+-----------------------------------------------------------------------------------------+
|                                   VIOLET API Server                                     |
|               (Node / Vite Development & Production API on /api/v1/*)                   |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   | Owner Guard Middleware (validateOwnerAuth)                                      |   |
|   | - Token Authentication (VIOLET_API_TOKEN)                                       |   |
|   | - Supabase Owner JWT Validation (sub === VIOLET_OWNER_ID || VIOLET_OWNER_EMAIL)  |   |
|   | - Rejection of unauthorized users & public registration                         |   |
|   +---------------------------------------------------------------------------------+   |
|                                            |                                            |
|                                            v                                            |
|   +---------------------------------------------------------------------------------+   |
|   | Multi-Agent Orchestrator (MultiAgentOrchestrator)                               |   |
|   | - ConcurrencySemaphore(max: 3) & Queue Management                              |   |
|   | - State Lifecycle & Task Map                                                    |   |
|   | - SSE Event Hub (subscribeToTask)                                               |   |
|   | - Model Usage & USD Cost Engine                                                 |   |
|   +----------------------+-----------------------------------+----------------------+   |
+--------------------------|-----------------------------------|--------------------------+
                           |                                   |
         Model Gateway API |                                   | Worktree CLI Operations
                           v                                   v
+--------------------------------------+   +----------------------------------------------+
|     Phase 3A Model Gateway           |   |       Git Worktree Manager                   |
|  - Intelligent Model Router          |   |  - Directory Traversal Validation            |
|  - Privacy Policy Engine             |   |  - Isolated Worktrees (.violet/worktrees/)   |
|  - Provider Adapters:                |   |  - Isolated Branches (violet/task-*)         |
|    * Anthropic (Claude 3.5 Sonnet)   |   |  - Real Commits & Diff Extraction            |
|    * OpenAI (GPT-4o)                 |   |  - Sandboxed Command Execution               |
|    * Google Gemini (Gemini 2.5 Flash)|   |  - Integration Branch Consolidation          |
|    * Ollama (Local DeepSeek / Qwen)  |   |  - Clean Pruning & Worktree Teardown         |
+--------------------------------------+   +----------------------------------------------+
                                                               |
                                                               v
                                           +----------------------------------------------+
                                           |      Local Windows Git Repository            |
                                           |      (D:\violet\Neuro)                       |
                                           |      - Working tree untainted                |
                                           |      - Isolated worktrees in .violet/        |
                                           |      - Protected main branch                 |
                                           +----------------------------------------------+
```

---

## 3. Specialized 3-Agent Collaborative Hierarchy

VIOLET Lab organizes agents into a structured hierarchy of responsibility:

| Agent Role | Default Model Tier | Primary Responsibilities | Artifacts Produced |
|---|---|---|---|
| **Architect Agent** | `anthropic:claude-3-5-sonnet` (or high-reasoning cloud/local model) | Inspects task requirements, surveys codebase architecture, identifies files to touch, specifies interfaces, and outlines step-by-step developer instructions. | Implementation Plan Artifact (`art_plan_*`) |
| **Developer Agent** | `openai:gpt-4o` (or code-optimized cloud/local model) | Provisions an isolated Git worktree, writes code, parses `[FILE: ...]` updates, stages changes, and generates an authentic Git commit. | Git Commits (`cmt_*`), Modified Code Files |
| **Reviewer / Tester Agent** | `gemini:gemini-2.0-flash` (or fast verification cloud/local model) | Generates `git diff`, analyzes changes for correctness and security, runs dry status/lint checks, and delivers a binding verdict. | Code Review Record (`rev_*`), Test Metrics |

---

## 4. Git Worktree Isolation & Commit Safety

To ensure that autonomous agents never corrupt user work or destroy in-progress edits:

1. **Strict Path Traversal Protection:**
   All worktree operations validate that target files resolve strictly inside the worktree directory:
   ```typescript
   assertPathInsideWorktree(worktreePath: string, relativePath: string): string {
     const normalizedWorktree = path.resolve(worktreePath);
     const resolvedTarget = path.resolve(normalizedWorktree, relativePath);
     if (!resolvedTarget.startsWith(normalizedWorktree + path.sep) && resolvedTarget !== normalizedWorktree) {
       throw new Error(`Path traversal violation: Target '${relativePath}' escapes worktree root.`);
     }
     return resolvedTarget;
   }
   ```
2. **Directory Isolation:**
   Worktrees are created inside `.violet/worktrees/task-{taskId}/{role}` which is explicitly ignored in `.gitignore`.
3. **Dedicated Branching:**
   Each agent operates on its own branch:
   - Developer: `violet/task-{taskId}/developer`
   - Integration: `violet/task-{taskId}/integration`
4. **Command Allowlist:**
   Agents can only run vetted binaries inside the worktree (`npm`, `npx`, `git`, `node`, `pytest`, `python`). Dangerous system binaries (`rm`, `del`, `format`, `powershell`, `cmd`, `curl`) are strictly blocked.
5. **No Unilateral Merges:**
   Integration branches are prepared for the owner. Auto-merging into `main` or force-pushing to remotes is strictly prohibited.

---

## 5. Concurrency Control & Scheduling

VIOLET Lab enforces an initial limit of **3 concurrent agents**:

```typescript
class ConcurrencySemaphore {
  private current = 0;
  private readonly max: number = 3;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> { ... }
  release(): void { ... }
}
```

- When 3 agents are actively executing, subsequent agent turns wait in a FIFO queue.
- Releasing a permit immediately wakes the next awaiting agent.
- Tasks support explicit cancellation via `AbortController`. When cancelled, all active worktrees are automatically unmounted and cleaned up.

---

## 6. Single-User Conversion & Security Architecture

VIOLET AI is a private personal operating system owned by a single user. Public access and open registration are disabled:

### Authentication Guard Flow
1. **Direct API Token Authentication:**
   Requests with `Authorization: Bearer <VIOLET_API_TOKEN>` are authorized directly (used by the Windows PC Agent, CLI tools, and local testing).
2. **Supabase Owner JWT Validation:**
   When Supabase Auth is enabled, JWT tokens are decoded and checked against `VIOLET_OWNER_ID` or `VIOLET_OWNER_EMAIL`.
   - If the token is expired, returns `401 Unauthorized: Authentication token has expired.`
   - If the token belongs to another user UUID or email, access is denied with `401 Unauthorized`.
3. **Local Single-User Fallback:**
   When no owner ID or token is configured in development, requests default to the local single-user owner identity (`00000000-0000-0000-0000-000000000001`).

### Database Security (Row-Level Security)
All database tables (`agent_tasks`, `agent_runs`, `agent_events`, `agent_commits`, `agent_artifacts`, `model_usage`, `agent_reviews`) enforce RLS policies restricting data access exclusively to `auth.uid() = user_id`.

---

## 7. Real-Time Dashboard & Event Streaming Protocol

The frontend connects to the backend API via Server-Sent Events (SSE) at:
`GET /api/v1/agent/tasks/:taskId/events`

### Event Schema
```typescript
interface AgentEventRecord {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  agentRole: "architect" | "developer" | "reviewer" | "orchestrator";
  eventType: string; // e.g. "architect.plan_created", "developer.committed"
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
```

The frontend dashboard (`VioletMultiAgentLab.tsx`) dynamically updates:
- Visual progress stepper (Planning -> Implementing -> Reviewing -> Completed).
- Agent status cards showing live activity, model name, and execution duration.
- Real commit cards with SHA copy, commit message, and insertion/deletion badges.
- Live streaming event log with color-coded agent tags.
- Token consumption and USD expenditure meters.
