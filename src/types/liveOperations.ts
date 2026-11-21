/**
 * VIOLET AI & Lab — Phase 3F Live Operations & Agent Observability Types
 */

import type { AIProviderType } from "../lib/violet/ai/types";
import type {
  AgentCommitRecord,
  AgentEventRecord,
  AgentMessage,
  AgentReviewRecord,
  AgentRole,
  MultiAgentRunStatus,
  ReviewVerdict,
} from "./multiAgent";

export type LiveAgentStatus =
  | "idle"
  | "queued"
  | "planning"
  | "working"
  | "waiting"
  | "reviewing"
  | "completed"
  | "failed"
  | "cancelled"
  | "stale";

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  agentRole: AgentRole;
  timestamp: string;
  durationMs: number;
  isSuccess: boolean;
  inputSummary?: string;
  outputSummary?: string;
}

export interface LiveAgent {
  id: string;
  taskId: string;
  taskGoal: string;
  name: string;
  role: AgentRole;
  status: LiveAgentStatus;
  provider: AIProviderType;
  model: string;
  executionMode: "local" | "cloud";
  assignedSkills: string[];
  activeTools: string[];
  worktreeBranch?: string;
  worktreePath?: string;
  activity: string;
  lastHeartbeat: string;
  isStale: boolean;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimatedCostUsd: number;
}

export interface LiveAgentDetail extends LiveAgent {
  runNumber: number;
  taskStatus: MultiAgentRunStatus;
  modelConfig: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
    usedContextTokens: number;
    systemPromptPreview: string;
    avgLatencyMs: number;
  };
  skillsDetail: Array<{
    name: string;
    description: string;
    status: "loaded" | "ready" | "active" | "error";
  }>;
  toolsDetail: Array<{
    name: string;
    allowed: boolean;
    executionCount: number;
    lastExecutedAt?: string;
  }>;
  recentToolExecutions: ToolExecutionRecord[];
  files: {
    opened: string[];
    modified: string[];
    staged: string[];
    uncommitted: string[];
  };
  git: {
    baseBranch: string;
    currentBranch: string;
    worktreePath: string;
    latestCommitSha?: string;
    latestCommitMessage?: string;
    filesChanged: string[];
    insertions: number;
    deletions: number;
  };
  communication: {
    messagesSent: AgentMessage[];
    messagesReceived: AgentMessage[];
    pendingReview?: AgentReviewRecord;
  };
  executionLogs: AgentEventRecord[];
}

export interface OperationsSummary {
  totalRegisteredAgents: number;
  activeAgents: number;
  idleAgents: number;
  failedAgents: number;
  staleAgents: number;
  queuedTasks: number;
  completedTasks: number;
  runningWorkflows: number;
  totalModelCalls: number;
  totalTokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimatedProviderCostUsd: number;
  providerCostBreakdown: Record<string, number>;
  providerCallBreakdown: Record<string, number>;
  providerTokenBreakdown: Record<string, number>;
}

export interface SystemResourceMetrics {
  cpuUsagePercent: number | null;
  memoryUsageBytes: number;
  memoryTotalBytes: number;
  memoryUsagePercent: number;
  isMeasured: boolean;
}

export interface GPUResourceMetrics {
  available: boolean;
  statusMessage: string;
  gpuUsagePercent: number | null;
  vramUsageBytes: number | null;
  vramTotalBytes: number | null;
}

export interface ProviderTelemetry {
  provider: AIProviderType;
  requestCount: number;
  avgLatencyMs: number;
  totalTokens: number;
  estimatedCostUsd: number;
  ollamaResponseTimeMs?: number | null;
  mode: "local" | "cloud";
  healthStatus: "healthy" | "degraded" | "unhealthy" | "disabled" | "ready";
}

export interface ResourceTelemetry {
  system: SystemResourceMetrics;
  gpu: GPUResourceMetrics;
  providers: ProviderTelemetry[];
  timestamp: string;
}

export interface WorkflowDAGNode {
  id: string;
  label: string;
  type: "task" | "subtask" | "agent" | "review" | "commit";
  status: "pending" | "running" | "completed" | "failed" | "blocked" | "stale";
  assignedAgentRole?: AgentRole;
  assignedModel?: string;
  targetFiles?: string[];
  isBlocked?: boolean;
  blockedBy?: string[];
  reviewVerdict?: ReviewVerdict;
  reviewCycle?: number;
  details?: Record<string, unknown>;
}

export interface WorkflowDAGEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: "dependency" | "communication" | "review_cycle" | "produces";
}

export interface WorkflowDAG {
  taskId: string;
  taskGoal: string;
  taskStatus: MultiAgentRunStatus;
  isPaused: boolean;
  nodes: WorkflowDAGNode[];
  edges: WorkflowDAGEdge[];
}

export interface EventStreamFilter {
  taskId?: string;
  agentRole?: AgentRole | "all";
  eventType?: string;
  since?: string;
  search?: string;
  limit?: number;
}

export interface TaskTraceability {
  taskId: string;
  goal: string;
  status: MultiAgentRunStatus;
  plan?: string;
  participatingAgents: Array<{
    role: AgentRole;
    model: string;
    provider: AIProviderType;
  }>;
  skillsUsed: string[];
  filesAccessed: string[];
  filesModified: string[];
  testsExecuted: Array<{
    command: string;
    exitCode: number;
    passed: boolean;
    outputSummary: string;
  }>;
  reviews: AgentReviewRecord[];
  commits: AgentCommitRecord[];
  worktreeLocation?: string;
  diffSummary?: {
    filesCount: number;
    insertions: number;
    deletions: number;
  };
}
