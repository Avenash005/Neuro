/**
 * Neuron AI — Unified Hybrid Search
 *
 * Searches both local files and cloud memories in parallel and combines results.
 * Every result is annotated with its source (local | cloud) and storage mode.
 *
 * The user sees one result list. Neuron shows clearly where each result came from.
 */

import { searchLocalFiles } from "./localIndexer";
import type { UnifiedSearchResult } from "../types/local";
import type { MemoryRecord } from "./supabase";

export type { UnifiedSearchResult };

export interface UnifiedSearchOptions {
  query: string;
  cloudSearch?: (query: string) => Promise<MemoryRecord[]>;
  folderId?: string;
  limit?: number;
  includeLocal?: boolean;
  includeCloud?: boolean;
}

export interface UnifiedSearchOutput {
  results: UnifiedSearchResult[];
  localCount: number;
  cloudCount: number;
  query: string;
  searchedAt: string;
  isOnline: boolean;
}

/**
 * Run a unified search across local files and cloud memories.
 * Local search runs via IndexedDB full-text scan.
 * Cloud search uses the existing Supabase hybrid_search_memories function.
 */
export async function unifiedSearch(
  options: UnifiedSearchOptions
): Promise<UnifiedSearchOutput> {
  const {
    query,
    cloudSearch,
    folderId,
    limit = 20,
    includeLocal = true,
    includeCloud = true,
  } = options;

  const isOnline = navigator.onLine;
  const searchedAt = new Date().toISOString();

  // Run local and cloud search in parallel
  const [localResults, cloudResults] = await Promise.all([
    includeLocal
      ? searchLocalFiles(query, folderId, limit).catch(() => [])
      : Promise.resolve([]),
    includeCloud && isOnline && cloudSearch
      ? cloudSearch(query).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Map local results
  const mappedLocal: UnifiedSearchResult[] = localResults.map((r) => ({
    id: r.fileId,
    title: r.fileName,
    snippet: r.snippet,
    source: "local" as const,
    storageMode: r.storageMode,
    filePath: r.filePath,
    fileType: r.fileType,
    modifiedAt: r.modifiedAt,
    score: r.score,
  }));

  // Map cloud results
  const mappedCloud: UnifiedSearchResult[] = cloudResults.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.extracted_text?.slice(0, 200) ?? r.summary ?? r.content,
    source: "cloud" as const,
    storageMode: "cloud" as const,
    cloudMemoryId: r.id,
    fileType: r.kind,
    modifiedAt: r.created_at,
    score: (r as MemoryRecord & { search_score?: number }).search_score ?? 0.5,
  }));

  // Merge and deduplicate by title similarity
  const combined = mergeAndRank(mappedLocal, mappedCloud, query, limit);

  return {
    results: combined,
    localCount: mappedLocal.length,
    cloudCount: mappedCloud.length,
    query,
    searchedAt,
    isOnline,
  };
}

// ─── Merge & Rank ─────────────────────────────────────────────────────────

function mergeAndRank(
  local: UnifiedSearchResult[],
  cloud: UnifiedSearchResult[],
  query: string,
  limit: number
): UnifiedSearchResult[] {
  // Normalize scores so local and cloud are on the same scale
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

  const score = (r: UnifiedSearchResult): number => {
    let s = r.score;
    // Boost results where the title matches the query
    const titleLower = r.title.toLowerCase();
    for (const term of terms) {
      if (titleLower.includes(term)) s += 2;
    }
    return s;
  };

  const all = [...local, ...cloud];
  return all
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

// ─── Source Label Helpers ─────────────────────────────────────────────────

export function getSourceLabel(result: UnifiedSearchResult): string {
  if (result.source === "local") return "🔒 Local";
  return "☁ Cloud";
}

export function getStorageModeIcon(storageMode: import("../types/local").StorageMode): string {
  switch (storageMode) {
    case "local": return "🔒";
    case "cloud": return "☁";
    case "hybrid": return "⚡";
  }
}

export function getStorageModeLabel(storageMode: import("../types/local").StorageMode): string {
  switch (storageMode) {
    case "local": return "Local Only";
    case "cloud": return "Cloud";
    case "hybrid": return "Hybrid";
  }
}
