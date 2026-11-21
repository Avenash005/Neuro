/**
 * VIOLET AI & Lab — Issue Intelligence & Bug Tracking Service
 *
 * Implements automated error detection, stable fingerprint deduplication,
 * skill-based intelligent agent assignment, bounded retries, and issue lifecycle.
 */

import crypto from "node:crypto";
import type {
  IssueCaptureInput,
  IssueCategory,
  IssueFilter,
  IssueFixAttempt,
  IssuePriority,
  IssueRecord,
  IssueSeverity,
  IssueStats,
  IssueStatus,
  SpecializedAgentRole,
} from "../../../types/issues";
import { isSupabaseConfigured, supabase } from "../../supabase";

export class IssueIntelligenceService {
  private readonly issues = new Map<string, IssueRecord>();
  private readonly fixAttempts = new Map<string, IssueFixAttempt[]>();
  private readonly listeners = new Set<(issue: IssueRecord) => void>();

  constructor() {}

  /**
   * Generates a stable normalized fingerprint to deduplicate recurring errors.
   */
  computeFingerprint(category: IssueCategory, errorMessage: string, sourceFile = "", lineNumber = 0): string {
    // Normalize error message: strip timestamps, memory addresses, and variable IDs
    const normalizedMsg = errorMessage
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/gi, "")
      .replace(/0x[0-9a-fA-F]+/g, "0xADDR")
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID")
      .replace(/task_\d+_[a-z0-9]+/gi, "TASK_ID")
      .replace(/run_\d+_[a-z0-9]+/gi, "RUN_ID")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const normalizedPath = sourceFile.replace(/\\/g, "/").toLowerCase();
    const payload = `${category}:${normalizedMsg}:${normalizedPath}:${lineNumber}`;
    return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
  }

  /**
   * Evaluates whether an error represents a transient infrastructure glitch or a code defect.
   */
  isTransientFailure(category: IssueCategory, errorMessage: string): boolean {
    if (category === "ollama_connection" || category === "timeout") return true;

    const lower = errorMessage.toLowerCase();
    const transientKeywords = [
      "econnrefused",
      "econnreset",
      "etimedout",
      "socket hang up",
      "fetch failed",
      "network error",
      "rate limit",
      "429",
      "503 service unavailable",
      "504 gateway timeout",
      "temporarily unavailable",
      "connection closed prematurely",
    ];

    return transientKeywords.some((k) => lower.includes(k));
  }

  /**
   * Routes an issue to a specialized agent role based on file type, error content, and domain skills.
   */
  routeToSpecializedAgent(
    category: IssueCategory,
    errorMessage: string,
    sourceFile = "",
    stackTrace = ""
  ): SpecializedAgentRole {
    const combined = `${errorMessage} ${sourceFile} ${stackTrace}`.toLowerCase();

    // 1. Security Vulnerabilities
    if (
      category === "security_vulnerability" ||
      combined.includes("cve-") ||
      combined.includes("secret") ||
      combined.includes("token leak") ||
      combined.includes("sql injection") ||
      combined.includes("path traversal") ||
      combined.includes("vulnerability")
    ) {
      return "security";
    }

    // 2. Database & Migrations
    if (
      combined.includes("supabase") ||
      combined.includes("postgres") ||
      combined.includes("pg_") ||
      combined.includes("sql") ||
      combined.includes("migration") ||
      combined.includes("relation does not exist") ||
      combined.includes("column does not exist") ||
      combined.includes("foreign key") ||
      combined.includes("deadlock") ||
      sourceFile.endsWith(".sql")
    ) {
      return "database";
    }

    // 3. Frontend & UI
    if (
      sourceFile.endsWith(".tsx") ||
      sourceFile.endsWith(".jsx") ||
      sourceFile.endsWith(".css") ||
      sourceFile.endsWith(".scss") ||
      sourceFile.includes("src/features/") ||
      sourceFile.includes("src/components/") ||
      combined.includes("react") ||
      combined.includes("usestate") ||
      combined.includes("useeffect") ||
      combined.includes("vite:reporter") ||
      combined.includes("html") ||
      combined.includes("dom")
    ) {
      return "frontend";
    }

    // 4. QA & Test Failures
    if (
      category === "test_failure" ||
      combined.includes("vitest") ||
      combined.includes("pytest") ||
      combined.includes("assertionerror") ||
      combined.includes("expected") && combined.includes("received") ||
      sourceFile.includes(".test.") ||
      sourceFile.includes(".spec.")
    ) {
      return "qa";
    }

    // 5. DevOps & Infrastructure
    if (
      combined.includes("docker") ||
      combined.includes("dockerfile") ||
      combined.includes("container") ||
      combined.includes("ci/cd") ||
      combined.includes("github actions") ||
      combined.includes("npm run build") ||
      combined.includes("vite build") ||
      sourceFile.includes("docker-compose") ||
      sourceFile.endsWith(".yml") ||
      sourceFile.endsWith(".yaml")
    ) {
      return "devops";
    }

    // 6. Python / Windows Agent / FastAPI / Backend API
    if (
      sourceFile.endsWith(".py") ||
      sourceFile.includes("apps/violet-local-agent") ||
      sourceFile.includes("src/server/") ||
      combined.includes("fastapi") ||
      combined.includes("starlette") ||
      combined.includes("uvicorn") ||
      combined.includes("pydantic") ||
      combined.includes("win32") ||
      combined.includes("uiautomation") ||
      combined.includes("endpoint")
    ) {
      return "backend";
    }

    // 7. Architectural Decisions & Dependency Conflicts
    if (
      category === "task_dependency" ||
      combined.includes("circular dependency") ||
      combined.includes("architecture") ||
      combined.includes("subtask blocked")
    ) {
      return "architect";
    }

    // 8. General Implementation
    return "developer";
  }

  /**
   * Captures, deduplicates, and logs a newly encountered issue.
   */
  captureIssue(input: IssueCaptureInput): IssueRecord {
    const now = new Date().toISOString();
    const sourceFile = input.sourceFile || "";
    const lineNumber = input.lineNumber || 0;
    const isTransient = this.isTransientFailure(input.category, input.errorMessage);
    const fingerprint = this.computeFingerprint(input.category, input.errorMessage, sourceFile, lineNumber);

    // Check for existing open or in_progress issue with the same fingerprint
    for (const existing of this.issues.values()) {
      if (
        existing.fingerprint === fingerprint &&
        (existing.status === "open" || existing.status === "in_progress" || existing.status === "reopened")
      ) {
        existing.retryCount += 1;
        existing.updatedAt = now;

        // If recurring past max retries, mark blocked and escalate priority
        if (existing.retryCount >= existing.maxRetries) {
          existing.status = "blocked";
          existing.severity = "critical";
          existing.priority = "p0";
          existing.description += `\n[${now}] Recurred ${existing.retryCount} times — exceeded max retries, marked BLOCKED.`;
        } else {
          existing.description += `\n[${now}] Recurrence #${existing.retryCount}: ${input.errorMessage.slice(0, 200)}`;
        }

        this.syncToSupabase(existing);
        this.notifyListeners(existing);
        return existing;
      }
    }

    // Determine initial severity and priority
    let severity: IssueSeverity = input.severity || "high";
    let priority: IssuePriority = input.priority || "p1";

    if (input.category === "security_vulnerability" || input.category === "worker_crash" || input.category === "build_failure") {
      severity = "critical";
      priority = "p0";
    } else if (isTransient) {
      severity = "medium";
      priority = "p2";
    }

    const assignedRole = this.routeToSpecializedAgent(
      input.category,
      input.errorMessage,
      sourceFile,
      input.stackTrace
    );

    const title = input.title || this.synthesizeTitle(input.category, input.errorMessage, sourceFile);
    const issueId = `iss_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const issue: IssueRecord = {
      id: issueId,
      fingerprint,
      title,
      description: input.description || input.errorMessage,
      severity,
      priority,
      category: input.category,
      errorMessage: input.errorMessage,
      stackTrace: input.stackTrace,
      sourceFile: sourceFile || undefined,
      lineNumber: lineNumber > 0 ? lineNumber : undefined,
      detectedAt: now,
      discoveringAgent: input.discoveringAgent || "orchestrator",
      assignedAgent: this.formatAgentTitle(assignedRole),
      assignedRole,
      taskId: input.taskId,
      runId: input.runId,
      worktreeBranch: input.worktreeBranch,
      worktreePath: input.worktreePath,
      rootCause: undefined,
      proposedResolution: undefined,
      status: "open",
      isTransient,
      retryCount: 0,
      maxRetries: 3,
      verificationResults: {},
      fixAttempts: [],
      createdAt: now,
      updatedAt: now,
    };

    this.issues.set(issueId, issue);
    this.fixAttempts.set(issueId, []);
    this.syncToSupabase(issue);
    this.notifyListeners(issue);
    return issue;
  }

  /**
   * Retrieves all issues matching optional filters.
   */
  listIssues(filter?: IssueFilter): IssueRecord[] {
    let result = Array.from(this.issues.values());

    if (filter?.severity && filter.severity !== "all") {
      result = result.filter((i) => i.severity === filter.severity);
    }
    if (filter?.status && filter.status !== "all") {
      result = result.filter((i) => i.status === filter.status);
    }
    if (filter?.category && filter.category !== "all") {
      result = result.filter((i) => i.category === filter.category);
    }
    if (filter?.assignedRole && filter.assignedRole !== "all") {
      result = result.filter((i) => i.assignedRole === filter.assignedRole);
    }
    if (filter?.taskId) {
      result = result.filter((i) => i.taskId === filter.taskId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.errorMessage.toLowerCase().includes(q) ||
          (i.sourceFile && i.sourceFile.toLowerCase().includes(q))
      );
    }

    // Sort descending by detectedAt
    result.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  getIssue(id: string): IssueRecord | undefined {
    const issue = this.issues.get(id);
    if (!issue) return undefined;
    return {
      ...issue,
      fixAttempts: this.fixAttempts.get(id) || [],
    };
  }

  /**
   * Aggregates issue metrics for dashboard widgets.
   */
  getIssueStats(): IssueStats {
    let open = 0;
    let critical = 0;
    let inProgress = 0;
    let resolved = 0;
    let reopened = 0;

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const issue of this.issues.values()) {
      if (issue.status === "open") open++;
      else if (issue.status === "in_progress") inProgress++;
      else if (issue.status === "resolved" || issue.status === "closed") resolved++;
      else if (issue.status === "reopened") reopened++;

      if (issue.severity === "critical" && (issue.status === "open" || issue.status === "in_progress")) {
        critical++;
      }

      byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    }

    return {
      total: this.issues.size,
      open,
      critical,
      inProgress,
      resolved,
      reopened,
      byCategory,
      bySeverity,
    };
  }

  /**
   * Reassigns an issue to a new agent or role.
   */
  assignAgent(issueId: string, assignedAgent: string, role?: SpecializedAgentRole): IssueRecord {
    const issue = this.issues.get(issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);

    issue.assignedAgent = assignedAgent;
    if (role) issue.assignedRole = role;
    issue.updatedAt = new Date().toISOString();

    this.syncToSupabase(issue);
    this.notifyListeners(issue);
    return issue;
  }

  /**
   * Updates an issue's status and records audit notes.
   */
  updateStatus(issueId: string, status: IssueStatus, notes?: string): IssueRecord {
    const issue = this.issues.get(issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);

    issue.status = status;
    issue.updatedAt = new Date().toISOString();
    if (notes) {
      issue.description += `\n[${issue.updatedAt}] Status changed to ${status}: ${notes}`;
    }

    this.syncToSupabase(issue);
    this.notifyListeners(issue);
    return issue;
  }

  /**
   * Records a fix attempt with tests and review verification results.
   */
  recordFixAttempt(
    issueId: string,
    attemptInput: Omit<IssueFixAttempt, "id" | "issueId" | "createdAt">
  ): IssueFixAttempt {
    const issue = this.issues.get(issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);

    const attempts = this.fixAttempts.get(issueId) || [];
    const attempt: IssueFixAttempt = {
      ...attemptInput,
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      issueId,
      createdAt: new Date().toISOString(),
    };

    attempts.push(attempt);
    this.fixAttempts.set(issueId, attempts);

    issue.fixAttempts = attempts;
    issue.updatedAt = new Date().toISOString();

    if (attempt.commitSha) {
      issue.resolutionCommitSha = attempt.commitSha;
    }
    if (attempt.testResults) {
      issue.verificationResults = attempt.testResults;
    }

    if (attempt.isSuccessful) {
      issue.status = "resolved";
    }

    this.syncToSupabase(issue);
    this.notifyListeners(issue);
    return attempt;
  }

  subscribe(listener: (issue: IssueRecord) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(issue: IssueRecord) {
    for (const listener of this.listeners) {
      try {
        listener(issue);
      } catch (err) {
        console.warn("Issue listener error:", err);
      }
    }
  }

  private formatAgentTitle(role: SpecializedAgentRole): string {
    switch (role) {
      case "frontend":
        return "VIOLET Frontend Specialist Agent";
      case "backend":
        return "VIOLET Backend Systems Agent";
      case "database":
        return "VIOLET Database & Storage Agent";
      case "qa":
        return "VIOLET QA & Test Specialist Agent";
      case "security":
        return "VIOLET Security & Vulnerability Agent";
      case "devops":
        return "VIOLET DevOps & Deployment Agent";
      case "architect":
        return "VIOLET Lead Architect Agent";
      case "reviewer":
        return "VIOLET Independent Reviewer Agent";
      case "developer":
      default:
        return "VIOLET Core Developer Agent";
    }
  }

  private synthesizeTitle(category: IssueCategory, errorMessage: string, sourceFile = ""): string {
    const fileHint = sourceFile ? ` in ${sourceFile.split(/[/\\]/).pop()}` : "";
    const cleanMsg = errorMessage.split("\n")[0].slice(0, 80);
    switch (category) {
      case "runtime_error":
        return `Runtime Exception: ${cleanMsg}${fileHint}`;
      case "typescript_error":
        return `TypeScript Type Error: ${cleanMsg}${fileHint}`;
      case "test_failure":
        return `Test Suite Failure: ${cleanMsg}${fileHint}`;
      case "build_failure":
        return `Build Compilation Failure: ${cleanMsg}`;
      case "security_vulnerability":
        return `Security Vulnerability Alert: ${cleanMsg}`;
      case "model_provider":
        return `AI Model Provider Error: ${cleanMsg}`;
      case "ollama_connection":
        return `Ollama Local Service Disconnected: ${cleanMsg}`;
      case "task_dependency":
        return `Subtask Blocked by Dependency Failure: ${cleanMsg}`;
      case "worker_crash":
        return `Agent Worker Crash: ${cleanMsg}`;
      case "timeout":
        return `Execution Timeout Exceeded: ${cleanMsg}`;
      default:
        return `Bug: ${cleanMsg}${fileHint}`;
    }
  }

  private syncToSupabase(issue: IssueRecord) {
    if (isSupabaseConfigured && supabase) {
      void (async () => {
        try {
          await (supabase.from("agent_issues") as any).upsert({
            id: issue.id,
            fingerprint: issue.fingerprint,
            title: issue.title,
            description: issue.description,
            severity: issue.severity,
            priority: issue.priority,
            category: issue.category,
            error_message: issue.errorMessage,
            stack_trace: issue.stackTrace || null,
            source_file: issue.sourceFile || null,
            line_number: issue.lineNumber || null,
            detected_at: issue.detectedAt,
            discovering_agent: issue.discoveringAgent,
            assigned_agent: issue.assignedAgent || null,
            assigned_role: issue.assignedRole,
            task_id: issue.taskId || null,
            run_id: issue.runId || null,
            worktree_branch: issue.worktreeBranch || null,
            worktree_path: issue.worktreePath || null,
            root_cause: issue.rootCause || null,
            proposed_resolution: issue.proposedResolution || null,
            status: issue.status,
            is_transient: issue.isTransient,
            retry_count: issue.retryCount,
            max_retries: issue.maxRetries,
            resolution_commit_sha: issue.resolutionCommitSha || null,
            resolution_commit_message: issue.resolutionCommitMessage || null,
            verification_results: issue.verificationResults || {},
            updated_at: issue.updatedAt,
          });
        } catch (err) {
          console.warn("Could not sync issue to Supabase:", err);
        }
      })();
    }
  }
}

export const globalIssueIntelligenceService = new IssueIntelligenceService();
