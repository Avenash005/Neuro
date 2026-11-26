import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MultiAgentOrchestrator } from "../agentOrchestrator";
import { GitWorktreeManager } from "../../git/worktreeManager";
import { FileConflictGuard } from "../fileConflictGuard";
import { RepositoryIntelligence } from "../repositoryIntelligence";
import { AgentCollaborationHub } from "../agentCollaboration";
import { SubtaskScheduler } from "../subtaskScheduler";
import { EngineeringIntelligence } from "../engineeringIntelligence";
import type { ModelGateway } from "../../ai/modelGateway";
import type { NormalizedChatResponse } from "../../ai/types";

function createMockGateway(options?: {
  architectPlan?: string;
  devCode?: string;
  reviewerResponse?: string;
  challengeResponse?: string;
}): ModelGateway {
  const plan =
    options?.architectPlan ||
    `[PLAN_PROPOSAL]
1. Requirements Analysis: Secure local API endpoints.
2. Target files: src/auth.ts, src/server.ts.
3. Steps for Developer:
   - Create auth middleware.
   - Add token verification.
4. Acceptance Criteria: Pass test suite.`;

  const code =
    options?.devCode ||
    `[SUMMARY]: Implemented strict token validation.
[FILE: src/auth.ts]
export function verifyToken(token: string): boolean {
  if (!token) return false;
  return token.startsWith("owner-secret-");
}
[END_FILE]`;

  const review =
    options?.reviewerResponse ||
    `[VERDICT]: APPROVED
[SCORE]: 95
[ISSUES]:
- [SUGGESTION] src/auth.ts: Consider extracting secret prefix to config.
[RECOMMENDATIONS]:
- Add integration test for invalid tokens.
[SUMMARY]:
Implementation is clean, secure, and passes static analysis with zero critical defects.`;

  const challenge =
    options?.challengeResponse ||
    `Reviewed implementation plan. No critical conflicts detected. Plan accepted for execution.`;

  const mock = {
    chat: vi.fn(async (req: any) => {
      const prompt = req.messages?.[0]?.content || "";

      let content = code;

      if (prompt.includes("Principal Software Architect")) {
        content = plan;
      } else if (prompt.includes("Evaluate the following implementation plan")) {
        content = challenge;
      } else if (prompt.includes("Lead Code Reviewer")) {
        content = review;
      }

      const response: NormalizedChatResponse = {
        request_id: `resp_${Date.now()}`,
        provider: (req.provider as any) || "anthropic",
        model: req.model || "claude-3-5-sonnet-latest",
        content,
        usage: { prompt_tokens: 150, completion_tokens: 80, total_tokens: 230 },
        finish_reason: "stop",
        latency_ms: 15,
        routing: {
          taskCategory: "coding",
          selectedReason: "Mock test routing",
          policy: "AUTO",
          mode: "auto",
          fallbackUsed: false,
        },
      };
      return response;
    }),
    registry: {
      getConfiguredProviders: () => ["anthropic", "openai", "gemini"],
      getAdapter: () => ({ isConfigured: true }),
    },
  } as unknown as ModelGateway;

  return mock;
}

describe("Autonomous Engineering Intelligence End-to-End Pipeline", () => {
  let tempRepoDir: string;
  let gitManager: GitWorktreeManager;
  let conflictGuard: FileConflictGuard;
  let repoIntel: RepositoryIntelligence;
  let collabHub: AgentCollaborationHub;
  let scheduler: SubtaskScheduler;
  let engineeringIntel: EngineeringIntelligence;

  beforeEach(async () => {
    tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), "violet-auto-eng-test-"));
    gitManager = new GitWorktreeManager(tempRepoDir);
    conflictGuard = new FileConflictGuard();
    repoIntel = new RepositoryIntelligence();
    collabHub = new AgentCollaborationHub();
    scheduler = new SubtaskScheduler(conflictGuard);
    engineeringIntel = new EngineeringIntelligence();

    // Initialize mock git repo
    await gitManager.runCommand(tempRepoDir, "git", ["init", "-b", "main"]);
    await gitManager.runCommand(tempRepoDir, "git", ["config", "user.name", "Violet Tester"]);
    await gitManager.runCommand(tempRepoDir, "git", ["config", "user.email", "tester@violet.local"]);

    // Create initial commit
    await fs.writeFile(path.join(tempRepoDir, "README.md"), "# Violet Test Project\n");
    await gitManager.runCommand(tempRepoDir, "git", ["add", "."]);
    await gitManager.runCommand(tempRepoDir, "git", ["commit", "-m", "chore: initial commit"]);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRepoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("executes the full Phase 3D autonomous engineering pipeline seamlessly", async () => {
    const mockGateway = createMockGateway();
    const orchestrator = new MultiAgentOrchestrator(
      mockGateway,
      gitManager,
      conflictGuard,
      3,
      repoIntel,
      collabHub,
      scheduler,
      engineeringIntel
    );

    const emittedEvents: string[] = [];
    orchestrator.subscribeToTask("task-e2e-auto-eng", (evt) => {
      emittedEvents.push(evt.eventType);
    });

    const task = await orchestrator.startTask({
      taskId: "task-e2e-auto-eng",
      goal: "Implement token validator in auth.ts with isolated tests",
      repoPath: tempRepoDir,
      baseBranch: "main",
      models: {
        architect: { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
        developer: { provider: "openai", model: "gpt-4o" },
        reviewer: { provider: "gemini", model: "gemini-2.0-flash" },
      },
    });

    expect(task.id).toBe("task-e2e-auto-eng");
    expect(task.status).toBe("planning");

    // Wait for async execution pipeline to complete
    let attempts = 0;
    while (attempts < 120) {
      const current = orchestrator.getTask("task-e2e-auto-eng");
      if (current?.status === "completed" || current?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 80));
      attempts++;
    }

    const finished = orchestrator.getTask("task-e2e-auto-eng");
    expect(finished).toBeDefined();
    expect(finished?.status).toBe("completed");

    // 1. Verify Repository Intelligence
    expect(emittedEvents).toContain("repo.inspected");

    // 2. Verify Subtask DAG Scheduling
    expect(finished?.subtasks).toBeDefined();
    expect(finished?.subtasks?.length).toBe(3);
    expect(finished?.subtasks?.[0].assignedRole).toBe("architect");
    expect(finished?.subtasks?.[0].status).toBe("completed");
    expect(finished?.subtasks?.[1].assignedRole).toBe("developer");
    expect(finished?.subtasks?.[1].status).toBe("completed");
    expect(finished?.subtasks?.[2].assignedRole).toBe("reviewer");
    expect(finished?.subtasks?.[2].status).toBe("completed");

    // 3. Verify Architectural Decisions (ADR)
    expect(finished?.architecturalDecisions).toBeDefined();
    expect(finished?.architecturalDecisions?.length).toBeGreaterThanOrEqual(1);
    expect(finished?.architecturalDecisions?.[0].status).toBe("accepted");
    expect(finished?.architecturalDecisions?.[0].modelsConsulted).toContain("claude-3-5-sonnet-latest");

    // 4. Verify Peer Agent Collaboration Messages
    expect(finished?.messages).toBeDefined();
    expect(finished?.messages?.length).toBeGreaterThanOrEqual(2);
    const proposalMsg = finished?.messages?.find((m) => m.messageType === "PLAN_PROPOSAL");
    const acceptMsg = finished?.messages?.find((m) => m.messageType === "PLAN_ACCEPTED");
    expect(proposalMsg).toBeDefined();
    expect(acceptMsg).toBeDefined();

    // 5. Verify Developer Commits in Isolated Worktree
    expect(finished?.commits.length).toBe(1);
    expect(finished?.commits[0].filesChanged).toContain("src/auth.ts");

    // 6. Verify Static Engineering Intelligence Analysis
    expect(emittedEvents).toContain("engineering.analyzed");
    expect(finished?.findings).toBeDefined();

    // 7. Verify Review Verdict & Integration Branch
    expect(finished?.reviews.length).toBe(1);
    expect(finished?.reviews[0].verdict).toBe("approved");
    expect(finished?.integrationBranch).toBeDefined();
    expect(finished?.integrationBranch).toContain("violet/task-task-e2e-auto-eng/integration");

    // 8. Verify File Locks Released
    expect(conflictGuard.getLocksForTask("task-e2e-auto-eng").length).toBe(0);
  }, 20000);
});
