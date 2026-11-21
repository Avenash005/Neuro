import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiAdapter } from "../adapters/geminiAdapter";

describe("GeminiAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("formats multimodal parts and parses candidate text", async () => {
    const adapter = new GeminiAdapter({ apiKey: "test-gemini-key" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "I see a screenshot of Windows desktop with taskbar." }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20, totalTokenCount: 70 },
      }),
    } as Response);

    const res = await adapter.chat({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is on the screen?" },
            { type: "image", mimeType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUg==" },
          ],
        },
      ],
      model: "gemini-2.0-flash",
    });

    expect(res.provider).toBe("gemini");
    expect(res.model).toBe("gemini-2.0-flash");
    expect(res.content).toContain("Windows desktop");
    expect(res.usage.total_tokens).toBe(70);
  });

  it("handles Gemini functionCall response", async () => {
    const adapter = new GeminiAdapter({ apiKey: "test-gemini-key" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "desktop_inspect",
                    args: { window_title: "Notepad" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    } as Response);

    const res = await adapter.chat({
      messages: [{ role: "user", content: "inspect notepad" }],
      tools: [
        {
          type: "function",
          function: {
            name: "desktop_inspect",
            description: "Inspect window",
            parameters: {
              type: "object",
              properties: { window_title: { type: "string" } },
            },
          },
        },
      ],
    });

    expect(res.finish_reason).toBe("tool_calls");
    expect(res.tool_calls?.[0].name).toBe("desktop_inspect");
    expect(res.tool_calls?.[0].arguments).toEqual({ window_title: "Notepad" });
  });
});
