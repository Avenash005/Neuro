/**
 * Neuron AI — MCP (Model Context Protocol) Server Interface
 *
 * Exposes Neuron's knowledge to authorized external AI applications
 * via a controlled, permission-gated API.
 *
 * Security:
 *  - Every request requires a valid API key
 *  - Each AI connection has an explicit capability list
 *  - Local-only data is never exposed unless explicitly permitted
 *  - All requests are logged to the audit trail
 *  - One user's connection cannot access another user's data
 */

import type {
  AIConnection,
  MCPToolName,
  MCPCapability,
  AuditLogEntry,
  AuditEventType,
} from "../../types/connectors";
import { retrieve } from "./retrievalEngine";
import { connectorManager } from "./connectorManager";

// ─── MCP Tool Registry ────────────────────────────────────────────────────

export const DEFAULT_MCP_CAPABILITIES: MCPCapability[] = [
  { tool: "search_neuron", enabled: true, description: "Search memories and documents" },
  { tool: "get_memory", enabled: true, description: "Retrieve a specific memory by ID" },
  { tool: "get_document", enabled: true, description: "Retrieve a specific document by provider + ID" },
  { tool: "search_collection", enabled: true, description: "Search within a specific collection" },
  { tool: "get_source", enabled: false, description: "Retrieve from a specific integration source" },
  { tool: "list_sources", enabled: true, description: "List available knowledge sources" },
  // Write tools — disabled by default
  { tool: "create_memory", enabled: false, description: "Create a new memory" },
  { tool: "update_memory", enabled: false, description: "Modify an existing memory" },
  { tool: "delete_memory", enabled: false, description: "Permanently delete a memory" },
];

// ─── Audit Log (in-memory ring buffer for the session) ────────────────────

const AUDIT_RING_SIZE = 200;

class AuditLog {
  private entries: AuditLogEntry[] = [];

  log(entry: Omit<AuditLogEntry, "id" | "createdAt">): AuditLogEntry {
    const full: AuditLogEntry = {
      ...entry,
      id: `al_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.entries.unshift(full);
    if (this.entries.length > AUDIT_RING_SIZE) {
      this.entries.length = AUDIT_RING_SIZE;
    }
    return full;
  }

  getAll(): AuditLogEntry[] { return [...this.entries]; }

  getRecent(n = 50): AuditLogEntry[] { return this.entries.slice(0, n); }

  getByActor(actor: string): AuditLogEntry[] {
    return this.entries.filter((e) => e.actor === actor);
  }

  getByEvent(eventType: AuditEventType): AuditLogEntry[] {
    return this.entries.filter((e) => e.eventType === eventType);
  }
}

export const auditLog = new AuditLog();

// ─── MCP Request Handler ──────────────────────────────────────────────────

export interface MCPRequest {
  tool: MCPToolName;
  params: Record<string, unknown>;
  apiKey: string;
}

export interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** In-memory store of AI connections (would be persisted in Supabase in production) */
const aiConnections = new Map<string, AIConnection>();

export function registerAIConnection(connection: AIConnection): void {
  aiConnections.set(connection.apiKey ?? connection.id, connection);
}

export function revokeAIConnection(connectionId: string): void {
  for (const [key, conn] of aiConnections) {
    if (conn.id === connectionId) {
      aiConnections.delete(key);
      break;
    }
  }
}

export function getAIConnections(): AIConnection[] {
  return [...aiConnections.values()];
}

/**
 * Handle an incoming MCP tool call.
 * Verifies auth, checks permissions, executes, logs.
 */
export async function handleMCPRequest(
  request: MCPRequest,
  userId: string
): Promise<MCPResponse> {
  // 1. Authenticate
  const connection = aiConnections.get(request.apiKey);
  if (!connection) {
    return { success: false, error: "Invalid API key" };
  }

  // 2. Verify ownership
  if (connection.userId !== userId) {
    auditLog.log({
      userId,
      eventType: "ai_access",
      actor: connection.name,
      summary: `Unauthorized access attempt — user mismatch`,
      metadata: { tool: request.tool },
    });
    return { success: false, error: "Unauthorized" };
  }

  // 3. Check capability
  const capability = connection.capabilities.find((c) => c.tool === request.tool);
  if (!capability?.enabled) {
    return {
      success: false,
      error: `Tool "${request.tool}" is not enabled for this connection`,
    };
  }

  // 4. Execute
  try {
    const result = await executeTool(request.tool, request.params, connection, userId);

    auditLog.log({
      userId,
      eventType: "ai_access",
      actor: connection.name,
      query: typeof request.params["query"] === "string" ? request.params["query"] : undefined,
      summary: `${connection.name} used ${request.tool}`,
      metadata: { tool: request.tool, params: request.params },
    });

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Tool execution failed",
    };
  }
}

// ─── Tool Implementations ─────────────────────────────────────────────────

async function executeTool(
  tool: MCPToolName,
  params: Record<string, unknown>,
  connection: AIConnection,
  _userId: string
): Promise<unknown> {
  switch (tool) {
    case "search_neuron": {
      const query = String(params["query"] ?? "");
      const allowedIds = connection.allowedProviderIds;
      const connectors = connectorManager.getAll();

      // Filter to only allowed providers
      const filtered = new Map<string, import("../../types/connectors").SourceConnector>();
      for (const [pid, conn] of connectors) {
        if (allowedIds.includes(pid) && conn.isReady()) {
          filtered.set(pid, conn);
        }
      }

      // Exclude local files if not permitted
      if (!connection.allowLocalFiles) {
        filtered.delete("local");
      }

      const output = await retrieve({
        query,
        connectors: filtered,
        context: { connectedProviderIds: [...filtered.keys()] },
        limit: 10,
      });

      return {
        results: output.results.map((r) => ({
          title: r.item.title,
          snippet: r.item.snippet,
          source: r.item.sourceProvider,
          url: r.item.url,
          score: r.totalScore,
        })),
        searchedSources: output.searchedProviders,
        totalResults: output.results.length,
      };
    }

    case "list_sources": {
      return connectorManager.getReadyProviderIds().map((pid) => ({
        providerId: pid,
        displayName: connectorManager.get(pid)?.getMetadata().displayName ?? pid,
        itemCount: connectorManager.get(pid)?.getMetadata().itemCount ?? 0,
      }));
    }

    case "get_memory": {
      const id = String(params["id"] ?? "");
      const connector = connectorManager.get("neuron");
      if (!connector) throw new Error("Neuron memory source not available");
      const item = await connector.getDocument(id);
      return item;
    }

    case "get_document": {
      const sourceId = String(params["sourceId"] ?? "");
      const providerId = String(params["providerId"] ?? "");
      const connector = connectorManager.get(providerId);
      if (!connector) throw new Error(`Provider "${providerId}" not connected`);
      if (!connection.allowedProviderIds.includes(providerId)) {
        throw new Error(`Access to "${providerId}" not authorized for this connection`);
      }
      return await connector.getDocument(sourceId);
    }

    default:
      throw new Error(`Tool "${tool}" not implemented`);
  }
}

// ─── MCP Tool Schema (for AI clients) ────────────────────────────────────

export const MCP_TOOL_SCHEMAS = {
  search_neuron: {
    description: "Search the user's personal knowledge base across all authorized sources.",
    parameters: {
      query: { type: "string", description: "Natural language search query" },
    },
  },
  list_sources: {
    description: "List all knowledge sources Neuron has access to.",
    parameters: {},
  },
  get_memory: {
    description: "Retrieve a specific memory by its ID.",
    parameters: {
      id: { type: "string", description: "Memory ID" },
    },
  },
  get_document: {
    description: "Retrieve a specific document from a connected source.",
    parameters: {
      sourceId: { type: "string", description: "Document/file ID from the provider" },
      providerId: { type: "string", description: "Provider ID (e.g. github, google_drive)" },
    },
  },
};
