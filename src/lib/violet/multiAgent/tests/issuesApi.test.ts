import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { startVioletApiServer } from "../../../../server/violetApiServer";
import { IssueIntelligenceService } from "../issueIntelligenceService";
import { IssueResolutionEngine } from "../issueResolutionEngine";
import { GitWorktreeManager } from "../../git/worktreeManager";

function createMockGateway(): any {
  return {
    chat: vi.fn().mockResolvedValue({
      content: `[ROOT_CAUSE]
Constraint violation diagnosed in database schema.
[END_ROOT_CAUSE]

[PROPOSED_RESOLUTION]
Added unique constraint handling and index verification.
[END_PROPOSED_RESOLUTION]`,
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    }),
  };
}

describe("Issues & Bugs API Endpoints", () => {
  const PORT = 8798;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  let server: http.Server;

  const gitManager = new GitWorktreeManager();
  const issueService = new IssueIntelligenceService();
  const issueEngine = new IssueResolutionEngine(issueService, createMockGateway(), gitManager);

  beforeAll(async () => {
    server = await startVioletApiServer({
      port: PORT,
      issueService,
      issueEngine,
      gitManager,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  let createdIssueId = "";

  it("POST /api/v1/issues/capture creates and routes an issue", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Database constraint error",
        description: "Unique constraint violated on user_email",
        category: "runtime_error",
        errorMessage: "duplicate key value violates unique constraint 'users_email_key'",
        sourceFile: "supabase/migrations/01_users.sql",
        lineNumber: 45,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.issue).toBeDefined();
    expect(data.issue.id).toBeDefined();
    expect(data.issue.assignedRole).toBe("database");
    expect(data.issue.status).toBe("open");

    createdIssueId = data.issue.id;
  });

  it("GET /api/v1/issues lists all issues and supports filtering", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues?assignedRole=database`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.length).toBeGreaterThan(0);
    expect(data.issues[0].assignedRole).toBe("database");
  });

  it("GET /api/v1/issues/stats returns defect statistics", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/stats`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.stats).toBeDefined();
    expect(data.stats.total).toBeGreaterThanOrEqual(1);
    expect(data.stats.open).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/v1/issues/:id retrieves specific issue details", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/${encodeURIComponent(createdIssueId)}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.issue).toBeDefined();
    expect(data.issue.id).toBe(createdIssueId);
  });

  it("POST /api/v1/issues/:id/assign reassigns agent and role", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/${encodeURIComponent(createdIssueId)}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "lead-database-agent",
        role: "database",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.issue.assignedAgent).toBe("lead-database-agent");
  });

  it("POST /api/v1/issues/:id/status updates issue status", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/${encodeURIComponent(createdIssueId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "in_progress",
        notes: "Investigation begun by lead agent.",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.issue.status).toBe("in_progress");
  });

  it("POST /api/v1/issues/:id/resolve executes isolated worktree fix", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/${encodeURIComponent(createdIssueId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skipReview: true,
        skipTests: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.issue.status).toBe("resolved");
    expect(data.issue.resolutionCommitSha).toBeDefined();
    expect(data.issue.worktreeBranch).toContain("violet/issue-");
  });

  it("POST /api/v1/issues/:id/reject reopens issue when fix is rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/issues/${encodeURIComponent(createdIssueId)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Fix requires additional migration rollbacks.",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.issue.status).toBe("reopened");
  });
});
