/**
 * Neuron AI — GitHub Connector
 *
 * Searches GitHub repositories, files, issues, and pull requests
 * using the GitHub REST API (read-only OAuth token).
 *
 * Auth: OAuth2 with scopes [repo:read]
 * All requests are made client-side using the user's access token.
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

const GITHUB_API = "https://api.github.com";

// ─── GitHub REST types (minimal) ──────────────────────────────────────────

interface GHSearchCodeItem {
  name: string;
  path: string;
  sha: string;
  url: string;
  html_url: string;
  repository: { full_name: string; html_url: string };
  text_matches?: { fragment: string }[];
}

interface GHIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  pull_request?: { url: string };
}

// ─── Connector ────────────────────────────────────────────────────────────

export class GitHubConnector extends BaseConnector implements SourceConnector {
  private accessToken: string = "";
  private itemCount = 0;
  private lastSyncAt: string | null = null;

  constructor(connectionId: string) {
    super("github", connectionId);
  }

  async authenticate(credentials: Record<string, string>): Promise<void> {
    const token = credentials["access_token"];
    if (!token) throw new Error("GitHub: access_token is required");
    // Verify token works
    const r = await this.fetch("/user");
    if (!r.ok) throw new Error("GitHub token verification failed");
    this.accessToken = token;
    this.state = "ready";
  }

  async disconnect(): Promise<void> {
    this.accessToken = "";
    this.state = "disconnected";
  }

  getCapabilities(): ConnectorCapability[] {
    return ["search", "get_document", "list_items", "sync", "get_metadata"];
  }

  getMetadata(): ConnectorMetadata {
    return {
      providerId: this._providerId,
      connectionId: this._connectionId,
      displayName: "GitHub",
      lastSyncAt: this.lastSyncAt,
      itemCount: this.itemCount,
      capabilities: this.getCapabilities(),
    };
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const { query, limit = 10 } = options;
    if (!this.accessToken) return { items: [] };

    const items: KnowledgeItem[] = [];

    // Search code
    try {
      const codeRes = await this.fetch(
        `/search/code?q=${encodeURIComponent(query)}&per_page=${Math.min(limit, 10)}`,
        { Accept: "application/vnd.github.v3.text-match+json" }
      );
      if (codeRes.ok) {
        const data = await codeRes.json() as { items: GHSearchCodeItem[] };
        for (const item of data.items ?? []) {
          const fragment = item.text_matches?.[0]?.fragment ?? "";
          items.push(makeKnowledgeItem({
            connectionId: this._connectionId,
            sourceProvider: "github",
            sourceType: "repository_file",
            sourceId: item.sha,
            title: `${item.repository.full_name}/${item.path}`,
            content: fragment,
            snippet: truncate(fragment, 200),
            metadata: { repo: item.repository.full_name, path: item.path, sha: item.sha },
            url: item.html_url,
            localPath: null,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }));
        }
      }
    } catch {
      // non-fatal — partial results are acceptable
    }

    // Search issues / PRs
    try {
      const issueRes = await this.fetch(
        `/search/issues?q=${encodeURIComponent(query)}&per_page=${Math.min(limit, 5)}`
      );
      if (issueRes.ok) {
        const data = await issueRes.json() as { items: GHIssue[] };
        for (const issue of data.items ?? []) {
          const isPR = Boolean(issue.pull_request);
          items.push(makeKnowledgeItem({
            connectionId: this._connectionId,
            sourceProvider: "github",
            sourceType: isPR ? "pull_request" : "issue",
            sourceId: String(issue.number),
            title: `#${issue.number}: ${issue.title}`,
            content: issue.body ?? issue.title,
            snippet: truncate(issue.body ?? "", 200),
            metadata: { state: issue.state, number: issue.number },
            url: issue.html_url,
            localPath: null,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
          }));
        }
      }
    } catch {
      // non-fatal
    }

    return { items };
  }

  async getDocument(sourceId: string): Promise<KnowledgeItem | null> {
    // sourceId = "owner/repo/path/to/file"
    const parts = sourceId.split("/");
    if (parts.length < 3) return null;
    const [owner, repo, ...pathParts] = parts;
    const path = pathParts.join("/");
    try {
      const r = await this.fetch(`/repos/${owner}/${repo}/contents/${path}`);
      if (!r.ok) return null;
      const data = await r.json() as { content: string; name: string; html_url: string; sha: string };
      const content = atob(data.content.replace(/\n/g, ""));
      return makeKnowledgeItem({
        connectionId: this._connectionId,
        sourceProvider: "github",
        sourceType: "repository_file",
        sourceId,
        title: `${owner}/${repo}/${path}`,
        content,
        snippet: truncate(content, 300),
        metadata: { owner, repo, path },
        url: data.html_url,
        localPath: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      return null;
    }
  }

  async sync(_cursor?: string): Promise<ConnectorSyncResult> {
    this.lastSyncAt = new Date().toISOString();
    return { newItems: 0, modifiedItems: 0, deletedItems: 0, nextCursor: null, errors: [] };
  }

  private fetch(path: string, extraHeaders?: Record<string, string>): Promise<Response> {
    return fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(15_000),
    });
  }
}
