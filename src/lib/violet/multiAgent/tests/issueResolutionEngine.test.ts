import { afterAll, describe, expect, it, vi } from "vitest";
import { GitWorktreeManager } from "../../git/worktreeManager";
import { IssueIntelligenceService } from "../issueIntelligenceService";
import { IssueResolutionEngine } from "../issueResolutionEngine";

function createMockGateway(): any {
  return {
    chat: vi.fn().mockResolvedValue({
      content: `[ROOT_CAUSE]
TypeError occurred because math helper was undefined.
[END_ROOT_CAUSE]

[PROPOSED_RESOLUTION]
Added optional chaining and default fallback.
[END_PROPOSED_RESOLUTION]

[FILE: src/utils/math_fixed.txt]
export function add(a: number, b: number) { return a + b; }
[END_FILE]`,
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    }),
  };
}

describe("IssueResolutionEngine", () => {
  const gitManager = new GitWorktreeManager();
  const issueService = new IssueIntelligenceService();
  const engine = new IssueResolutionEngine(issueService, createMockGateway(), gitManager);

  let createdWorktreePath = "";

  afterAll(async () => {
    if (createdWorktreePath) {
      await gitManager.cleanupWorktree(createdWorktreePath, true).catch(() => {});
    }
  });

  it("resolves an issue in an isolated Git worktree without modifying the base branch", async () => {
    const currentBranch = await gitManager.getCurrentBranch();

    // 1. Capture a test failure defect
    const issue = issueService.captureIssue({
      category: "test_failure",
      errorMessage: "TypeError: Cannot read properties of undefined in component helper",
      sourceFile: "src/utils/math.ts",
      lineNumber: 10,
      discoveringAgent: "qa-agent",
    });

    expect(issue.status).toBe("open");

    // 2. Resolve issue autonomously
    const resolved = await engine.resolveIssue(issue.id, {
      skipReview: true,
      skipTests: false,
    });

    createdWorktreePath = resolved.worktreePath || "";

    // 3. Verify resolution artifacts
    expect(resolved.status).toBe("resolved");
    expect(resolved.rootCause).toBeDefined();
    expect(resolved.proposedResolution).toBeDefined();
    expect(resolved.worktreeBranch).toBeDefined();
    expect(resolved.worktreeBranch).toContain(`violet/issue-${issue.id}`);
    expect(resolved.resolutionCommitSha).toBeDefined();
    expect(resolved.verificationResults?.testsPassed).toBe(true);

    // 4. Verify SAFEGUARD: Current branch is still unpolluted and untouched
    const afterBranch = await gitManager.getCurrentBranch();
    expect(afterBranch).toBe(currentBranch);
  });

  it("rejects approval if issue is not in 'resolved' status", async () => {
    const openIssue = issueService.captureIssue({
      category: "runtime_error",
      errorMessage: "Unresolved defect",
    });

    await expect(engine.approveFix(openIssue.id)).rejects.toThrow(/is in status 'open', expected 'resolved'/);
  });

  it("reopens issue and cleans up worktree when owner rejects the staged fix", async () => {
    const issue = issueService.captureIssue({
      category: "typescript_error",
      errorMessage: "Missing property error",
    });

    const resolved = await engine.resolveIssue(issue.id, { skipReview: true, skipTests: true });
    expect(resolved.status).toBe("resolved");

    const rejected = await engine.rejectFix(issue.id, "Code style does not match guidelines.");
    expect(rejected.status).toBe("reopened");
    expect(rejected.description).toContain("Fix rejected by owner");
  });
});
