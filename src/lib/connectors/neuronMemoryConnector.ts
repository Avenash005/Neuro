/**
 * Neuron AI — Neuron Memory Connector
 *
 * Wraps Neuron's own memories (Supabase) as a SourceConnector
 * so the retrieval engine can search them uniformly alongside
 * external integrations.
 */

import type {
  SourceConnector,
  ConnectorSearchOptions,
  ConnectorSearchResult,
  ConnectorSyncResult,
  ConnectorMetadata,
  KnowledgeItem,
  ConnectorCapability,
} from "../../types/connectors";
import type { MemoryRecord } from "../supabase";
import { BaseConnector, makeKnowledgeItem, truncate, keywordScore } from "./baseConnector";

export class NeuronMemoryConnector extends BaseConnector implements SourceConnector {
  private memories: MemoryRecord[];

  constructor(connectionId: string, memories: MemoryRecord[]) {
    super("neuron", connectionId);
    this.memories = memories;
    this.state = "ready";
  }

  /** Update the in-memory cache when memories change */
  updateMemories(memories: MemoryRecord[]): void {
    this.memories = memories;
  }

  async authenticate(_credentials: Record<string, string>): Promise<void> {
    this.state = "ready";
  }

  async disconnect(): Promise<void> {
    this.state = "disconnected";
  }

  getCapabilities(): ConnectorCapability[] {
    return ["search", "get_document", "list_items"];
  }

  getMetadata(): ConnectorMetadata {
    return {
      providerId: this._providerId,
      connectionId: this._connectionId,
      displayName: "Neuron Memories",
      lastSyncAt: new Date().toISOString(),
      itemCount: this.memories.length,
      capabilities: this.getCapabilities(),
    };
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const { query, limit = 10 } = options;
    const terms = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    const scored = this.memories
      .map((m) => {
        const haystack = `${m.title} ${m.content} ${m.extracted_text ?? ""} ${(m.tags ?? []).join(" ")}`;
        const score = keywordScore(haystack, terms);
        return { m, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const items: KnowledgeItem[] = scored.map(({ m }) =>
      makeKnowledgeItem({
        connectionId: this._connectionId,
        sourceProvider: "neuron",
        sourceType: "memory",
        sourceId: m.id,
        title: m.title,
        content: m.extracted_text ?? m.content,
        snippet: truncate(m.extracted_text ?? m.content, 200),
        metadata: { kind: m.kind, tags: m.tags },
        url: null,
        localPath: null,
        createdAt: m.created_at,
        updatedAt: m.created_at,
        storageMode: "cloud",
      })
    );

    return { items, totalEstimate: this.memories.length };
  }

  async getDocument(sourceId: string): Promise<KnowledgeItem | null> {
    const memory = this.memories.find((m) => m.id === sourceId);
    if (!memory) return null;
    return makeKnowledgeItem({
      connectionId: this._connectionId,
      sourceProvider: "neuron",
      sourceType: "memory",
      sourceId: memory.id,
      title: memory.title,
      content: memory.extracted_text ?? memory.content,
      snippet: truncate(memory.extracted_text ?? memory.content, 300),
      metadata: { kind: memory.kind, tags: memory.tags },
      url: null,
      localPath: null,
      createdAt: memory.created_at,
      updatedAt: memory.created_at,
      storageMode: "cloud",
    });
  }

  async sync(_cursor?: string): Promise<ConnectorSyncResult> {
    return { newItems: 0, modifiedItems: 0, deletedItems: 0, nextCursor: null, errors: [] };
  }
}
