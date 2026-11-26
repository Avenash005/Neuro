import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterAdapter } from "../adapters/openrouterAdapter";

describe("OpenRouterAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports unconfigured when API key is missing", () => {
    const adapter = new OpenRouterAdapter({ apiKey: "" });
    expect(adapter.isConfigured).toBe(false);
  });

  it("reports configured when API key is provided", () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-test-key" });
    expect(adapter.isConfigured).toBe(true);
  });

  it("executes chat completion and normalizes tool calls", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-test-key" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  function: {
                    name: "computer_click",
                    arguments: JSON.stringify({ x: 100, y: 200 }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
      }),
    } as Response);

    const res = await adapter.chat({
      messages: [{ role: "user", content: "click the button" }],
      model: "anthropic/claude-3.5-sonnet",
    });

    expect(res.provider).toBe("openrouter");
    expect(res.finish_reason).toBe("tool_calls");
    expect(res.tool_calls?.length).toBe(1);
    expect(res.tool_calls?.[0].name).toBe("computer_click");
    expect(res.tool_calls?.[0].arguments).toEqual({ x: 100, y: 200 });
  });

  it("streams Server-Sent Events (SSE) and handles [DONE]", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-test-key" });

    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ];

    let index = 0;
    const mockStream = {
      getReader: () => ({
        read: async () => {
          if (index < sseLines.length) {
            const chunk = new TextEncoder().encode(sseLines[index++]);
            return { done: false, value: chunk };
          }
          return { done: true, value: undefined };
        },
        releaseLock: () => {},
      }),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    } as unknown as Response);

    const chunks = [];
    for await (const chunk of adapter.stream({
      messages: [{ role: "user", content: "hello" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0].delta).toBe("Hello");
    expect(chunks[1].delta).toBe(" world");
    expect(chunks[2].finish_reason).toBe("stop");
  });
});
