import type { VioletApprovalRequest, VioletRiskLevel, VioletToolManifest } from "../../types/violet";
import { verifyApproval } from "./approvalManager";

export type VioletDecision =
  | { allowed: true; requiresApproval: false; reason: string }
  | { allowed: true; requiresApproval: true; reason: string }
  | { allowed: false; requiresApproval: false; reason: string };

export interface VioletPolicyContext {
  enabled: boolean;
  grantedScopes: string[];
  verifiedApprovalForExactOperation?: boolean;
  toolEnabled?: boolean;
  approval?: VioletApprovalRequest;
  arguments?: Record<string, unknown>;
  referenceTime?: Date;
}

/**
 * Central policy gate. Model output is never permission.
 * Approval must be attached to the exact operation/arguments by the caller.
 */
export function evaluateVioletTool(
  tool: VioletToolManifest,
  context: VioletPolicyContext,
): VioletDecision {
  if (!context.enabled || context.toolEnabled === false) {
    return { allowed: false, requiresApproval: false, reason: "VIOLET or this tool is disabled." };
  }

  const missingScopes = tool.requiredScopes.filter((scope) => !context.grantedScopes.includes(scope));
  if (missingScopes.length > 0) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Missing required permission scopes: ${missingScopes.join(", ")}.`,
    };
  }

  const risk: VioletRiskLevel = tool.risk;
  if (risk === "read_only" || risk === "reversible") {
    return { allowed: true, requiresApproval: false, reason: "Allowed by the configured tool policy." };
  }

  if (context.verifiedApprovalForExactOperation) {
    return { allowed: true, requiresApproval: false, reason: "Exact operation approval was verified by the trusted approval service." };
  }

  return {
    allowed: true,
    requiresApproval: true,
    reason: risk === "financial"
      ? "Financial actions require just-in-time explicit approval."
      : risk === "destructive"
        ? "Destructive actions require explicit approval."
        : "External side effects require explicit approval.",
  };
}

/**
 * Async policy gate that verifies cryptographic approval hashes and expirations.
 */
export async function evaluateVioletToolAsync(
  tool: VioletToolManifest,
  context: VioletPolicyContext,
): Promise<VioletDecision> {
  let isVerified = context.verifiedApprovalForExactOperation ?? false;

  if (!isVerified && context.approval && context.arguments) {
    const verification = await verifyApproval(
      context.approval,
      context.arguments,
      context.referenceTime ?? new Date()
    );
    if (verification.valid) {
      isVerified = true;
    } else if (context.approval.status === "rejected" || context.approval.status === "consumed") {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Approval invalid: ${verification.reason}`,
      };
    }
  }

  return evaluateVioletTool(tool, {
    ...context,
    verifiedApprovalForExactOperation: isVerified,
  });
}
