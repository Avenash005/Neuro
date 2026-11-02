/**
 * Neuron AI — Base Connector
 * Shared utilities for all source connectors.
 */

import type {
  KnowledgeItem,
  KnowledgeStorageMode,
  ConnectorCapability,
} from "../../types/connectors";

let _idCounter = 0;

export function makeId(): string {
  return `ki_${Date.now()}_${_idCounter++}`;
}

export function makeKnowledgeItem(
  partial: Omit<KnowledgeItem, "id" | "userId" | "contentHash" | "storageMode" | "syncStatus" | "indexedAt" | "score" | "keywordScore" | "semanticScore" | "recencyScore"> & {
    userId?: string;
    contentHash?: string;
    storageMode?: KnowledgeStorageMode;
  }
): KnowledgeItem {
  return {
    id: makeId(),
    userId: partial.userId ?? "local",
    contentHash: partial.contentHash ?? hashContent(partial.content),
    storageMode: partial.storageMode ?? "cloud",
    syncStatus: "synced",
    indexedAt: new Date().toISOString(),
    ...partial,
  };
}

/** Simple djb2-style hash for deduplication — not cryptographic */
export function hashContent(s: string): string {
  let h = 5381;
  for (let i = 0; i < Math.min(s.length, 4096); i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

/** Truncate a string to maxLen, appending "…" if truncated */
export function truncate(s: string, maxLen = 300): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/** Score a text against a set of query terms */
export function keywordScore(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    let pos = 0;
    while ((pos = lower.indexOf(t, pos)) !== -1) { score++; pos++; }
  }
  return score;
}

export type ConnectorState = "disconnected" | "ready" | "error";

export abstract class BaseConnector {
  protected state: ConnectorState = "disconnected";
  protected _connectionId: string;
  protected _providerId: string;

  constructor(providerId: string, connectionId: string) {
    this._providerId = providerId;
    this._connectionId = connectionId;
  }

  get providerId(): string { return this._providerId; }
  get connectionId(): string { return this._connectionId; }

  isReady(): boolean { return this.state === "ready"; }

  getCapabilities(): ConnectorCapability[] { return ["search", "get_document", "list_items"]; }
}
