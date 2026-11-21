# VIOLET AI & Lab — Phase 3F Extension Architecture
## Issue Intelligence, Automated Defect Capture & Autonomous Resolution Engine

**Branch**: `feature/violet-operating-system-foundation`  
**Date**: November 21, 2026  
**Status**: Production Verified & Fully Implemented  

---

## 1. Executive Summary

Phase 3F Extension extends VIOLET Live Operations with a dedicated **Issue Intelligence & Bug Tracking Center**. The system transforms passive error logging into an active, intelligent defect capture, triage, and autonomous remediation pipeline. It guarantees strict **owner-governed safety**: fixes are executed inside isolated Git worktrees and are never merged into production or base branches without explicit owner confirmation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AUTOMATED ERROR CAPTURE                               │
│  Agent Failures │ Provider Errors │ Terminal Cmds │ Tests │ Security Scans  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ISSUE INTELLIGENCE SERVICE (Fingerprint Engine)             │
│  - Strip timestamps / UUIDs / RAM addrs -> SHA-256 stable fingerprint hash  │
│  - Transient failure vs genuine defect classification (429/timeout/sockets) │
│  - Deduplicate recurring errors & track retry counts (bounded at maxRetries)│
│  - Route to Specialized Agents (Frontend, Backend, Database, QA, Security...)│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 AUTONOMOUS ISSUE RESOLUTION ENGINE (Safe Worktrees)         │
│  1. Extract root cause & proposed fix with Model Gateway reasoning          │
│  2. Create isolated Git worktree: .violet/worktrees/issue-{id}/{role}       │
│  3. Branch: violet/issue-{id}/{role}                                        │
│  4. Apply patches strictly inside worktree (path traversal protected)       │
│  5. Run verification tests in worktree                                      │
│  6. Independent code review verdict (APPROVED / CHANGES_REQUESTED)           │
│  7. Commit fix inside worktree & record attempt                             │
│  8. Mark status 'resolved' & STAGE for owner review                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OWNER CONFIRMATION & INTEGRATION GATE                  │
│  - CRITICAL SAFEGUARD: Zero silent modifications to main/base branch         │
│  - Owner reviews diff, test output, and reviewer score in Issues Center     │
│  - Owner approves: Fast-forward / squash merge into base branch             │
│  - Owner rejects: Issue reopened and worktree pruned                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Pillars

### 2.1 Automated Issue Capture
Defects are automatically captured across the entire VIOLET ecosystem without manual intervention:
1. **Agent Pipeline Failures**: Catches unhandled exceptions, subtask failures, and aborts.
2. **Model Provider Errors**: Captures rate limits, quota outages, and context length errors.
3. **Ollama & Local Model Errors**: Captures local connection drops, missing model weights, and port failures.
4. **Terminal & CLI Failures**: Captures non-zero exit codes from build tools, package managers, and scripts.
5. **TypeScript & Static Analysis**: Captures compilation defects and type check mismatches.
6. **Automated Test Failures**: Captures Vitest / Pytest assertion errors and failure traces.
7. **Security Analysis Findings**: Captures hardcoded secrets, injection vectors, and dependency CVEs.
8. **Reviewer Change Requests**: Converts reviewer `CHANGES_REQUESTED` issues into actionable bug records.
9. **Task Dependency Deadlocks**: Detects circular dependencies and scheduler blockers.
10. **Worker Crashes & Timeouts**: Detects unresponsive worker heartbeats (>30s) and timeout violations.

### 2.2 Stable Fingerprint Deduplication
Recurring test runs, retry loops, and polling cycles frequently encounter the same error multiple times. To eliminate alert fatigue and duplicate issues:
- Error messages are normalized by stripping ISO timestamps (`YYYY-MM-DDTHH:mm:ssZ`), memory addresses (`0xADDR`), UUIDs, and transient task/run identifiers.
- Paths are normalized across Windows (`\`) and POSIX (`/`).
- Payload: `sha256(category + normalized_msg + normalized_path + line_number).slice(0, 32)`.
- If an existing open, in-progress, or reopened issue matches the fingerprint:
  - Increments `retryCount`.
  - Appends recurrence timestamp to description.
  - If `retryCount >= maxRetries` (default 3), escalates status to `blocked`, severity to `critical`, and priority to `p0`.

### 2.3 Transient vs Genuine Defect Classification
Infrastructure blips must not be misdiagnosed as code defects:
- **Transient**: `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `socket hang up`, `fetch failed`, `429 Too Many Requests`, `503 Service Unavailable`, `504 Gateway Timeout`. Handled with retry backoff and marked transient.
- **Genuine Code Defects**: Syntax errors, unhandled rejections, type mismatches, assertion failures, null pointer dereferences. Directly routed for autonomous resolution.

### 2.4 Skill-Based Specialized Agent Routing
Issues are deterministically routed to the optimal agent persona based on file extensions, stack traces, and error semantics:

| Category / Error Indicators | Target Specialized Role | Agent Persona |
| :--- | :--- | :--- |
| `.tsx`, `.jsx`, `.css`, React, DOM, hooks, UI errors | `frontend` | Frontend Agent |
| `.py`, FastAPI, Starlette, uvicorn, Windows agent | `backend` | Backend Agent |
| `.sql`, Postgres, Supabase, migrations, constraints | `database` | Database Agent |
| `test_failure`, Vitest, Pytest, AssertionError | `qa` | QA & Test Agent |
| `security_vulnerability`, CVE, token leaks, injections | `security` | Security Agent |
| Docker, Dockerfile, build failure, CI/CD | `devops` | DevOps Agent |
| `task_dependency`, circular graph, architecture | `architect` | Architect Agent |
| General logic, unclassified exceptions | `developer` | Developer Agent |

---

## 3. Autonomous Issue Resolution Engine

### 3.1 Isolated Worktree Strategy
To eliminate the risk of corrupted working copies or conflicting edits:
- For each defect resolution, an isolated Git worktree is spawned under `.violet/worktrees/issue-{issueId}/{role}`.
- Worktree branch: `violet/issue-{issueId}/{role}` based off the current base branch.
- Target path assertions enforce strict jail containment — path traversal attempts (`../../`) throw immediate security violations.

### 3.2 Resolution Workflow
1. **Context Extraction**: Gathers source file content surrounding `sourceFile` and `lineNumber` (default +/- 25 lines context), stack trace, and original defect metadata.
2. **AI Diagnosis & Fix Synthesis**: Model Gateway invokes reasoning models to output `[ROOT_CAUSE]`, `[PROPOSED_RESOLUTION]`, and `[FILE: <path>]...[END_FILE]` patches.
3. **Patch Application**: Writes patched files strictly inside the isolated worktree directory.
4. **Verification Testing**: Executes verification checks (e.g. `git status`, test suite) inside the worktree.
5. **Independent Code Review**: Computes git diff against base branch and requests review from an independent model.
6. **Worktree Commit**: Commits changes with structured attribution: `fix(category): title [issue:id]`.
7. **Fix Attempt Recording**: Records commit SHA, verification results, and review verdict in the issue history.
8. **Staged Status**: Issue transitions to `resolved`. **Never auto-merges into base branch.**

### 3.3 Owner Confirmation Gate
Only the authenticated human owner can approve merging a fix into the project's base branch:
- **Approval (`/api/v1/issues/:id/approve`)**:
  - Validates that issue status is `resolved`.
  - Fast-forward/squash merges `violet/issue-{id}/{role}` into the target base branch (`main` or feature branch).
  - Updates issue status to `closed`.
  - Cleans up isolated worktree and prunes Git worktree metadata.
- **Rejection (`/api/v1/issues/:id/reject`)**:
  - Reverts issue status to `reopened`.
  - Appends owner's feedback to issue description.
  - Cleans up worktree to prepare for subsequent fix attempts.

---

## 4. REST & SSE Streaming API Specifications

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/issues` | List defects with filters (`status`, `severity`, `category`, `assignedRole`, `search`) | Yes (Owner) |
| `GET` | `/api/v1/issues/stats` | Aggregate metrics (total, open, critical, in-progress, resolved, reopened) | Yes (Owner) |
| `GET` | `/api/v1/issues/stream` | Server-Sent Events (SSE) live push feed of issue updates and captures | Yes (Owner) |
| `GET` | `/api/v1/issues/:id` | Detailed defect record with stack trace and fix attempt history | Yes (Owner) |
| `POST` | `/api/v1/issues/capture` | Programmatically capture a new defect (used by orchestrators & agents) | Yes (Owner/Agent) |
| `POST` | `/api/v1/issues/:id/assign` | Manually reassign defect to a specialized agent role | Yes (Owner) |
| `POST` | `/api/v1/issues/:id/status` | Update lifecycle status (`open`, `in_progress`, `closed`, `blocked`) | Yes (Owner) |
| `POST` | `/api/v1/issues/:id/resolve` | Trigger autonomous resolution workflow in isolated worktree | Yes (Owner) |
| `POST` | `/api/v1/issues/:id/approve` | **Owner Approval**: Merge staged fix branch into repository base branch | Yes (Owner) |
| `POST` | `/api/v1/issues/:id/reject` | Owner Rejection: Reject fix and reopen issue with feedback | Yes (Owner) |

---

## 5. Frontend User Experience

### 5.1 Dedicated Issues & Bugs Center (`VioletIssuesCenter.tsx`)
- **Metrics Bar**: Instant visibility into Total, Open, Critical (P0), In-Progress, Resolved (Awaiting Owner Approval), and Blocked defects.
- **Multi-Filter Toolbar**: Filter by severity, status, category, assigned role, or free-text search.
- **Defect Cards**: Color-coded severity badges, recurrence badges (e.g. `Recurred 2x`), transient pills, and assigned agent tags.
- **Detail Inspector Drawer**:
  - Formatted monospace dark viewer for full stack traces with one-click copy.
  - Root cause diagnosis and proposed remediation breakdown.
  - Staged fix commit SHA and verification results summary.
  - Owner Action Bar: "Trigger Autonomous Fix", "Approve & Merge Integration", "Reject Fix", and "Reassign Agent".

### 5.2 Live Operations Active Defect Banner (`VioletLiveOperations.tsx`)
- When any agent encounters an issue, a high-visibility alert banner renders at the top of the Live Operations dashboard.
- Highlights:
  - Failing agent and role.
  - Current activity when failure occurred.
  - Tool, command, or model that failed.
  - Whether task is currently blocked.
  - Assigned fixing agent.
  - "Inspect in Issues Center" one-click navigation shortcut.
