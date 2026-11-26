/**
 * VIOLET Lab — Phase 3B Multi-Agent Autonomous Development Contracts
 */

import type { AIProviderType } from "../lib/violet/ai/types";

export type AgentRole = "orchestrator" | "architect" | "developer" | "reviewer";

export type MultiAgentRunStatus =
  | "queued"
  | "planning"
  | "implementing"
  | "reviewing"
  | "testing"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export type ReviewVerdict = "approved" | "changes_requested" | "rejected";

export type ArtifactType = "plan" | "diff" | "test_report" | "review" | "code";

export type AgentMessageType =
  | "PLAN_PROPOSAL"
  | "CHALLENGE_PLAN"
  | "PLAN_ACCEPTED"
  | "REQUEST_ASSISTANCE"
  | "ASSISTANCE_RESPONSE"
  | "CODE_QUESTION"
  | "REVIEW_FEEDBACK"
  | "STATUS_UPDATE";

export interface AgentMessage {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  fromRole: AgentRole;
  toRole: AgentRole | "all";
  messageType: AgentMessageType;
  content: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export type SubTaskStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface SubTask {
  id: string;
  taskId: string;
  runId?: string;
  title: string;
  description: string;
  assignedRole: AgentRole;
  assignedModel?: string;
  status: SubTaskStatus;
  dependencies: string[];
  targetFiles: string[];
  resultSummary?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export type FindingCategory = "bug" | "regression" | "duplication" | "architecture" | "missing_test" | "security";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface EngineeringFinding {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestedRemediation?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ArchitecturalDecision {
  id: string;
  taskId: string;
  userId: string;
  title: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  context: string;
  decision: string;
  consequences: string;
  modelsConsulted: string[];
  createdAt: string;
}

export interface CodebaseSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "export";
  filePath: string;
  line: number;
}

export interface CodebaseFileSummary {
  filePath: string;
  language: string;
  symbols: string[];
  dependencies: string[];
  exports: string[];
  relevanceScore?: number;
}

export interface RepositoryAnalysis {
  repoRoot: string;
  totalFiles: number;
  languages: Record<string, number>;
  frameworks: string[];
  keyDependencies: string[];
  structureOverview: string;
}

export interface ReviewIssue {
  severity: "critical" | "warning" | "suggestion";
  file?: string;
  line?: number;
  description: string;
  suggestedFix?: string;
}

export interface MultiAgentModelsConfig {
  architect?: { provider?: AIProviderType; model?: string };
  developer?: { provider?: AIProviderType; model?: string };
  reviewer?: { provider?: AIProviderType; model?: string };
  automaticSelection?: boolean;
}

export interface MultiAgentTaskRequest {
  taskId?: string;
  userId?: string;
  goal: string;
  repoPath?: string;
  baseBranch?: string;
  models?: MultiAgentModelsConfig;
  autoMergeOnApproval?: boolean;
  maxRetries?: number;
  maxCorrectionAttempts?: number;
  testCommand?: { command: string; args?: string[] };
  requireIndependentReviewer?: boolean;
}

export interface AgentRunRecord {
  id: string;
  taskId: string;
  userId: string;
  runNumber: number;
  status: MultiAgentRunStatus;
  activeAgents: Array<{
    role: AgentRole;
    model: string;
    provider: AIProviderType;
    status: "idle" | "running" | "completed" | "failed" | "queued" | "planning" | "working" | "waiting" | "reviewing" | "cancelled" | "stale";
    activity: string;
    worktreeBranch?: string;
    worktreePath?: string;
    lastHeartbeat?: string;
    startedAt?: string;
    completedAt?: string;
    assignedSkills?: string[];
    activeTools?: string[];
    executionMode?: "local" | "cloud";
  }>;
  architectModel: string;
  developerModel: string;
  reviewerModel: string;
  baseBranch: string;
  integrationBranch?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEventRecord {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  agentRole: AgentRole;
  eventType: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentCommitRecord {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  agentRole: AgentRole;
  branchName: string;
  worktreePath?: string;
  commitSha: string;
  commitMessage: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
  createdAt: string;
}

export interface AgentArtifactRecord {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  agentRole: AgentRole;
  artifactType: ArtifactType;
  filePath?: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ModelUsageRecord {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  agentRole: AgentRole;
  provider: AIProviderType;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  createdAt: string;
}

export interface AgentReviewRecord {
  id: string;
  taskId: string;
  runId?: string;
  userId: string;
  reviewerAgentRole: AgentRole;
  reviewerModel?: string;
  commitSha?: string;
  cycleNumber?: number;
  verdict: ReviewVerdict;
  score?: number;
  issues?: ReviewIssue[];
  recommendations?: string[];
  reviewNotes: string;
  automatedChecks?: {
    lintPassed?: boolean;
    typecheckPassed?: boolean;
    testsPassed?: boolean;
    details?: string;
  };
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    output?: string;
  };
  createdAt: string;
}

export interface GitWorktreeInfo {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
  isLocked: boolean;
  isPrunable: boolean;
}

export interface MultiAgentTaskState {
  id: string;
  goal: string;
  userId: string;
  status: MultiAgentRunStatus;
  repoPath: string;
  baseBranch: string;
  integrationBranch?: string;
  reviewStatus?: "pending" | "approved" | "changes_requested" | "rejected" | "integrated";
  currentCycle?: number;
  maxCycles?: number;
  currentRun?: AgentRunRecord;
  runs: AgentRunRecord[];
  events: AgentEventRecord[];
  commits: AgentCommitRecord[];
  artifacts: AgentArtifactRecord[];
  usage: ModelUsageRecord[];
  reviews: AgentReviewRecord[];
  subtasks?: SubTask[];
  messages?: AgentMessage[];
  findings?: EngineeringFinding[];
  architecturalDecisions?: ArchitecturalDecision[];
  sharedMemory?: Record<string, unknown>;
  totalCostUsd: number;
  totalTokens: number;
  isPaused?: boolean;
  pausedAt?: string;
  retryCount?: number;
  integrationApproved?: boolean;
  integrationApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
}
