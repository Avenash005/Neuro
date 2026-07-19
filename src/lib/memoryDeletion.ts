export type MemoryDeletionOperations = {
  removeFile: (path: string) => Promise<void>;
  deleteRow: (memoryId: string) => Promise<void>;
};

export async function runMemoryDeletion(
  operations: MemoryDeletionOperations,
  memoryId: string,
  storagePath: string | null,
) {
  if (storagePath) await operations.removeFile(storagePath);
  await operations.deleteRow(memoryId);
}
