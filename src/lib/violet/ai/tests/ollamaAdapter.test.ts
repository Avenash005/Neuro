import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaAdapter } from "../adapters/ollamaAdapter";

describe("OllamaAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("isConfigured is true by default without requiring an API key", () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://127.0.0.1:11434" });
    expect(adapter.isConfigured).toBe(true);
    expect(adapter.provider).toBe("ollama");
  });

  it("infers local vision and tool-calling capabilities accurately", async () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://127.0.0.1:11434" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: "llama3.1:8b", details: { parameter_size: "8B" } },
          { name: "llava:13b", details: { parameter_size: "13B" } },
        ],
      }),
    } as Response);

    const models = await adapter.listModels();
    expect(models.length).toBe(2);

    const llama = models.find((m) => m.name === "llama3.1:8b");
    expect(llama?.capabilities.local_or_cloud).toBe("local");
    expect(llama?.capabilities.tool_calling).toBe(true);
    expect(llama?.capabilities.context_window).toBe(128000);

    const llava = models.find((m) => m.name === "llava:13b");
    expect(llava?.capabilities.vision).toBe(true);
  });

  it("handles offline daemon gracefully in health check", async () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://127.0.0.1:9999" });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.configured).toBe(true);
    expect(health.message).toContain("offline or unreachable");
  });

  it("executes chat completion and normalizes response", async () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://127.0.0.1:11434" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: "assistant", content: "Hello from local Ollama" },
        prompt_eval_count: 15,
        eval_count: 25,
      }),
    } as Response);

    const res = await adapter.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "llama3",
    });

    expect(res.provider).toBe("ollama");
    expect(res.model).toBe("llama3");
    expect(res.content).toBe("Hello from local Ollama");
    expect(res.finish_reason).toBe("stop");
    expect(res.usage.total_tokens).toBe(40);
  });

  it("streams NDJSON chunks and emits finished stream", async () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://127.0.0.1:11434" });

    const streamData = [
      JSON.stringify({ message: { content: "Part 1 " }, done: false }) + "\n",
      JSON.stringify({ message: { content: "Part 2" }, done: true, prompt_eval_count: 5, eval_count: 10 }) + "\n",
    ];

    let index = 0;
    const mockStream = {
      getReader: () => ({
        read: async () => {
          if (index < streamData.length) {
            const chunk = new TextEncoder().encode(streamData[index++]);
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
      messages: [{ role: "user", content: "stream me" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0].delta).toBe("Part 1 ");
    expect(chunks[1].delta).toBe("Part 2");
    expect(chunks[2].finish_reason).toBe("stop");
    expect(chunks[2].usage?.total_tokens).toBe(15);
  });
});
