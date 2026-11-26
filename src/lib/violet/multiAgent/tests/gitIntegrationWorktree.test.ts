import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GitWorktreeManager } from "../../git/worktreeManager";

const execFileAsync = promisify(execFile);

describe("Git Worktree Manager — Real Temporary Repository Integration", () => {
  let tempRepoDir = "";
  let manager: GitWorktreeManager;
  const taskId = `temp-task-${Date.now()}`;
  let worktreePath = "";

  beforeAll(async () => {
    // 1. Create a dedicated temporary directory
    tempRepoDir = path.join(os.tmpdir(), `violet-temp-repo-${Date.now()}`);
    await fs.mkdir(tempRepoDir, { recursive: true });

    // 2. Initialize a real Git repository
    await execFileAsync("git", ["init", "-b", "main"], { cwd: tempRepoDir });
    await execFileAsync("git", ["config", "user.name", "VIOLET Test Setup"], { cwd: tempRepoDir });
    await execFileAsync("git", ["config", "user.email", "setup@violet.test"], { cwd: tempRepoDir });

    // 3. Create initial commit on main
    await fs.writeFile(path.join(tempRepoDir, "README.md"), "# Initial Project Setup\n\nMain branch.", "utf-8");
    await execFileAsync("git", ["add", "README.md"], { cwd: tempRepoDir });
    await execFileAsync("git", ["commit", "-m", "chore: initial repository commit"], { cwd: tempRepoDir });

    // 4. Initialize GitWorktreeManager attached to this temp repo
    manager = new GitWorktreeManager();
    // Cache the temporary repo as root
    (manager as any).repoRoot = tempRepoDir;
  });

  afterAll(async () => {
    // Teardown: cleanup worktree and temp directory
    if (worktreePath) {
      await manager.cleanupWorktree(worktreePath, true).catch(() => {});
    }
    if (tempRepoDir) {
      await fs.rm(tempRepoDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("identifies the temp repository root and main branch", async () => {
    const root = await manager.getRepoRoot();
    expect(path.resolve(root)).toBe(path.resolve(tempRepoDir));

    const branch = await manager.getCurrentBranch();
    expect(branch).toBe("main");
  });

  it("creates an authentic isolated Git worktree and branch in the temp repo", async () => {
    const res = await manager.createWorktree(taskId, "developer", "main");
    worktreePath = res.worktreePath;

    expect(res.branch).toBe(`violet/task-${taskId}/developer`);
    expect(res.worktreePath).toContain(".violet");

    const stat = await fs.stat(res.worktreePath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("modifies files inside the worktree without polluting the main repository", async () => {
    const codeFile = "src/math.ts";
    const codeContent = "export const multiply = (a: number, b: number) => a * b;\n";

    await manager.writeFile(worktreePath, codeFile, codeContent);

    // File exists in worktree
    const worktreeRead = await manager.readFile(worktreePath, codeFile);
    expect(worktreeRead).toBe(codeContent);

    // Verify main repository DOES NOT have this file (strict isolation!)
    const mainPath = path.join(tempRepoDir, codeFile);
    const mainExists = await fs.stat(mainPath).catch(() => null);
    expect(mainExists).toBeNull();
  });

  it("detects untracked files and creates a real Git commit in the worktree", async () => {
    const status = await manager.getStatus(worktreePath);
    expect(status.isClean).toBe(false);
    expect(status.untracked.some((u) => u.includes("src"))).toBe(true);

    const commitResult = await manager.commit(
      worktreePath,
      "feat(math): add multiplication utility function",
      "VIOLET Developer Agent",
      "developer@violet.local"
    );

    expect(commitResult.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(commitResult.commitMessage).toBe("feat(math): add multiplication utility function");
    expect(commitResult.filesChanged.length).toBeGreaterThan(0);
    expect(commitResult.insertions).toBeGreaterThanOrEqual(1);

    // Verify status is now clean
    const cleanStatus = await manager.getStatus(worktreePath);
    expect(cleanStatus.isClean).toBe(true);
  });

  it("extracts real Git diff between the worktree branch and main", async () => {
    const diff = await manager.getDiff(worktreePath, "main");
    expect(diff).toContain("diff --git");
    expect(diff).toContain("multiply = (a: number, b: number)");
  });

  it("executes approved commands safely inside the worktree", async () => {
    const res = await manager.runCommand(worktreePath, "git", ["log", "--oneline", "-1"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("feat(math): add multiplication utility function");
  });

  it("prepares a reviewable integration branch pointing to the developer commit", async () => {
    const integrationBranch = await manager.createIntegrationBranch(
      taskId,
      `violet/task-${taskId}/developer`,
      "main"
    );

    expect(integrationBranch).toBe(`violet/task-${taskId}/integration`);

    // Verify integration branch exists in Git
    const { stdout } = await execFileAsync("git", ["rev-parse", integrationBranch], { cwd: tempRepoDir });
    expect(stdout.trim()).toMatch(/^[a-f0-9]{40}$/);
  });

  it("cleans up the isolated worktree completely and prunes git records", async () => {
    await manager.cleanupWorktree(worktreePath, true);

    const exists = await fs.stat(worktreePath).catch(() => null);
    expect(exists).toBeNull();
    worktreePath = "";
  });
});
