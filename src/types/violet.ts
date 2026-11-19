/**
 * VIOLET operating-system contracts.
 *
 * These are shared domain types only. Keep provider secrets and privileged
 * execution in trusted backend/local-agent processes, never in the browser.
 */

export type VioletTaskStatus =
  | "requested"
  | "classified"
  | "planned"
  | "awaiting_approval"
  | "queued"
  | "running"
  | "awaiting_human"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

export type VioletRiskLevel =
  | "read_only"
  | "reversible"
  | "external_side_effect"
  | "destructive"
  | "financial";

export type VioletToolDomain =
  | "computer"
  | "browser"
  | "developer"
  | "communication"
  | "shopping"
  | "knowledge"
  | "productivity"
  | "research"
  | "finance"
  | "voice"
  | "workflow";

export type VioletStepStatus =
  | "pending"
  | "awaiting_approval"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type VioletApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "consumed";

export interface VioletExecutionBudget {
  maxDurationMs: number;
  maxToolCalls: number;
  maxRetriesPerStep?: number;
}

export interface VioletTaskRequest {
  id: string;
  userId: string;
  goal: string;
  source: "desktop" | "web" | "mobile" | "voice" | "messaging";
  constraints?: Record<string, unknown>;
  createdAt: string;
}

export interface VioletTaskStep {
  id: string;
  taskId: string;
  order: number;
  title: string;
  toolName: string;
  arguments: Record<string, unknown>;
  risk: VioletRiskLevel;
  expectedEvidence: string[];
  status: VioletStepStatus;
  argumentsHash?: string;
  argumentsPreview?: Record<string, unknown>;
  resultSummary?: string | null;
  evidence?: Array<{ type: "url" | "file" | "screenshot" | "text"; reference: string }>;
  errorCode?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface VioletTask {
  id: string;
  userId: string;
  goal: string;
  source: "desktop" | "web" | "mobile" | "voice" | "messaging";
  status: VioletTaskStatus;
  plan: VioletTaskStep[];
  constraints: Record<string, unknown>;
  executionBudget: VioletExecutionBudget;
  errorCode?: string | null;
  errorSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface VioletToolManifest {
  name: string;
  version: string;
  domain: VioletToolDomain;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredScopes: string[];
  risk: VioletRiskLevel;
  platforms: Array<"windows" | "web" | "mobile" | "cloud">;
  timeoutMs: number;
  supportsIdempotency: boolean;
  enabled: boolean;
}

export interface VioletToolResult<T = unknown> {
  status: "succeeded" | "failed" | "needs_human" | "rejected";
  data?: T;
  evidence: Array<{ type: "url" | "file" | "screenshot" | "text"; reference: string }>;
  summary: string;
  recoverable: boolean;
  errorCode?: string;
}

export interface VioletToolContext {
  taskId: string;
  stepId: string;
  userId: string;
  signal?: AbortSignal;
  localAgentToken?: string;
  localAgentUrl?: string;
}

export type VioletToolExecutor<TArgs = Record<string, unknown>, TResult = unknown> = (
  args: TArgs,
  context: VioletToolContext
) => Promise<VioletToolResult<TResult>>;

export interface VioletApprovalRequest {
  id: string;
  taskId: string;
  stepId: string;
  operation: string;
  consequence: string;
  argumentsHash: string;
  argumentsPreview: Record<string, unknown>;
  status: VioletApprovalStatus;
  expiresAt: string;
  decidedAt?: string | null;
  consumedAt?: string | null;
  createdAt: string;
}

export interface VioletHumanHandoff {
  id: string;
  taskId: string;
  stepId?: string;
  reason: "captcha" | "otp" | "mfa" | "permission" | "consent" | "ambiguous_state" | "manual_takeover";
  instructions: string;
  visibleClient: "browser" | "desktop";
  status: "waiting" | "resumed" | "cancelled" | "timed_out";
  createdAt: string;
  resumedAt?: string | null;
  expiresAt?: string | null;
}

export interface VioletTaskEvent {
  id: string;
  taskId: string;
  userId: string;
  eventType: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface VioletPairedDevice {
  id: string;
  userId: string;
  name: string;
  platform: "windows" | "macos" | "linux";
  publicKeyFingerprint: string;
  scopes: string[];
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface VioletWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  trigger: { type: "manual" | "schedule" | "event"; configuration: Record<string, unknown> };
  steps: VioletTaskStep[];
}
