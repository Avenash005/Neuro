/**
 * Neuron AI — Notion Connector
 *
 * Searches pages and databases from a Notion workspace.
 * Uses the Notion API v1 (OAuth integration token).
 *
 * Auth: OAuth2 with read_content scope
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
import { BaseConnector, makeKnowledgeItem, truncate } from "./baseConnector";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// ─── Notion API types (minimal) ───────────────────────────────────────────

interface NotionPage {
  id: string;
  object: "page" | "database";
  url: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, {
    type: string;
    title?: { plain_text: string }[];
    rich_text?: { plain_text: string }[];
  }>;
}

interface NotionSearchResponse {
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
}

interface NotionBlockContent {
  results: {
    type: string;
    [key: string]: unknown;
  }[];
}

// ─── Connector ────────────────────────────────────────────────────────────

export class NotionConnector extends BaseConnector implements SourceConnector {
  private accessToken: string = "";
  private itemCount = 0;
  private lastSyncAt: string | null = null;

  constructor(connectionId: string) {
    super("notion", connectionId);
  }

  async authenticate(credentials: Record<string, string>): Promise<void> {
    const token = credentials["access_token"];
    if (!token) throw new Error("Notion: access_token required");
    this.accessToken = token;
    this.state = "ready";
  }

  async disconnect(): Promise<void> {
    this.accessToken = "";
    this.state = "disconnected";
  }

  getCapabilities(): ConnectorCapability[] {
    return ["search", "get_document", "list_items", "sync"];
  }

  getMetadata(): ConnectorMetadata {
    return {
      providerId: this._providerId,
      connectionId: this._connectionId,
      displayName: "Notion",
      lastSyncAt: this.lastSyncAt,
      itemCount: this.itemCount,
      capabilities: this.getCapabilities(),
    };
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const { query, limit = 10 } = options;
    if (!this.accessToken) return { items: [] };

    try {
      const r = await this.fetch("/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          page_size: Math.min(limit, 20),
          sort: { direction: "descending", timestamp: "last_edited_time" },
        }),
      });
      if (!r.ok) return { items: [] };
      const data = await r.json() as NotionSearchResponse;

      const items: KnowledgeItem[] = (data.results ?? []).map((page) => {
        const title = extractNotionTitle(page);
        return makeKnowledgeItem({
          connectionId: this._connectionId,
          sourceProvider: "notion",
          sourceType: page.object === "database" ? "database" : "page",
          sourceId: page.id,
          title,
          content: title,
          snippet: title,
          metadata: { notionId: page.id, object: page.object },
          url: page.url,
          localPath: null,
          createdAt: page.created_time,
          updatedAt: page.last_edited_time,
        });
      });

      return { items, nextCursor: data.next_cursor ?? undefined };
    } catch {
      return { items: [] };
    }
  }

  async getDocument(sourceId: string): Promise<KnowledgeItem | null> {
    try {
      // Fetch page metadata
      const pageRes = await this.fetch(`/pages/${sourceId}`);
      if (!pageRes.ok) return null;
      const page = await pageRes.json() as NotionPage;

      // Fetch page content blocks
      const blocksRes = await this.fetch(`/blocks/${sourceId}/children?page_size=50`);
      let content = extractNotionTitle(page);
      if (blocksRes.ok) {
        const blocks = await blocksRes.json() as NotionBlockContent;
        const blockTexts = extractBlockText(blocks.results);
        content = content + "\n\n" + blockTexts;
      }

      return makeKnowledgeItem({
        connectionId: this._connectionId,
        sourceProvider: "notion",
        sourceType: "page",
        sourceId,
        title: extractNotionTitle(page),
        content,
        snippet: truncate(content, 300),
        metadata: { notionId: sourceId },
        url: page.url,
        localPath: null,
        createdAt: page.created_time,
        updatedAt: page.last_edited_time,
      });
    } catch {
      return null;
    }
  }

  async sync(_cursor?: string): Promise<ConnectorSyncResult> {
    this.lastSyncAt = new Date().toISOString();
    return { newItems: 0, modifiedItems: 0, deletedItems: 0, nextCursor: null, errors: [] };
  }

  private fetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractNotionTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function extractBlockText(blocks: { type: string; [k: string]: unknown }[]): string {
  const texts: string[] = [];
  for (const block of blocks) {
    const typed = block[block.type] as { rich_text?: { plain_text: string }[] } | undefined;
    if (typed?.rich_text) {
      texts.push(typed.rich_text.map((t) => t.plain_text).join(""));
    }
  }
  return texts.join("\n").slice(0, 2000);
}
