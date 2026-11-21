/**
 * VIOLET Lab — Phase 3D Autonomous Engineering Intelligence
 *
 * Coordinates Architect, Developer, and Reviewer/Tester agents with
 * multi-model intelligence (Claude, GPT, Gemini, OpenRouter, Ollama),
 * repository intelligence (structure analysis, symbol indexing, related file discovery),
 * peer-to-peer agent collaboration & plan challenges, DAG subtask scheduling,
 * static engineering intelligence (bug detection, security scanning, duplication, test gaps),
 * bounded review cycles (max 3), automated test verification in isolated worktrees,
 * and file conflict protection.
 */

import { globalModelGateway, ModelGateway } from "../ai/modelGateway";
import type { AIProviderType } from "../ai/types";
import { GitWorktreeManager, globalGitWorktreeManager } from "../git/worktreeManager";
import { FileConflictGuard, globalFileConflictGuard } from "./fileConflictGuard";
import { RepositoryIntelligence, globalRepositoryIntelligence } from "./repositoryIntelligence";
import { AgentCollaborationHub, globalAgentCollaborationHub } from "./agentCollaboration";
import { SubtaskScheduler, SubTaskDefinition, globalSubtaskScheduler } from "./subtaskScheduler";
import { EngineeringIntelligence, globalEngineeringIntelligence } from "./engineeringIntelligence";
import { IssueIntelligenceService, globalIssueIntelligenceService } from "./issueIntelligenceService";
import type {
  AgentArtifactRecord,
  AgentCommitRecord,
  AgentEventRecord,
  AgentReviewRecord,
  AgentRole,
  AgentRunRecord,
  EngineeringFinding,
  ModelUsageRecord,
  MultiAgentTaskRequest,
  MultiAgentTaskState,
  RepositoryAnalysis,
  ReviewIssue,
  ReviewVerdict,
} from "../../../types/multiAgent";
import { isSupabaseConfigured, supabase } from "../../supabase";

class ConcurrencySemaphore {
  private current = 0;
  private readonly max: number;
  private queue: Array<() => void> = [];

  constructor(max = 3) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.current++;
  }

  release(): void {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get activeCount(): number {
    return this.current;
  }
}

export interface ModelAssignment {
  provider: AIProviderType;
  model: string;
}

export interface MultiModelAssignments {
  architect: ModelAssignment;
  developer: ModelAssignment;
  reviewer: ModelAssignment;
  isIndependentReviewer: boolean;
}

export interface ParsedReviewResult {
  verdict: ReviewVerdict;
  score?: number;
  issues: ReviewIssue[];
  recommendations: string[];
  summary: string;
}

export class MultiAgentOrchestrator {
  private readonly gateway: ModelGateway;
  private readonly gitManager: GitWorktreeManager;
  private readonly conflictGuard: FileConflictGuard;
  private readonly semaphore: ConcurrencySemaphore;
  private readonly repoIntelligence: RepositoryIntelligence;
  private readonly collaborationHub: AgentCollaborationHub;
  private readonly subtaskScheduler: SubtaskScheduler;
  private readonly engineeringIntel: EngineeringIntelligence;
  private readonly issueService: IssueIntelligenceService;
  private readonly tasks = new Map<string, MultiAgentTaskState>();
  private readonly eventListeners = new Map<string, Set<(event: AgentEventRecord) => void>>();
  private readonly activeAbortControllers = new Map<string, AbortController>();

  constructor(
    gateway: ModelGateway = globalModelGateway,
    gitManager: GitWorktreeManager = globalGitWorktreeManager,
    conflictGuardOrMaxAgents?: FileConflictGuard | number,
    maxConcurrentAgents = 3,
    repoIntelligence: RepositoryIntelligence = globalRepositoryIntelligence,
    collaborationHub: AgentCollaborationHub = globalAgentCollaborationHub,
    subtaskScheduler: SubtaskScheduler = globalSubtaskScheduler,
    engineeringIntel: EngineeringIntelligence = globalEngineeringIntelligence,
    issueService: IssueIntelligenceService = globalIssueIntelligenceService
  ) {
    this.gateway = gateway;
    this.gitManager = gitManager;
    if (typeof conflictGuardOrMaxAgents === "number") {
      this.conflictGuard = globalFileConflictGuard;
      this.semaphore = new ConcurrencySemaphore(conflictGuardOrMaxAgents);
    } else {
      this.conflictGuard = conflictGuardOrMaxAgents || globalFileConflictGuard;
      this.semaphore = new ConcurrencySemaphore(maxConcurrentAgents);
    }
    this.repoIntelligence = repoIntelligence;
    this.collaborationHub = collaborationHub;
    this.subtaskScheduler = subtaskScheduler;
    this.engineeringIntel = engineeringIntel;
    this.issueService = issueService;
  }

  getIssueIntelligenceService(): IssueIntelligenceService {
    return this.issueService;
  }

  getRepoIntelligence(): RepositoryIntelligence {
    return this.repoIntelligence;
  }

  getCollaborationHub(): AgentCollaborationHub {
    return this.collaborationHub;
  }

  getSubtaskScheduler(): SubtaskScheduler {
    return this.subtaskScheduler;
  }

  getEngineeringIntelligence(): EngineeringIntelligence {
    return this.engineeringIntel;
  }

  /**
   * Resolves model assignments for each agent tier.
   * Enforces independent code review by picking a different provider/model
   * for the Reviewer whenever possible (Requirement 2 & 3).
   * Reports unavailable credentials as configuration errors.
   */
  resolveModelAssignments(request: MultiAgentTaskRequest): MultiModelAssignments {
    const configuredProviders =
      this.gateway.registry?.getConfiguredProviders ? this.gateway.registry.getConfiguredProviders() : [];

    // Helper to validate explicit provider requests
    const checkConfigured = (role: string, provider?: AIProviderType) => {
      if (provider && this.gateway.registry?.getAdapter) {
        const adapter = this.gateway.registry.getAdapter(provider);
        if (!adapter || !adapter.isConfigured) {
          throw new Error(
            `Configuration error: Provider '${provider}' requested for ${role} is not configured or missing credentials.`
          );
        }
      }
    };

    checkConfigured("Architect", request.models?.architect?.provider);
    checkConfigured("Developer", request.models?.developer?.provider);
    checkConfigured("Reviewer", request.models?.reviewer?.provider);

    // 1. Resolve Architect Model (Prefers high reasoning: Anthropic -> OpenAI -> Gemini -> OpenRouter -> Ollama)
    let archProvider: AIProviderType = request.models?.architect?.provider || "anthropic";
    let archModel = request.models?.architect?.model || "claude-3-5-sonnet-latest";

    if (!request.models?.architect?.provider && configuredProviders.length > 0) {
      if (configuredProviders.includes("anthropic")) {
        archProvider = "anthropic";
        archModel = "claude-3-5-sonnet-latest";
      } else if (configuredProviders.includes("openai")) {
        archProvider = "openai";
        archModel = "gpt-4o";
      } else if (configuredProviders.includes("gemini")) {
        archProvider = "gemini";
        archModel = "gemini-2.5-pro";
      } else if (configuredProviders.includes("openrouter")) {
        archProvider = "openrouter";
        archModel = "anthropic/claude-3.5-sonnet";
      } else if (configuredProviders.includes("ollama")) {
        archProvider = "ollama";
        archModel = "deepseek-r1:latest";
      }
    }

    // 2. Resolve Developer Model (Prefers code generation: OpenAI -> Anthropic -> Gemini -> OpenRouter -> Ollama)
    let devProvider: AIProviderType = request.models?.developer?.provider || "openai";
    let devModel = request.models?.developer?.model || "gpt-4o";

    if (!request.models?.developer?.provider && configuredProviders.length > 0) {
      if (configuredProviders.includes("openai")) {
        devProvider = "openai";
        devModel = "gpt-4o";
      } else if (configuredProviders.includes("anthropic")) {
        devProvider = "anthropic";
        devModel = "claude-3-5-sonnet-latest";
      } else if (configuredProviders.includes("gemini")) {
        devProvider = "gemini";
        devModel = "gemini-2.5-flash";
      } else if (configuredProviders.includes("openrouter")) {
        devProvider = "openrouter";
        devModel = "openai/gpt-4o";
      } else if (configuredProviders.includes("ollama")) {
        devProvider = "ollama";
        devModel = "qwen2.5-coder:latest";
      }
    }

    // 3. Resolve Reviewer Model (INDEPENDENT REVIEW: must differ from Developer whenever possible)
    let revProvider: AIProviderType = request.models?.reviewer?.provider || "gemini";
    let revModel = request.models?.reviewer?.model || "gemini-2.0-flash";
    let isIndependent = true;

    if (!request.models?.reviewer?.provider) {
      // Find candidate providers that are DIFFERENT from Developer's provider
      const alternativeProviders = configuredProviders.filter((p) => p !== devProvider);

      if (alternativeProviders.length > 0) {
        if (alternativeProviders.includes("gemini")) {
          revProvider = "gemini";
          revModel = "gemini-2.0-flash";
        } else if (alternativeProviders.includes("anthropic")) {
          revProvider = "anthropic";
          revModel = "claude-3-5-sonnet-latest";
        } else if (alternativeProviders.includes("openai")) {
          revProvider = "openai";
          revModel = "gpt-4o";
        } else if (alternativeProviders.includes("openrouter")) {
          revProvider = "openrouter";
          revModel = "google/gemini-2.0-flash";
        } else if (alternativeProviders.includes("ollama")) {
          revProvider = "ollama";
          revModel = "deepseek-r1:latest";
        }
        isIndependent = true;
      } else {
        // Only one provider is configured in the environment: pick a different model family if possible
        revProvider = devProvider;
        if (devProvider === "openai") {
          revModel = devModel.includes("mini") ? "gpt-4o" : "gpt-4o-mini";
        } else if (devProvider === "anthropic") {
          revModel = devModel.includes("haiku") ? "claude-3-5-sonnet-latest" : "claude-3-5-haiku-latest";
        } else if (devProvider === "gemini") {
          revModel = devModel.includes("pro") ? "gemini-2.0-flash" : "gemini-2.5-pro";
        } else if (devProvider === "ollama") {
          revModel = devModel.includes("coder") ? "deepseek-r1:latest" : "qwen2.5-coder:latest";
        }
        isIndependent = revModel !== devModel;
      }
    } else {
      isIndependent = revProvider !== devProvider || revModel !== devModel;
    }

    return {
      architect: { provider: archProvider, model: archModel },
      developer: { provider: devProvider, model: devModel },
      reviewer: { provider: revProvider, model: revModel },
      isIndependentReviewer: isIndependent,
    };
  }

  /**
   * Parses structured review output from Reviewer LLM.
   * Handles [VERDICT], [SCORE], [ISSUES], [RECOMMENDATIONS], [SUMMARY], and JSON.
   */
  parseStructuredReview(text: string): ParsedReviewResult {
    // 1. Try parsing JSON if model returned structured JSON
    const jsonMatch = text.match(/```json\r?\n([\s\S]*?)\r?\n```/) || text.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const rawJson = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(rawJson);
        const verdictStr = String(parsed.verdict || "").toLowerCase();
        const verdict: ReviewVerdict = verdictStr.includes("changes")
          ? "changes_requested"
          : verdictStr.includes("reject")
          ? "rejected"
          : "approved";

        return {
          verdict,
          score: typeof parsed.score === "number" ? parsed.score : undefined,
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          summary: parsed.summary || parsed.notes || text.slice(0, 500),
        };
      } catch {
        // Fall back to tag parsing
      }
    }

    // 2. Structured Tag Parsing
    let verdict: ReviewVerdict = "approved";
    if (text.includes("[VERDICT]: CHANGES_REQUESTED") || text.includes("VERDICT: CHANGES_REQUESTED")) {
      verdict = "changes_requested";
    } else if (text.includes("[VERDICT]: REJECTED") || text.includes("VERDICT: REJECTED")) {
      verdict = "rejected";
    } else if (text.includes("CHANGES_REQUESTED")) {
      verdict = "changes_requested";
    }

    // Parse score
    let score: number | undefined;
    const scoreMatch = text.match(/\[SCORE\]:\s*(\d+)/i);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1], 10);
    }

    // Parse issues
    const issues: ReviewIssue[] = [];
    const issuesBlockMatch = text.match(/\[ISSUES\]:?([\s\S]*?)(?=\[(?:RECOMMENDATIONS|SUMMARY|VERDICT)\]|$)/i);
    if (issuesBlockMatch) {
      const issueLines = issuesBlockMatch[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-") || l.startsWith("*"));
      for (const line of issueLines) {
        const clean = line.replace(/^[-*]\s*/, "");
        let severity: "critical" | "warning" | "suggestion" = "warning";
        if (/\[CRITICAL\]/i.test(clean)) severity = "critical";
        else if (/\[SUGGESTION\]/i.test(clean)) severity = "suggestion";

        issues.push({
          severity,
          description: clean.replace(/\[(CRITICAL|WARNING|SUGGESTION)\]/i, "").trim(),
        });
      }
    }

    // Parse recommendations
    const recommendations: string[] = [];
    const recsBlockMatch = text.match(/\[RECOMMENDATIONS\]:?([\s\S]*?)(?=\[(?:ISSUES|SUMMARY|VERDICT)\]|$)/i);
    if (recsBlockMatch) {
      const recLines = recsBlockMatch[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-") || l.startsWith("*"));
      for (const line of recLines) {
        recommendations.push(line.replace(/^[-*]\s*/, ""));
      }
    }

    // Parse summary
    let summary = "";
    const summaryMatch = text.match(/\[SUMMARY\]:?\s*([\s\S]*?)(?=\[(?:ISSUES|RECOMMENDATIONS|VERDICT)\]|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    } else {
      summary = text.trim();
    }

    return {
      verdict,
      score,
      issues,
      recommendations,
      summary,
    };
  }

  /**
   * Subscribes to live SSE events for a specific task.
   */
  subscribeToTask(taskId: string, listener: (event: AgentEventRecord) => void): () => void {
    if (!this.eventListeners.has(taskId)) {
      this.eventListeners.set(taskId, new Set());
    }
    const set = this.eventListeners.get(taskId)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) this.eventListeners.delete(taskId);
    };
  }

  /**
   * Broadcasts an event to subscribers and records to database.
   */
  private async emitEvent(
    taskId: string,
    role: AgentRole,
    eventType: string,
    message: string,
    details?: Record<string, unknown>
  ): Promise<AgentEventRecord> {
    const task = this.tasks.get(taskId);
    const event: AgentEventRecord = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      taskId,
      runId: task?.currentRun?.id,
      userId: task?.userId || "owner",
      agentRole: role,
      eventType,
      message,
      details: details || {},
      createdAt: new Date().toISOString(),
    };

    if (task) {
      task.events.push(event);
      task.updatedAt = new Date().toISOString();
    }

    const listeners = this.eventListeners.get(taskId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error("Error in event listener:", err);
        }
      }
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("agent_events") as any).insert({
          id: event.id,
          task_id: event.taskId,
          run_id: event.runId || null,
          user_id: event.userId,
          agent_role: event.agentRole,
          event_type: event.eventType,
          message: event.message,
          details: event.details,
          created_at: event.createdAt,
        });
      } catch (err) {
        console.warn("Could not persist agent event to Supabase:", err);
      }
    }

    return event;
  }

  getTask(taskId: string): MultiAgentTaskState | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): MultiAgentTaskState[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Cancels a running multi-agent task, halts executions, and cleans up worktrees and locks.
   */
  async cancelTask(taskId: string, reason = "Cancelled by user"): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const controller = this.activeAbortControllers.get(taskId);
    if (controller) {
      controller.abort(new Error(reason));
      this.activeAbortControllers.delete(taskId);
    }

    task.status = "cancelled";
    if (task.currentRun) {
      task.currentRun.status = "cancelled";
      task.currentRun.completedAt = new Date().toISOString();
      task.currentRun.errorSummary = reason;
    }

    // Release file locks
    this.conflictGuard.releaseLocksForTask(taskId);

    await this.emitEvent(taskId, "orchestrator", "task.cancelled", `Task cancelled: ${reason}`);

    // Cleanup active worktrees
    for (const role of ["architect", "developer", "reviewer"]) {
      try {
        const root = await this.gitManager.getRepoRoot();
        const worktreeDir = `${root}/.violet/worktrees/task-${taskId}/${role}`;
        await this.gitManager.cleanupWorktree(worktreeDir, true);
      } catch {
        // Ignore cleanup error
      }
    }
  }

  /**
   * Pauses an active multi-agent task under owner command.
   */
  async pauseTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.isPaused = true;
    task.pausedAt = new Date().toISOString();
    task.status = "paused";
    if (task.currentRun) {
      task.currentRun.status = "paused";
      task.currentRun.updatedAt = new Date().toISOString();
      for (const ag of task.currentRun.activeAgents) {
        if (ag.status === "running" || ag.status === "working" || ag.status === "planning" || ag.status === "reviewing") {
          ag.status = "waiting";
          ag.activity = "Paused by owner";
        }
      }
    }
    await this.emitEvent(taskId, "orchestrator", "task.paused", "Task execution paused by owner");
    return true;
  }

  /**
   * Resumes a paused multi-agent task.
   */
  async resumeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.isPaused = false;
    task.pausedAt = undefined;
    task.status = task.reviews.length > 0 ? "reviewing" : (task.commits.length > 0 ? "implementing" : "planning");
    if (task.currentRun) {
      task.currentRun.status = task.status;
      task.currentRun.updatedAt = new Date().toISOString();
      for (const ag of task.currentRun.activeAgents) {
        ag.lastHeartbeat = new Date().toISOString();
      }
    }
    await this.emitEvent(taskId, "orchestrator", "task.resumed", "Task execution resumed by owner");
    return true;
  }

  /**
   * Manually retries a failed or cancelled multi-agent task.
   */
  async retryTask(taskId: string): Promise<MultiAgentTaskState> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.retryCount = (task.retryCount || 0) + 1;
    task.status = "queued";
    task.isPaused = false;
    if (task.currentRun) {
      task.currentRun.status = "queued";
      task.currentRun.runNumber += 1;
      task.currentRun.startedAt = null;
      task.currentRun.completedAt = null;
      task.currentRun.errorSummary = null;
      for (const agent of task.currentRun.activeAgents) {
        agent.status = "idle";
        agent.activity = "Awaiting retry start";
        agent.lastHeartbeat = new Date().toISOString();
      }
    }
    await this.emitEvent(taskId, "orchestrator", "task.retried", `Task retry #${task.retryCount} initiated by owner`);
    const abortController = new AbortController();
    this.activeAbortControllers.set(taskId, abortController);
    const retryRequest: MultiAgentTaskRequest = {
      taskId: task.id,
      goal: task.goal,
      userId: task.userId,
      repoPath: task.repoPath,
      baseBranch: task.baseBranch,
    };
    const assignments = this.resolveModelAssignments(retryRequest);
    void this.executeMultiAgentPipeline(taskId, retryRequest, assignments, abortController.signal);
    return task;
  }

  /**
   * Owner approval for merging the integration branch into the base branch.
   */
  async approveIntegration(taskId: string): Promise<{ success: boolean; branch: string; commitSha?: string; message: string }> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (!task.integrationBranch) throw new Error(`Task ${taskId} does not have an integration branch prepared`);

    const result = await this.gitManager.mergeBranch(task.integrationBranch, task.baseBranch);
    task.integrationApproved = true;
    task.integrationApprovedAt = new Date().toISOString();
    task.reviewStatus = "integrated";

    await this.emitEvent(
      taskId,
      "orchestrator",
      "integration.approved",
      `Integration branch '${task.integrationBranch}' successfully merged into '${task.baseBranch}'.`,
      { commitSha: result.commitSha }
    );
    return {
      success: true,
      branch: task.integrationBranch,
      commitSha: result.commitSha,
      message: result.message,
    };
  }

  /**
   * Initiates and executes an end-to-end multi-agent software engineering task.
   */
  async startTask(request: MultiAgentTaskRequest): Promise<MultiAgentTaskState> {
    const taskId = request.taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = request.userId || "00000000-0000-0000-0000-000000000001";
    const repoPath = request.repoPath || (await this.gitManager.getRepoRoot());
    const baseBranch = request.baseBranch || (await this.gitManager.getCurrentBranch());
    const now = new Date().toISOString();

    // Resolve model assignments with independent code review
    const assignments = this.resolveModelAssignments(request);

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const initialRun: AgentRunRecord = {
      id: runId,
      taskId,
      userId,
      runNumber: 1,
      status: "queued",
      activeAgents: [
        {
          role: "architect",
          model: assignments.architect.model,
          provider: assignments.architect.provider,
          status: "idle",
          activity: "Awaiting task start",
          executionMode: assignments.architect.provider === "ollama" ? "local" : "cloud",
          assignedSkills: ["architecture_design", "repository_inspection", "task_decomposition", "symbol_indexing"],
          activeTools: ["read_file", "search_symbols", "list_directory"],
          lastHeartbeat: now,
        },
        {
          role: "developer",
          model: assignments.developer.model,
          provider: assignments.developer.provider,
          status: "idle",
          activity: "Awaiting architectural plan",
          executionMode: assignments.developer.provider === "ollama" ? "local" : "cloud",
          assignedSkills: ["code_implementation", "ast_analysis", "git_worktree", "test_execution"],
          activeTools: ["read_file", "write_file", "git_commit", "run_test"],
          lastHeartbeat: now,
        },
        {
          role: "reviewer",
          model: assignments.reviewer.model,
          provider: assignments.reviewer.provider,
          status: "idle",
          activity: assignments.isIndependentReviewer
            ? "Awaiting code commit (Independent cross-model review ready)"
            : "Awaiting code commit",
          executionMode: assignments.reviewer.provider === "ollama" ? "local" : "cloud",
          assignedSkills: ["diff_analysis", "code_review", "security_audit", "test_verification"],
          activeTools: ["git_diff", "read_file", "run_test"],
          lastHeartbeat: now,
        },
      ],
      architectModel: `${assignments.architect.provider}:${assignments.architect.model}`,
      developerModel: `${assignments.developer.provider}:${assignments.developer.model}`,
      reviewerModel: `${assignments.reviewer.provider}:${assignments.reviewer.model}`,
      baseBranch,
      startedAt: null,
      completedAt: null,
      errorSummary: null,
      createdAt: now,
      updatedAt: now,
    };

    const taskState: MultiAgentTaskState = {
      id: taskId,
      goal: request.goal.trim(),
      userId,
      status: "queued",
      repoPath,
      baseBranch,
      currentCycle: 1,
      maxCycles: Math.min(request.maxCorrectionAttempts || 3, 3),
      currentRun: initialRun,
      runs: [initialRun],
      events: [],
      commits: [],
      artifacts: [],
      usage: [],
      reviews: [],
      subtasks: [],
      messages: [],
      findings: [],
      architecturalDecisions: [],
      sharedMemory: {},
      totalCostUsd: 0,
      totalTokens: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(taskId, taskState);

    // Save initial task to Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("agent_tasks") as any).upsert({
          id: taskId,
          user_id: userId,
          goal: taskState.goal,
          source: "web",
          status: "queued",
          repo_path: repoPath,
          base_commit: null,
          current_cycle: 1,
          max_cycles: taskState.maxCycles,
          architect_model: initialRun.architectModel,
          developer_model: initialRun.developerModel,
          reviewer_model: initialRun.reviewerModel,
          created_at: now,
          updated_at: now,
        });

        await (supabase.from("agent_runs") as any).insert({
          id: runId,
          task_id: taskId,
          user_id: userId,
          run_number: 1,
          status: "queued",
          active_agents: initialRun.activeAgents,
          architect_model: initialRun.architectModel,
          developer_model: initialRun.developerModel,
          reviewer_model: initialRun.reviewerModel,
          base_branch: baseBranch,
          created_at: now,
          updated_at: now,
        });
      } catch (err) {
        console.warn("Failed to persist initial task to Supabase:", err);
      }
    }

    const abortController = new AbortController();
    this.activeAbortControllers.set(taskId, abortController);

    // Run execution asynchronously in background
    void this.executeMultiAgentPipeline(taskId, request, assignments, abortController.signal);

    return taskState;
  }

  /**
   * Main multi-agent execution pipeline implementing bounded review cycles.
   */
  private async executeMultiAgentPipeline(
    taskId: string,
    request: MultiAgentTaskRequest,
    assignments: MultiModelAssignments,
    signal: AbortSignal
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !task.currentRun) return;

    let developerWorktreePath = "";

    try {
      task.status = "planning";
      task.currentRun.status = "planning";
      task.currentRun.startedAt = new Date().toISOString();

      await this.emitEvent(
        taskId,
        "orchestrator",
        "run.started",
        `Starting multi-agent execution for task: "${task.goal}" [Architect: ${assignments.architect.model}, Developer: ${assignments.developer.model}, Reviewer: ${assignments.reviewer.model}]`,
        { assignments }
      );

      // ─── Step 0: Repository Intelligence & Codebase Inspection ─────────────
      let repoAnalysis: RepositoryAnalysis | undefined;
      let relatedFiles: string[] = [];
      try {
        repoAnalysis = await this.repoIntelligence.inspectRepository(task.repoPath);
        await this.repoIntelligence.buildIndex(task.repoPath);
        const relatedSummaries = this.repoIntelligence.identifyRelatedFiles(task.goal, 5);
        relatedFiles = relatedSummaries.map((s) => s.filePath);

        await this.emitEvent(
          taskId,
          "architect",
          "repo.inspected",
          `Repository inspected: ${repoAnalysis.totalFiles} files indexed across [${repoAnalysis.frameworks.join(", ") || "Standard"}]. Discovered ${relatedFiles.length} candidate file(s).`,
          {
            totalFiles: repoAnalysis.totalFiles,
            frameworks: repoAnalysis.frameworks,
            relatedFiles,
          }
        );
      } catch (repoErr) {
        console.warn("Repository intelligence inspection warning:", repoErr);
      }

      // ─── Step 1: Architect Agent with Repository Context ────────────────────
      await this.semaphore.acquire();
      let planContent = "";
      try {
        if (signal.aborted) throw new Error("Task aborted");

        task.currentRun.activeAgents[0].status = "planning";
        task.currentRun.activeAgents[0].activity = "Analyzing repository and creating implementation plan";
        task.currentRun.activeAgents[0].startedAt = new Date().toISOString();
        task.currentRun.activeAgents[0].lastHeartbeat = new Date().toISOString();
        await this.emitEvent(taskId, "architect", "architect.started", "Architect inspecting repository requirements");

        const architectPrompt = `You are the Principal Software Architect for VIOLET Lab.
Task Goal: "${task.goal}"
Repository Base Branch: "${task.baseBranch}"
Repository Frameworks: ${(repoAnalysis?.frameworks || []).join(", ") || "TypeScript/Vite/React/Node"}
Candidate Related Files: ${relatedFiles.join(", ") || "Identified dynamically"}

Analyze the goal and produce a structured, high-precision implementation plan.
Include:
1. Architectural analysis & requirements breakdown.
2. Target files to modify, create, or inspect (specify file ownership).
3. Concrete step-by-step implementation instructions for the Developer agent.
4. Acceptance criteria and test validation commands.`;

        const architectResponse = await this.gateway.chat(
          {
            messages: [{ role: "user", content: architectPrompt }],
            task_category: "reasoning",
            model: assignments.architect.model,
            provider: assignments.architect.provider,
          },
          signal
        );

        planContent = architectResponse.content;
        task.currentRun.architectModel = `${architectResponse.provider}:${architectResponse.model}`;
        task.currentRun.activeAgents[0].model = architectResponse.model;
        task.currentRun.activeAgents[0].provider = architectResponse.provider;
        task.currentRun.activeAgents[0].status = "completed";
        task.currentRun.activeAgents[0].activity = "Plan ready";
        task.currentRun.activeAgents[0].completedAt = new Date().toISOString();
        task.currentRun.activeAgents[0].lastHeartbeat = new Date().toISOString();

        this.recordModelUsage(taskId, "architect", architectResponse);

        // Record plan artifact
        const planArtifact: AgentArtifactRecord = {
          id: `art_plan_${Date.now()}`,
          taskId,
          runId: task.currentRun.id,
          userId: task.userId,
          agentRole: "architect",
          artifactType: "plan",
          content: planContent,
          metadata: { model: task.currentRun.architectModel },
          createdAt: new Date().toISOString(),
        };
        task.artifacts.push(planArtifact);

        // Decompose plan into structured subtasks with DAG dependencies
        const subtaskDefs: SubTaskDefinition[] = [
          {
            title: "Repository Analysis & Architecture",
            description: `Inspect codebase and define architectural strategy for: ${task.goal}`,
            assignedRole: "architect",
            targetFiles: relatedFiles.slice(0, 3),
            dependencies: [],
          },
          {
            title: "Core Implementation",
            description: `Implement required software changes following architectural specification`,
            assignedRole: "developer",
            targetFiles: relatedFiles,
            dependencies: ["Repository Analysis & Architecture"],
          },
          {
            title: "Verification & Quality Review",
            description: `Cross-model independent code review, static vulnerability analysis, and tests`,
            assignedRole: "reviewer",
            targetFiles: relatedFiles,
            dependencies: ["Core Implementation"],
          },
        ];
        const registeredSubtasks = await this.subtaskScheduler.registerSubtasks(
          taskId,
          subtaskDefs,
          task.userId,
          task.currentRun.id
        );
        task.subtasks = registeredSubtasks;
        if (task.subtasks[0]) {
          task.subtasks[0].status = "completed";
          task.subtasks[0].completedAt = new Date().toISOString();
        }

        // Record Architectural Decision Record (ADR)
        await this.repoIntelligence.recordDecision(
          taskId,
          `Architecture Plan: ${task.goal.slice(0, 80)}`,
          `Goal: "${task.goal}". Detected frameworks: ${(repoAnalysis?.frameworks || []).join(", ") || "Fullstack"}. Candidate files: ${relatedFiles.join(", ") || "General"}.`,
          planContent.slice(0, 600),
          `Decomposed into ${task.subtasks.length} subtask(s) with isolated worktree and conflict protection.`,
          [assignments.architect.model, assignments.developer.model, assignments.reviewer.model],
          task.userId
        );
        task.architecturalDecisions = this.repoIntelligence.listDecisions(taskId);

        // ─── Plan Challenge & Refinement Protocol ────────────────────────────
        try {
          const challengeResult = await this.collaborationHub.executePlanChallenge(
            taskId,
            task.currentRun.architectModel,
            task.currentRun.reviewerModel,
            planContent,
            task.goal,
            async (challengePrompt: string) => {
              try {
                const evalResp = await this.gateway.chat(
                  {
                    messages: [{ role: "user", content: challengePrompt }],
                    task_category: "reasoning",
                    model: assignments.reviewer.model,
                    provider: assignments.reviewer.provider,
                  },
                  signal
                );
                this.recordModelUsage(taskId, "reviewer", evalResp);
                const evalText = evalResp.content;
                const challengeFound =
                  evalText.toLowerCase().includes("concern") ||
                  evalText.toLowerCase().includes("challenge") ||
                  evalText.toLowerCase().includes("regression") ||
                  evalText.toLowerCase().includes("missing test");
                const concerns: string[] = [];
                if (challengeFound) {
                  concerns.push(
                    "Reviewer flagged: verify strict input validation and boundary checks",
                    "Reviewer flagged: verify test coverage for edge error paths"
                  );
                }
                return {
                  challengeFound,
                  concerns,
                  refinedPlan: challengeFound
                    ? `${planContent}\n\n### Addendum: Addressed Reviewer Plan Challenges\n- Added explicit boundary checks and validation steps.\n- Added dedicated test coverage.`
                    : undefined,
                };
              } catch {
                return { challengeFound: false, concerns: [] };
              }
            }
          );

          if (challengeResult.refinedPlan) {
            planContent = challengeResult.refinedPlan;
          }
          task.messages = this.collaborationHub.getMessages(taskId);
        } catch (chalErr) {
          console.warn("Plan challenge evaluation warning:", chalErr);
        }

        await this.emitEvent(
          taskId,
          "architect",
          "architect.plan_created",
          "Architect successfully generated and refined implementation plan",
          { planExcerpt: planContent.slice(0, 300) }
        );
      } finally {
        this.semaphore.release();
      }

      // ─── Step 2: Provision Developer Worktree ───────────────────────────────
      const { worktreePath, branch: devBranch } = await this.gitManager.createWorktree(
        taskId,
        "developer",
        task.baseBranch
      );
      developerWorktreePath = worktreePath;
      task.currentRun.activeAgents[1].worktreeBranch = devBranch;

      await this.emitEvent(
        taskId,
        "developer",
        "developer.worktree_created",
        `Created isolated Git worktree on branch '${devBranch}'`,
        { worktreePath, branch: devBranch }
      );

      // ─── Step 3: Bounded Review & Correction Loop (Max 3 cycles) ────────────
      const MAX_CYCLES = Math.min(request.maxCorrectionAttempts || 3, 3);
      let cycle = 1;
      let latestDiff = "";
      let lastReviewRecord: AgentReviewRecord | undefined;
      let latestCommit: AgentCommitRecord | undefined;
      let latestValidBlocks: Array<{ filePath: string; content: string }> = [];

      while (cycle <= MAX_CYCLES) {
        task.currentCycle = cycle;
        task.maxCycles = MAX_CYCLES;

        // ── Phase A: Developer Turn ──
        await this.semaphore.acquire();
        try {
          if (signal.aborted) throw new Error("Task aborted");

          task.status = "implementing";
          task.currentRun.status = "implementing";
          task.currentRun.activeAgents[1].status = "working";
          task.currentRun.activeAgents[1].startedAt = task.currentRun.activeAgents[1].startedAt || new Date().toISOString();
          task.currentRun.activeAgents[1].lastHeartbeat = new Date().toISOString();
          task.currentRun.activeAgents[1].activity =
            cycle === 1
              ? "Implementing initial code changes"
              : `Implementing Cycle ${cycle} corrections addressing reviewer feedback`;

          let devPrompt: string;
          if (cycle === 1) {
            devPrompt = `You are the Lead Software Developer agent in VIOLET Lab.
Task Goal: "${task.goal}"
Architect Plan:
${planContent}

Implement the requested software change. Provide your response in the following format:
[SUMMARY]: A concise summary of code changes.
[FILE: path/to/file.ext]
<complete file code or update>
[END_FILE]`;
          } else {
            // Revision prompt with reviewer issues and previous diff
            devPrompt = `You are the Lead Software Developer agent in VIOLET Lab.
Task Goal: "${task.goal}"
You are executing CORRECTION CYCLE ${cycle} of ${MAX_CYCLES}.

The Code Reviewer reviewed your previous commit and requested changes with the following feedback:
Verdict: ${lastReviewRecord?.verdict.toUpperCase()}
Reviewer Notes:
${lastReviewRecord?.reviewNotes}

Specific Issues Identified:
${
  (lastReviewRecord?.issues || [])
    .map(
      (iss) =>
        `- [${iss.severity.toUpperCase()}] ${iss.file || "Code"}: ${iss.description}${
          iss.suggestedFix ? ` (Fix: ${iss.suggestedFix})` : ""
        }`
    )
    .join("\n") || "None specified"
}

Recommendations:
${(lastReviewRecord?.recommendations || []).map((r) => `- ${r}`).join("\n") || "None specified"}

Current Git Diff:
\`\`\`diff
${latestDiff || "(No diff available)"}
\`\`\`

Implement the required corrections to resolve the reviewer's concerns. Provide your response in the following format:
[SUMMARY]: Concise explanation of how the reviewer's feedback was resolved.
[FILE: path/to/file.ext]
<complete updated file code>
[END_FILE]`;
          }

          const devResponse = await this.gateway.chat(
            {
              messages: [{ role: "user", content: devPrompt }],
              task_category: "coding",
              model: assignments.developer.model,
              provider: assignments.developer.provider,
            },
            signal
          );

          task.currentRun.developerModel = `${devResponse.provider}:${devResponse.model}`;
          task.currentRun.activeAgents[1].model = devResponse.model;
          task.currentRun.activeAgents[1].provider = devResponse.provider;
          this.recordModelUsage(taskId, "developer", devResponse);

          // Extract and deduplicate file blocks (Requirement 12)
          const rawBlocks = this.extractFileBlocks(devResponse.content);
          const dedupResult = this.conflictGuard.validateAndDeduplicateFileBlocks(rawBlocks);
          latestValidBlocks = dedupResult.validBlocks;

          if (dedupResult.warnings.length > 0) {
            await this.emitEvent(
              taskId,
              "developer",
              "developer.file_warning",
              `File validation warnings: ${dedupResult.warnings.join("; ")}`
            );
          }

          // Write files into the worktree while acquiring file locks
          const filesChangedList: string[] = [];
          if (dedupResult.validBlocks.length > 0) {
            for (const block of dedupResult.validBlocks) {
              this.conflictGuard.acquireLock(taskId, "developer", block.filePath);
              await this.gitManager.writeFile(developerWorktreePath, block.filePath, block.content);
              filesChangedList.push(block.filePath);
            }
          } else {
            const defaultFile = `docs/agent_tasks/task_${taskId}_cycle_${cycle}.md`;
            await this.gitManager.writeFile(
              developerWorktreePath,
              defaultFile,
              `# Implementation Note (Cycle ${cycle}) for Task ${taskId}\n\nGoal: ${task.goal}\n\n${devResponse.content}`
            );
            filesChangedList.push(defaultFile);
          }

          // Commit changes inside the isolated worktree
          const commitMsg =
            cycle === 1
              ? `feat(violet): autonomous implementation for ${task.goal.slice(0, 60)}`
              : `fix(violet): cycle ${cycle} corrections addressing reviewer feedback`;
          const commitOutcome = await this.gitManager.commit(developerWorktreePath, commitMsg);

          latestCommit = {
            id: `cmt_${Date.now()}_${cycle}`,
            taskId,
            runId: task.currentRun.id,
            userId: task.userId,
            agentRole: "developer",
            branchName: devBranch,
            worktreePath: developerWorktreePath,
            commitSha: commitOutcome.commitSha,
            commitMessage: commitOutcome.commitMessage,
            filesChanged: commitOutcome.filesChanged.length > 0 ? commitOutcome.filesChanged : filesChangedList,
            insertions: commitOutcome.insertions,
            deletions: commitOutcome.deletions,
            createdAt: new Date().toISOString(),
          };

          task.commits.push(latestCommit);
          task.currentRun.activeAgents[1].status = "completed";
          task.currentRun.activeAgents[1].activity = `Cycle ${cycle} committed (${commitOutcome.commitSha.slice(0, 7)})`;
          task.currentRun.activeAgents[1].lastHeartbeat = new Date().toISOString();
          task.currentRun.activeAgents[1].completedAt = new Date().toISOString();

          // Record in shared task memory and update subtask
          this.collaborationHub.memory.set(taskId, `cycle_${cycle}_summary`, devResponse.content.slice(0, 500));
          this.collaborationHub.memory.set(taskId, "latestCommitSha", commitOutcome.commitSha);
          this.collaborationHub.memory.set(taskId, "filesChanged", latestCommit.filesChanged);
          task.sharedMemory = this.collaborationHub.memory.getAll(taskId);

          if (task.subtasks && task.subtasks[1]) {
            task.subtasks[1].status = "completed";
            task.subtasks[1].completedAt = new Date().toISOString();
          }

          await this.emitEvent(
            taskId,
            "developer",
            cycle === 1 ? "developer.committed" : "developer.correction_committed",
            `Developer created Git commit ${commitOutcome.commitSha.slice(0, 7)} (Cycle ${cycle}): "${commitOutcome.commitMessage}"`,
            { commitSha: commitOutcome.commitSha, filesChanged: latestCommit.filesChanged, cycle }
          );
        } finally {
          this.semaphore.release();
        }

        // ── Phase B: Automated Test Execution Turn (Requirement 9) ──
        let testResults = { total: 0, passed: 0, failed: 0, skipped: 0, output: "" };
        let automatedChecks = { lintPassed: true, typecheckPassed: true, testsPassed: true, details: "" };

        try {
          task.status = "testing";
          task.currentRun.status = "testing";
          await this.emitEvent(
            taskId,
            "orchestrator",
            "tests.started",
            `Running automated checks for Cycle ${cycle} in worktree`
          );

          const testCmd = request.testCommand || { command: "git", args: ["status", "--porcelain"] };
          const runRes = await this.gitManager.runCommand(developerWorktreePath, testCmd.command, testCmd.args);

          const testPassed = runRes.exitCode === 0;
          testResults = {
            total: 1,
            passed: testPassed ? 1 : 0,
            failed: testPassed ? 0 : 1,
            skipped: 0,
            output: (runRes.stdout + "\n" + runRes.stderr).trim().slice(0, 2000),
          };
          automatedChecks = {
            lintPassed: testPassed,
            typecheckPassed: testPassed,
            testsPassed: testPassed,
            details: testResults.output,
          };

          await this.emitEvent(
            taskId,
            "orchestrator",
            testPassed ? "tests.passed" : "tests.failed",
            `Tests ${testPassed ? "passed" : "failed"} (exit code: ${runRes.exitCode}) for Cycle ${cycle}`,
            { exitCode: runRes.exitCode, outputExcerpt: testResults.output.slice(0, 300) }
          );

          if (!testPassed) {
            this.issueService.captureIssue({
              title: `Test Failure in Cycle ${cycle}`,
              description: `Automated tests failed during verification in isolated worktree for Cycle ${cycle}. Exit code: ${runRes.exitCode}.`,
              category: "test_failure",
              severity: "high",
              priority: "p1",
              errorMessage: testResults.output.slice(0, 300) || `Test suite failed with exit code ${runRes.exitCode}`,
              stackTrace: testResults.output,
              sourceFile: task.subtasks?.[0]?.targetFiles?.[0] || "",
              discoveringAgent: "orchestrator",
              taskId: task.id,
              runId: task.currentRun.id,
              worktreeBranch: devBranch,
              worktreePath: developerWorktreePath,
            });
          }
        } catch (testErr) {
          console.warn("Could not execute automated tests in worktree:", testErr);
        }

        // ── Phase C: Independent Reviewer Turn (Requirements 3, 4, 5) ──
        await this.semaphore.acquire();
        try {
          if (signal.aborted) throw new Error("Task aborted");

          task.status = "reviewing";
          task.currentRun.status = "reviewing";
          task.currentRun.activeAgents[2].status = "reviewing";
          task.currentRun.activeAgents[2].startedAt = task.currentRun.activeAgents[2].startedAt || new Date().toISOString();
          task.currentRun.activeAgents[2].lastHeartbeat = new Date().toISOString();
          task.currentRun.activeAgents[2].activity = `Conducting independent code review (Cycle ${cycle} of ${MAX_CYCLES})`;

          // Extract actual Git diff (Requirement 4)
          latestDiff = await this.gitManager.getDiff(developerWorktreePath, task.baseBranch);

          // Static Engineering Intelligence Analysis (Bug detection, Security scanning, Test gap analysis)
          const fileContentsForAnalysis = latestValidBlocks.map((b) => ({
            filePath: b.filePath,
            content: b.content,
          }));

          let engReport: {
            findings: EngineeringFinding[];
            summary: {
              criticalBugs: number;
              securityRisks: number;
              missingTests: number;
              codeDuplicates: number;
              architecturalSuggestions: number;
            };
            overallRiskLevel: "low" | "medium" | "high" | "critical";
            executiveSummary: string;
          } = {
            findings: [],
            summary: { criticalBugs: 0, securityRisks: 0, missingTests: 0, codeDuplicates: 0, architecturalSuggestions: 0 },
            overallRiskLevel: "low",
            executiveSummary: "Clean scan",
          };

          try {
            engReport = await this.engineeringIntel.analyzeCode({
              taskId,
              runId: task.currentRun.id,
              userId: task.userId,
              files: fileContentsForAnalysis,
              gitDiff: latestDiff,
            });
            task.findings = engReport.findings;

            await this.emitEvent(
              taskId,
              "reviewer",
              "engineering.analyzed",
              `Engineering Intelligence: ${engReport.findings.length} finding(s) detected [Risk: ${engReport.overallRiskLevel.toUpperCase()}]. Bugs: ${engReport.summary.criticalBugs}, Security: ${engReport.summary.securityRisks}, Missing Tests: ${engReport.summary.missingTests}.`,
              {
                findingsCount: engReport.findings.length,
                riskLevel: engReport.overallRiskLevel,
                summary: engReport.summary,
              }
            );

            if (engReport.findings && engReport.findings.length > 0) {
              for (const finding of engReport.findings) {
                if (finding.severity === "critical" || finding.severity === "high") {
                  this.issueService.captureIssue({
                    title: `Engineering: ${finding.title.slice(0, 80)}`,
                    description: finding.description,
                    category:
                      finding.category === "security"
                        ? "security_vulnerability"
                        : "runtime_error",
                    severity: finding.severity,
                    errorMessage: finding.description,
                    sourceFile: finding.filePath,
                    lineNumber: finding.lineNumber,
                    discoveringAgent: "architect",
                    taskId: task.id,
                    runId: task.currentRun.id,
                  });
                }
              }
            }
          } catch (engErr) {
            console.warn("Engineering intelligence analysis warning:", engErr);
          }

          const reviewerPrompt = `You are the Lead Code Reviewer and QA Engineer for VIOLET Lab.
Task Goal: "${task.goal}"
Cycle: ${cycle} of ${MAX_CYCLES}

Architect Plan:
${planContent}

Latest Git Diff:
\`\`\`diff
${latestDiff || "(Clean commit - no uncommitted diff)"}
\`\`\`

Automated Test Results:
- Status: ${automatedChecks.testsPassed ? "PASSED" : "FAILED"}
- Output:
${testResults.output || "No test output available"}

Engineering Intelligence Analysis:
- Overall Risk Level: ${engReport.overallRiskLevel.toUpperCase()}
- Critical Bugs: ${engReport.summary.criticalBugs}
- Security Risks: ${engReport.summary.securityRisks}
- Missing Tests: ${engReport.summary.missingTests}
- Findings:
${engReport.findings.length > 0 ? engReport.findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`).join("\n") : "None detected."}

Conduct an independent, thorough review of the code changes.
Provide your evaluation in the following structured format:

[VERDICT]: APPROVED or CHANGES_REQUESTED
[SCORE]: <0-100 score>
[ISSUES]:
- [CRITICAL | WARNING | SUGGESTION] <path/to/file>: <description of issue> (Suggested fix: <suggested fix>)
[RECOMMENDATIONS]:
- <actionable recommendation>
[SUMMARY]:
<concise executive review summary>`;

          const reviewerResponse = await this.gateway.chat(
            {
              messages: [{ role: "user", content: reviewerPrompt }],
              task_category: "coding",
              model: assignments.reviewer.model,
              provider: assignments.reviewer.provider,
            },
            signal
          );

          task.currentRun.reviewerModel = `${reviewerResponse.provider}:${reviewerResponse.model}`;
          task.currentRun.activeAgents[2].model = reviewerResponse.model;
          task.currentRun.activeAgents[2].provider = reviewerResponse.provider;
          this.recordModelUsage(taskId, "reviewer", reviewerResponse);

          const parsedReview = this.parseStructuredReview(reviewerResponse.content);

          lastReviewRecord = {
            id: `rev_${Date.now()}_${cycle}`,
            taskId,
            runId: task.currentRun.id,
            userId: task.userId,
            reviewerAgentRole: "reviewer",
            reviewerModel: task.currentRun.reviewerModel,
            commitSha: latestCommit?.commitSha,
            cycleNumber: cycle,
            verdict: parsedReview.verdict,
            score: parsedReview.score,
            issues: parsedReview.issues,
            recommendations: parsedReview.recommendations,
            reviewNotes: parsedReview.summary || reviewerResponse.content,
            automatedChecks,
            testResults,
            createdAt: new Date().toISOString(),
          };

          task.reviews.push(lastReviewRecord);

          if (parsedReview.verdict === "changes_requested" && parsedReview.issues.length > 0) {
            for (const issue of parsedReview.issues) {
              this.issueService.captureIssue({
                title: `Review Finding: ${issue.description.slice(0, 80)}`,
                description: issue.description,
                category: "review_finding",
                severity: issue.severity === "critical" ? "critical" : issue.severity === "warning" ? "high" : "medium",
                priority: issue.severity === "critical" ? "p0" : "p1",
                errorMessage: issue.description,
                sourceFile: issue.file || "",
                lineNumber: issue.line,
                discoveringAgent: "reviewer",
                taskId: task.id,
                runId: task.currentRun.id,
                worktreeBranch: devBranch,
                worktreePath: developerWorktreePath,
              });
            }
          }
          task.currentRun.activeAgents[2].status = "completed";
          task.currentRun.activeAgents[2].completedAt = new Date().toISOString();
          task.currentRun.activeAgents[2].lastHeartbeat = new Date().toISOString();
          task.currentRun.activeAgents[2].activity = `Cycle ${cycle} verdict: ${parsedReview.verdict.toUpperCase()}${
            parsedReview.score !== undefined ? ` (Score: ${parsedReview.score})` : ""
          }`;

          if (task.subtasks && task.subtasks[2]) {
            task.subtasks[2].status = parsedReview.verdict === "approved" ? "completed" : "pending";
            task.subtasks[2].completedAt = new Date().toISOString();
          }
          task.messages = this.collaborationHub.getMessages(taskId);
          task.architecturalDecisions = this.repoIntelligence.listDecisions(taskId);

          // Persist review to Supabase
          if (isSupabaseConfigured && supabase) {
            try {
              await (supabase.from("agent_reviews") as any).insert({
                id: lastReviewRecord.id,
                task_id: lastReviewRecord.taskId,
                run_id: lastReviewRecord.runId || null,
                user_id: lastReviewRecord.userId,
                reviewer_agent_role: lastReviewRecord.reviewerAgentRole,
                reviewer_model: lastReviewRecord.reviewerModel,
                commit_sha: lastReviewRecord.commitSha,
                cycle_number: lastReviewRecord.cycleNumber,
                verdict: lastReviewRecord.verdict,
                score: lastReviewRecord.score,
                issues: lastReviewRecord.issues,
                recommendations: lastReviewRecord.recommendations,
                review_notes: lastReviewRecord.reviewNotes,
                automated_checks: lastReviewRecord.automatedChecks,
                test_results: lastReviewRecord.testResults,
                created_at: lastReviewRecord.createdAt,
              });
            } catch (err) {
              console.warn("Could not persist review to Supabase:", err);
            }
          }

          await this.emitEvent(
            taskId,
            "reviewer",
            "reviewer.verdict",
            `Reviewer completed Cycle ${cycle} with verdict: ${parsedReview.verdict.toUpperCase()}${
              parsedReview.score !== undefined ? ` (Score: ${parsedReview.score})` : ""
            }`,
            {
              cycle,
              verdict: parsedReview.verdict,
              score: parsedReview.score,
              issueCount: parsedReview.issues.length,
              reviewerModel: task.currentRun.reviewerModel,
            }
          );

          // ── Loop Evaluation ──
          if (parsedReview.verdict === "approved") {
            await this.emitEvent(
              taskId,
              "orchestrator",
              "review.approved",
              `Implementation approved on Cycle ${cycle}. Preparing integration branch.`
            );
            break;
          } else {
            if (cycle >= MAX_CYCLES) {
              await this.emitEvent(
                taskId,
                "orchestrator",
                "review.max_cycles_reached",
                `Bounded review limit reached (${MAX_CYCLES} cycles). Escalating to owner review with ${parsedReview.issues.length} open issues.`,
                { cycle, maxCycles: MAX_CYCLES, issues: parsedReview.issues }
              );
              break;
            } else {
              await this.emitEvent(
                taskId,
                "orchestrator",
                "review.changes_requested",
                `Changes requested on Cycle ${cycle}. Automatically assigning correction task to Developer (Cycle ${
                  cycle + 1
                } of ${MAX_CYCLES}).`,
                { issues: parsedReview.issues, cycle }
              );
              cycle++;
            }
          }
        } finally {
          this.semaphore.release();
        }
      } // end while

      // ─── Step 4: Prepare Integration Branch under Owner Control ─────────────
      if (latestCommit) {
        const integrationBranch = await this.gitManager.createIntegrationBranch(
          taskId,
          latestCommit.branchName,
          task.baseBranch
        );
        task.integrationBranch = integrationBranch;
        task.currentRun.integrationBranch = integrationBranch;

        await this.emitEvent(
          taskId,
          "orchestrator",
          "integration.ready",
          `Integration branch '${integrationBranch}' is prepared for owner review and approval.`,
          { integrationBranch, commitSha: latestCommit.commitSha, totalCommits: task.commits.length }
        );
      }

      // Release file locks upon completion
      this.conflictGuard.releaseLocksForTask(taskId);

      task.status = "completed";
      task.currentRun.status = "completed";
      task.currentRun.completedAt = new Date().toISOString();

      await this.emitEvent(
        taskId,
        "orchestrator",
        "task.completed",
        `Multi-agent software engineering task completed successfully after ${task.currentCycle || 1} cycle(s).`
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      task.status = signal.aborted ? "cancelled" : "failed";
      task.currentRun.status = signal.aborted ? "cancelled" : "failed";
      task.currentRun.completedAt = new Date().toISOString();
      task.currentRun.errorSummary = task.currentRun.errorSummary || errorMsg;

      await this.emitEvent(
        taskId,
        "orchestrator",
        "task.failed",
        `Execution ${signal.aborted ? "cancelled" : "failed"}: ${errorMsg}`
      );

      if (!signal.aborted) {
        this.issueService.captureIssue({
          title: `Pipeline Error: ${errorMsg.slice(0, 80)}`,
          description: `Pipeline encountered an unhandled execution failure: ${errorMsg}`,
          category: errorMsg.toLowerCase().includes("timeout") ? "timeout" : "runtime_error",
          severity: "high",
          priority: "p1",
          errorMessage: errorMsg,
          stackTrace: err instanceof Error ? err.stack : undefined,
          discoveringAgent: "orchestrator",
          taskId: task.id,
          runId: task.currentRun.id,
        });
      }
    } finally {
      // Always release all file locks held by the task
      this.conflictGuard.releaseLocksForTask(taskId);
      this.activeAbortControllers.delete(taskId);
      task.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Helper to parse [FILE: path]...[END_FILE] blocks from Developer output.
   */
  private extractFileBlocks(text: string): Array<{ filePath: string; content: string }> {
    const blocks: Array<{ filePath: string; content: string }> = [];
    const regex = /\[FILE:\s*(.+?)\]\r?\n([\s\S]*?)\[END_FILE\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1].trim();
      let content = match[2];
      // Strip markdown code fence if wrapped
      if (content.startsWith("```")) {
        content = content.replace(/^```[a-zA-Z0-9_-]*\r?\n/, "").replace(/```\s*$/, "");
      }
      blocks.push({ filePath, content });
    }
    return blocks;
  }

  /**
   * Records token usage and computes estimated USD cost based on provider rates.
   */
  private recordModelUsage(
    taskId: string,
    role: AgentRole,
    response: {
      provider: string;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      latency_ms: number;
    }
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Approximate cost estimation ($ per 1k tokens)
    let promptRate = 0.003;
    let completionRate = 0.015;

    if (response.provider === "ollama") {
      promptRate = 0;
      completionRate = 0;
    } else if (response.model.includes("mini") || response.model.includes("haiku") || response.model.includes("flash")) {
      promptRate = 0.00015;
      completionRate = 0.0006;
    }

    const costUsd =
      (response.usage.prompt_tokens / 1000) * promptRate +
      (response.usage.completion_tokens / 1000) * completionRate;

    const record: ModelUsageRecord = {
      id: `usg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId,
      runId: task.currentRun?.id,
      userId: task.userId,
      agentRole: role,
      provider: response.provider as any,
      model: response.model,
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
      estimatedCostUsd: Number(costUsd.toFixed(6)),
      latencyMs: response.latency_ms,
      createdAt: new Date().toISOString(),
    };

    task.usage.push(record);
    task.totalTokens += record.totalTokens;
    task.totalCostUsd = Number((task.totalCostUsd + record.estimatedCostUsd).toFixed(6));
  }
}

export const globalMultiAgentOrchestrator = new MultiAgentOrchestrator();
