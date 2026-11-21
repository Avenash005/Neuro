/**
 * VIOLET AI & Lab — Frontend API Client
 *
 * Provides a type-safe client for the frontend UI to interact with the
 * backend VIOLET Model Gateway and Multi-Agent Autonomous Engineering Orchestrator.
 */

import type {
  AIProviderType,
  ChatRequest,
  ModelDefinition,
  NormalizedChatResponse,
  NormalizedStreamChunk,
  ProviderHealth,
  UserPreferences,
} from "./types";
import type {
  AgentEventRecord,
  GitWorktreeInfo,
  MultiAgentTaskRequest,
  MultiAgentTaskState,
} from "../../../types/multiAgent";
import type {
  EventStreamFilter,
  LiveAgent,
  LiveAgentDetail,
  OperationsSummary,
  ResourceTelemetry,
  TaskTraceability,
  WorkflowDAG,
} from "../../../types/liveOperations";
import type {
  IssueCaptureInput,
  IssueFilter,
  IssueRecord,
  IssueStats,
  IssueStatus,
  SpecializedAgentRole,
} from "../../../types/issues";
import type {
  ApproveFixResult,
  ResolveIssueOptions,
} from "../multiAgent/issueResolutionEngine";

export interface OwnerBootstrapStatus {
  isBootstrapped: boolean;
  hasConfiguredOwner: boolean;
  ownerEmail: string | null;
  ownerId: string | null;
  bootstrappedAt: string | null;
}

export interface BootstrapResult {
  success: boolean;
  message: string;
  isBootstrapped: boolean;
}

export class VioletAIClient {
  private readonly baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async getHealth(): Promise<{ status: string; version: string; service: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/health`);
    if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
    return (await res.json()) as { status: string; version: string; service: string };
  }

  async getOwnerAuthInfo(): Promise<{
    isSingleUser: boolean;
    isBootstrapped?: boolean;
    hasConfiguredOwner: boolean;
    ownerId: string | null;
    ownerEmail: string | null;
    bootstrappedAt?: string | null;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/owner`);
    if (!res.ok) throw new Error(`Failed to fetch owner auth info: HTTP ${res.status}`);
    return (await res.json()) as {
      isSingleUser: boolean;
      isBootstrapped?: boolean;
      hasConfiguredOwner: boolean;
      ownerId: string | null;
      ownerEmail: string | null;
      bootstrappedAt?: string | null;
    };
  }

  async getBootstrapStatus(): Promise<OwnerBootstrapStatus> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/bootstrap-status`);
    if (!res.ok) throw new Error(`Failed to fetch bootstrap status: HTTP ${res.status}`);
    return (await res.json()) as OwnerBootstrapStatus;
  }

  async completeOwnerBootstrap(email: string, ownerId: string): Promise<BootstrapResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ownerId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(data.error || "Failed to bootstrap owner account.");
    }
    return (await res.json()) as BootstrapResult;
  }

  async getProviders(): Promise<Record<AIProviderType, ProviderHealth>> {
    const res = await fetch(`${this.baseUrl}/api/v1/providers`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch providers: HTTP ${res.status}`);
    const data = (await res.json()) as { providers: Record<AIProviderType, ProviderHealth> };
    return data.providers;
  }

  async getModels(): Promise<ModelDefinition[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/models`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
    const data = (await res.json()) as { models: ModelDefinition[] };
    return data.models;
  }

  async getPreferences(): Promise<UserPreferences> {
    const res = await fetch(`${this.baseUrl}/api/v1/preferences`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch preferences: HTTP ${res.status}`);
    const data = (await res.json()) as { preferences: UserPreferences };
    return data.preferences;
  }

  async updatePreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
    const res = await fetch(`${this.baseUrl}/api/v1/preferences`, {
      method: "PUT",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update preferences: HTTP ${res.status}`);
    const data = (await res.json()) as { preferences: UserPreferences };
    return data.preferences;
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<NormalizedChatResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
      signal,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Chat request failed with HTTP ${res.status}`);
    }

    return (await res.json()) as NormalizedChatResponse;
  }

  async *stream(
    request: ChatRequest,
    signal?: AbortSignal
  ): AsyncGenerator<NormalizedStreamChunk, void, unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/chat/stream`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
      signal,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Stream request failed with HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No readable stream received from server");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        if (signal?.aborted) {
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            return;
          }

          try {
            const chunk = JSON.parse(payload) as NormalizedStreamChunk;
            yield chunk;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Multi-Agent Lab Endpoints ──────────────────────────────────────────

  async startMultiAgentTask(request: MultiAgentTaskRequest): Promise<MultiAgentTaskState> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/tasks`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Failed to start multi-agent task: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { task: MultiAgentTaskState };
    return data.task;
  }

  async listMultiAgentTasks(): Promise<MultiAgentTaskState[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/tasks`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to list tasks: HTTP ${res.status}`);
    const data = (await res.json()) as { tasks: MultiAgentTaskState[] };
    return data.tasks;
  }

  async getMultiAgentTask(taskId: string): Promise<MultiAgentTaskState> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/tasks/${encodeURIComponent(taskId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get task: HTTP ${res.status}`);
    const data = (await res.json()) as { task: MultiAgentTaskState };
    return data.task;
  }

  async cancelMultiAgentTask(taskId: string, reason?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`Failed to cancel task: HTTP ${res.status}`);
  }

  async *streamTaskEvents(
    taskId: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentEventRecord, void, unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/tasks/${encodeURIComponent(taskId)}/events`, {
      headers: this.getHeaders(),
      signal,
    });

    if (!res.ok) throw new Error(`Failed to stream task events: HTTP ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No readable event stream from server");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        if (signal?.aborted) return;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") return;

          try {
            const event = JSON.parse(payload) as AgentEventRecord;
            yield event;
          } catch {
            // Ignore parse errors on malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async getWorktrees(): Promise<GitWorktreeInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/worktrees`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch worktrees: HTTP ${res.status}`);
    const data = (await res.json()) as { worktrees: GitWorktreeInfo[] };
    return data.worktrees;
  }

  async cleanupWorktree(worktreePath?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/agent/worktrees/cleanup`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ worktreePath }),
    });
    if (!res.ok) throw new Error(`Failed to cleanup worktrees: HTTP ${res.status}`);
  }

  // ─── Phase 3F Live Operations & Observability API Methods ──────────────────

  async getOperationsSummary(): Promise<OperationsSummary> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/summary`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch operations summary: HTTP ${res.status}`);
    return (await res.json()) as OperationsSummary;
  }

  async getLiveAgents(): Promise<LiveAgent[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/agents`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch live agents: HTTP ${res.status}`);
    const data = (await res.json()) as { agents: LiveAgent[] };
    return data.agents;
  }

  async getLiveAgentDetail(agentId: string): Promise<LiveAgentDetail> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/agents/${encodeURIComponent(agentId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch agent details: HTTP ${res.status}`);
    const data = (await res.json()) as { agent: LiveAgentDetail };
    return data.agent;
  }

  async getWorkflowDAG(taskId: string): Promise<WorkflowDAG> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/workflow/${encodeURIComponent(taskId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch workflow DAG: HTTP ${res.status}`);
    const data = (await res.json()) as { workflow: WorkflowDAG };
    return data.workflow;
  }

  async getResourceTelemetry(): Promise<ResourceTelemetry> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/resources`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch resource telemetry: HTTP ${res.status}`);
    return (await res.json()) as ResourceTelemetry;
  }

  async getOperationsEvents(filter?: EventStreamFilter): Promise<AgentEventRecord[]> {
    const query = new URLSearchParams();
    if (filter?.taskId) query.set("taskId", filter.taskId);
    if (filter?.agentRole) query.set("agentRole", filter.agentRole);
    if (filter?.eventType) query.set("eventType", filter.eventType);
    if (filter?.search) query.set("search", filter.search);
    if (filter?.since) query.set("since", filter.since);
    if (filter?.limit) query.set("limit", filter.limit.toString());

    const qs = query.toString();
    const url = `${this.baseUrl}/api/v1/operations/events${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch operations events: HTTP ${res.status}`);
    const data = (await res.json()) as { events: AgentEventRecord[] };
    return data.events;
  }

  async getTaskTraceability(taskId: string): Promise<TaskTraceability> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/trace/${encodeURIComponent(taskId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch task traceability: HTTP ${res.status}`);
    const data = (await res.json()) as { trace: TaskTraceability };
    return data.trace;
  }

  async getTaskDiff(taskId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/diff/${encodeURIComponent(taskId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch task diff: HTTP ${res.status}`);
    const data = (await res.json()) as { diff: string };
    return data.diff;
  }

  async pauseTask(taskId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/tasks/${encodeURIComponent(taskId)}/pause`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
    });
    if (!res.ok) throw new Error(`Failed to pause task: HTTP ${res.status}`);
    const data = (await res.json()) as { success: boolean };
    return data.success;
  }

  async resumeTask(taskId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
    });
    if (!res.ok) throw new Error(`Failed to resume task: HTTP ${res.status}`);
    const data = (await res.json()) as { success: boolean };
    return data.success;
  }

  async retryTask(taskId: string): Promise<MultiAgentTaskState> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
    });
    if (!res.ok) throw new Error(`Failed to retry task: HTTP ${res.status}`);
    const data = (await res.json()) as { task: MultiAgentTaskState };
    return data.task;
  }

  async approveIntegration(taskId: string): Promise<{ success: boolean; branch: string; commitSha?: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/operations/tasks/${encodeURIComponent(taskId)}/approve`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
    });
    if (!res.ok) throw new Error(`Failed to approve integration: HTTP ${res.status}`);
    return (await res.json()) as { success: boolean; branch: string; commitSha?: string };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase 3F Extension: Issue Intelligence & Bug Tracking API
  // ════════════════════════════════════════════════════════════════════════════

  async listIssues(filter?: IssueFilter): Promise<IssueRecord[]> {
    const query = new URLSearchParams();
    if (filter?.status && filter.status !== "all") query.set("status", filter.status);
    if (filter?.severity && filter.severity !== "all") query.set("severity", filter.severity);
    if (filter?.category && filter.category !== "all") query.set("category", filter.category);
    if (filter?.assignedRole && filter.assignedRole !== "all") query.set("assignedRole", filter.assignedRole);
    if (filter?.taskId) query.set("taskId", filter.taskId);
    if (filter?.search) query.set("search", filter.search);
    if (filter?.limit) query.set("limit", filter.limit.toString());

    const qs = query.toString();
    const url = `${this.baseUrl}/api/v1/issues${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to list issues: HTTP ${res.status}`);
    const data = (await res.json()) as { issues: IssueRecord[] };
    return data.issues;
  }

  async getIssueStats(): Promise<IssueStats> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/stats`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch issue stats: HTTP ${res.status}`);
    const data = (await res.json()) as { stats: IssueStats };
    return data.stats;
  }

  async getIssue(issueId: string): Promise<IssueRecord> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch issue '${issueId}': HTTP ${res.status}`);
    const data = (await res.json()) as { issue: IssueRecord };
    return data.issue;
  }

  async captureIssue(input: IssueCaptureInput): Promise<IssueRecord> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/capture`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to capture issue: HTTP ${res.status}`);
    const data = (await res.json()) as { success: boolean; issue: IssueRecord };
    return data.issue;
  }

  async assignIssueAgent(
    issueId: string,
    agent: string,
    role?: SpecializedAgentRole
  ): Promise<IssueRecord> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}/assign`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent, role }),
    });
    if (!res.ok) throw new Error(`Failed to assign agent to issue: HTTP ${res.status}`);
    const data = (await res.json()) as { success: boolean; issue: IssueRecord };
    return data.issue;
  }

  async updateIssueStatus(
    issueId: string,
    status: IssueStatus,
    notes?: string
  ): Promise<IssueRecord> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}/status`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status, notes }),
    });
    if (!res.ok) throw new Error(`Failed to update issue status: HTTP ${res.status}`);
    const data = (await res.json()) as { success: boolean; issue: IssueRecord };
    return data.issue;
  }

  async resolveIssue(
    issueId: string,
    options?: ResolveIssueOptions
  ): Promise<IssueRecord> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}/resolve`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errData.error || `Failed to resolve issue: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { success: boolean; issue: IssueRecord };
    return data.issue;
  }

  async approveIssueFix(
    issueId: string,
    options?: { targetBranch?: string }
  ): Promise<ApproveFixResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}/approve`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errData.error || `Failed to approve issue fix: HTTP ${res.status}`);
    }
    return (await res.json()) as ApproveFixResult;
  }

  async rejectIssueFix(issueId: string, reason?: string): Promise<IssueRecord> {
    const res = await fetch(`${this.baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}/reject`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`Failed to reject issue fix: HTTP ${res.status}`);
    const data = (await res.json()) as { success: boolean; issue: IssueRecord };
    return data.issue;
  }
}

export const globalVioletAIClient = new VioletAIClient();
