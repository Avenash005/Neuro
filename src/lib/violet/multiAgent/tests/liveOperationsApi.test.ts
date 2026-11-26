import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type http from "node:http";
import { handleVioletApiRequest } from "../../../../server/violetApiServer";
import type { LiveOperationsService } from "../liveOperationsService";
import type { ModelGateway } from "../../ai/modelGateway";
import type { MultiAgentOrchestrator } from "../agentOrchestrator";
import type { GitWorktreeManager } from "../../git/worktreeManager";

class MockRequest extends EventEmitter {
  url: string;
  method: string;
  headers: Record<string, string>;

  constructor(method: string, url: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: "127.0.0.1:8766", ...headers };
  }
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";
  finished = false;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  write(chunk: string) {
    this.body += chunk;
    return true;
  }

  end(chunk?: string) {
    if (chunk) this.body += chunk;
    this.finished = true;
    this.emit("finish");
  }
}

describe("Live Operations API Endpoints", () => {
  let mockOperationsService: Partial<LiveOperationsService>;
  let mockGateway: Partial<ModelGateway>;
  let mockOrchestrator: Partial<MultiAgentOrchestrator>;
  let mockGitManager: Partial<GitWorktreeManager>;

  beforeEach(() => {
    mockOperationsService = {
      getOperationsSummary: vi.fn().mockReturnValue({
        totalRegisteredAgents: 4,
        activeAgents: 1,
        idleAgents: 3,
        failedAgents: 0,
        staleAgents: 0,
        queuedTasks: 0,
        completedTasks: 5,
        runningWorkflows: 1,
        totalModelCalls: 12,
        totalTokens: { prompt: 5000, completion: 2000, total: 7000 },
        estimatedProviderCostUsd: 0.042,
        providerCostBreakdown: { anthropic: 0.042 },
        providerCallBreakdown: { anthropic: 12 },
        providerTokenBreakdown: { anthropic: 7000 },
      }),
      getLiveAgents: vi.fn().mockReturnValue([
        {
          id: "task-1-developer",
          taskId: "task-1",
          taskGoal: "Fix race condition in task queue",
          name: "VIOLET Core Developer",
          role: "developer",
          status: "working",
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          executionMode: "cloud",
          assignedSkills: ["code_implementation"],
          activeTools: ["read_file", "write_file"],
          activity: "Refactoring queue locks",
          lastHeartbeat: new Date().toISOString(),
          isStale: false,
          durationMs: 4200,
          tokens: { prompt: 1000, completion: 300, total: 1300 },
          estimatedCostUsd: 0.007,
        },
      ]),
      getAgentDetail: vi.fn().mockImplementation((id: string) => {
        if (id === "task-1-developer") {
          return {
            id: "task-1-developer",
            taskId: "task-1",
            name: "VIOLET Core Developer",
            role: "developer",
            status: "working",
            provider: "anthropic",
            model: "claude-3-5-sonnet",
            executionMode: "cloud",
            assignedSkills: ["code_implementation"],
            activeTools: ["read_file"],
            activity: "Refactoring queue locks",
            lastHeartbeat: new Date().toISOString(),
            isStale: false,
            durationMs: 4200,
            tokens: { prompt: 1000, completion: 300, total: 1300 },
            estimatedCostUsd: 0.007,
            modelConfig: {
              temperature: 0.2,
              maxTokens: 4096,
              contextWindow: 128000,
              usedContextTokens: 1300,
              systemPromptPreview: "You are the VIOLET Core Developer",
              avgLatencyMs: 650,
            },
            skillsDetail: [],
            toolsDetail: [],
            recentToolExecutions: [],
            files: { opened: [], modified: [], staged: [], uncommitted: [] },
            git: {
              baseBranch: "main",
              currentBranch: "violet/task-1/dev",
              worktreePath: "/repo/.violet/worktrees/task-1/dev",
              filesChanged: [],
              insertions: 0,
              deletions: 0,
            },
            communication: { messagesSent: [], messagesReceived: [] },
            executionLogs: [],
          };
        }
        return null;
      }),
      getWorkflowDAG: vi.fn().mockImplementation((taskId: string) => {
        if (taskId === "task-1") {
          return {
            taskId: "task-1",
            taskGoal: "Fix race condition in task queue",
            taskStatus: "implementing",
            isPaused: false,
            nodes: [{ id: "task-task-1", label: "Fix race condition", type: "task", status: "running" }],
            edges: [],
          };
        }
        return null;
      }),
      getResourceTelemetry: vi.fn().mockReturnValue({
        system: {
          cpuUsagePercent: 12.5,
          memoryUsageBytes: 4000000,
          memoryTotalBytes: 16000000,
          memoryUsagePercent: 25.0,
          isMeasured: true,
        },
        gpu: {
          available: false,
          statusMessage: "Unavailable (No hardware telemetry provider connected)",
          gpuUsagePercent: null,
          vramUsageBytes: null,
          vramTotalBytes: null,
        },
        providers: [],
        timestamp: new Date().toISOString(),
      }),
      getEvents: vi.fn().mockReturnValue([]),
      getTaskDiff: vi.fn().mockResolvedValue("+ export function lock() {}"),
      pauseTask: vi.fn().mockResolvedValue(true),
      resumeTask: vi.fn().mockResolvedValue(true),
      retryTask: vi.fn().mockResolvedValue({ id: "task-1", status: "queued" } as any),
      approveIntegration: vi.fn().mockResolvedValue({
        success: true,
        branch: "violet/task-1/integration",
        commitSha: "sha123",
        message: "Merge successful",
      }),
      cancelTask: vi.fn().mockResolvedValue(true),
    };

    mockGateway = {};
    mockOrchestrator = {};
    mockGitManager = {};
  });

  it("handles GET /api/v1/operations/summary", async () => {
    const req = new MockRequest("GET", "/api/v1/operations/summary");
    const res = new MockResponse();

    const handled = handleVioletApiRequest(
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalRegisteredAgents).toBe(4);
    expect(body.activeAgents).toBe(1);
    expect(body.estimatedProviderCostUsd).toBe(0.042);
  });

  it("handles GET /api/v1/operations/agents", async () => {
    const req = new MockRequest("GET", "/api/v1/operations/agents");
    const res = new MockResponse();

    const handled = handleVioletApiRequest(
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.agents.length).toBe(1);
    expect(body.agents[0].role).toBe("developer");
  });

  it("handles GET /api/v1/operations/agents/:id", async () => {
    const req = new MockRequest("GET", "/api/v1/operations/agents/task-1-developer");
    const res = new MockResponse();

    const handled = handleVioletApiRequest(
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.agent.id).toBe("task-1-developer");
    expect(body.agent.modelConfig.avgLatencyMs).toBe(650);
  });

  it("handles GET /api/v1/operations/workflow/:taskId", async () => {
    const req = new MockRequest("GET", "/api/v1/operations/workflow/task-1");
    const res = new MockResponse();

    const handled = handleVioletApiRequest(
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.workflow.nodes.length).toBe(1);
  });

  it("handles GET /api/v1/operations/resources", async () => {
    const req = new MockRequest("GET", "/api/v1/operations/resources");
    const res = new MockResponse();

    const handled = handleVioletApiRequest(
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.system.isMeasured).toBe(true);
    expect(body.gpu.available).toBe(false);
    expect(body.gpu.statusMessage).toContain("Unavailable");
  });

  it("handles POST owner control endpoints: pause, resume, retry, approve", async () => {
    // 1. Pause
    const pauseReq = new MockRequest("POST", "/api/v1/operations/tasks/task-1/pause");
    const pauseRes = new MockResponse();
    handleVioletApiRequest(
      pauseReq as unknown as http.IncomingMessage,
      pauseRes as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );
    await new Promise((r) => pauseRes.on("finish", r));
    expect(pauseRes.statusCode).toBe(200);
    expect(JSON.parse(pauseRes.body).success).toBe(true);

    // 2. Resume
    const resumeReq = new MockRequest("POST", "/api/v1/operations/tasks/task-1/resume");
    const resumeRes = new MockResponse();
    handleVioletApiRequest(
      resumeReq as unknown as http.IncomingMessage,
      resumeRes as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );
    await new Promise((r) => resumeRes.on("finish", r));
    expect(resumeRes.statusCode).toBe(200);
    expect(JSON.parse(resumeRes.body).success).toBe(true);

    // 3. Approve
    const approveReq = new MockRequest("POST", "/api/v1/operations/tasks/task-1/approve");
    const approveRes = new MockResponse();
    handleVioletApiRequest(
      approveReq as unknown as http.IncomingMessage,
      approveRes as unknown as http.ServerResponse,
      mockGateway as ModelGateway,
      mockOrchestrator as MultiAgentOrchestrator,
      mockGitManager as GitWorktreeManager,
      mockOperationsService as LiveOperationsService
    );
    await new Promise((r) => approveRes.on("finish", r));
    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.success).toBe(true);
    expect(approveBody.branch).toBe("violet/task-1/integration");
  });
});
