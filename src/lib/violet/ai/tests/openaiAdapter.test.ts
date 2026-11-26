import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIAdapter } from "../adapters/openaiAdapter";

describe("OpenAIAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handles chat completion with tool calling", async () => {
    const adapter = new OpenAIAdapter({ apiKey: "sk-test-openai" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_abc",
                  function: {
                    name: "launch_app",
                    arguments: JSON.stringify({ app_name: "notepad.exe" }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
      }),
    } as Response);

    const res = await adapter.chat({
      messages: [{ role: "user", content: "open notepad" }],
      model: "gpt-4o",
    });

    expect(res.provider).toBe("openai");
    expect(res.model).toBe("gpt-4o");
    expect(res.finish_reason).toBe("tool_calls");
    expect(res.tool_calls?.[0].name).toBe("launch_app");
  });

  it("retries on transient 503 error and succeeds on subsequent attempt", async () => {
    const adapter = new OpenAIAdapter({ apiKey: "sk-test-openai", maxRetries: 2 });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          text: async () => "Temporary Overload",
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Recovered successfully" } }],
          usage: { total_tokens: 10 },
        }),
      } as Response;
    });

    const res = await adapter.chat({
      messages: [{ role: "user", content: "test retry" }],
    });

    expect(callCount).toBe(2);
    expect(res.content).toBe("Recovered successfully");
  });
});
