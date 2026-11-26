import { beforeEach, describe, expect, it } from "vitest";
import { FileConflictError, FileConflictGuard } from "../fileConflictGuard";

describe("FileConflictGuard", () => {
  let guard: FileConflictGuard;

  beforeEach(() => {
    guard = new FileConflictGuard();
  });

  describe("Path Normalization & Security", () => {
    it("normalizes relative file paths cleanly", () => {
      expect(guard.normalizeFilePath("src/components/Button.tsx")).toBe("src/components/Button.tsx");
      expect(guard.normalizeFilePath("./src/utils/math.ts")).toBe("src/utils/math.ts");
      expect(guard.normalizeFilePath("src\\services\\api.ts")).toBe("src/services/api.ts");
    });

    it("rejects path traversal attempts", () => {
      expect(() => guard.normalizeFilePath("../outside.ts")).toThrow(FileConflictError);
      expect(() => guard.normalizeFilePath("foo/../../secret.txt")).toThrow(FileConflictError);
      expect(() => guard.normalizeFilePath("/etc/passwd")).toThrow(FileConflictError);
    });

    it("rejects protected files and directories", () => {
      expect(() => guard.assertNotProtected(".env")).toThrow(FileConflictError);
      expect(() => guard.assertNotProtected(".env")).toThrow(FileConflictError);
      expect(() => guard.assertNotProtected(".git/config")).toThrow(FileConflictError);
      expect(() => guard.assertNotProtected("node_modules/express/index.js")).toThrow(FileConflictError);
      expect(() => guard.assertNotProtected("package-lock.json")).toThrow(FileConflictError);
    });
  });

  describe("File Locking & Concurrency Control", () => {
    it("acquires and tracks file locks for a task", () => {
      guard.acquireLock("task-100", "developer", "src/auth.ts");
      const locks = guard.getLocksForTask("task-100");
      expect(locks).toHaveLength(1);
      expect(locks[0].filePath).toBe("src/auth.ts");
      expect(locks[0].agentRole).toBe("developer");
    });

    it("prevents concurrent tasks from acquiring locks on the same file", () => {
      guard.acquireLock("task-100", "developer", "src/shared.ts");

      // Same task acquiring same file is allowed
      expect(() => guard.acquireLock("task-100", "developer", "src/shared.ts")).not.toThrow();

      // Different task attempting to lock the same file is rejected
      expect(() => guard.acquireLock("task-200", "developer", "src/shared.ts")).toThrow(
        /File conflict violation: File 'src\/shared\.ts' is currently locked by concurrent task 'task-100'/
      );
    });

    it("releases all locks when task completes or cancels", () => {
      guard.acquireLock("task-100", "developer", "src/a.ts");
      guard.acquireLock("task-100", "developer", "src/b.ts");
      expect(guard.getLocksForTask("task-100")).toHaveLength(2);

      guard.releaseLocksForTask("task-100");
      expect(guard.getLocksForTask("task-100")).toHaveLength(0);

      // Other task can now acquire locks
      expect(() => guard.acquireLock("task-200", "developer", "src/a.ts")).not.toThrow();
    });
  });

  describe("LLM Output Deduplication & Conflict Resolution", () => {
    it("deduplicates identical file blocks from developer response", () => {
      const blocks = [
        { filePath: "src/calc.ts", content: "export const x = 1;" },
        { filePath: "src/calc.ts", content: "export const x = 1;" },
      ];

      const result = guard.validateAndDeduplicateFileBlocks(blocks);
      expect(result.validBlocks).toHaveLength(1);
      expect(result.duplicateCount).toBe(1);
      expect(result.conflictsResolved).toHaveLength(0);
    });

    it("detects and resolves conflicting duplicate file blocks", () => {
      const blocks = [
        { filePath: "src/calc.ts", content: "export const x = 1;" },
        { filePath: "src/calc.ts", content: "export const x = 2;" },
      ];

      const result = guard.validateAndDeduplicateFileBlocks(blocks);
      expect(result.validBlocks).toHaveLength(1);
      expect(result.validBlocks[0].content).toBe("export const x = 2;");
      expect(result.conflictsResolved).toContain("src/calc.ts");
      expect(result.warnings.some((w) => w.includes("Conflicting duplicate blocks"))).toBe(true);
    });

    it("filters out protected files from block list with warnings", () => {
      const blocks = [
        { filePath: "src/valid.ts", content: "console.log('ok');" },
        { filePath: ".env", content: "SECRET=leaked" },
      ];

      const result = guard.validateAndDeduplicateFileBlocks(blocks);
      expect(result.validBlocks).toHaveLength(1);
      expect(result.validBlocks[0].filePath).toBe("src/valid.ts");
      expect(result.warnings.some((w) => w.includes("Protected file violation"))).toBe(true);
    });
  });
});
