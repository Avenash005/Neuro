import { describe, expect, it } from "vitest";
import { evaluateVioletTool } from "./policy";
import type { VioletToolManifest } from "../../types/violet";

const baseTool: VioletToolManifest = {
  name: "browser.navigate",
  version: "1.0.0",
  domain: "browser",
  description: "Navigate to a URL",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  requiredScopes: ["browser:navigate"],
  risk: "read_only",
  platforms: ["windows"],
  timeoutMs: 10_000,
  supportsIdempotency: true,
  enabled: true,
};

describe("evaluateVioletTool", () => {
  it("rejects disabled VIOLET", () => {
    expect(evaluateVioletTool(baseTool, { enabled: false, grantedScopes: ["browser:navigate"] }).allowed).toBe(false);
  });

  it("rejects missing scopes", () => {
    expect(evaluateVioletTool(baseTool, { enabled: true, grantedScopes: [] }).allowed).toBe(false);
  });

  it("allows scoped read-only tools without approval", () => {
    const result = evaluateVioletTool(baseTool, { enabled: true, grantedScopes: ["browser:navigate"] });
    expect(result).toMatchObject({ allowed: true, requiresApproval: false });
  });

  it("requires approval for external side effects", () => {
    const tool = { ...baseTool, name: "messaging.send", risk: "external_side_effect" as const };
    const result = evaluateVioletTool(tool, { enabled: true, grantedScopes: ["browser:navigate"] });
    expect(result).toMatchObject({ allowed: true, requiresApproval: true });
  });

  it("allows an explicitly approved exact operation", () => {
    const tool = { ...baseTool, risk: "financial" as const };
    const result = evaluateVioletTool(tool, {
      enabled: true,
      grantedScopes: ["browser:navigate"],
      userApprovedThisAction: true,
    });
    expect(result).toMatchObject({ allowed: true, requiresApproval: false });
  });
});
