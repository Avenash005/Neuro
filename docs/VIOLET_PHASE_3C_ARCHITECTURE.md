# VIOLET Lab — Phase 3C Architecture Specification
## Multi-Model Collaboration Engine & Bounded Review Cycles

---

## 1. Executive Summary & Vision

**VIOLET Lab Phase 3C** extends the multi-agent software engineering platform into a genuine **Multi-Model Collaboration Engine**. In this architecture:
- Multiple specialized AI models (Claude 3.5 Sonnet, GPT-4o, Gemini 2.0 Flash / 2.5 Pro, OpenRouter, and local Ollama) collaborate on software engineering tasks.
- The platform enforces **independent code review**: the Reviewer agent operates with a different model from the Developer whenever possible, preventing blind spots and model-specific biases.
- Reviewers inspect **actual Git diffs** and automated test outputs, delivering structured verdicts (`APPROVED` or `CHANGES_REQUESTED`) with scored issues and actionable recommendations.
- When changes are requested, the orchestrator automatically assigns correction tasks to the Developer in a **bounded review loop** (maximum of 3 attempts).
- All file modifications are protected by a deterministic **File Conflict Guard** preventing duplicates, race conditions, and accidental overwrites.
- Integration branches remain strictly under **owner control**; no remote pushing or automatic merges occur without explicit human authorization.

---

## 2. Multi-Model Collaboration Data Flow

```
+-----------------------------------------------------------------------------------------+
|                                    VIOLET Command Center                                |
|                                   [Multi-Agent Lab Tab]                                 |
|                                                                                         |
|   +--------------------------+  +-------------------------+  +-----------------------+  |
|   |  Architect (Anthropic)   |  |   Developer (OpenAI)    |  |    Reviewer (Gemini)  |  |
|   |  Claude 3.5 Sonnet       |  |   GPT-4o                |  |    Gemini 2.0 Flash   |  |
|   +--------------------------+  +-------------------------+  +-----------------------+  |
|                                                                                         |
|   [ Review Cycles (1..3) ]        [ Real Git Diffs & Commits ]   [ Test Run Outputs ]   |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                         MultiAgentOrchestrator (Phase 3C)                               |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   | 1. Model Assignment Engine (resolveModelAssignments)                            |   |
|   |    - Verifies configured provider credentials                                   |   |
|   |    - Enforces Independent Reviewer: Reviewer Model !== Developer Model          |   |
|   +---------------------------------------------------------------------------------+   |
|   | 2. File Conflict Guard (FileConflictGuard)                                      |   |
|   |    - Path normalization & traversal defense                                     |   |
|   |    - Cross-agent file lock management (acquireLock / releaseLocks)              |   |
|   |    - Intra-turn LLM patch deduplication & conflict resolution                  |   |
|   +---------------------------------------------------------------------------------+   |
|   | 3. Bounded Review & Correction Loop (Max 3 Cycles)                              |   |
|   |                                                                                 |   |
|   |   +------------------------+                                                    |   |
|   |   | Cycle 1..3: Developer  | ---> Writes worktree files                         |   |
|   |   | (Initial or Revision)  | ---> Git Commit (author attribution)               |   |
|   |   +-----------+------------+                                                    |   |
|   |               |                                                                 |   |
|   |               v                                                                 |   |
|   |   +------------------------+                                                    |   |
|   |   | Automated Test Runner  | ---> Runs test commands in isolated worktree       |   |
|   |   | (runCommand)           | ---> Captures exitCode, stdout, stderr             |   |
|   |   +-----------+------------+                                                    |   |
|   |               |                                                                 |   |
|   |               v                                                                 |   |
|   |   +------------------------+                                                    |   |
|   |   | Independent Reviewer   | ---> Inspects actual Git diff & test results       |   |
|   |   | (parseStructuredReview)| ---> Returns [VERDICT], [SCORE], [ISSUES]          |   |
|   |   +-----------+------------+                                                    |   |
|   |               |                                                                 |   |
|   |         +-----+-----------------------------+                                   |   |
|   |         |                                   |                                   |   |
|   |         | [APPROVED]                        | [CHANGES_REQUESTED]               |   |
|   |         v                                   v                                   |   |
|   |   +------------------------+          Cycle < 3 ?                               |   |
|   |   | Prepare Integration    |          YES: Cycle++ -> Re-prompt Developer       |   |
|   |   | Branch (Owner Review)  |          NO: Terminate with max_cycles_reached     |   |
|   |   +------------------------+                                                    |   |
|   +---------------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Independent Cross-Model Code Review

### The Independent Reviewer Principle
When an AI model reviews its own code, it frequently repeats reasoning blind spots or overlooks subtle hallucinations. VIOLET Lab resolves this by enforcing **cross-model independence**:

1. **Provider Diversity:** If the Developer is powered by `openai:gpt-4o`, the Reviewer is automatically assigned to `gemini:gemini-2.0-flash` or `anthropic:claude-3-5-sonnet`.
2. **Model Family Diversity:** If only a single provider is configured (e.g. OpenAI only or Ollama only), the orchestrator selects a different model architecture (e.g. `gpt-4o-mini` reviewing `gpt-4o`, or `deepseek-r1` reviewing `qwen2.5-coder`).
3. **Configuration Verification:** If a user explicitly requests a provider whose credentials or API keys are missing, the orchestrator immediately halts with a descriptive configuration error (`Configuration error: Provider 'x' requested for Role is not configured or missing credentials.`).

---

## 4. Structured Review Protocol

Reviewers analyze the **actual Git diff** produced by `git diff ${baseBranch}...HEAD` and test results. Reviewers return structured evaluations parsed into the following model:

```typescript
export interface ReviewIssue {
  severity: "critical" | "warning" | "suggestion";
  file?: string;
  line?: number;
  description: string;
  suggestedFix?: string;
}

export interface ParsedReviewResult {
  verdict: "approved" | "changes_requested" | "rejected";
  score?: number; // 0 - 100
  issues: ReviewIssue[];
  recommendations: string[];
  summary: string;
}
```

### Tag-Based & JSON Support
The parser handles both structured tags (`[VERDICT]`, `[SCORE]`, `[ISSUES]`, `[RECOMMENDATIONS]`, `[SUMMARY]`) and JSON code fences, ensuring resilience across different model formats.

---

## 5. Bounded Review & Correction Loop (Max 3 Cycles)

The review loop is strictly bounded to prevent infinite cycles and runaway API costs:

| Cycle | Developer Action | Reviewer Action | Outcome If Changes Requested |
|---|---|---|---|
| **Cycle 1** | Implements initial code based on Architect plan. Commits to worktree. | Executes tests. Reviews diff against `baseBranch`. | Automatically dispatches Cycle 2 correction task to Developer with issue list. |
| **Cycle 2** | Implements targeted fixes resolving Reviewer issues. Commits `fix(violet): cycle 2 corrections`. | Re-runs tests. Inspects latest diff. Evaluates whether issues were resolved. | Automatically dispatches Cycle 3 correction task to Developer. |
| **Cycle 3** | Implements final corrections. Commits `fix(violet): cycle 3 corrections`. | Re-runs tests. Conducts final review evaluation. | Bounded limit reached. Task completes with `review.max_cycles_reached` and escalates to owner review. |

---

## 6. File Conflict & Overwrite Guard (`FileConflictGuard`)

Autonomous multi-agent execution requires strict file safety guarantees:
1. **POSIX Path Normalization:** All file paths are sanitized, removing `\` backslashes, leading `./`, and verifying no path escapes the workspace root.
2. **Path Traversal Defense:** Paths containing `..`, absolute drive roots (`C:\`), or leading slashes (`/etc/passwd`) throw an immediate `FileConflictError`.
3. **Protected Path Shield:** Files such as `.env`, `.git/`, `node_modules/`, and `package-lock.json` are protected from modification by autonomous agents.
4. **Intra-Turn Deduplication:** When developer LLMs output duplicate `[FILE: ...]` blocks, the guard detects conflicts, reports warnings, and safely resolves to the latest block.
5. **Concurrency Locks:** Prevents two parallel agent turns or tasks from modifying the same file at the same time.

---

## 7. Owner Control & Integration Safeguards

In accordance with VIOLET Lab's single-user architecture:
- All agent commits remain strictly inside the isolated Git worktree (`violet/task-{taskId}/developer`).
- Upon completion, changes are consolidated into a reviewable integration branch: `violet/task-{taskId}/integration`.
- **Zero Automatic Push or Remote Merge:** The dashboard presents the owner with the exact command to merge when satisfied:
  ```powershell
  git checkout main && git merge --no-ff violet/task-{taskId}/integration
  ```
