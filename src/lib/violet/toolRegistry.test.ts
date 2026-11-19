import { describe, expect, it, vi } from "vitest";
import { VioletToolRegistry } from "./toolRegistry";
import { createDefaultToolRegistry } from "./builtInTools";
import type { VioletToolContext, VioletToolManifest } from "../../types/violet";
import { VioletLocalAgentClient } from "./localAgentClient";

const sampleManifest: VioletToolManifest = {
  name: "files.list",
  version: "1.0.0",
  domain: "computer",
  description: "List an approved folder",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  requiredScopes: ["computer:files:read"],
  risk: "read_only",
  platforms: ["windows"],
  timeoutMs: 5000,
  supportsIdempotency: true,
  enabled: true,
};

const dummyContext: VioletToolContext = {
  taskId: "t1",
  stepId: "s1",
  userId: "u1",
};

describe("VioletToolRegistry", () => {
  it("registers and retrieves tools", () => {
    const registry = new VioletToolRegistry();
    registry.register(sampleManifest);
    expect(registry.get("files.list")?.domain).toBe("computer");
  });

  it("rejects duplicate tool names", () => {
    const registry = new VioletToolRegistry();
    registry.register(sampleManifest);
    expect(() => registry.register(sampleManifest)).toThrow("already registered");
  });

  it("filters tools by enabled state and granted scopes", () => {
    const registry = new VioletToolRegistry();
    registry.register(sampleManifest);
    registry.register({
      ...sampleManifest,
      name: "files.delete",
      risk: "destructive",
      requiredScopes: ["computer:files:delete"],
    });
    registry.register({
      ...sampleManifest,
      name: "files.search",
      enabled: false,
    });
    expect(registry.listAvailable(["computer:files:read"]).map((t) => t.name)).toEqual(["files.list"]);
  });

  it("supports unregistering tools", () => {
    const registry = new VioletToolRegistry();
    registry.register(sampleManifest);
    expect(registry.unregister("files.list")).toBe(true);
    expect(registry.get("files.list")).toBeUndefined();
  });

  it("executes registered tool handler and returns result", async () => {
    const registry = new VioletToolRegistry();
    registry.register(sampleManifest, async (args) => ({
      status: "succeeded",
      data: { count: 3, path: args.path },
      evidence: [],
      summary: "Listed 3 files",
      recoverable: false,
    }));

    const result = await registry.execute("files.list", { path: "C:/docs" }, dummyContext);
    expect(result.status).toBe("succeeded");
    expect(result.summary).toBe("Listed 3 files");
  });

  it("handles missing tool execution gracefully", async () => {
    const registry = new VioletToolRegistry();
    const result = await registry.execute("non_existent", {}, dummyContext);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("TOOL_NOT_FOUND");
  });

  it("handles disabled tools gracefully", async () => {
    const registry = new VioletToolRegistry();
    registry.register({ ...sampleManifest, enabled: false }, async () => ({
      status: "succeeded",
      evidence: [],
      summary: "ok",
      recoverable: false,
    }));
    const result = await registry.execute("files.list", {}, dummyContext);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("TOOL_DISABLED");
  });

  it("enforces tool execution timeouts", async () => {
    const registry = new VioletToolRegistry();
    const shortTimeoutManifest: VioletToolManifest = {
      ...sampleManifest,
      timeoutMs: 50,
    };
    registry.register(shortTimeoutManifest, async (_args, ctx) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        ctx.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
      return { status: "succeeded", summary: "done", evidence: [], recoverable: false };
    });

    const result = await registry.execute("files.list", {}, dummyContext);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(result.recoverable).toBe(true);
  });
});

describe("createDefaultToolRegistry", () => {
  it("registers system.ping and executes it", async () => {
    const registry = createDefaultToolRegistry();
    const ping = registry.get("system.ping");
    expect(ping).toBeDefined();

    const result = await registry.execute("system.ping", {}, dummyContext);
    expect(result.status).toBe("succeeded");
    expect(result.summary).toContain("System is responsive");
  });

  it("wires computer tools to local agent client", async () => {
    const mockAgent = {
      health: vi.fn(),
      getCapabilities: vi.fn(),
      listFiles: vi.fn().mockResolvedValue([{ name: "test.py", path: "C:/test.py", kind: "file" }]),
      readTextFile: vi.fn().mockResolvedValue("print('hello')"),
      createTextFile: vi.fn().mockResolvedValue({ created: true, path: "C:/out.txt" }),
      captureScreen: vi.fn().mockResolvedValue({ mimeType: "image/jpeg", byteLength: 4096 }),
      runNamedCommand: vi.fn().mockResolvedValue({ command_id: "py", returncode: 0, stdout: "ok", stderr: "" }),
    } as unknown as VioletLocalAgentClient;

    const registry = createDefaultToolRegistry({ localAgentClient: mockAgent });

    const listRes = await registry.execute("computer.files.list", { path: "C:/repo" }, dummyContext);
    expect(listRes.status).toBe("succeeded");
    expect(listRes.summary).toContain("Listed 1 items");

    const readRes = await registry.execute("computer.files.read", { path: "C:/test.py" }, dummyContext);
    expect(readRes.status).toBe("succeeded");
    expect(readRes.summary).toContain("Read 14 characters");
  });
});
