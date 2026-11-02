/**
 * Neuron AI — Google Drive Connector
 *
 * Searches files and documents from Google Drive using the
 * Google Drive API v3 (read-only OAuth token).
 *
 * Auth: OAuth2 with scope [drive.readonly]
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

const DRIVE_API = "https://www.googleapis.com/drive/v3";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  description: string | null;
  createdTime: string;
  modifiedTime: string;
  size: string | null;
  snippet?: string;
}

interface DriveSearchResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

const MIME_TO_SOURCE_TYPE: Record<string, KnowledgeItem["sourceType"]> = {
  "application/vnd.google-apps.document": "document",
  "application/vnd.google-apps.spreadsheet": "spreadsheet",
  "application/vnd.google-apps.presentation": "presentation",
  "application/pdf": "pdf",
  "text/plain": "document",
};

export class GoogleDriveConnector extends BaseConnector implements SourceConnector {
  private accessToken: string = "";
  private itemCount = 0;
  private lastSyncAt: string | null = null;

  constructor(connectionId: string) {
    super("google_drive", connectionId);
  }

  async authenticate(credentials: Record<string, string>): Promise<void> {
    const token = credentials["access_token"];
    if (!token) throw new Error("Google Drive: access_token required");
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
      displayName: "Google Drive",
      lastSyncAt: this.lastSyncAt,
      itemCount: this.itemCount,
      capabilities: this.getCapabilities(),
    };
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const { query, limit = 10 } = options;
    if (!this.accessToken) return { items: [] };

    try {
      const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
      const params = new URLSearchParams({
        q,
        pageSize: String(Math.min(limit, 20)),
        fields: "files(id,name,mimeType,webViewLink,description,createdTime,modifiedTime,size),nextPageToken",
        orderBy: "modifiedTime desc",
      });
      const r = await this.fetch(`/files?${params}`);
      if (!r.ok) return { items: [] };
      const data = await r.json() as DriveSearchResponse;

      const items: KnowledgeItem[] = (data.files ?? []).map((file) =>
        makeKnowledgeItem({
          connectionId: this._connectionId,
          sourceProvider: "google_drive",
          sourceType: MIME_TO_SOURCE_TYPE[file.mimeType] ?? "document",
          sourceId: file.id,
          title: file.name,
          content: file.description ?? file.name,
          snippet: truncate(file.description ?? file.name, 200),
          metadata: { mimeType: file.mimeType, size: file.size },
          url: file.webViewLink,
          localPath: null,
          createdAt: file.createdTime,
          updatedAt: file.modifiedTime,
        })
      );

      return { items, nextCursor: data.nextPageToken };
    } catch {
      return { items: [] };
    }
  }

  async getDocument(sourceId: string): Promise<KnowledgeItem | null> {
    try {
      const params = new URLSearchParams({
        fields: "id,name,mimeType,webViewLink,description,createdTime,modifiedTime",
      });
      const r = await this.fetch(`/files/${sourceId}?${params}`);
      if (!r.ok) return null;
      const file = await r.json() as DriveFile;
      return makeKnowledgeItem({
        connectionId: this._connectionId,
        sourceProvider: "google_drive",
        sourceType: MIME_TO_SOURCE_TYPE[file.mimeType] ?? "document",
        sourceId: file.id,
        title: file.name,
        content: file.description ?? file.name,
        snippet: truncate(file.description ?? "", 300),
        metadata: { mimeType: file.mimeType },
        url: file.webViewLink,
        localPath: null,
        createdAt: file.createdTime,
        updatedAt: file.modifiedTime,
      });
    } catch {
      return null;
    }
  }

  async sync(_cursor?: string): Promise<ConnectorSyncResult> {
    this.lastSyncAt = new Date().toISOString();
    return { newItems: 0, modifiedItems: 0, deletedItems: 0, nextCursor: null, errors: [] };
  }

  private fetch(path: string): Promise<Response> {
    return fetch(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  }
}
