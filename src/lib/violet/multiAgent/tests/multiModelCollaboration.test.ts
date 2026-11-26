import { describe, expect, it, vi } from "vitest";
import type { ModelGateway } from "../../ai/modelGateway";
import type { NormalizedChatResponse } from "../../ai/types";
import type { GitWorktreeManager } from "../../git/worktreeManager";
import { MultiAgentOrchestrator } from "../agentOrchestrator";
import { FileConflictGuard } from "../fileConflictGuard";

function createMockGateway(
  configuredProviders: string[] = ["anthropic", "openai", "gemini"],
  reviewSequence: string[] = ["[VERDICT]: APPROVED\n[SCORE]: 95\n[SUMMARY]: Approved."]
): ModelGateway {
  let reviewCallIndex = 0;

  const mockRegistry = {
    getConfiguredProviders: vi.fn().mockReturnValue(configuredProviders),
    getAdapter: vi.fn().mockImplementation((provider: string) => {
      const isConfigured = configuredProviders.includes(provider);
      return { isConfigured };
    }),
  };

  return {
    registry: mockRegistry,
    chat: vi.fn().mockImplementation(async (req) => {
      const prompt = req.messages[0]?.content || "";
      let content = "Default model response";

      if (prompt.includes("Principal Software Architect")) {
        content = "Architect Plan:\n1. Update src/calc.ts\n2. Add test coverage.";
      } else if (prompt.includes("Lead Software Developer")) {
        if (prompt.includes("CORRECTION CYCLE")) {
          content =
            "[SUMMARY]: Fixed boundary check as requested by reviewer.\n[FILE: src/calc.ts]\nexport const add = (a: number, b: number) => (a === 0 ? b : a + b);\n[END_FILE]";
        } else {
          content =
            "[SUMMARY]: Initial calculation implementation.\n[FILE: src/calc.ts]\nexport const add = (a: number, b: number) => a + b;\n[END_FILE]";
        }
      } else if (prompt.includes("Lead Code Reviewer")) {
        content = reviewSequence[reviewCallIndex] || reviewSequence[reviewSequence.length - 1];
        reviewCallIndex++;
      }

      const res: NormalizedChatResponse = {
        request_id: `req_${Date.now()}`,
        provider: req.provider || "openai",
        model: req.model || "gpt-4o",
        content,
        finish_reason: "stop",
        latency_ms: 30,
        routing: {
          taskCategory: req.task_category || "coding",
          selectedReason: "Mock multi-model test selection",
          policy: "AUTO",
          mode: "auto",
          fallbackUsed: false,
        },
        usage: {
          prompt_tokens: 120,
          completion_tokens: 60,
          total_tokens: 180,
        },
      };
      return res;
    }),
  } as unknown as ModelGateway;
}

function createMockGitManager(): GitWorktreeManager {
  return {
    getRepoRoot: vi.fn().mockResolvedValue("/mock/repo"),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    createWorktree: vi.fn().mockResolvedValue({
      worktreePath: "/mock/repo/.violet/worktrees/task-multi/developer",
      branch: "violet/task-multi/developer",
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("export const add = (a: number, b: number) => a + b;"),
    commit: vi.fn().mockImplementation(async (_path, message) => ({
      commitSha: "f1e2d3c4b5a6789012345678901234567890ffff",
      commitMessage: message,
      branch: "violet/task-multi/developer",
      filesChanged: ["src/calc.ts"],
      insertions: 5,
      deletions: 1,
    })),
    getDiff: vi.fn().mockResolvedValue("+export const add = (a: number, b: number) => a + b;"),
    runCommand: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Tests PASSED: 1 suite, 5 tests passed",
      stderr: "",
      durationMs: 85,
    }),
    createIntegrationBranch: vi.fn().mockResolvedValue("violet/task-multi/integration"),
    cleanupWorktree: vi.fn().mockResolvedValue(undefined),
    listAllWorktrees: vi.fn().mockResolvedValue([]),
    assertPathInsideWorktree: vi.fn().mockReturnValue("/mock/target"),
  } as unknown as GitWorktreeManager;
}

describe("VIOLET Lab — Phase 3C Multi-Model Collaboration Engine", () => {
  describe("Multi-Model Assignment & Cross-Model Diversity", () => {
    it("assigns distinct models to Architect, Developer, and Reviewer", () => {
      const gateway = createMockGateway(["anthropic", "openai", "gemini"]);
      const orchestrator = new MultiAgentOrchestrator(gateway, createMockGitManager(), new FileConflictGuard(), 3);

      const assignments = orchestrator.resolveModelAssignments({
        goal: "Refactor auth tokens",
      });

      expect(assignments.architect.provider).toBe("anthropic");
      expect(assignments.developer.provider).toBe("openai");
      expect(assignments.reviewer.provider).toBe("gemini");
      expect(assignments.isIndependentReviewer).toBe(true);
      expect(assignments.reviewer.provider).not.toBe(assignments.developer.provider);
    });

    it("enforces independent model within same provider when only one provider is configured", () => {
      const gateway = createMockGateway(["openai"]);
      const orchestrator = new MultiAgentOrchestrator(gateway, createMockGitManager(), new FileConflictGuard(), 3);

      const assignments = orchestrator.resolveModelAssignments({
        goal: "Refactor auth tokens",
      });

      expect(assignments.developer.provider).toBe("openai");
      expect(assignments.developer.model).toBe("gpt-4o");
      expect(assignments.reviewer.provider).toBe("openai");
      expect(assignments.reviewer.model).toBe("gpt-4o-mini");
      expect(assignments.isIndependentReviewer).toBe(true);
    });

    it("reports unavailable provider credentials as a configuration error", () => {
      const gateway = createMockGateway(["openai"]); // only openai configured
      const orchestrator = new MultiAgentOrchestrator(gateway, createMockGitManager(), new FileConflictGuard(), 3);

      expect(() => {
        orchestrator.resolveModelAssignments({
          goal: "Build cache layer",
          models: {
            reviewer: { provider: "anthropic", model: "claude-3-5-sonnet" },
          },
        });
      }).toThrow(/Configuration error: Provider 'anthropic' requested for Reviewer is not configured/);
    });
  });

  describe("Structured Review Parsing", () => {
    it("parses structured tag review with changes requested, issues, and recommendations", () => {
      const orchestrator = new MultiAgentOrchestrator(createMockGateway(), createMockGitManager(), 3);

      const reviewText = `[VERDICT]: CHANGES_REQUESTED
[SCORE]: 72
[ISSUES]:
- [CRITICAL] src/calc.ts: Missing zero division safety guard (Suggested fix: check divisor !== 0)
- [WARNING] src/calc.test.ts: Missing negative integer test cases
[RECOMMENDATIONS]:
- Add parameterized edge case testing
[SUMMARY]: Code structure is promising but critical division check must be added.`;

      const result = orchestrator.parseStructuredReview(reviewText);

      expect(result.verdict).toBe("changes_requested");
      expect(result.score).toBe(72);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].severity).toBe("critical");
      expect(result.issues[0].description).toContain("Missing zero division safety guard");
      expect(result.issues[1].severity).toBe("warning");
      expect(result.recommendations).toContain("Add parameterized edge case testing");
      expect(result.summary).toContain("Code structure is promising");
    });

    it("parses structured JSON review responses", () => {
      const orchestrator = new MultiAgentOrchestrator(createMockGateway(), createMockGitManager(), 3);

      const jsonReview = JSON.stringify({
        verdict: "APPROVED",
        score: 96,
        issues: [],
        recommendations: ["Ship to staging"],
        summary: "Flawless implementation.",
      });

      const result = orchestrator.parseStructuredReview(`\`\`\`json\n${jsonReview}\n\`\`\``);

      expect(result.verdict).toBe("approved");
      expect(result.score).toBe(96);
      expect(result.issues).toHaveLength(0);
      expect(result.summary).toBe("Flawless implementation.");
    });
  });

  describe("Bounded Review & Correction Cycles (Max 3 Attempts)", () => {
    it("triggers automatic correction cycle when changes are requested, then completes upon approval", async () => {
      const reviewSequence = [
        // Cycle 1: Reviewer requests changes
        `[VERDICT]: CHANGES_REQUESTED
[SCORE]: 68
[ISSUES]:
- [CRITICAL] src/calc.ts: Zero boundary check missing
[SUMMARY]: Changes requested for safety.`,
        // Cycle 2: Reviewer approves after developer correction
        `[VERDICT]: APPROVED
[SCORE]: 95
[ISSUES]:
[SUMMARY]: Fixes verified. Looks great!`,
      ];

      const gateway = createMockGateway(["anthropic", "openai", "gemini"], reviewSequence);
      const gitManager = createMockGitManager();
      const orchestrator = new MultiAgentOrchestrator(gateway, gitManager, 3);

      const emittedEventTypes: string[] = [];
      orchestrator.subscribeToTask("task-collab-1", (evt) => {
        emittedEventTypes.push(evt.eventType);
      });

      await orchestrator.startTask({
        taskId: "task-collab-1",
        goal: "Implement robust math division utility",
        maxCorrectionAttempts: 3,
      });

      // Allow async pipeline to process both cycles
      const startWait = Date.now();
      while (Date.now() - startWait < 20000) {
        const cur = orchestrator.getTask("task-collab-1");
        if (cur?.status === "completed" || cur?.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const task = orchestrator.getTask("task-collab-1");
      expect(task).toBeDefined();
      expect(task?.status).toBe("completed");

      // Verify two review records were created
      expect(task?.reviews).toHaveLength(2);
      expect(task?.reviews[0].verdict).toBe("changes_requested");
      expect(task?.reviews[0].cycleNumber).toBe(1);
      expect(task?.reviews[1].verdict).toBe("approved");
      expect(task?.reviews[1].cycleNumber).toBe(2);

      // Verify two commits were created (initial + cycle 2 correction)
      expect(task?.commits).toHaveLength(2);
      expect(task?.commits[1].commitMessage).toContain("cycle 2 corrections");

      // Verify review correction events were broadcast
      expect(emittedEventTypes).toContain("review.changes_requested");
      expect(emittedEventTypes).toContain("developer.correction_committed");
      expect(emittedEventTypes).toContain("review.approved");
      expect(emittedEventTypes).toContain("integration.ready");

      // Integration branch prepared under owner control
      expect(task?.integrationBranch).toBe("violet/task-multi/integration");
    }, 25000);

    it("enforces bounded limit of max 3 correction cycles when reviews continually fail", async () => {
      // 3 consecutive change requests
      const persistentRejection = [
        "[VERDICT]: CHANGES_REQUESTED\n[SCORE]: 50\n[SUMMARY]: Cycle 1 rejected.",
        "[VERDICT]: CHANGES_REQUESTED\n[SCORE]: 55\n[SUMMARY]: Cycle 2 rejected.",
        "[VERDICT]: CHANGES_REQUESTED\n[SCORE]: 58\n[SUMMARY]: Cycle 3 rejected.",
      ];

      const gateway = createMockGateway(["anthropic", "openai", "gemini"], persistentRejection);
      const gitManager = createMockGitManager();
      const orchestrator = new MultiAgentOrchestrator(gateway, gitManager, 3);

      const emittedEventTypes: string[] = [];
      orchestrator.subscribeToTask("task-max-cycles", (evt) => {
        emittedEventTypes.push(evt.eventType);
      });

      await orchestrator.startTask({
        taskId: "task-max-cycles",
        goal: "Complex intractable algorithm",
        maxCorrectionAttempts: 3,
      });

      const startTime = Date.now();
      while (Date.now() - startTime < 20000) {
        const t = orchestrator.getTask("task-max-cycles");
        if (t?.status === "completed" || t?.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      const task = orchestrator.getTask("task-max-cycles");
      expect(task).toBeDefined();
      expect(task?.status).toBe("completed");

      // Exactly 3 review cycles recorded
      expect(task?.reviews).toHaveLength(3);
      expect(task?.currentCycle).toBe(3);

      // Verify max cycles reached event was emitted
      expect(emittedEventTypes).toContain("review.max_cycles_reached");
    }, 25000);

    it("runs automated test checks in worktree during review cycle", async () => {
      const gateway = createMockGateway();
      const gitManager = createMockGitManager();
      const orchestrator = new MultiAgentOrchestrator(gateway, gitManager, 3);

      await orchestrator.startTask({
        taskId: "task-with-tests",
        goal: "Verify automated test capture",
        testCommand: { command: "git", args: ["status", "--porcelain"] },
      });

      const startWait = Date.now();
      while (Date.now() - startWait < 10000) {
        const cur = orchestrator.getTask("task-with-tests");
        if (cur?.reviews && cur.reviews.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const task = orchestrator.getTask("task-with-tests");
      expect(task?.reviews).toHaveLength(1);
      expect(task?.reviews[0].automatedChecks?.testsPassed).toBe(true);
      expect(task?.reviews[0].testResults?.passed).toBe(1);
    }, 20000);
  });
});
