/**
 * Neuron AI — Local File System Layer
 *
 * Uses the browser File System Access API (showDirectoryPicker) so the user
 * explicitly grants access to exactly the folders they choose.
 * Neuron NEVER scans the whole machine or accesses files outside what the
 * user grants.
 *
 * Security rules enforced here:
 *  - Only authorized FileSystemDirectoryHandle entries are used.
 *  - Files are read as text/binary blobs only; no code execution.
 *  - File-size limit enforced before reading.
 *  - Symlink traversal is not possible via the File System Access API.
 *  - Directory traversal outside the handle root is impossible by design.
 */

import { uuidv4 } from "./uuid";
import type { ConnectedFolder, LocalFileEntry, StorageMode } from "../types/local";
import {
  listConnectedFolders,
  upsertConnectedFolder,
  removeConnectedFolder,
  deleteLocalFilesByFolder,
  upsertLocalFile,
  listLocalFiles,
  getLocalFileByHash,
} from "./localDb";

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_EXTENSIONS = new Set([
  "md", "txt", "pdf", "docx", "doc", "rtf",
  "html", "htm", "json", "csv", "tsv",
  "js", "ts", "tsx", "jsx", "py", "rb", "java", "go", "rs",
  "yaml", "yml", "toml", "ini", "env", "sh", "bash",
  "xml", "sql",
]);

const EXTENSION_MIME: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  rtf: "application/rtf",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  js: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  jsx: "text/javascript",
  py: "text/x-python",
  rb: "text/x-ruby",
  java: "text/x-java-source",
  go: "text/x-go",
  rs: "text/x-rust",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "application/toml",
  ini: "text/ini",
  env: "text/plain",
  sh: "text/x-shellscript",
  bash: "text/x-shellscript",
  xml: "text/xml",
  sql: "text/x-sql",
};

// ─── Handle Persistence ────────────────────────────────────────────────────

// We keep in-memory references to FileSystemDirectoryHandle objects so we can
// re-use them within a session.  Handles are also persisted via IndexedDB
// using the File System Access API's built-in serialisation when supported.
const handleMap = new Map<string, FileSystemDirectoryHandle>();

export function cacheHandle(id: string, handle: FileSystemDirectoryHandle): void {
  handleMap.set(id, handle);
}

export function getCachedHandle(id: string): FileSystemDirectoryHandle | undefined {
  return handleMap.get(id);
}

// ─── Folder Picker ────────────────────────────────────────────────────────

/**
 * Open the OS folder picker.  Returns null if the user cancels.
 * Throws if the File System Access API is not available.
 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!("showDirectoryPicker" in window)) {
    throw new Error(
      "Your browser does not support the File System Access API. " +
      "Please use Chrome 86+ or Edge 86+."
    );
  }
  try {
    const handle = await (window as typeof window & {
      showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({ mode: "read" });
    return handle;
  } catch (err) {
    // User cancelled — DOMException with name AbortError
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

// ─── Connect Folder ───────────────────────────────────────────────────────

export async function connectFolder(
  handle: FileSystemDirectoryHandle,
  storageMode: StorageMode = "hybrid"
): Promise<ConnectedFolder> {
  const existing = await listConnectedFolders();
  const alreadyConnected = existing.find((f) => f.name === handle.name);
  if (alreadyConnected) {
    // Re-cache the handle (permissions may have been re-granted)
    cacheHandle(alreadyConnected.id, handle);
    return alreadyConnected;
  }

  const folder: ConnectedFolder = {
    id: uuidv4(),
    path: handle.name, // Full path isn't exposed by File System Access API
    name: handle.name,
    storageMode,
    addedAt: new Date().toISOString(),
    lastScannedAt: null,
    fileCount: 0,
    totalSizeBytes: 0,
    indexStatus: "idle",
  };

  cacheHandle(folder.id, handle);
  await upsertConnectedFolder(folder);
  return folder;
}

export async function disconnectFolder(id: string): Promise<void> {
  await deleteLocalFilesByFolder(id);
  await removeConnectedFolder(id);
  handleMap.delete(id);
}

export async function updateFolderStorageMode(id: string, storageMode: StorageMode): Promise<void> {
  const { getConnectedFolder } = await import("./localDb");
  const folder = await getConnectedFolder(id);
  if (!folder) return;
  await upsertConnectedFolder({ ...folder, storageMode });
  // Update all files in the folder to match
  const files = await listLocalFiles(id);
  for (const file of files) {
    await upsertLocalFile({ ...file, storageMode });
  }
}

// ─── File Scanner ─────────────────────────────────────────────────────────

export type ScanProgress = {
  scanned: number;
  total: number;
  currentFile: string;
};

/**
 * Recursively scan a directory handle and yield all eligible files.
 * Does not read file content — only metadata.
 */
// FileSystemDirectoryHandle is async-iterable but TypeScript's DOM lib
// doesn't always expose the [Symbol.asyncIterator] signature — cast to Any.
type DirIterable = AsyncIterable<[string, FileSystemHandle]>;

async function* walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string = ""
): AsyncGenerator<{ handle: FileSystemFileHandle; path: string }> {
  for await (const [name, entry] of dirHandle as unknown as DirIterable) {
    // Skip hidden files/folders (dot-files)
    if (name.startsWith(".")) continue;
    // Skip node_modules and similar heavy dirs
    if (name === "node_modules" || name === "__pycache__" || name === ".git") continue;

    const entryPath = basePath ? `${basePath}/${name}` : name;

    if (entry.kind === "file") {
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (ALLOWED_EXTENSIONS.has(ext)) {
        yield { handle: entry as FileSystemFileHandle, path: entryPath };
      }
    } else if (entry.kind === "directory") {
      yield* walkDirectory(entry as FileSystemDirectoryHandle, entryPath);
    }
  }
}

/**
 * Compute a SHA-256 hash of an ArrayBuffer.
 */
async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Scan all files under a connected folder and populate the local index.
 * Only re-processes files whose content hash has changed.
 *
 * @returns number of new/changed files found
 */
export async function scanFolder(
  folderId: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<number> {
  const handle = getCachedHandle(folderId);
  if (!handle) {
    throw new Error(
      "Folder handle not found. Please re-connect the folder to grant access."
    );
  }

  const { getConnectedFolder } = await import("./localDb");
  const folder = await getConnectedFolder(folderId);
  if (!folder) throw new Error("Folder not registered");

  // Mark folder as scanning
  await upsertConnectedFolder({
    ...folder,
    indexStatus: "scanning",
  });

  let scanned = 0;
  let newOrChanged = 0;
  const seenPaths = new Set<string>();

  try {
    // First pass: count total (best effort)
    const allPaths: { handle: FileSystemFileHandle; path: string }[] = [];
    for await (const item of walkDirectory(handle)) {
      allPaths.push(item);
    }

    for (const { handle: fileHandle, path } of allPaths) {
      seenPaths.add(path);
      scanned++;
      onProgress?.({ scanned, total: allPaths.length, currentFile: path });

      try {
        const file = await fileHandle.getFile();

        // Security: enforce file size limit
        if (file.size > MAX_FILE_SIZE_BYTES) continue;

        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;

        // Read content for hashing
        const buffer = await file.arrayBuffer();
        const hash = await sha256(buffer);

        // Check if already indexed with same hash
        const existingByHash = await getLocalFileByHash(hash);
        const existingAtPath = (await listLocalFiles(folderId)).find(
          (f) => f.filePath === path
        );

        if (existingAtPath && existingAtPath.contentHash === hash) {
          // No change — skip
          continue;
        }

        newOrChanged++;

        const entry: LocalFileEntry = {
          id: existingAtPath?.id ?? uuidv4(),
          folderId,
          fileName: file.name,
          filePath: path,
          fileType: ext,
          mimeType: EXTENSION_MIME[ext] ?? "application/octet-stream",
          fileSizeBytes: file.size,
          modifiedAt: new Date(file.lastModified).toISOString(),
          contentHash: hash,
          indexStatus: "pending",
          embeddingId: null,
          storageMode: folder.storageMode,
          syncStatus: "local_only",
          cloudObjectId: existingAtPath?.cloudObjectId ?? null,
          extractedText: null,
          summary: null,
          tags: [],
          indexedAt: null,
        };

        // If the file was previously synced to cloud but now changed locally,
        // mark it as pending upload
        if (existingByHash.length > 0 && existingAtPath?.syncStatus === "synced") {
          entry.syncStatus = "pending_upload";
        }

        await upsertLocalFile(entry);
      } catch {
        // Individual file errors are silently skipped
      }
    }

    // Mark deleted files
    const allFiles = await listLocalFiles(folderId);
    for (const file of allFiles) {
      if (!seenPaths.has(file.filePath)) {
        await upsertLocalFile({ ...file, indexStatus: "skipped", syncStatus: "local_only" });
      }
    }

    const updatedFiles = await listLocalFiles(folderId);
    const totalBytes = updatedFiles.reduce((acc, f) => acc + f.fileSizeBytes, 0);

    await upsertConnectedFolder({
      ...folder,
      lastScannedAt: new Date().toISOString(),
      fileCount: updatedFiles.length,
      totalSizeBytes: totalBytes,
      indexStatus: "ready",
    });
  } catch (err) {
    await upsertConnectedFolder({
      ...folder,
      indexStatus: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return newOrChanged;
}

// ─── File Content Reader ──────────────────────────────────────────────────

/**
 * Read a specific file's text content given its folder handle and relative path.
 * Returns null if the file cannot be read.
 */
export async function readFileContent(
  folderId: string,
  relativePath: string
): Promise<string | null> {
  const handle = getCachedHandle(folderId);
  if (!handle) return null;

  try {
    const parts = relativePath.split("/");
    let current: FileSystemDirectoryHandle = handle;

    // Traverse subdirectories
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }

    const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();

    if (file.size > MAX_FILE_SIZE_BYTES) return null;

    return await file.text();
  } catch {
    return null;
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

export { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES };
