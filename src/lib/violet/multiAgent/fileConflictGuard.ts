/**
 * VIOLET Lab — File Conflict & Overwrite Guard
 *
 * Prevents duplicate, conflicting, or unauthorized file modifications across
 * autonomous agents, concurrent tasks, and multi-round developer turns.
 */

import path from "node:path";

export interface FileLockEntry {
  taskId: string;
  agentRole: string;
  filePath: string;
  lockedAt: string;
}

export interface FileBlock {
  filePath: string;
  content: string;
}

export interface DeduplicationResult {
  validBlocks: FileBlock[];
  duplicateCount: number;
  conflictsResolved: string[];
  warnings: string[];
}

export class FileConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileConflictError";
  }
}

export class FileConflictGuard {
  // Global active file locks: key = normalized relative path, value = lock info
  private activeLocks = new Map<string, FileLockEntry>();

  // Protected paths that agents are strictly forbidden from modifying
  private readonly PROTECTED_PATTERNS: RegExp[] = [
    /^\.git(\/|\\|$)/i,
    /^\.env(\..+)?$/i,
    /^node_modules(\/|\\|$)/i,
    /^package-lock\.json$/i,
    /^\.violet\/worktrees(\/|\\|$)/i,
  ];

  /**
   * Normalizes a relative file path to a canonical POSIX format.
   * Rejects path traversal attempts.
   */
  normalizeFilePath(rawPath: string): string {
    const trimmed = rawPath.trim().replace(/^['"]|['"]$/g, "");
    if (!trimmed) {
      throw new FileConflictError("Target file path cannot be empty.");
    }

    if (path.isAbsolute(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[a-zA-Z]:/.test(trimmed)) {
      throw new FileConflictError(
        `Absolute path violation: Target path '${rawPath}' is absolute. Only workspace-relative paths are allowed.`
      );
    }

    // Convert backslashes to forward slashes
    let normalized = trimmed.replace(/\\/g, "/");

    // Remove leading './'
    normalized = normalized.replace(/^\.\//, "");

    // Path traversal validation
    const resolved = path.posix.normalize(normalized);
    if (resolved.startsWith("..") || path.posix.isAbsolute(resolved)) {
      throw new FileConflictError(
        `Path traversal violation: Target file path '${rawPath}' attempts to escape working boundary.`
      );
    }

    return resolved;
  }

  /**
   * Asserts that a target file is safe for modification and not protected.
   */
  assertNotProtected(filePath: string): void {
    const normalized = this.normalizeFilePath(filePath);
    for (const pattern of this.PROTECTED_PATTERNS) {
      if (pattern.test(normalized)) {
        throw new FileConflictError(
          `Protected file violation: File '${normalized}' is security-protected and cannot be modified by autonomous agents.`
        );
      }
    }
  }

  /**
   * Acquires a file lock for a specific task and agent role.
   * Prevents concurrent agents or tasks from modifying the same file simultaneously.
   */
  acquireLock(taskId: string, agentRole: string, filePath: string): void {
    const normalized = this.normalizeFilePath(filePath);
    this.assertNotProtected(normalized);

    const existingLock = this.activeLocks.get(normalized);
    if (existingLock && existingLock.taskId !== taskId) {
      throw new FileConflictError(
        `File conflict violation: File '${normalized}' is currently locked by concurrent task '${existingLock.taskId}' (${existingLock.agentRole}).`
      );
    }

    this.activeLocks.set(normalized, {
      taskId,
      agentRole,
      filePath: normalized,
      lockedAt: new Date().toISOString(),
    });
  }

  /**
   * Releases all file locks held by a specific task.
   */
  releaseLocksForTask(taskId: string): void {
    for (const [key, lock] of this.activeLocks.entries()) {
      if (lock.taskId === taskId) {
        this.activeLocks.delete(key);
      }
    }
  }

  /**
   * Inspects and deduplicates file blocks returned by developer agent output.
   * If multiple blocks specify the same file, detects conflicts and applies
   * deterministic resolution while reporting warnings.
   */
  validateAndDeduplicateFileBlocks(rawBlocks: FileBlock[]): DeduplicationResult {
    const blockMap = new Map<string, { content: string; occurrences: number }>();
    const conflictsResolved: string[] = [];
    const warnings: string[] = [];
    let duplicateCount = 0;

    for (const block of rawBlocks) {
      let normalizedPath: string;
      try {
        normalizedPath = this.normalizeFilePath(block.filePath);
        this.assertNotProtected(normalizedPath);
      } catch (err) {
        warnings.push(`Skipped invalid file block '${block.filePath}': ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (blockMap.has(normalizedPath)) {
        duplicateCount++;
        const prev = blockMap.get(normalizedPath)!;
        prev.occurrences++;

        if (prev.content !== block.content) {
          conflictsResolved.push(normalizedPath);
          warnings.push(
            `Conflicting duplicate blocks detected for '${normalizedPath}'. Applying latest update.`
          );
        }
        // Retain latest patch
        blockMap.set(normalizedPath, { content: block.content, occurrences: prev.occurrences });
      } else {
        blockMap.set(normalizedPath, { content: block.content, occurrences: 1 });
      }
    }

    const validBlocks: FileBlock[] = Array.from(blockMap.entries()).map(([filePath, info]) => ({
      filePath,
      content: info.content,
    }));

    return {
      validBlocks,
      duplicateCount,
      conflictsResolved,
      warnings,
    };
  }

  /**
   * Returns list of currently active locks for a task.
   */
  getLocksForTask(taskId: string): FileLockEntry[] {
    return Array.from(this.activeLocks.values()).filter((l) => l.taskId === taskId);
  }
}

export const globalFileConflictGuard = new FileConflictGuard();
