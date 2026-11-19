import { describe, expect, it } from "vitest";
import { VioletTaskOrchestrator } from "./taskOrchestrator";
import { VioletToolRegistry } from "./toolRegistry";
import type { VioletToolManifest } from "../../types/violet";
import { createApprovalRequest } from "./approvalManager";

describe("VioletTaskOrchestrator", () => {
  it("creates a task and plans deterministic steps", () => {
    const registry = new VioletToolRegistry();
    const orchestrator = new VioletTaskOrchestrator(registry);

    const task = orchestrator.createTask({
      userId: "u1",
      goal: "Check system health and ping",
    });

    expect(task.status).toBe("requested");
    expect(task.plan).toHaveLength(0);

    const planned = orchestrator.planTask(task);
    expect(planned.status).toBe("planned");
    expect(planned.plan.length).toBeGreaterThan(0);
    expect(planned.plan[0].toolName).toBe("system.ping");
  });

  it("executes a read-only linear plan to completion", async () => {
    const registry = new VioletToolRegistry();
    const pingManifest: VioletToolManifest = {
      name: "system.ping",
      version: "1.0.0",
      domain: "productivity",
      description: "Ping",
      inputSchema: {},
      outputSchema: {},
      requiredScopes: [],
      risk: "read_only",
      platforms: ["web"],
      timeoutMs: 1000,
      supportsIdempotency: true,
      enabled: true,
    };
    registry.register(pingManifest, async () => ({
      status: "succeeded",
      evidence: [],
      summary: "pong",
      recoverable: false,
    }));

    const orchestrator = new VioletTaskOrchestrator(registry);
    const task = orchestrator.createTask({
      userId: "user-1",
      goal: "Check system health",
    });

    const finalTask = await orchestrator.executeTask(task, {
      userId: "user-1",
      grantedScopes: [],
      registry,
    });

    expect(finalTask.status).toBe("completed");
    expect(finalTask.plan[0].status).toBe("completed");
    expect(finalTask.plan[0].resultSummary).toBe("pong");
  });

  it("pauses execution when a step requires approval", async () => {
    const registry = new VioletToolRegistry();
    const dangerousManifest: VioletToolManifest = {
      name: "files.delete",
      version: "1.0.0",
      domain: "computer",
      description: "Delete file",
      inputSchema: {},
      outputSchema: {},
      requiredScopes: ["computer:files:write"],
      risk: "destructive",
      platforms: ["windows"],
      timeoutMs: 1000,
      supportsIdempotency: false,
      enabled: true,
    };
    registry.register(dangerousManifest, async () => ({
      status: "succeeded",
      evidence: [],
      summary: "deleted",
      recoverable: false,
    }));

    const orchestrator = new VioletTaskOrchestrator(registry);
    const task = orchestrator.createTask({
      userId: "user-1",
      goal: "Delete old files",
      plan: [
        {
          id: "step-del",
          taskId: "t1",
          order: 0,
          title: "Delete file",
          toolName: "files.delete",
          arguments: { path: "C:/tmp.txt" },
          risk: "destructive",
          expectedEvidence: [],
          status: "pending",
        },
      ],
    });

    const result = await orchestrator.executeTask(task, {
      userId: "user-1",
      grantedScopes: ["computer:files:write"],
      registry,
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.plan[0].status).toBe("awaiting_approval");
  });

  it("continues execution once approval token is provided", async () => {
    const registry = new VioletToolRegistry();
    const dangerousManifest: VioletToolManifest = {
      name: "files.delete",
      version: "1.0.0",
      domain: "computer",
      description: "Delete file",
      inputSchema: {},
      outputSchema: {},
      requiredScopes: ["computer:files:write"],
      risk: "destructive",
      platforms: ["windows"],
      timeoutMs: 1000,
      supportsIdempotency: false,
      enabled: true,
    };
    registry.register(dangerousManifest, async () => ({
      status: "succeeded",
      evidence: [],
      summary: "deleted",
      recoverable: false,
    }));

    const orchestrator = new VioletTaskOrchestrator(registry);
    const task = orchestrator.createTask({
      userId: "user-1",
      goal: "Delete old files",
      plan: [
        {
          id: "step-del",
          taskId: "t1",
          order: 0,
          title: "Delete file",
          toolName: "files.delete",
          arguments: { path: "C:/tmp.txt" },
          risk: "destructive",
          expectedEvidence: [],
          status: "pending",
        },
      ],
    });

    const approvalReq = await createApprovalRequest({
      taskId: task.id,
      stepId: "step-del",
      operation: "files.delete",
      consequence: "Will delete file",
      argumentsPreview: { path: "C:/tmp.txt" },
    });
    const approvedToken = {
      ...approvalReq,
      status: "approved" as const,
      decidedAt: new Date().toISOString(),
    };

    const approvalsMap = new Map();
    approvalsMap.set("step-del", approvedToken);

    const completed = await orchestrator.executeTask(task, {
      userId: "user-1",
      grantedScopes: ["computer:files:write"],
      registry,
      approvals: approvalsMap,
    });

    expect(completed.status).toBe("completed");
    expect(completed.plan[0].status).toBe("completed");
    expect(completed.plan[0].resultSummary).toBe("deleted");
  });

  it("pauses execution for human handoff when security challenge appears", async () => {
    const registry = new VioletToolRegistry();
    const browserManifest: VioletToolManifest = {
      name: "browser.navigate",
      version: "1.0.0",
      domain: "browser",
      description: "Navigate",
      inputSchema: {},
      outputSchema: {},
      requiredScopes: ["browser:navigate"],
      risk: "read_only",
      platforms: ["web"],
      timeoutMs: 2000,
      supportsIdempotency: false,
      enabled: true,
    };
    registry.register(browserManifest, async () => ({
      status: "needs_human",
      evidence: [],
      summary: "Cloudflare Turnstile challenge detected",
      recoverable: true,
    }));

    const orchestrator = new VioletTaskOrchestrator(registry);
    const task = orchestrator.createTask({
      userId: "user-1",
      goal: "Browse protected site",
      plan: [
        {
          id: "step-nav",
          taskId: "t1",
          order: 0,
          title: "Open site",
          toolName: "browser.navigate",
          arguments: { url: "https://example.com" },
          risk: "read_only",
          expectedEvidence: [],
          status: "pending",
        },
      ],
    });

    const result = await orchestrator.executeTask(task, {
      userId: "user-1",
      grantedScopes: ["browser:navigate"],
      registry,
    });

    expect(result.status).toBe("awaiting_human");
  });

  it("supports manual cancellation of a task", () => {
    const registry = new VioletToolRegistry();
    const orchestrator = new VioletTaskOrchestrator(registry);
    const task = orchestrator.createTask({ userId: "u1", goal: "Long job" });
    const cancelled = orchestrator.cancelTask(task, "User pressed stop");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.errorSummary).toContain("User pressed stop");
  });
});
