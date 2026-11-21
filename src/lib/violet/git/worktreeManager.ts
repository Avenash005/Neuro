/**
 * VIOLET Lab — Git Worktree & Execution Manager
 *
 * Implements isolated Git worktrees and branches per agent.
 * Guarantees zero pollution of the main working directory.
 * Includes path traversal protection and secure commit recording.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitWorktreeInfo } from "../../../types/multiAgent";

const execFileAsync = promisify(execFile);

export interface WorktreeCommitResult {
  commitSha: string;
  commitMessage: string;
  branch: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
}

export interface WorktreeStatusResult {
  isClean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export class GitWorktreeManager {
  private repoRoot: string | null = null;

  constructor(repoRoot?: string) {
    if (repoRoot) {
      this.repoRoot = path.resolve(repoRoot);
    }
  }

  /**
   * Discovers and validates the repository root directory.
   */
  async getRepoRoot(): Promise<string> {
    if (this.repoRoot) return this.repoRoot;

    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
        cwd: process.cwd(),
      });
      this.repoRoot = stdout.trim();
      return this.repoRoot;
    } catch (err) {
      throw new Error(`Failed to locate Git repository root: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Gets the current base branch of the main repository.
   */
  async getCurrentBranch(): Promise<string> {
    const root = await this.getRepoRoot();
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
      const branch = stdout.trim();
      return branch === "HEAD" ? "main" : branch;
    } catch {
      return "main";
    }
  }

  /**
   * Sanitizes identifiers to prevent path traversal or shell manipulation.
   */
  private sanitizeIdentifier(id: string): string {
    const clean = id.replace(/[^a-zA-Z0-9_\-]/g, "");
    if (!clean) throw new Error(`Invalid identifier: '${id}'`);
    return clean;
  }

  /**
   * Asserts that a target file path resides strictly inside the worktree directory.
   */
  assertPathInsideWorktree(worktreePath: string, relativePath: string): string {
    const normalizedWorktree = path.resolve(worktreePath);
    const resolvedTarget = path.resolve(normalizedWorktree, relativePath);

    if (!resolvedTarget.startsWith(normalizedWorktree + path.sep) && resolvedTarget !== normalizedWorktree) {
      throw new Error(
        `Path traversal violation: Target path '${relativePath}' resolves outside worktree root '${worktreePath}'.`
      );
    }
    return resolvedTarget;
  }

  /**
   * Creates an isolated Git worktree and branch for an agent.
   */
  async createWorktree(
    taskId: string,
    agentRole: string,
    baseBranch?: string
  ): Promise<{ worktreePath: string; branch: string }> {
    const root = await this.getRepoRoot();
    const cleanTaskId = this.sanitizeIdentifier(taskId);
    const cleanRole = this.sanitizeIdentifier(agentRole);

    const branch = `violet/task-${cleanTaskId}/${cleanRole}`;
    const worktreeDir = path.resolve(root, ".violet", "worktrees", `task-${cleanTaskId}`, cleanRole);

    const base = baseBranch || (await this.getCurrentBranch());

    // Ensure parent directories exist
    await fs.mkdir(path.dirname(worktreeDir), { recursive: true });

    // Check if worktree directory already exists
    try {
      const stat = await fs.stat(worktreeDir);
      if (stat.isDirectory()) {
        // Remove existing worktree first
        await this.cleanupWorktree(worktreeDir, false);
      }
    } catch {
      // Worktree path does not exist yet
    }

    try {
      // Create worktree with fresh branch
      await execFileAsync("git", ["worktree", "add", "-B", branch, worktreeDir, base], { cwd: root });
    } catch (err) {
      throw new Error(
        `Failed to create Git worktree for ${agentRole} on branch ${branch}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    return { worktreePath: worktreeDir, branch };
  }

  /**
   * Creates an isolated Git worktree and branch specifically for issue resolution.
   */
  async createIssueWorktree(
    issueId: string,
    role = "fix",
    baseBranch?: string
  ): Promise<{ worktreePath: string; branch: string }> {
    const root = await this.getRepoRoot();
    const cleanIssueId = this.sanitizeIdentifier(issueId);
    const cleanRole = this.sanitizeIdentifier(role);

    const branch = `violet/issue-${cleanIssueId}/${cleanRole}`;
    const worktreeDir = path.resolve(root, ".violet", "worktrees", `issue-${cleanIssueId}`, cleanRole);

    const base = baseBranch || (await this.getCurrentBranch());

    await fs.mkdir(path.dirname(worktreeDir), { recursive: true });

    try {
      const stat = await fs.stat(worktreeDir);
      if (stat.isDirectory()) {
        await this.cleanupWorktree(worktreeDir, false);
      }
    } catch {
      // Worktree path does not exist yet
    }

    try {
      await execFileAsync("git", ["worktree", "add", "-B", branch, worktreeDir, base], { cwd: root });
    } catch (err) {
      throw new Error(
        `Failed to create Git worktree for issue ${issueId} on branch ${branch}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    return { worktreePath: worktreeDir, branch };
  }

  /**
   * Reads a file safely from the worktree.
   */
  async readFile(worktreePath: string, relativePath: string): Promise<string> {
    const targetPath = this.assertPathInsideWorktree(worktreePath, relativePath);
    return await fs.readFile(targetPath, "utf-8");
  }

  /**
   * Writes a file safely inside the worktree.
   */
  async writeFile(worktreePath: string, relativePath: string, content: string): Promise<void> {
    const targetPath = this.assertPathInsideWorktree(worktreePath, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf-8");
  }

  /**
   * Gets Git status for the worktree.
   */
  async getStatus(worktreePath: string): Promise<WorktreeStatusResult> {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: worktreePath });
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];

    for (const line of lines) {
      const code = line.slice(0, 2);
      const file = line.slice(3).trim();

      if (code === "??") {
        untracked.push(file);
      } else if (code.includes("M")) {
        modified.push(file);
      } else if (code.includes("D")) {
        deleted.push(file);
      } else if (code.includes("A") || code[0] === "M") {
        staged.push(file);
      }
    }

    return {
      isClean: lines.length === 0,
      staged,
      modified,
      untracked,
      deleted,
    };
  }

  /**
   * Creates an actual Git commit in the isolated worktree and records its metadata.
   */
  async commit(
    worktreePath: string,
    message: string,
    authorName = "VIOLET Autonomous Agent",
    authorEmail = "agent@violet.local"
  ): Promise<WorktreeCommitResult> {
    const sanitizedMsg = message.trim();
    if (!sanitizedMsg) throw new Error("Commit message cannot be empty");

    // 1. Stage all changes in worktree
    await execFileAsync("git", ["add", "-A"], { cwd: worktreePath });

    // Check if there are changes to commit
    const { stdout: statusOut } = await execFileAsync("git", ["status", "--porcelain"], { cwd: worktreePath });
    if (!statusOut.trim()) {
      // Nothing to commit, get current commit SHA
      const { stdout: shaOut } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
      const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: worktreePath,
      });

      return {
        commitSha: shaOut.trim(),
        commitMessage: "No changes to commit",
        branch: branchOut.trim(),
        filesChanged: [],
        insertions: 0,
        deletions: 0,
      };
    }

    // 2. Commit changes
    await execFileAsync(
      "git",
      [
        "-c",
        `user.name=${authorName}`,
        "-c",
        `user.email=${authorEmail}`,
        "commit",
        "-m",
        sanitizedMsg,
      ],
      { cwd: worktreePath }
    );

    // 3. Inspect committed SHA & branch
    const { stdout: shaOut } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
    const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: worktreePath,
    });

    // 4. Extract diff statistics
    const { stdout: statsOut } = await execFileAsync("git", ["diff", "--stat", "HEAD~1", "HEAD"], {
      cwd: worktreePath,
    }).catch(() => ({ stdout: "" }));

    const { stdout: filesOut } = await execFileAsync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], {
      cwd: worktreePath,
    }).catch(() => ({ stdout: "" }));

    const filesChanged = filesOut.split("\n").map((f) => f.trim()).filter(Boolean);

    let insertions = 0;
    let deletions = 0;
    const match = statsOut.match(/(\d+)\s+insertion.*?(?:,\s*(\d+)\s+deletion)?/);
    if (match) {
      insertions = parseInt(match[1] || "0", 10);
      deletions = parseInt(match[2] || "0", 10);
    }

    return {
      commitSha: shaOut.trim(),
      commitMessage: sanitizedMsg,
      branch: branchOut.trim(),
      filesChanged,
      insertions,
      deletions,
    };
  }

  /**
   * Generates diff against base branch.
   */
  async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", ["diff", `${baseBranch}...HEAD`], {
        cwd: worktreePath,
      });
      return stdout;
    } catch {
      const { stdout } = await execFileAsync("git", ["diff", "HEAD~1"], { cwd: worktreePath }).catch(() => ({
        stdout: "",
      }));
      return stdout;
    }
  }

  /**
   * Runs an approved check or command inside the worktree (e.g. tests or build).
   */
  async runCommand(
    worktreePath: string,
    command: string,
    args: string[] = [],
    timeoutMs = 60_000
  ): Promise<RunCommandResult> {
    const ALLOWED_BINARIES = new Set(["npm", "npx", "git", "node", "pytest", "python", "vitest", "pnpm", "yarn"]);
    const baseBinary = path.basename(command).replace(/\.exe$/i, "").toLowerCase();

    if (!ALLOWED_BINARIES.has(baseBinary)) {
      throw new Error(`Command execution restriction: Binary '${command}' is not in the approved automation allowlist.`);
    }

    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: worktreePath,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      });
      return {
        exitCode: 0,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return {
        exitCode: typeof e.code === "number" ? e.code : 1,
        stdout: e.stdout || "",
        stderr: e.stderr || (err instanceof Error ? err.message : String(err)),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Prepares a reviewable integration branch containing developer commits.
   */
  async createIntegrationBranch(
    taskId: string,
    developerBranch: string,
    _baseBranch = "main"
  ): Promise<string> {
    const root = await this.getRepoRoot();
    const cleanTaskId = this.sanitizeIdentifier(taskId);
    const integrationBranch = `violet/task-${cleanTaskId}/integration`;

    // Create integration branch pointing to the developer branch
    await execFileAsync("git", ["branch", "-f", integrationBranch, developerBranch], { cwd: root });
    return integrationBranch;
  }

  /**
   * Merges an approved integration branch into the target base branch with owner confirmation.
   */
  async mergeBranch(
    sourceBranch: string,
    targetBranch: string
  ): Promise<{ success: boolean; commitSha: string; message: string }> {
    const root = await this.getRepoRoot();
    try {
      const current = await this.getCurrentBranch();
      if (current !== targetBranch) {
        await execFileAsync("git", ["checkout", targetBranch], { cwd: root });
      }
      const { stdout } = await execFileAsync(
        "git",
        ["merge", sourceBranch, "--no-edit", "-m", `Merge branch '${sourceBranch}' approved by owner`],
        { cwd: root }
      );
      const { stdout: headSha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      return {
        success: true,
        commitSha: headSha.trim(),
        message: stdout.trim(),
      };
    } catch (err) {
      throw new Error(
        `Failed to merge branch '${sourceBranch}' into '${targetBranch}': ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Cleans up an isolated worktree directory and prunes worktree metadata.
   */
  async cleanupWorktree(worktreePath: string, deleteBranch = false): Promise<void> {
    const root = await this.getRepoRoot();
    let branchName = "";

    if (deleteBranch) {
      try {
        const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: worktreePath,
        }).catch(() => ({ stdout: "" }));
        branchName = branchOut.trim();
      } catch {
        // Ignore
      }
    }

    try {
      await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], { cwd: root }).catch(() => {});
      await execFileAsync("git", ["worktree", "prune"], { cwd: root }).catch(() => {});

      // If directory still exists on disk, remove forcefully with retries on Windows
      await fs.rm(worktreePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});
    } catch {
      // Ignore cleanup error
    }

    if (deleteBranch && branchName && (branchName.startsWith("violet/task-") || branchName.startsWith("violet/issue-"))) {
      try {
        await execFileAsync("git", ["branch", "-D", branchName], { cwd: root }).catch(() => {});
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Lists all currently registered Git worktrees.
   */
  async listAllWorktrees(): Promise<GitWorktreeInfo[]> {
    const root = await this.getRepoRoot();
    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: root });

    const blocks = stdout.split("\n\n").filter(Boolean);
    const list: GitWorktreeInfo[] = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      let worktreePath = "";
      let head = "";
      let branch = "";
      let isBare = false;
      let isLocked = false;
      let isPrunable = false;

      for (const line of lines) {
        if (line.startsWith("worktree ")) worktreePath = line.slice(9).trim();
        if (line.startsWith("HEAD ")) head = line.slice(5).trim();
        if (line.startsWith("branch ")) branch = line.slice(7).trim();
        if (line === "bare") isBare = true;
        if (line === "locked") isLocked = true;
        if (line === "prunable") isPrunable = true;
      }

      if (worktreePath) {
        list.push({ path: worktreePath, head, branch, isBare, isLocked, isPrunable });
      }
    }

    return list;
  }
}

export const globalGitWorktreeManager = new GitWorktreeManager();
