import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeArgumentsHash,
  consumeApproval,
  createApprovalRequest,
  verifyApproval,
} from "./approvalManager";
import { evaluateVioletToolAsync } from "./policy";
import type { VioletToolManifest } from "../../types/violet";

const destructiveManifest: VioletToolManifest = {
  name: "files.delete",
  version: "1.0.0",
  domain: "computer",
  description: "Delete an approved file",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  requiredScopes: ["computer:files:write"],
  risk: "destructive",
  platforms: ["windows"],
  timeoutMs: 5000,
  supportsIdempotency: false,
  enabled: true,
};

describe("canonicalJson and computeArgumentsHash", () => {
  it("produces identical JSON regardless of key insertion order", () => {
    const objA = { z: 1, a: "hello", m: [3, 2, 1], nested: { y: true, b: false } };
    const objB = { nested: { b: false, y: true }, m: [3, 2, 1], a: "hello", z: 1 };
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
  });

  it("computes matching 64-char hex SHA-256 hashes for equivalent objects", async () => {
    const hashA = await computeArgumentsHash({ path: "C:/docs/report.pdf", force: true });
    const hashB = await computeArgumentsHash({ force: true, path: "C:/docs/report.pdf" });
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).toBe(hashB);
  });

  it("detects argument variations", async () => {
    const hashA = await computeArgumentsHash({ path: "C:/docs/a.txt" });
    const hashB = await computeArgumentsHash({ path: "C:/docs/b.txt" });
    expect(hashA).not.toBe(hashB);
  });
});

describe("createApprovalRequest and verifyApproval", () => {
  it("creates an approval request with valid arguments hash", async () => {
    const args = { path: "C:/Projects/Neuro/file.txt" };
    const request = await createApprovalRequest({
      taskId: "task-1",
      stepId: "step-1",
      operation: "files.delete",
      consequence: "Will permanently delete file.txt",
      argumentsPreview: args,
      ttlMs: 60_000,
    });

    expect(request.status).toBe("pending");
    expect(request.argumentsHash).toBe(await computeArgumentsHash(args));
    expect(request.decidedAt).toBeNull();
    expect(request.consumedAt).toBeNull();
  });

  it("fails verification if approval is not approved", async () => {
    const args = { path: "C:/file.txt" };
    const request = await createApprovalRequest({
      taskId: "t1",
      stepId: "s1",
      operation: "delete",
      consequence: "delete file",
      argumentsPreview: args,
    });

    const result = await verifyApproval(request, args);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expected 'approved'");
  });

  it("fails verification if arguments were tampered with", async () => {
    const args = { path: "C:/file.txt" };
    const request = await createApprovalRequest({
      taskId: "t1",
      stepId: "s1",
      operation: "delete",
      consequence: "delete file",
      argumentsPreview: args,
    });
    const approved = { ...request, status: "approved" as const, decidedAt: new Date().toISOString() };

    const tamperedArgs = { path: "C:/system32/important.dll" };
    const result = await verifyApproval(approved, tamperedArgs);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("argument tampering detected");
  });

  it("fails verification if approval token has expired", async () => {
    const args = { path: "C:/file.txt" };
    const request = await createApprovalRequest({
      taskId: "t1",
      stepId: "s1",
      operation: "delete",
      consequence: "delete file",
      argumentsPreview: args,
      ttlMs: 1000,
    });
    const approved = { ...request, status: "approved" as const, decidedAt: new Date().toISOString() };

    const futureTime = new Date(Date.now() + 10_000);
    const result = await verifyApproval(approved, args, futureTime);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("verifies successfully when approved and arguments match", async () => {
    const args = { path: "C:/file.txt" };
    const request = await createApprovalRequest({
      taskId: "t1",
      stepId: "s1",
      operation: "delete",
      consequence: "delete file",
      argumentsPreview: args,
    });
    const approved = { ...request, status: "approved" as const, decidedAt: new Date().toISOString() };

    const result = await verifyApproval(approved, args);
    expect(result.valid).toBe(true);
  });

  it("supports single-use consumption", async () => {
    const args = { path: "C:/file.txt" };
    const request = await createApprovalRequest({
      taskId: "t1",
      stepId: "s1",
      operation: "delete",
      consequence: "delete file",
      argumentsPreview: args,
    });
    const approved = { ...request, status: "approved" as const, decidedAt: new Date().toISOString() };

    const consumed = consumeApproval(approved);
    expect(consumed.status).toBe("consumed");
    expect(consumed.consumedAt).toBeDefined();

    const verifyConsumed = await verifyApproval(consumed, args);
    expect(verifyConsumed.valid).toBe(false);
    expect(verifyConsumed.reason).toContain("already been consumed");
  });
});

describe("evaluateVioletToolAsync integration", () => {
  it("allows destructive action only when matching approval is verified", async () => {
    const args = { path: "C:/file.txt" };
    const context = {
      enabled: true,
      grantedScopes: ["computer:files:write"],
      arguments: args,
    };

    // Without approval: requires approval
    const dec1 = await evaluateVioletToolAsync(destructiveManifest, context);
    expect(dec1.allowed).toBe(true);
    expect(dec1.requiresApproval).toBe(true);

    // With approved token
    const request = await createApprovalRequest({
      taskId: "t1",
      stepId: "s1",
      operation: "files.delete",
      consequence: "Permanently deletes file",
      argumentsPreview: args,
    });
    const approved = { ...request, status: "approved" as const, decidedAt: new Date().toISOString() };

    const dec2 = await evaluateVioletToolAsync(destructiveManifest, { ...context, approval: approved });
    expect(dec2.allowed).toBe(true);
    expect(dec2.requiresApproval).toBe(false);

    // If arguments change, approval is rejected
    const dec3 = await evaluateVioletToolAsync(destructiveManifest, {
      ...context,
      approval: approved,
      arguments: { path: "C:/other.txt" },
    });
    expect(dec3.allowed).toBe(true);
    expect(dec3.requiresApproval).toBe(true);
  });
});
