/**
 * Neuron AI — Hybrid Local + Cloud types
 * All types for the local-first knowledge layer.
 */

// ─── Storage Classification ────────────────────────────────────────────────

export type StorageMode = "local" | "cloud" | "hybrid";

export type SyncStatus =
  | "local_only"
  | "synced"
  | "pending_upload"
  | "pending_download"
  | "conflict"
  | "error";

// ─── Connected Folder ──────────────────────────────────────────────────────

export interface ConnectedFolder {
  id: string;
  path: string;           // Absolute path on disk
  name: string;           // Display name (last segment of path)
  storageMode: StorageMode;
  addedAt: string;        // ISO
  lastScannedAt: string | null;
  fileCount: number;
  totalSizeBytes: number;
  indexStatus: "idle" | "scanning" | "indexing" | "ready" | "error";
  errorMessage?: string;
}

// ─── Local File Index Entry ────────────────────────────────────────────────

export interface LocalFileEntry {
  id: string;             // uuid
  folderId: string;
  fileName: string;
  filePath: string;       // Absolute path
  fileType: string;       // Extension e.g. "md", "pdf", "txt"
  mimeType: string;
  fileSizeBytes: number;
  modifiedAt: string;     // ISO
  contentHash: string;    // SHA-256 hex of file content
  indexStatus: "pending" | "processing" | "ready" | "error" | "skipped";
  embeddingId: string | null;
  storageMode: StorageMode;
  syncStatus: SyncStatus;
  cloudObjectId: string | null;
  extractedText: string | null;
  summary: string | null;
  tags: string[];
  errorMessage?: string;
  indexedAt: string | null;
}

// ─── Sync Record ───────────────────────────────────────────────────────────

export type SyncChangeType = "new" | "modified" | "deleted" | "renamed" | "conflict";

export interface SyncRecord {
  id: string;
  fileId: string;
  fileName: string;
  changeType: SyncChangeType;
  localModifiedAt: string | null;
  cloudModifiedAt: string | null;
  localHash: string | null;
  cloudHash: string | null;
  status: "pending" | "uploading" | "downloading" | "complete" | "conflict" | "error";
  resolvedBy?: "local" | "cloud";
  createdAt: string;
  resolvedAt: string | null;
  errorMessage?: string;
}

// ─── Conflict ─────────────────────────────────────────────────────────────

export interface SyncConflict {
  id: string;
  fileId: string;
  fileName: string;
  filePath: string;
  localModifiedAt: string;
  cloudModifiedAt: string;
  localHash: string;
  cloudHash: string;
  detectedAt: string;
}

// ─── Local Knowledge Item ──────────────────────────────────────────────────

export interface LocalKnowledgeItem {
  id: string;
  title: string;
  contentLocation: "local" | "cloud" | "both";
  storageMode: StorageMode;
  localPath: string | null;
  cloudObjectId: string | null;
  contentHash: string | null;
  fileId: string | null;   // References LocalFileEntry
  extractedText: string | null;
  summary: string | null;
  tags: string[];
  embeddingLocal: number[] | null;
  createdAt: string;
  updatedAt: string;
}

// ─── AI Processing Context ─────────────────────────────────────────────────

export type AIProvider = "local_ollama" | "cloud";

export interface AIProcessingInfo {
  provider: AIProvider;
  modelName: string;
  isLocal: boolean;
}

// ─── Unified Search Result ─────────────────────────────────────────────────

export type SearchResultSource = "local" | "cloud";

export interface UnifiedSearchResult {
  id: string;
  title: string;
  snippet: string;
  source: SearchResultSource;
  storageMode: StorageMode;
  filePath?: string;
  cloudMemoryId?: string;
  fileType?: string;
  modifiedAt: string;
  score: number;
  aiProvider?: AIProvider;
}

// ─── Local Settings ────────────────────────────────────────────────────────

export interface LocalSettings {
  storageMode: StorageMode;
  cloudSyncEnabled: boolean;
  localAIEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaEmbeddingModel: string;
  ollamaChatModel: string;
  cloudAIEnabled: boolean;
  maxFileSizeBytes: number;
  allowedFileExtensions: string[];
  autoSyncInterval: number | null;  // minutes, null = manual only
  privacyNoticeAcknowledged: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  storageMode: "hybrid",
  cloudSyncEnabled: true,
  localAIEnabled: false,
  ollamaBaseUrl: "http://localhost:11434",
  ollamaEmbeddingModel: "nomic-embed-text",
  ollamaChatModel: "llama3",
  cloudAIEnabled: true,
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
  allowedFileExtensions: ["md", "txt", "pdf", "docx", "doc", "rtf", "html", "json", "csv"],
  autoSyncInterval: 15,
  privacyNoticeAcknowledged: false,
};

// ─── Privacy Stats ─────────────────────────────────────────────────────────

export interface PrivacyStats {
  localFileCount: number;
  cloudFileCount: number;
  localStorageBytes: number;
  cloudStorageBytes: number;
  localAIEnabled: boolean;
  cloudAIEnabled: boolean;
  connectedFolders: ConnectedFolder[];
  lastSyncAt: string | null;
  pendingSyncCount: number;
}
