/**
 * Neuron AI — Slack Connector
 *
 * Searches messages and channels from authorized Slack workspaces.
 * Uses Slack Web API (OAuth2 token).
 *
 * Auth: OAuth2 with scopes [channels:history, channels:read, search:read]
 * Read-only — Neuron cannot send messages.
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

const SLACK_API = "https://slack.com/api";

interface SlackSearchMessage {
  type: string;
  channel: { id: string; name: string };
  user: string;
  username: string;
  text: string;
  ts: string;
  permalink: string;
}

interface SlackSearchResponse {
  ok: boolean;
  messages?: {
    matches: SlackSearchMessage[];
    pagination: { total_count: number };
  };
  error?: string;
}

export class SlackConnector extends BaseConnector implements SourceConnector {
  private accessToken: string = "";
  private teamName: string = "Slack";
  private itemCount = 0;
  private lastSyncAt: string | null = null;

  constructor(connectionId: string) {
    super("slack", connectionId);
  }

  async authenticate(credentials: Record<string, string>): Promise<void> {
    const token = credentials["access_token"];
    if (!token) throw new Error("Slack: access_token required");
    this.accessToken = token;
    // Test auth
    const r = await this.apiCall("auth.test", {});
    if (!r.ok) throw new Error(`Slack auth failed: ${r.error ?? "unknown"}`);
    this.teamName = (r as Record<string, string>)["team"] ?? "Slack";
    this.state = "ready";
  }

  async disconnect(): Promise<void> {
    this.accessToken = "";
    this.state = "disconnected";
  }

  getCapabilities(): ConnectorCapability[] {
    return ["search", "list_items", "sync"];
  }

  getMetadata(): ConnectorMetadata {
    return {
      providerId: this._providerId,
      connectionId: this._connectionId,
      displayName: this.teamName,
      lastSyncAt: this.lastSyncAt,
      itemCount: this.itemCount,
      capabilities: this.getCapabilities(),
    };
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const { query, limit = 10 } = options;
    if (!this.accessToken) return { items: [] };

    try {
      const data = await this.apiCall("search.messages", {
        query,
        count: String(Math.min(limit, 20)),
        sort: "score",
        sort_dir: "desc",
      }) as unknown as SlackSearchResponse;

      if (!data.ok) return { items: [] };

      const matches = data.messages?.matches ?? [];
      const items: KnowledgeItem[] = matches.map((msg) => {
        const ts = parseSlackTs(msg.ts);
        return makeKnowledgeItem({
          connectionId: this._connectionId,
          sourceProvider: "slack",
          sourceType: "message",
          sourceId: msg.ts,
          title: `#${msg.channel.name}: ${truncate(msg.text, 80)}`,
          content: msg.text,
          snippet: truncate(msg.text, 200),
          metadata: {
            channel: msg.channel.name,
            channelId: msg.channel.id,
            user: msg.username ?? msg.user,
            ts: msg.ts,
          },
          url: msg.permalink,
          localPath: null,
          createdAt: ts,
          updatedAt: ts,
        });
      });

      return { items };
    } catch {
      return { items: [] };
    }
  }

  async getDocument(_sourceId: string): Promise<KnowledgeItem | null> {
    // Messages are not individually fetchable without channel context
    return null;
  }

  async sync(_cursor?: string): Promise<ConnectorSyncResult> {
    this.lastSyncAt = new Date().toISOString();
    return { newItems: 0, modifiedItems: 0, deletedItems: 0, nextCursor: null, errors: [] };
  }

  private async apiCall(method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(`${SLACK_API}/${method}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Slack API error: ${r.status}`);
    return r.json() as Promise<Record<string, unknown>>;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseSlackTs(ts: string): string {
  const secs = parseFloat(ts);
  return new Date(secs * 1000).toISOString();
}
