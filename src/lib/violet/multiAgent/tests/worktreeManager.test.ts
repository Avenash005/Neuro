import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { GitWorktreeManager } from "../../git/worktreeManager";

describe("GitWorktreeManager", () => {
  const manager = new GitWorktreeManager();
  const testTaskId = `test-${Date.now()}`;
  let createdWorktreePath = "";

  afterAll(async () => {
    if (createdWorktreePath) {
      await manager.cleanupWorktree(createdWorktreePath, true).catch(() => {});
    }
  });

  it("resolves valid repository root", async () => {
    const root = await manager.getRepoRoot();
    expect(root).toBeDefined();
    expect(root.length).toBeGreaterThan(0);
    const hasGit = await fs.stat(path.join(root, ".git")).catch(() => null);
    expect(hasGit).not.toBeNull();
  });

  it("determines the current branch", async () => {
    const branch = await manager.getCurrentBranch();
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });

  it("validates and allows paths strictly inside worktree", () => {
    const fakeWorktree = path.resolve("C:/fake/worktree");
    const safeTarget = manager.assertPathInsideWorktree(fakeWorktree, "src/components/Button.tsx");
    expect(safeTarget).toBe(path.resolve(fakeWorktree, "src/components/Button.tsx"));
  });

  it("throws path traversal violation on directory traversal attempts", () => {
    const fakeWorktree = path.resolve("C:/fake/worktree");
    expect(() => {
      manager.assertPathInsideWorktree(fakeWorktree, "../../../etc/passwd");
    }).toThrow(/Path traversal violation/);

    expect(() => {
      manager.assertPathInsideWorktree(fakeWorktree, "nested/../../../../secret.key");
    }).toThrow(/Path traversal violation/);
  });

  it("creates an isolated Git worktree and branch", async () => {
    const res = await manager.createWorktree(testTaskId, "developer");
    createdWorktreePath = res.worktreePath;
    expect(res.branch).toBe(`violet/task-${testTaskId}/developer`);
    expect(res.worktreePath).toContain(`.violet`);
    expect(res.worktreePath).toContain(`developer`);

    const exists = await fs.stat(res.worktreePath).catch(() => null);
    expect(exists).not.toBeNull();
  });

  it("writes and reads files safely inside the isolated worktree", async () => {
    const testFile = "src/temp_test_artifact.txt";
    const testContent = "VIOLET Multi-Agent Isolated Worktree Test";

    await manager.writeFile(createdWorktreePath, testFile, testContent);
    const readBack = await manager.readFile(createdWorktreePath, testFile);
    expect(readBack).toBe(testContent);
  });

  it("detects untracked or modified files in worktree status", async () => {
    const status = await manager.getStatus(createdWorktreePath);
    expect(status.isClean).toBe(false);
    expect(status.untracked.length + status.modified.length + status.staged.length).toBeGreaterThan(0);
  });

  it("creates an actual Git commit with author attribution and metadata", async () => {
    const commitResult = await manager.commit(
      createdWorktreePath,
      "feat(test): autonomous multi-agent commit verification",
      "VIOLET Developer Agent",
      "developer@violet.local"
    );

    expect(commitResult.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(commitResult.commitMessage).toBe("feat(test): autonomous multi-agent commit verification");
    expect(commitResult.branch).toBe(`violet/task-${testTaskId}/developer`);
    expect(commitResult.filesChanged).toContain("src/temp_test_artifact.txt");
  });

  it("returns clean status when committing with no changes", async () => {
    const secondCommit = await manager.commit(createdWorktreePath, "no changes test");
    expect(secondCommit.commitMessage).toBe("No changes to commit");
    expect(secondCommit.filesChanged).toHaveLength(0);
  });

  it("generates diff against previous commit or base branch", async () => {
    const diff = await manager.getDiff(createdWorktreePath, "HEAD~1");
    expect(diff).toContain("VIOLET Multi-Agent Isolated Worktree Test");
  });

  it("enforces command restrictions: allows approved commands and rejects dangerous ones", async () => {
    // Approved command: git
    const gitVersion = await manager.runCommand(createdWorktreePath, "git", ["--version"]);
    expect(gitVersion.exitCode).toBe(0);
    expect(gitVersion.stdout.toLowerCase()).toContain("git version");

    // Rejected dangerous command: rm / curl / format
    await expect(manager.runCommand(createdWorktreePath, "rm", ["-rf", "/"])).rejects.toThrow(
      /Command execution restriction: Binary 'rm' is not in the approved automation allowlist/
    );

    await expect(manager.runCommand(createdWorktreePath, "powershell", ["-Command", "dir"])).rejects.toThrow(
      /Command execution restriction: Binary 'powershell' is not in the approved automation allowlist/
    );
  });

  it("creates a reviewable integration branch pointing to developer branch", async () => {
    const integrationBranch = await manager.createIntegrationBranch(
      testTaskId,
      `violet/task-${testTaskId}/developer`
    );
    expect(integrationBranch).toBe(`violet/task-${testTaskId}/integration`);
  });

  it("lists all registered worktrees including the created one", async () => {
    const all = await manager.listAllWorktrees();
    expect(Array.isArray(all)).toBe(true);
    const found = all.find((w) => path.resolve(w.path) === path.resolve(createdWorktreePath));
    expect(found).toBeDefined();
  });

  it("cleans up the worktree and prunes git records", async () => {
    await manager.cleanupWorktree(createdWorktreePath, true);
    const exists = await fs.stat(createdWorktreePath).catch(() => null);
    expect(exists).toBeNull();
    createdWorktreePath = "";
  });
});
