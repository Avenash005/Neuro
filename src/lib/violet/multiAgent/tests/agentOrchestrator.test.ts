import { describe, expect, it, vi } from "vitest";
import type { ModelGateway } from "../../ai/modelGateway";
import type { NormalizedChatResponse } from "../../ai/types";
import type { GitWorktreeManager } from "../../git/worktreeManager";
import { MultiAgentOrchestrator } from "../agentOrchestrator";

function createMockGateway(responses?: Partial<Record<string, string>>): ModelGateway {
  return {
    chat: vi.fn().mockImplementation(async (req) => {
      const prompt = req.messages[0]?.content || "";
      let content = "Default mock agent response";

      if (prompt.includes("Principal Software Architect")) {
        content =
          responses?.architect ||
          "Architect Plan:\n1. Update src/calc.ts with add function.\n2. Write tests in src/calc.test.ts.";
      } else if (prompt.includes("Lead Software Developer")) {
        content =
          responses?.developer ||
          "[SUMMARY]: Implemented calculation logic.\n[FILE: src/calc.ts]\nexport const add = (a: number, b: number) => a + b;\n[END_FILE]";
      } else if (prompt.includes("Lead Code Reviewer")) {
        content =
          responses?.reviewer ||
          "Reviewer analysis:\nCode is clean and correct.\nVERDICT: APPROVED";
      }

      const res: NormalizedChatResponse = {
        request_id: `req_${Date.now()}`,
        provider: req.provider || "openai",
        model: req.model || "gpt-4o",
        content,
        finish_reason: "stop",
        latency_ms: 45,
        routing: {
          taskCategory: req.task_category || "coding",
          selectedReason: "Mock test selection",
          policy: "AUTO",
          mode: "auto",
          fallbackUsed: false,
        },
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };
      return res;
    }),
  } as unknown as ModelGateway;
}

function createMockGitManager(): GitWorktreeManager {
  return {
    getRepoRoot: vi.fn().mockResolvedValue("/mock/repo/root"),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    createWorktree: vi.fn().mockResolvedValue({
      worktreePath: "/mock/repo/root/.violet/worktrees/task-123/developer",
      branch: "violet/task-123/developer",
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("export const add = (a: number, b: number) => a + b;"),
    commit: vi.fn().mockResolvedValue({
      commitSha: "a1b2c3d4e5f6789012345678901234567890abcd",
      commitMessage: "feat(violet): autonomous implementation",
      branch: "violet/task-123/developer",
      filesChanged: ["src/calc.ts"],
      insertions: 5,
      deletions: 0,
    }),
    getDiff: vi.fn().mockResolvedValue("+export const add = (a: number, b: number) => a + b;"),
    runCommand: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "All tests passed",
      stderr: "",
      durationMs: 120,
    }),
    createIntegrationBranch: vi.fn().mockResolvedValue("violet/task-123/integration"),
    cleanupWorktree: vi.fn().mockResolvedValue(undefined),
    listAllWorktrees: vi.fn().mockResolvedValue([]),
    assertPathInsideWorktree: vi.fn().mockReturnValue("/mock/target"),
  } as unknown as GitWorktreeManager;
}

describe("MultiAgentOrchestrator", () => {
  it("enforces max concurrent agents limit with internal semaphore", async () => {
    const orchestrator = new MultiAgentOrchestrator(
      createMockGateway(),
      createMockGitManager(),
      3
    );

    const sem = (orchestrator as any).semaphore;
    expect(sem.activeCount).toBe(0);

    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.activeCount).toBe(3);

    // 4th acquire will wait
    let acquiredFourth = false;
    const fourthPromise = sem.acquire().then(() => {
      acquiredFourth = true;
    });

    // Verify it is waiting in the queue
    expect(acquiredFourth).toBe(false);

    // Release one permit
    sem.release();
    await fourthPromise;
    expect(acquiredFourth).toBe(true);

    sem.release();
    sem.release();
    sem.release();
    expect(sem.activeCount).toBe(0);
  });

  it("subscribes to live SSE events and receives dispatched events", async () => {
    const orchestrator = new MultiAgentOrchestrator(
      createMockGateway(),
      createMockGitManager(),
      3
    );

    const receivedEvents: string[] = [];
    const unsubscribe = orchestrator.subscribeToTask("task-test-sse", (event) => {
      receivedEvents.push(event.eventType);
    });

    await (orchestrator as any).emitEvent(
      "task-test-sse",
      "architect",
      "test.event.one",
      "Message 1"
    );
    await (orchestrator as any).emitEvent(
      "task-test-sse",
      "developer",
      "test.event.two",
      "Message 2"
    );

    expect(receivedEvents).toEqual(["test.event.one", "test.event.two"]);

    // Unsubscribe and verify no more events delivered
    unsubscribe();
    await (orchestrator as any).emitEvent(
      "task-test-sse",
      "reviewer",
      "test.event.three",
      "Message 3"
    );
    expect(receivedEvents).toHaveLength(2);
  });

  it("executes end-to-end task through Architect -> Developer -> Reviewer", async () => {
    const mockGateway = createMockGateway();
    const mockGit = createMockGitManager();
    const orchestrator = new MultiAgentOrchestrator(mockGateway, mockGit, 3);

    const task = await orchestrator.startTask({
      taskId: "task-end-to-end",
      goal: "Implement a high-performance math library",
      repoPath: "/mock/repo/root",
      baseBranch: "main",
    });

    expect(task.id).toBe("task-end-to-end");
    expect(["queued", "planning", "completed"]).toContain(task.status);

    // Wait for the background pipeline to finish
    const startWait = Date.now();
    while (Date.now() - startWait < 10000) {
      const cur = orchestrator.getTask("task-end-to-end");
      if (cur?.status === "completed" || cur?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const finished = orchestrator.getTask("task-end-to-end");
    expect(finished).toBeDefined();
    expect(finished?.status).toBe("completed");

    // Architect plan verified
    expect(finished?.artifacts).toHaveLength(1);
    expect(finished?.artifacts[0].artifactType).toBe("plan");
    expect(finished?.artifacts[0].content).toContain("Architect Plan:");

    // Developer worktree and commit verified
    expect(finished?.commits).toHaveLength(1);
    expect(finished?.commits[0].commitSha).toBe("a1b2c3d4e5f6789012345678901234567890abcd");
    expect(finished?.commits[0].branchName).toBe("violet/task-123/developer");

    // Reviewer analysis and verdict verified
    expect(finished?.reviews).toHaveLength(1);
    expect(finished?.reviews[0].verdict).toBe("approved");

    // Integration branch prepared
    expect(finished?.integrationBranch).toBe("violet/task-123/integration");

    // Token usage & cost computed
    expect(finished?.totalTokens).toBeGreaterThan(0);
    expect(finished?.totalCostUsd).toBeGreaterThanOrEqual(0);
  }, 15000);

  it("handles changes requested verdict when reviewer flags issues", async () => {
    const mockGateway = createMockGateway({
      reviewer: "Found security flaw in input validation.\nVERDICT: CHANGES_REQUESTED",
    });
    const mockGit = createMockGitManager();
    const orchestrator = new MultiAgentOrchestrator(mockGateway, mockGit, 3);

    await orchestrator.startTask({
      taskId: "task-with-changes",
      goal: "Implement input handler",
    });

    const startWait = Date.now();
    while (Date.now() - startWait < 10000) {
      const cur = orchestrator.getTask("task-with-changes");
      if (cur?.reviews && cur.reviews.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const task = orchestrator.getTask("task-with-changes");
    expect(task?.reviews[0]?.verdict).toBe("changes_requested");
  }, 15000);

  it("cancels an active task and halts execution", async () => {
    const mockGateway = createMockGateway();
    const mockGit = createMockGitManager();
    const orchestrator = new MultiAgentOrchestrator(mockGateway, mockGit, 3);

    await orchestrator.startTask({
      taskId: "task-to-cancel",
      goal: "Long running compilation job",
    });

    await orchestrator.cancelTask("task-to-cancel", "User clicked abort");

    const cancelledTask = orchestrator.getTask("task-to-cancel");
    expect(cancelledTask?.status).toBe("cancelled");
    expect(cancelledTask?.currentRun?.status).toBe("cancelled");
    expect(cancelledTask?.currentRun?.errorSummary).toContain("User clicked abort");
  });
});
