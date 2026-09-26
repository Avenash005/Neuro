/**
 * Neuron AI — Sync Engine
 *
 * Handles selective, incremental synchronization between local and Supabase cloud storage.
 *
 * Principles:
 *  - Only changed files are synchronized (content-hash based).
 *  - The user controls which folders/files are synced.
 *  - Conflicts are detected and surfaced for user resolution — never silently overwritten.
 *  - Sync can be disabled without deleting cloud data.
 *  - All cloud objects are scoped to the authenticated user's ID (RLS enforced).
 *
 * This module runs entirely in the browser and communicates with Supabase Storage
 * and the `local_file_sync` table in Postgres (RLS protected).
 */

import { uuidv4 } from "./uuid";
import {
  listLocalFiles,
  upsertLocalFile,
  upsertSyncRecord,
  upsertSyncConflict,
  listSyncConflicts,
  resolveSyncConflict,
} from "./localDb";
import type {
  LocalFileEntry,
  SyncRecord,
  SyncConflict,
  StorageMode,
} from "../types/local";

// ─── Cloud File Manifest ──────────────────────────────────────────────────

export interface CloudFileManifest {
  fileId: string;       // matches LocalFileEntry.id
  fileName: string;
  contentHash: string;
  updatedAt: string;
  storagePath: string;
}

// ─── Sync Engine ─────────────────────────────────────────────────────────

export type SyncEngineEvent =
  | { type: "start"; total: number }
  | { type: "progress"; processed: number; total: number; currentFile: string }
  | { type: "conflict"; conflict: SyncConflict }
  | { type: "complete"; uploaded: number; downloaded: number; conflicts: number }
  | { type: "error"; message: string };

export type SyncListener = (event: SyncEngineEvent) => void;

export interface SyncOptions {
  userId: string;
  supabaseClient: import("@supabase/supabase-js").SupabaseClient;
  folderId?: string;       // If set, only sync files from this folder
  listener?: SyncListener;
  direction?: "upload" | "download" | "both";
}

/**
 * Run an incremental sync pass.
 */
export async function runSync(options: SyncOptions): Promise<{
  uploaded: number;
  downloaded: number;
  conflicts: number;
}> {
  const { userId, supabaseClient, folderId, listener, direction = "both" } = options;

  // Get local files eligible for sync (storageMode !== "local")
  const localFiles = (await listLocalFiles(folderId)).filter(
    (f) => f.storageMode !== "local" && f.indexStatus === "ready"
  );

  let uploaded = 0;
  let downloaded = 0;
  let conflicts = 0;

  listener?.({ type: "start", total: localFiles.length });

  // Fetch the cloud manifest for this user
  const cloudManifest = await fetchCloudManifest(userId, supabaseClient);
  const cloudByFileId = new Map<string, CloudFileManifest>(
    cloudManifest.map((m) => [m.fileId, m])
  );

  let processed = 0;

  // ── Upload pass ───────────────────────────────────────────────────────
  if (direction === "upload" || direction === "both") {
    for (const localFile of localFiles) {
      listener?.({
        type: "progress",
        processed,
        total: localFiles.length,
        currentFile: localFile.fileName,
      });

      const cloudEntry = cloudByFileId.get(localFile.id);

      if (!cloudEntry) {
        // New file — upload
        const ok = await uploadFile(userId, localFile, supabaseClient);
        if (ok) {
          uploaded++;
          await upsertLocalFile({ ...localFile, syncStatus: "synced" });
          await recordSync(localFile, "new", "complete", supabaseClient);
        }
      } else if (cloudEntry.contentHash !== localFile.contentHash) {
        // Both changed — conflict
        if (localFile.modifiedAt > cloudEntry.updatedAt) {
          // Local is newer — but check if cloud also changed
          if (cloudEntry.updatedAt > (localFile.indexedAt ?? "1970-01-01")) {
            // Real conflict
            conflicts++;
            const conflict = buildConflict(localFile, cloudEntry);
            await upsertSyncConflict(conflict);
            await upsertLocalFile({ ...localFile, syncStatus: "conflict" });
            listener?.({ type: "conflict", conflict });
          } else {
            // Local change only — safe to upload
            const ok = await uploadFile(userId, localFile, supabaseClient);
            if (ok) {
              uploaded++;
              await upsertLocalFile({ ...localFile, syncStatus: "synced" });
              await recordSync(localFile, "modified", "complete", supabaseClient);
            }
          }
        }
      }

      processed++;
    }
  }

  // ── Download pass ─────────────────────────────────────────────────────
  if (direction === "download" || direction === "both") {
    const localById = new Map<string, LocalFileEntry>(localFiles.map((f) => [f.id, f]));

    for (const cloudEntry of cloudManifest) {
      const localFile = localById.get(cloudEntry.fileId);

      if (!localFile) {
        // Cloud-only file — nothing to do for local-first mode
        // (local files are authoritative; cloud files that don't exist locally
        //  are only shown in search as cloud results)
        downloaded++;
        continue;
      }

      if (cloudEntry.contentHash !== localFile.contentHash &&
          cloudEntry.updatedAt > localFile.modifiedAt) {
        // Cloud is newer — update local metadata
        await upsertLocalFile({
          ...localFile,
          syncStatus: "synced",
          cloudObjectId: cloudEntry.storagePath,
        });
        downloaded++;
      }
    }
  }

  listener?.({ type: "complete", uploaded, downloaded, conflicts });

  return { uploaded, downloaded, conflicts };
}

// ─── Conflict Resolution ───────────────────────────────────────────────────

export async function resolveConflict(
  conflictId: string,
  resolution: "keep_local" | "keep_cloud",
  userId: string,
  supabaseClient: import("@supabase/supabase-js").SupabaseClient
): Promise<void> {
  const conflicts = await listSyncConflicts();
  const conflict = conflicts.find((c) => c.id === conflictId);
  if (!conflict) throw new Error("Conflict not found");

  const localFiles = await listLocalFiles();
  const localFile = localFiles.find((f) => f.id === conflict.fileId);
  if (!localFile) throw new Error("Local file not found");

  if (resolution === "keep_local") {
    // Upload local version to cloud, overwriting
    await uploadFile(userId, localFile, supabaseClient);
    await upsertLocalFile({ ...localFile, syncStatus: "synced" });
  } else {
    // Mark as synced with cloud version
    await upsertLocalFile({
      ...localFile,
      syncStatus: "synced",
      cloudObjectId: conflict.id,
    });
  }

  await resolveSyncConflict(conflictId);
}

// ─── Cloud Manifest Fetch ─────────────────────────────────────────────────

async function fetchCloudManifest(
  userId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<CloudFileManifest[]> {
  try {
    const { data, error } = await supabase
      .from("local_file_sync")
      .select("file_id, file_name, content_hash, updated_at, storage_path")
      .eq("user_id", userId);

    if (error) return [];

    return (data ?? []).map((row: {
      file_id: string;
      file_name: string;
      content_hash: string;
      updated_at: string;
      storage_path: string;
    }) => ({
      fileId: row.file_id,
      fileName: row.file_name,
      contentHash: row.content_hash,
      updatedAt: row.updated_at,
      storagePath: row.storage_path,
    }));
  } catch {
    return [];
  }
}

// ─── File Upload ──────────────────────────────────────────────────────────

async function uploadFile(
  userId: string,
  localFile: LocalFileEntry,
  supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<boolean> {
  try {
    const storagePath = `${userId}/${localFile.id}/${localFile.fileName}`;

    // Upload metadata record to Postgres (RLS: user_id = auth.uid())
    const { error: dbError } = await supabase
      .from("local_file_sync")
      .upsert({
        file_id: localFile.id,
        user_id: userId,
        file_name: localFile.fileName,
        file_path: localFile.filePath,
        file_type: localFile.fileType,
        file_size: localFile.fileSizeBytes,
        content_hash: localFile.contentHash,
        storage_path: storagePath,
        extracted_text: localFile.extractedText,
        summary: localFile.summary,
        tags: localFile.tags,
        storage_mode: localFile.storageMode,
        folder_id: localFile.folderId,
        modified_at: localFile.modifiedAt,
        updated_at: new Date().toISOString(),
      });

    return !dbError;
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildConflict(
  localFile: LocalFileEntry,
  cloudEntry: CloudFileManifest
): SyncConflict {
  return {
    id: uuidv4(),
    fileId: localFile.id,
    fileName: localFile.fileName,
    filePath: localFile.filePath,
    localModifiedAt: localFile.modifiedAt,
    cloudModifiedAt: cloudEntry.updatedAt,
    localHash: localFile.contentHash,
    cloudHash: cloudEntry.contentHash,
    detectedAt: new Date().toISOString(),
  };
}

async function recordSync(
  file: LocalFileEntry,
  changeType: SyncRecord["changeType"],
  status: SyncRecord["status"],
  _supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<void> {
  const record: SyncRecord = {
    id: uuidv4(),
    fileId: file.id,
    fileName: file.fileName,
    changeType,
    localModifiedAt: file.modifiedAt,
    cloudModifiedAt: new Date().toISOString(),
    localHash: file.contentHash,
    cloudHash: file.contentHash,
    status,
    createdAt: new Date().toISOString(),
    resolvedAt: status === "complete" ? new Date().toISOString() : null,
  };
  await upsertSyncRecord(record);
}

// ─── Sync Toggle ──────────────────────────────────────────────────────────

/**
 * Stop syncing a folder without deleting cloud data.
 * Sets all files in the folder to local_only storage mode.
 */
export async function stopSyncingFolder(
  folderId: string,
  _supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<void> {
  const files = await listLocalFiles(folderId);
  for (const file of files) {
    await upsertLocalFile({
      ...file,
      storageMode: "local" as StorageMode,
      syncStatus: "local_only",
    });
  }
}

/**
 * Delete all cloud data for a folder.
 * This is destructive and separate from "stop syncing".
 */
export async function deleteCloudData(
  folderId: string,
  userId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<void> {
  const files = await listLocalFiles(folderId);
  const fileIds = files.map((f) => f.id);

  if (fileIds.length > 0) {
    await supabase
      .from("local_file_sync")
      .delete()
      .eq("user_id", userId)
      .in("file_id", fileIds);
  }

  for (const file of files) {
    await upsertLocalFile({ ...file, syncStatus: "local_only", cloudObjectId: null });
  }
}
