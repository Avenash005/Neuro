import { describe, expect, it } from "vitest";
import { violetService } from "./violetService";
import type { VioletApprovalRequest, VioletTask } from "../../types/violet";

describe("VioletService", () => {
  it("saves and lists tasks in memory", async () => {
    const task: VioletTask = {
      id: "task-svc-1",
      userId: "u1",
      goal: "Test task saving",
      source: "web",
      status: "planned",
      plan: [],
      constraints: {},
      executionBudget: { maxDurationMs: 5000, maxToolCalls: 10 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await violetService.saveTask(task);
    const tasks = await violetService.listTasks();
    expect(tasks.some((t) => t.id === "task-svc-1")).toBe(true);

    const fetched = await violetService.getTask("task-svc-1");
    expect(fetched?.goal).toBe("Test task saving");
  });

  it("handles approval lifecycle in memory", async () => {
    const approval: VioletApprovalRequest = {
      id: "appr-svc-1",
      taskId: "task-svc-1",
      stepId: "step-1",
      operation: "files.create",
      consequence: "Will create file",
      argumentsHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      argumentsPreview: { path: "C:/new.txt" },
      status: "pending",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    await violetService.saveApproval(approval);
    expect(violetService.listApprovals("task-svc-1")).toHaveLength(1);

    const approved = await violetService.respondApproval("appr-svc-1", true);
    expect(approved?.status).toBe("approved");
    expect(approved?.decidedAt).toBeDefined();
  });

  it("handles human handoffs and resume signals", async () => {
    await violetService.saveHandoff({
      id: "hnd-svc-1",
      taskId: "task-svc-1",
      reason: "captcha",
      instructions: "Solve the CAPTCHA in the browser",
      visibleClient: "desktop",
      status: "waiting",
      createdAt: new Date().toISOString(),
    });

    const handoffs = violetService.listHandoffs("task-svc-1");
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].status).toBe("waiting");

    const resumed = await violetService.resumeHandoff("hnd-svc-1");
    expect(resumed?.status).toBe("resumed");
    expect(resumed?.resumedAt).toBeDefined();
  });
});
