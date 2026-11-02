/**
 * Neuron AI — Universal Knowledge Retrieval Types
 *
 * Core types for the integration layer:
 * Provider registry, SourceConnector interface, KnowledgeItem,
 * RetrievalQuery, RankedResult, AuditLog, MCP tool definitions.
 */

// ─── Integration Provider ─────────────────────────────────────────────────

export type IntegrationCategory =
  | "code"        // GitHub, GitLab, Bitbucket
  | "storage"     // Google Drive, Dropbox, OneDrive
  | "notes"       // Notion, Confluence, Obsidian
  | "messaging"   // Slack, Discord, Teams
  | "calendar"    // Google Calendar, Outlook
  | "mail"        // Gmail, Outlook Mail
  | "design"      // Figma, Miro
  | "project"     // Linear, Jira, Asana
  | "local"       // Local filesystem
  | "custom";     // User-defined APIs

export type AuthType = "oauth2" | "api_key" | "local" | "none";

export type ConnectorCapability =
  | "search"
  | "get_document"
  | "list_items"
  | "sync"
  | "get_metadata"
  | "stream_content";

export interface IntegrationProvider {
  id: string;
  name: string;
  description: string;
  /** Emoji or short text icon – no external URLs needed */
  iconEmoji: string;
  category: IntegrationCategory;
  authType: AuthType;
  capabilities: ConnectorCapability[];
  /** OAuth scopes requested (read-only by default) */
  scopes: string[];
  /** Human-readable list of what Neuron CAN do */
  permissionsGranted: string[];
  /** Human-readable list of what Neuron CANNOT do */
  permissionsDenied: string[];
  docsUrl?: string;
}

// ─── Connection State ──────────────────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "expired"
  | "syncing";

export interface IntegrationConnection {
  id: string;                     // uuid
  userId: string;
  providerId: string;
  status: ConnectionStatus;
  displayName: string;            // e.g. "avenash@gmail.com", "my-org/my-repo"
  accessToken?: string;           // encrypted at rest
  refreshToken?: string;
  tokenExpiresAt?: string;        // ISO
  scopes: string[];
  lastSyncAt: string | null;
  lastSyncStats?: SyncStats;
  syncCursor?: string;            // provider-specific cursor for incremental sync
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface SyncStats {
  newItems: number;
  modifiedItems: number;
  deletedItems: number;
  totalItems: number;
  durationMs: number;
  completedAt: string;
}

// ─── Universal Knowledge Item ──────────────────────────────────────────────

export type KnowledgeSourceType =
  // Code
  | "repository_file"
  | "repository_readme"
  | "issue"
  | "pull_request"
  | "commit"
  // Storage
  | "document"
  | "pdf"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "folder"
  // Notes
  | "page"
  | "database"
  | "block"
  // Messaging
  | "message"
  | "thread"
  | "channel"
  // Local
  | "local_file"
  // Neuron
  | "memory"
  | "collection"
  // Other
  | "unknown";

export type KnowledgeStorageMode = "local" | "cloud" | "hybrid";

export interface KnowledgeItem {
  id: string;
  userId: string;
  connectionId: string;
  sourceProvider: string;         // e.g. "github", "google_drive", "local"
  sourceType: KnowledgeSourceType;
  sourceId: string;               // provider-specific ID
  title: string;
  content: string;                // extracted/normalized text
  snippet: string;                // short excerpt for display
  metadata: Record<string, unknown>;
  url: string | null;             // external URL (open in browser)
  localPath: string | null;       // for local_file items
  contentHash: string;
  storageMode: KnowledgeStorageMode;
  syncStatus: "synced" | "pending" | "error";
  createdAt: string;
  updatedAt: string;
  indexedAt: string | null;
  // Retrieval scoring (populated at query time)
  score?: number;
  keywordScore?: number;
  semanticScore?: number;
  recencyScore?: number;
}

// ─── Source Connector Interface ────────────────────────────────────────────

export interface ConnectorSearchOptions {
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface ConnectorSearchResult {
  items: KnowledgeItem[];
  nextCursor?: string;
  totalEstimate?: number;
}

export interface ConnectorSyncResult {
  newItems: number;
  modifiedItems: number;
  deletedItems: number;
  nextCursor: string | null;
  errors: string[];
}

export interface ConnectorMetadata {
  providerId: string;
  connectionId: string;
  displayName: string;
  lastSyncAt: string | null;
  itemCount: number;
  capabilities: ConnectorCapability[];
}

/**
 * Every integration implements this interface.
 * The retrieval engine only ever talks to this interface.
 */
export interface SourceConnector {
  readonly providerId: string;
  readonly connectionId: string;

  /** Returns true if the connector is ready to serve requests */
  isReady(): boolean;

  /** Authenticate / refresh credentials */
  authenticate(credentials: Record<string, string>): Promise<void>;

  /** Revoke credentials and clean up */
  disconnect(): Promise<void>;

  /** Search for items matching the query */
  search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult>;

  /** Fetch a single document by its source ID */
  getDocument(sourceId: string): Promise<KnowledgeItem | null>;

  /** Incremental sync — only changed items since last cursor */
  sync(cursor?: string): Promise<ConnectorSyncResult>;

  /** Provider and connection metadata */
  getMetadata(): ConnectorMetadata;

  /** Human-readable description of what this connector can access */
  getCapabilities(): ConnectorCapability[];
}

// ─── Source Router ─────────────────────────────────────────────────────────

export type RoutingStrategy = "explicit" | "inferred" | "all";

export interface SourceRoute {
  providerIds: string[];
  strategy: RoutingStrategy;
  confidence: number;
  reasoning: string;
}

// ─── Retrieval Query ──────────────────────────────────────────────────────

export interface RetrievalQuery {
  raw: string;
  normalized: string;
  intent: "search" | "locate" | "explain" | "list" | "compare";
  sourceHints: string[];       // provider IDs hinted by the query
  typeHints: KnowledgeSourceType[];
  route: SourceRoute;
  limit: number;
}

// ─── Ranked Result ────────────────────────────────────────────────────────

export interface RankedResult {
  item: KnowledgeItem;
  totalScore: number;
  keywordScore: number;
  recencyScore: number;
  sourceRelevanceScore: number;
  isDuplicate: boolean;
  duplicateGroupId?: string;
}

export interface RetrievalOutput {
  query: RetrievalQuery;
  results: RankedResult[];
  sourceBreakdown: Record<string, number>;  // providerId → count
  searchedProviders: string[];
  failedProviders: { providerId: string; error: string }[];
  durationMs: number;
  contextChunks: ContextChunk[];
}

export interface ContextChunk {
  sourceId: string;
  providerId: string;
  title: string;
  content: string;
  url: string | null;
  score: number;
}

// ─── MCP Tool Definitions ─────────────────────────────────────────────────

export type MCPToolName =
  | "search_neuron"
  | "get_memory"
  | "get_document"
  | "search_collection"
  | "get_source"
  | "list_sources"
  | "create_memory"
  | "update_memory"
  | "delete_memory";

export interface MCPCapability {
  tool: MCPToolName;
  enabled: boolean;
  description: string;
}

export interface AIConnection {
  id: string;
  userId: string;
  name: string;                   // e.g. "Claude Desktop", "ChatGPT"
  type: "mcp" | "api_key" | "oauth";
  apiKey?: string;                // encrypted
  capabilities: MCPCapability[];
  allowedProviderIds: string[];   // which source connectors it can access
  allowLocalFiles: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

// ─── Audit Log ────────────────────────────────────────────────────────────

export type AuditEventType =
  | "search"
  | "sync"
  | "connect"
  | "disconnect"
  | "ai_access"
  | "export"
  | "delete";

export interface AuditLogEntry {
  id: string;
  userId: string;
  eventType: AuditEventType;
  actor: string;                  // "user" | AI connection name | "system"
  query?: string;
  providerIds?: string[];
  itemCount?: number;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
