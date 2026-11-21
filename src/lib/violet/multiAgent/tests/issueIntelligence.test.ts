import { describe, expect, it } from "vitest";
import { IssueIntelligenceService } from "../issueIntelligenceService";

describe("IssueIntelligenceService", () => {
  const service = new IssueIntelligenceService();

  describe("Fingerprint Deduplication & Normalization", () => {
    it("generates stable normalized fingerprints ignoring variable timestamps and addresses", () => {
      const fp1 = service.computeFingerprint(
        "runtime_error",
        "Connection error at 2026-11-21T10:00:00.123Z with pointer 0x7ffd1234abcd",
        "src/lib/network.ts",
        42
      );

      const fp2 = service.computeFingerprint(
        "runtime_error",
        "Connection error at 2026-11-21T12:45:10.999Z with pointer 0x8ffa5678ef00",
        "src\\lib\\network.ts",
        42
      );

      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(32);
    });

    it("generates different fingerprints for distinct categories or file locations", () => {
      const fp1 = service.computeFingerprint("runtime_error", "Null dereference", "src/main.ts", 10);
      const fp2 = service.computeFingerprint("test_failure", "Null dereference", "src/main.ts", 10);
      const fp3 = service.computeFingerprint("runtime_error", "Null dereference", "src/main.ts", 20);

      expect(fp1).not.toBe(fp2);
      expect(fp1).not.toBe(fp3);
    });
  });

  describe("Transient vs Code Defect Classification", () => {
    it("identifies transient infrastructure and network glitches", () => {
      expect(service.isTransientFailure("ollama_connection", "connection refused")).toBe(true);
      expect(service.isTransientFailure("timeout", "Operation timed out after 30s")).toBe(true);
      expect(service.isTransientFailure("model_provider", "Rate limit exceeded (429 Too Many Requests)")).toBe(true);
      expect(service.isTransientFailure("runtime_error", "fetch failed: ECONNRESET")).toBe(true);
    });

    it("identifies genuine code defects and logic errors", () => {
      expect(service.isTransientFailure("typescript_error", "Property 'id' does not exist on type 'User'")).toBe(false);
      expect(service.isTransientFailure("test_failure", "expected 404 to be 200")).toBe(false);
      expect(service.isTransientFailure("security_vulnerability", "SQL injection vector in query")).toBe(false);
    });
  });

  describe("Skill-Based Intelligent Agent Routing", () => {
    it("routes React and UI errors to Frontend Agent", () => {
      const role = service.routeToSpecializedAgent("runtime_error", "useState called outside component", "src/components/Header.tsx");
      expect(role).toBe("frontend");
    });

    it("routes Python / FastAPI errors to Backend Agent", () => {
      const role = service.routeToSpecializedAgent("runtime_error", "FastAPI endpoint returned 500", "apps/violet-local-agent/violet_agent/main.py");
      expect(role).toBe("backend");
    });

    it("routes SQL & Supabase errors to Database Agent", () => {
      const role = service.routeToSpecializedAgent("runtime_error", "relation 'agent_issues' does not exist", "supabase/migrations/test.sql");
      expect(role).toBe("database");
    });

    it("routes Test failures to QA Agent", () => {
      const role = service.routeToSpecializedAgent("test_failure", "AssertionError: expected 'active' to be 'idle'", "src/test/suite.test.ts");
      expect(role).toBe("qa");
    });

    it("routes Security vulnerabilities to Security Agent", () => {
      const role = service.routeToSpecializedAgent("security_vulnerability", "Potential token leak in logging handler");
      expect(role).toBe("security");
    });

    it("routes Docker & build errors to DevOps Agent", () => {
      const role = service.routeToSpecializedAgent("build_failure", "vite build failed: chunk size warning", "docker-compose.yml");
      expect(role).toBe("devops");
    });

    it("routes task dependency deadlocks to Architect Agent", () => {
      const role = service.routeToSpecializedAgent("task_dependency", "circular dependency detected in subtask graph");
      expect(role).toBe("architect");
    });
  });

  describe("Issue Capture, Deduplication & Retry Bounds", () => {
    it("captures new issues and deduplicates recurring errors", () => {
      const issue1 = service.captureIssue({
        category: "test_failure",
        errorMessage: "AssertionError: expected 1 to be 2",
        sourceFile: "src/utils/math.test.ts",
        lineNumber: 15,
        discoveringAgent: "qa-tester",
      });

      expect(issue1.id).toBeDefined();
      expect(issue1.status).toBe("open");
      expect(issue1.retryCount).toBe(0);
      expect(issue1.assignedRole).toBe("qa");

      // Capture identical error again
      const issue2 = service.captureIssue({
        category: "test_failure",
        errorMessage: "AssertionError: expected 1 to be 2",
        sourceFile: "src/utils/math.test.ts",
        lineNumber: 15,
        discoveringAgent: "qa-tester",
      });

      expect(issue2.id).toBe(issue1.id);
      expect(issue2.retryCount).toBe(1);
    });

    it("escalates recurring issues to BLOCKED and P0 when max retries are exceeded", () => {
      const svc = new IssueIntelligenceService();
      let issue = svc.captureIssue({
        category: "runtime_error",
        errorMessage: "Persistent database connection failure",
        sourceFile: "src/db/client.ts",
        lineNumber: 30,
      });

      expect(issue.status).toBe("open");

      // Recur up to maxRetries (3)
      issue = svc.captureIssue({ category: "runtime_error", errorMessage: "Persistent database connection failure", sourceFile: "src/db/client.ts", lineNumber: 30 });
      issue = svc.captureIssue({ category: "runtime_error", errorMessage: "Persistent database connection failure", sourceFile: "src/db/client.ts", lineNumber: 30 });
      issue = svc.captureIssue({ category: "runtime_error", errorMessage: "Persistent database connection failure", sourceFile: "src/db/client.ts", lineNumber: 30 });

      expect(issue.retryCount).toBe(3);
      expect(issue.status).toBe("blocked");
      expect(issue.severity).toBe("critical");
      expect(issue.priority).toBe("p0");
    });
  });

  describe("Filtering, Stats & Lifecycle Operations", () => {
    it("computes accurate issue statistics", () => {
      const svc = new IssueIntelligenceService();
      svc.captureIssue({ category: "security_vulnerability", errorMessage: "Token leak" });
      svc.captureIssue({ category: "test_failure", errorMessage: "Vitest failed" });

      const stats = svc.getIssueStats();
      expect(stats.total).toBe(2);
      expect(stats.open).toBe(2);
      expect(stats.critical).toBeGreaterThanOrEqual(1);
    });

    it("filters issues by status, severity, category, and role", () => {
      const svc = new IssueIntelligenceService();
      const iss1 = svc.captureIssue({ category: "runtime_error", errorMessage: "UI failure", sourceFile: "src/App.tsx" });
      const iss2 = svc.captureIssue({ category: "command_failure", errorMessage: "npm build failed", sourceFile: "Dockerfile" });

      const frontendIssues = svc.listIssues({ assignedRole: "frontend" });
      expect(frontendIssues.length).toBe(1);
      expect(frontendIssues[0].id).toBe(iss1.id);

      const devopsIssues = svc.listIssues({ assignedRole: "devops" });
      expect(devopsIssues.length).toBe(1);
      expect(devopsIssues[0].id).toBe(iss2.id);
    });

    it("records fix attempts and tracks history", () => {
      const svc = new IssueIntelligenceService();
      const issue = svc.captureIssue({ category: "typescript_error", errorMessage: "Type mismatch", sourceFile: "src/types.ts" });

      const attempt = svc.recordFixAttempt(issue.id, {
        attemptNumber: 1,
        assignedAgent: "agent-developer",
        assignedRole: "developer",
        commitSha: "a1b2c3d4",
        isSuccessful: true,
        testResults: { testsPassed: true, reviewVerdict: "APPROVED" },
      });

      expect(attempt.commitSha).toBe("a1b2c3d4");
      expect(attempt.isSuccessful).toBe(true);

      const updated = svc.getIssue(issue.id);
      expect(updated?.fixAttempts?.length).toBe(1);
    });

    it("updates issue status and assigned agents safely", () => {
      const svc = new IssueIntelligenceService();
      const issue = svc.captureIssue({ category: "runtime_error", errorMessage: "Bug" });

      const reassigned = svc.assignAgent(issue.id, "senior-dev-agent", "backend");
      expect(reassigned.assignedAgent).toBe("senior-dev-agent");
      expect(reassigned.assignedRole).toBe("backend");

      const statusUpdated = svc.updateStatus(issue.id, "in_progress", "Work started");
      expect(statusUpdated.status).toBe("in_progress");
    });
  });
});
