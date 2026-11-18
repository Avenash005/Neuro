import { describe, expect, it } from "vitest";
import { VioletToolRegistry } from "./toolRegistry";
import type { VioletToolManifest } from "../../types/violet";

const manifest: VioletToolManifest = {
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

describe("VioletToolRegistry", () => {
  it("registers and retrieves tools", () => {
    const registry = new VioletToolRegistry();
    registry.register(manifest);
    expect(registry.get("files.list")?.domain).toBe("computer");
  });

  it("rejects duplicate tool names", () => {
    const registry = new VioletToolRegistry();
    registry.register(manifest);
    expect(() => registry.register(manifest)).toThrow("already registered");
  });

  it("filters tools by enabled state and granted scopes", () => {
    const registry = new VioletToolRegistry();
    registry.register(manifest);
    registry.register({ ...manifest, name: "files.delete", risk: "destructive" });
    expect(registry.listAvailable(["computer:files:read"]).map((tool) => tool.name)).toEqual(["files.list"]);
  });

  it("supports unregistering tools", () => {
    const registry = new VioletToolRegistry();
    registry.register(manifest);
    expect(registry.unregister("files.list")).toBe(true);
    expect(registry.get("files.list")).toBeUndefined();
  });
});
