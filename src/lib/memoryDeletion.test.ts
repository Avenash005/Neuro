import { describe, expect, it, vi } from "vitest";
import { runMemoryDeletion } from "./memoryDeletion";

describe("runMemoryDeletion", () => {
  it("removes a private source file before deleting its memory row", async () => {
    const order: string[] = [];
    const removeFile = vi.fn(async (path: string) => { order.push(`file:${path}`); });
    const deleteRow = vi.fn(async (id: string) => { order.push(`row:${id}`); });

    await runMemoryDeletion({ removeFile, deleteRow }, "memory-1", "user-1/source.png");

    expect(order).toEqual(["file:user-1/source.png", "row:memory-1"]);
  });

  it("deletes text notes without calling storage", async () => {
    const removeFile = vi.fn(async () => undefined);
    const deleteRow = vi.fn(async () => undefined);

    await runMemoryDeletion({ removeFile, deleteRow }, "memory-2", null);

    expect(removeFile).not.toHaveBeenCalled();
    expect(deleteRow).toHaveBeenCalledWith("memory-2");
  });

  it("keeps the database row when private-file removal fails", async () => {
    const removeFile = vi.fn(async () => { throw new Error("storage unavailable"); });
    const deleteRow = vi.fn(async () => undefined);

    await expect(runMemoryDeletion({ removeFile, deleteRow }, "memory-3", "user-1/file.pdf"))
      .rejects.toThrow("storage unavailable");
    expect(deleteRow).not.toHaveBeenCalled();
  });
});
