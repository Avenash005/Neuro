/**
 * Neuron AI — Local Database Layer
 *
 * Uses IndexedDB (via a thin promise wrapper) as the local persistent store.
 * All data here stays on the user's device unless explicitly synced.
 *
 * Stores:
 *   connected_folders   — folders the user has authorized Neuron to access
 *   local_files         — index entries for every scanned file
 *   sync_records        — history of sync operations
 *   sync_conflicts      — unresolved conflicts awaiting user decision
 *   local_settings      — user's local/hybrid preferences
 *   local_knowledge     — local knowledge items (text notes etc.)
 */

import type {
  ConnectedFolder,
  LocalFileEntry,
  LocalSettings,
  SyncConflict,
  SyncRecord,
  LocalKnowledgeItem,
} from "../types/local";
import { DEFAULT_LOCAL_SETTINGS } from "../types/local";

// ─── DB Bootstrap ──────────────────────────────────────────────────────────

const DB_NAME = "neuron_local";
const DB_VERSION = 1;

type StoreName =
  | "connected_folders"
  | "local_files"
  | "sync_records"
  | "sync_conflicts"
  | "local_settings"
  | "local_knowledge";

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // connected_folders
      if (!db.objectStoreNames.contains("connected_folders")) {
        db.createObjectStore("connected_folders", { keyPath: "id" });
      }

      // local_files
      if (!db.objectStoreNames.contains("local_files")) {
        const store = db.createObjectStore("local_files", { keyPath: "id" });
        store.createIndex("by_folder", "folderId", { unique: false });
        store.createIndex("by_hash", "contentHash", { unique: false });
        store.createIndex("by_status", "indexStatus", { unique: false });
        store.createIndex("by_sync", "syncStatus", { unique: false });
      }

      // sync_records
      if (!db.objectStoreNames.contains("sync_records")) {
        const store = db.createObjectStore("sync_records", { keyPath: "id" });
        store.createIndex("by_file", "fileId", { unique: false });
        store.createIndex("by_status", "status", { unique: false });
      }

      // sync_conflicts
      if (!db.objectStoreNames.contains("sync_conflicts")) {
        const store = db.createObjectStore("sync_conflicts", { keyPath: "id" });
        store.createIndex("by_file", "fileId", { unique: false });
      }

      // local_settings (single-row store keyed by "settings")
      if (!db.objectStoreNames.contains("local_settings")) {
        db.createObjectStore("local_settings", { keyPath: "key" });
      }

      // local_knowledge
      if (!db.objectStoreNames.contains("local_knowledge")) {
        const store = db.createObjectStore("local_knowledge", { keyPath: "id" });
        store.createIndex("by_mode", "storageMode", { unique: false });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── Generic Helpers ───────────────────────────────────────────────────────

function tx(store: StoreName, mode: IDBTransactionMode = "readonly") {
  return openDb().then((db) => {
    const transaction = db.transaction(store, mode);
    return transaction.objectStore(store);
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return wrap<T[]>(store.getAll());
}

function getByIndex<T>(store: IDBObjectStore, indexName: string, value: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Connected Folders ─────────────────────────────────────────────────────

export async function listConnectedFolders(): Promise<ConnectedFolder[]> {
  const store = await tx("connected_folders");
  return getAll<ConnectedFolder>(store);
}

export async function getConnectedFolder(id: string): Promise<ConnectedFolder | null> {
  const store = await tx("connected_folders");
  const result = await wrap<ConnectedFolder | undefined>(store.get(id));
  return result ?? null;
}

export async function upsertConnectedFolder(folder: ConnectedFolder): Promise<void> {
  const store = await tx("connected_folders", "readwrite");
  await wrap(store.put(folder));
}

export async function removeConnectedFolder(id: string): Promise<void> {
  const store = await tx("connected_folders", "readwrite");
  await wrap(store.delete(id));
}

// ─── Local Files ──────────────────────────────────────────────────────────

export async function listLocalFiles(folderId?: string): Promise<LocalFileEntry[]> {
  const store = await tx("local_files");
  if (folderId) {
    return getByIndex<LocalFileEntry>(store, "by_folder", folderId);
  }
  return getAll<LocalFileEntry>(store);
}

export async function getLocalFile(id: string): Promise<LocalFileEntry | null> {
  const store = await tx("local_files");
  const result = await wrap<LocalFileEntry | undefined>(store.get(id));
  return result ?? null;
}

export async function getLocalFileByHash(hash: string): Promise<LocalFileEntry[]> {
  const store = await tx("local_files");
  return getByIndex<LocalFileEntry>(store, "by_hash", hash);
}

export async function upsertLocalFile(entry: LocalFileEntry): Promise<void> {
  const store = await tx("local_files", "readwrite");
  await wrap(store.put(entry));
}

export async function deleteLocalFile(id: string): Promise<void> {
  const store = await tx("local_files", "readwrite");
  await wrap(store.delete(id));
}

export async function deleteLocalFilesByFolder(folderId: string): Promise<void> {
  const files = await listLocalFiles(folderId);
  const store = await tx("local_files", "readwrite");
  for (const file of files) {
    await wrap(store.delete(file.id));
  }
}

// ─── Sync Records ─────────────────────────────────────────────────────────

export async function listSyncRecords(): Promise<SyncRecord[]> {
  const store = await tx("sync_records");
  return getAll<SyncRecord>(store);
}

export async function upsertSyncRecord(record: SyncRecord): Promise<void> {
  const store = await tx("sync_records", "readwrite");
  await wrap(store.put(record));
}

export async function deleteSyncRecord(id: string): Promise<void> {
  const store = await tx("sync_records", "readwrite");
  await wrap(store.delete(id));
}

// ─── Sync Conflicts ───────────────────────────────────────────────────────

export async function listSyncConflicts(): Promise<SyncConflict[]> {
  const store = await tx("sync_conflicts");
  return getAll<SyncConflict>(store);
}

export async function upsertSyncConflict(conflict: SyncConflict): Promise<void> {
  const store = await tx("sync_conflicts", "readwrite");
  await wrap(store.put(conflict));
}

export async function resolveSyncConflict(id: string): Promise<void> {
  const store = await tx("sync_conflicts", "readwrite");
  await wrap(store.delete(id));
}

// ─── Local Settings ───────────────────────────────────────────────────────

export async function loadLocalSettings(): Promise<LocalSettings> {
  const store = await tx("local_settings");
  const result = await wrap<{ key: string; value: LocalSettings } | undefined>(store.get("settings"));
  return result?.value ?? { ...DEFAULT_LOCAL_SETTINGS };
}

export async function saveLocalSettings(settings: LocalSettings): Promise<void> {
  const store = await tx("local_settings", "readwrite");
  await wrap(store.put({ key: "settings", value: settings }));
}

// ─── Local Knowledge ──────────────────────────────────────────────────────

export async function listLocalKnowledge(): Promise<LocalKnowledgeItem[]> {
  const store = await tx("local_knowledge");
  return getAll<LocalKnowledgeItem>(store);
}

export async function upsertLocalKnowledge(item: LocalKnowledgeItem): Promise<void> {
  const store = await tx("local_knowledge", "readwrite");
  await wrap(store.put(item));
}

export async function deleteLocalKnowledge(id: string): Promise<void> {
  const store = await tx("local_knowledge", "readwrite");
  await wrap(store.delete(id));
}

// ─── Stats ────────────────────────────────────────────────────────────────

export async function getLocalStats(): Promise<{ fileCount: number; totalBytes: number }> {
  const files = await listLocalFiles();
  const totalBytes = files.reduce((acc, f) => acc + f.fileSizeBytes, 0);
  return { fileCount: files.length, totalBytes };
}
