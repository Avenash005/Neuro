import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicAdapter } from "../adapters/anthropicAdapter";

describe("AnthropicAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("extracts system prompt to top-level property and parses tool_use response", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "sk-ant-test-key" });

    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          content: [
            { type: "text", text: "Planning the command:" },
            {
              type: "tool_use",
              id: "toolu_01",
              name: "run_command",
              input: { command: "dir" },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 30, output_tokens: 40 },
        }),
      } as Response;
    });

    const res = await adapter.chat({
      messages: [
        { role: "system", content: "You are an OS agent." },
        { role: "user", content: "list files" },
      ],
      model: "claude-3-5-sonnet-20241022",
    });

    expect(capturedBody.system).toBe("You are an OS agent.");
    expect(res.provider).toBe("anthropic");
    expect(res.finish_reason).toBe("tool_calls");
    expect(res.content).toBe("Planning the command:");
    expect(res.tool_calls?.[0].name).toBe("run_command");
    expect(res.tool_calls?.[0].arguments).toEqual({ command: "dir" });
    expect(res.usage.total_tokens).toBe(70);
  });
});
