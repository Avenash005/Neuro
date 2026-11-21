/**
 * VIOLET AI & Lab — Phase 3F Extension: Issue Intelligence & Bug Tracking Types
 */

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";

export type IssuePriority = "p0" | "p1" | "p2" | "p3";

export type IssueCategory =
  | "runtime_error"
  | "model_provider"
  | "ollama_connection"
  | "command_failure"
  | "typescript_error"
  | "test_failure"
  | "build_failure"
  | "security_vulnerability"
  | "review_finding"
  | "task_dependency"
  | "worker_crash"
  | "timeout";

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed" | "reopened" | "blocked";

export type SpecializedAgentRole =
  | "frontend"
  | "backend"
  | "database"
  | "qa"
  | "security"
  | "devops"
  | "architect"
  | "developer"
  | "reviewer";

export interface VerificationResults {
  testsPassed?: boolean;
  typecheckPassed?: boolean;
  lintPassed?: boolean;
  reviewVerdict?: string;
  reviewScore?: number;
  details?: string;
  outputSummary?: string;
}

export interface IssueFixAttempt {
  id: string;
  issueId: string;
  attemptNumber: number;
  assignedAgent: string;
  assignedRole: SpecializedAgentRole;
  worktreeBranch?: string;
  commitSha?: string;
  testResults?: VerificationResults;
  reviewVerdict?: string;
  isSuccessful: boolean;
  logs?: string;
  createdAt: string;
}

export interface IssueRecord {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  priority: IssuePriority;
  category: IssueCategory;
  errorMessage: string;
  stackTrace?: string;
  sourceFile?: string;
  lineNumber?: number;
  detectedAt: string;
  discoveringAgent: string;
  assignedAgent?: string;
  assignedRole: SpecializedAgentRole;
  taskId?: string;
  runId?: string;
  worktreeBranch?: string;
  worktreePath?: string;
  rootCause?: string;
  proposedResolution?: string;
  status: IssueStatus;
  isTransient: boolean;
  retryCount: number;
  maxRetries: number;
  resolutionCommitSha?: string;
  resolutionCommitMessage?: string;
  verificationResults?: VerificationResults;
  fixAttempts?: IssueFixAttempt[];
  createdAt: string;
  updatedAt: string;
}

export interface IssueStats {
  total: number;
  open: number;
  critical: number;
  inProgress: number;
  resolved: number;
  reopened: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export interface IssueFilter {
  severity?: IssueSeverity | "all";
  status?: IssueStatus | "all";
  category?: IssueCategory | "all";
  assignedRole?: SpecializedAgentRole | "all";
  taskId?: string;
  search?: string;
  limit?: number;
}

export interface IssueCaptureInput {
  title?: string;
  description?: string;
  category: IssueCategory;
  errorMessage: string;
  stackTrace?: string;
  sourceFile?: string;
  lineNumber?: number;
  severity?: IssueSeverity;
  priority?: IssuePriority;
  discoveringAgent?: string;
  taskId?: string;
  runId?: string;
  worktreeBranch?: string;
  worktreePath?: string;
}
