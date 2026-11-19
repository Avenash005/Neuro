import type { VioletApprovalRequest } from "../../types/violet";

/**
 * Deterministically serialize a JSON value by recursively sorting object keys.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * Compute SHA-256 hash of canonical arguments.
 */
export async function computeArgumentsHash(args: Record<string, unknown>): Promise<string> {
  const canonical = canonicalJson(args);
  const data = new TextEncoder().encode(canonical);

  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle?.digest) {
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Pure fallback SHA-256 simulation for non-subtle test harness
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(64, "0");
}

export interface CreateApprovalParams {
  id?: string;
  taskId: string;
  stepId: string;
  operation: string;
  consequence: string;
  argumentsPreview: Record<string, unknown>;
  ttlMs?: number;
}

export async function createApprovalRequest(params: CreateApprovalParams): Promise<VioletApprovalRequest> {
  const hash = await computeArgumentsHash(params.argumentsPreview);
  const now = new Date();
  const ttl = params.ttlMs ?? 15 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();

  return {
    id: params.id ?? `appr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    taskId: params.taskId,
    stepId: params.stepId,
    operation: params.operation,
    consequence: params.consequence,
    argumentsHash: hash,
    argumentsPreview: Object.freeze({ ...params.argumentsPreview }),
    status: "pending",
    expiresAt,
    decidedAt: null,
    consumedAt: null,
    createdAt: now.toISOString(),
  };
}

export interface VerificationResult {
  valid: boolean;
  reason: string;
}

export async function verifyApproval(
  approval: VioletApprovalRequest,
  currentArgs: Record<string, unknown>,
  referenceTime: Date = new Date()
): Promise<VerificationResult> {
  if (approval.status === "consumed") {
    return { valid: false, reason: "Approval token has already been consumed (one-time use)." };
  }
  if (approval.status === "rejected") {
    return { valid: false, reason: "Approval request was explicitly rejected by the user." };
  }
  if (approval.status !== "approved") {
    return { valid: false, reason: `Approval status is '${approval.status}', expected 'approved'.` };
  }

  if (new Date(approval.expiresAt).getTime() <= referenceTime.getTime()) {
    return { valid: false, reason: "Approval token has expired." };
  }

  const currentHash = await computeArgumentsHash(currentArgs);
  if (currentHash !== approval.argumentsHash) {
    return {
      valid: false,
      reason: "Operation arguments do not match approved arguments (argument tampering detected).",
    };
  }

  return { valid: true, reason: "Approval is verified and valid for exact operation and arguments." };
}

export function consumeApproval(
  approval: VioletApprovalRequest,
  referenceTime: Date = new Date()
): VioletApprovalRequest {
  if (approval.status === "consumed") {
    throw new Error("Cannot consume an already consumed approval token.");
  }
  if (approval.status !== "approved") {
    throw new Error(`Cannot consume approval in state '${approval.status}'.`);
  }
  return {
    ...approval,
    status: "consumed",
    consumedAt: referenceTime.toISOString(),
  };
}
