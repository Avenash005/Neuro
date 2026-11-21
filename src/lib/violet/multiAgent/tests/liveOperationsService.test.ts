import { describe, expect, it, vi, beforeEach } from "vitest";
import { LiveOperationsService } from "../liveOperationsService";
import type { MultiAgentOrchestrator } from "../agentOrchestrator";
import type { ModelGateway } from "../../ai/modelGateway";
import type { GitWorktreeManager } from "../../git/worktreeManager";
import type { MultiAgentTaskState } from "../../../../types/multiAgent";
import type { WorkflowDAGNode, WorkflowDAGEdge, ProviderTelemetry } from "../../../../types/liveOperations";

describe("LiveOperationsService (Phase 3F)", () => {
  let mockOrchestrator: Partial<MultiAgentOrchestrator>;
  let mockGateway: Partial<ModelGateway>;
  let mockGitManager: Partial<GitWorktreeManager>;
  let sampleTask: MultiAgentTaskState;

  beforeEach(() => {
    sampleTask = {
      id: "task-test-101",
      goal: "Implement authentication refresh token mechanism",
      userId: "user-123",
      status: "implementing",
      repoPath: "/repo",
      baseBranch: "main",
      integrationBranch: "violet/task-test-101/integration",
      currentCycle: 1,
      maxCycles: 3,
      currentRun: {
        id: "run-1",
        taskId: "task-test-101",
        userId: "user-123",
        runNumber: 1,
        status: "implementing",
        activeAgents: [
          {
            role: "architect",
            model: "claude-3-5-sonnet",
            provider: "anthropic",
            status: "completed",
            activity: "Plan ready",
            assignedSkills: ["architecture_design"],
            activeTools: ["read_file"],
            lastHeartbeat: new Date().toISOString(),
          },
          {
            role: "developer",
            model: "claude-3-5-sonnet",
            provider: "anthropic",
            status: "working",
            activity: "Writing auth middleware",
            worktreeBranch: "violet/task-test-101/dev",
            worktreePath: "/repo/.violet/worktrees/task-test-101/dev",
            assignedSkills: ["code_implementation", "git_worktree"],
            activeTools: ["write_file", "run_test"],
            lastHeartbeat: new Date().toISOString(),
            startedAt: new Date(Date.now() - 5000).toISOString(),
          },
          {
            role: "reviewer",
            model: "gpt-4o",
            provider: "openai",
            status: "idle",
            activity: "Awaiting developer commit",
            assignedSkills: ["code_review"],
            activeTools: ["git_diff"],
            lastHeartbeat: new Date().toISOString(),
          },
        ],
        architectModel: "anthropic:claude-3-5-sonnet",
        developerModel: "anthropic:claude-3-5-sonnet",
        reviewerModel: "openai:gpt-4o",
        baseBranch: "main",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      runs: [],
      events: [
        {
          id: "evt-1",
          taskId: "task-test-101",
          userId: "user-123",
          agentRole: "developer",
          eventType: "developer.committed",
          message: "Committed auth middleware",
          createdAt: new Date().toISOString(),
        },
      ],
      commits: [
        {
          id: "cmt-1",
          taskId: "task-test-101",
          userId: "user-123",
          agentRole: "developer",
          branchName: "violet/task-test-101/dev",
          commitSha: "abc123456789",
          commitMessage: "Add token refresh handler",
          filesChanged: ["src/auth.ts"],
          insertions: 42,
          deletions: 3,
          createdAt: new Date().toISOString(),
        },
      ],
      artifacts: [
        {
          id: "art-1",
          taskId: "task-test-101",
          userId: "user-123",
          agentRole: "architect",
          artifactType: "plan",
          content: "# Implementation Plan\nStep 1: Refresh tokens",
          createdAt: new Date().toISOString(),
        },
      ],
      usage: [
        {
          id: "usg-1",
          taskId: "task-test-101",
          userId: "user-123",
          agentRole: "developer",
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          promptTokens: 1200,
          completionTokens: 400,
          totalTokens: 1600,
          estimatedCostUsd: 0.0096,
          latencyMs: 850,
          createdAt: new Date().toISOString(),
        },
      ],
      reviews: [
        {
          id: "rev-1",
          taskId: "task-test-101",
          userId: "user-123",
          reviewerAgentRole: "reviewer",
          reviewerModel: "openai:gpt-4o",
          verdict: "approved",
          cycleNumber: 1,
          score: 95,
          reviewNotes: "Clean implementation with zero security issues.",
          createdAt: new Date().toISOString(),
        },
      ],
      subtasks: [
        {
          id: "st-1",
          taskId: "task-test-101",
          title: "Architecture Analysis",
          description: "Analyze auth requirements",
          assignedRole: "architect",
          status: "completed",
          dependencies: [],
          targetFiles: ["src/auth.ts"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "st-2",
          taskId: "task-test-101",
          title: "Implement Token Refresh",
          description: "Write refresh controller",
          assignedRole: "developer",
          status: "running",
          dependencies: ["st-1"],
          targetFiles: ["src/auth.ts"],
          createdAt: new Date().toISOString(),
        },
      ],
      messages: [],
      totalCostUsd: 0.0096,
      totalTokens: 1600,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockOrchestrator = {
      listTasks: vi.fn().mockReturnValue([sampleTask]),
      getTask: vi.fn().mockImplementation((id) => (id === sampleTask.id ? sampleTask : undefined)),
      pauseTask: vi.fn().mockResolvedValue(true),
      resumeTask: vi.fn().mockResolvedValue(true),
      retryTask: vi.fn().mockResolvedValue({ ...sampleTask, status: "queued" }),
      cancelTask: vi.fn().mockResolvedValue(undefined),
      approveIntegration: vi.fn().mockResolvedValue({
        success: true,
        branch: "violet/task-test-101/integration",
        commitSha: "abc1234",
        message: "Merged successfully",
      }),
    };

    mockGateway = {
      registry: {
        checkAllHealth: vi.fn().mockResolvedValue({}),
        listAllModels: vi.fn().mockResolvedValue([]),
      } as any,
    };

    mockGitManager = {
      getDiff: vi.fn().mockResolvedValue("diff --git a/src/auth.ts b/src/auth.ts\n+export function refreshToken() {}"),
      mergeBranch: vi.fn().mockResolvedValue({ success: true, commitSha: "abc1234", message: "Merged" }),
    };
  });

  it("calculates operations summary metrics accurately from real task data", () => {
    const service = new LiveOperationsService(
      mockOrchestrator as MultiAgentOrchestrator,
      mockGateway as ModelGateway,
      mockGitManager as GitWorktreeManager
    );

    const summary = service.getOperationsSummary();
    expect(summary.totalRegisteredAgents).toBeGreaterThanOrEqual(3);
    expect(summary.activeAgents).toBe(1); // Developer is working and has fresh heartbeat
    expect(summary.idleAgents).toBe(1); // Reviewer is idle
    expect(summary.totalModelCalls).toBe(1);
    expect(summary.totalTokens.total).toBe(1600);
    expect(summary.estimatedProviderCostUsd).toBe(0.0096);
    expect(summary.providerCostBreakdown.anthropic).toBe(0.0096);
    expect(summary.runningWorkflows).toBe(1);
  });

  it("identifies stale workers when heartbeat threshold is exceeded", () => {
    // Modify developer heartbeat to 45 seconds ago (threshold is 30s)
    sampleTask.currentRun!.activeAgents[1].lastHeartbeat = new Date(Date.now() - 45_000).toISOString();

    const service = new LiveOperationsService(
      mockOrchestrator as MultiAgentOrchestrator,
      mockGateway as ModelGateway,
      mockGitManager as GitWorktreeManager
    );

    const liveAgents = service.getLiveAgents();
    const developerAgent = liveAgents.find((a) => a.role === "developer");

    expect(developerAgent).toBeDefined();
    expect(developerAgent?.isStale).toBe(true);
    expect(developerAgent?.status).toBe("stale");

    // Operations summary should not count stale agent as active
    const summary = service.getOperationsSummary();
    expect(summary.activeAgents).toBe(0);
    expect(summary.staleAgents).toBe(1);
  });

  it("generates full 8-tab inspector detail for an agent", () => {
    const service = new LiveOperationsService(
      mockOrchestrator as MultiAgentOrchestrator,
      mockGateway as ModelGateway,
      mockGitManager as GitWorktreeManager
    );

    const detail = service.getAgentDetail(`task-test-101-developer`);
    expect(detail).toBeDefined();
    expect(detail?.name).toBe("VIOLET Core Developer");
    expect(detail?.role).toBe("developer");
    expect(detail?.modelConfig).toBeDefined();
    expect(detail?.modelConfig.avgLatencyMs).toBe(850);
    expect(detail?.skillsDetail.length).toBeGreaterThan(0);
    expect(detail?.toolsDetail.length).toBeGreaterThan(0);
    expect(detail?.files.opened).toContain("src/auth.ts");
    expect(detail?.files.modified).toContain("src/auth.ts");
    expect(detail?.git.latestCommitSha).toBe("abc123456789");
    expect(detail?.executionLogs.length).toBe(1);
  });

  it("constructs interactive workflow DAG with subtask and review nodes", () => {
    const service = new LiveOperationsService(
      mockOrchestrator as MultiAgentOrchestrator,
      mockGateway as ModelGateway,
      mockGitManager as GitWorktreeManager
    );

    const dag = service.getWorkflowDAG("task-test-101");
    expect(dag).toBeDefined();
    expect(dag?.nodes.some((n: WorkflowDAGNode) => n.type === "task")).toBe(true);
    expect(dag?.nodes.some((n: WorkflowDAGNode) => n.type === "subtask")).toBe(true);
    expect(dag?.nodes.some((n: WorkflowDAGNode) => n.type === "review")).toBe(true);
    expect(dag?.nodes.some((n: WorkflowDAGNode) => n.type === "commit")).toBe(true);

    // Verify subtask dependency edge
    const depEdge = dag?.edges.find((e: WorkflowDAGEdge) => e.kind === "dependency");
    expect(depEdge).toBeDefined();
    expect(depEdge?.source).toBe("subtask-st-1");
    expect(depEdge?.target).toBe("subtask-st-2");
  });

  it("measures system hardware and strictly reports GPU as unavailable without inventing fake data", () => {
    const service = new LiveOperationsService(
      mockOrchestrator as MultiAgentOrchestrator,
      mockGateway as ModelGateway,
      mockGitManager as GitWorktreeManager
    );

    const telemetry = service.getResourceTelemetry();
    expect(telemetry.system.isMeasured).toBe(true);
    expect(telemetry.system.memoryTotalBytes).toBeGreaterThan(0);
    expect(telemetry.system.memoryUsagePercent).toBeGreaterThan(0);

    // Strictly check GPU telemetry requirement
    expect(telemetry.gpu.available).toBe(false);
    expect(telemetry.gpu.statusMessage).toContain("Unavailable (No hardware telemetry provider connected)");
    expect(telemetry.gpu.gpuUsagePercent).toBeNull();
    expect(telemetry.gpu.vramUsageBytes).toBeNull();

    // Provider stats
    const anthropicStats = telemetry.providers.find((p: ProviderTelemetry) => p.provider === "anthropic");
    expect(anthropicStats?.requestCount).toBe(1);
    expect(anthropicStats?.avgLatencyMs).toBe(850);
  });

  it("supports owner control actions: pause, resume, retry, approve, and diff", async () => {
    const service = new LiveOperationsService(
      mockOrchestrator as MultiAgentOrchestrator,
      mockGateway as ModelGateway,
      mockGitManager as GitWorktreeManager
    );

    const paused = await service.pauseTask("task-test-101");
    expect(paused).toBe(true);
    expect(mockOrchestrator.pauseTask).toHaveBeenCalledWith("task-test-101");

    const resumed = await service.resumeTask("task-test-101");
    expect(resumed).toBe(true);
    expect(mockOrchestrator.resumeTask).toHaveBeenCalledWith("task-test-101");

    const retried = await service.retryTask("task-test-101");
    expect(retried.status).toBe("queued");
    expect(mockOrchestrator.retryTask).toHaveBeenCalledWith("task-test-101");

    const approved = await service.approveIntegration("task-test-101");
    expect(approved.success).toBe(true);
    expect(approved.branch).toBe("violet/task-test-101/integration");

    const diff = await service.getTaskDiff("task-test-101");
    expect(diff).toContain("export function refreshToken");
  });
});
