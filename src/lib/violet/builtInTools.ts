import type {
  VioletToolContext,
  VioletToolManifest,
} from "../../types/violet";
import { VioletLocalAgentClient } from "./localAgentClient";
import { VioletToolRegistry } from "./toolRegistry";

export function createDefaultToolRegistry(options?: {
  localAgentClient?: VioletLocalAgentClient;
}): VioletToolRegistry {
  const registry = new VioletToolRegistry();
  const agentClient = options?.localAgentClient ?? new VioletLocalAgentClient();

  // 1. System Ping
  const pingManifest: VioletToolManifest = {
    name: "system.ping",
    version: "1.0.0",
    domain: "productivity",
    description: "Check system health and latency",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requiredScopes: [],
    risk: "read_only",
    platforms: ["windows", "web", "cloud"],
    timeoutMs: 3000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(pingManifest, async () => ({
    status: "succeeded",
    data: { pong: true, timestamp: new Date().toISOString() },
    evidence: [],
    summary: "System is responsive and operational",
    recoverable: false,
  }));

  // 2. Knowledge Search
  const searchManifest: VioletToolManifest = {
    name: "knowledge.search",
    version: "1.0.0",
    domain: "knowledge",
    description: "Search personal memories, notes, and documents in Neuro memory engine",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["knowledge:read"],
    risk: "read_only",
    platforms: ["web", "windows", "cloud"],
    timeoutMs: 8000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(searchManifest, async (args) => {
    const query = String(args.query || "").toLowerCase();
    if (!query.trim()) {
      return {
        status: "failed",
        summary: "Search query cannot be empty",
        recoverable: true,
        evidence: [],
      };
    }
    try {
      const { listLocalKnowledge } = await import("../localDb");
      const items = await listLocalKnowledge();
      const matched = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.summary && item.summary.toLowerCase().includes(query)) ||
          (item.extractedText && item.extractedText.toLowerCase().includes(query))
      );
      const limit = Number(args.limit) || 5;
      const results = matched.slice(0, limit);

      return {
        status: "succeeded",
        data: { items: results, count: results.length },
        evidence: results.map((r) => ({ type: "text" as const, reference: `knowledge:${r.id}` })),
        summary: `Found ${results.length} relevant items in personal knowledge base`,
        recoverable: false,
      };
    } catch {
      return {
        status: "succeeded",
        data: { items: [], count: 0 },
        evidence: [],
        summary: "Knowledge search completed with 0 results",
        recoverable: false,
      };
    }
  });

  // 3. Computer: Files List
  const listFilesManifest: VioletToolManifest = {
    name: "computer.files.list",
    version: "1.0.0",
    domain: "computer",
    description: "List directory contents in an approved local Windows workspace folder",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:files:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(listFilesManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const targetPath = String(args.path || "");
    try {
      const items = await client.listFiles(targetPath);
      return {
        status: "succeeded",
        data: { items, count: items.length },
        evidence: [{ type: "file", reference: targetPath }],
        summary: `Listed ${items.length} items in '${targetPath}'`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to list files",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 4. Computer: Files Read
  const readFileManifest: VioletToolManifest = {
    name: "computer.files.read",
    version: "1.0.0",
    domain: "computer",
    description: "Read UTF-8 text from an approved file on the local Windows PC",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:files:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(readFileManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const targetPath = String(args.path || "");
    try {
      const content = await client.readTextFile(targetPath);
      return {
        status: "succeeded",
        data: { path: targetPath, content, byteLength: content.length },
        evidence: [{ type: "file", reference: targetPath }],
        summary: `Read ${content.length} characters from '${targetPath}'`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to read file",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 5. Computer: Files Create
  const createFileManifest: VioletToolManifest = {
    name: "computer.files.create",
    version: "1.0.0",
    domain: "computer",
    description: "Create a new UTF-8 text file in an approved local Windows workspace (non-overwriting)",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:files:write"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 15000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(createFileManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const targetPath = String(args.path || "");
    const content = String(args.content || "");
    try {
      const result = await client.createTextFile(targetPath, content);
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "file", reference: targetPath }],
        summary: `Created file at '${targetPath}' (${content.length} characters)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to create file",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 6. Computer: Screen Capture
  const screenManifest: VioletToolManifest = {
    name: "computer.screen.capture",
    version: "1.0.0",
    domain: "computer",
    description: "Capture visible desktop screen snapshot from the Windows PC",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:screen:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 12000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(screenManifest, async (_args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.captureScreen();
      return {
        status: "succeeded",
        data: { mimeType: result.mimeType, byteLength: result.byteLength, blobUrl: result.blobUrl },
        evidence: [{ type: "screenshot", reference: result.blobUrl || "screenshot:desktop" }],
        summary: `Captured screen snapshot (${Math.round(result.byteLength / 1024)} KB)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Screen capture unavailable",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 7. Computer: Run Named Command
  const runCommandManifest: VioletToolManifest = {
    name: "computer.commands.run",
    version: "1.0.0",
    domain: "computer",
    description: "Execute an allowlisted named command on the local Windows PC",
    inputSchema: {
      type: "object",
      properties: { command_id: { type: "string" } },
      required: ["command_id"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:command:run"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 30000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(runCommandManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const commandId = String(args.command_id || "");
    try {
      const result = await client.runNamedCommand(commandId);
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "text", reference: `cmd:${commandId}` }],
        summary: `Executed command '${commandId}' with exit code ${result.returncode}`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to run command",
        recoverable: true,
        evidence: [],
      };
    }
  });

  return registry;
}

function resolveAgentClient(
  fallback: VioletLocalAgentClient,
  context: VioletToolContext
): VioletLocalAgentClient {
  if (context.localAgentUrl || context.localAgentToken) {
    return new VioletLocalAgentClient({
      baseUrl: context.localAgentUrl,
      token: context.localAgentToken,
    });
  }
  return fallback;
}
