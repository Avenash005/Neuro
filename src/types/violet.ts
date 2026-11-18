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
  status: "pending" | "awaiting_approval" | "running" | "completed" | "failed" | "skipped";
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

export interface VioletApprovalRequest {
  id: string;
  taskId: string;
  stepId: string;
  operation: string;
  consequence: string;
  argumentsPreview: Record<string, unknown>;
  expiresAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
}

export interface VioletHumanHandoff {
  id: string;
  taskId: string;
  reason: "captcha" | "otp" | "mfa" | "permission" | "consent" | "ambiguous_state" | "manual_takeover";
  instructions: string;
  visibleClient: "browser" | "desktop";
  status: "waiting" | "resumed" | "cancelled" | "timed_out";
  createdAt: string;
}

export interface VioletPairedDevice {
  id: string;
  userId: string;
  name: string;
  platform: "windows";
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
