import { beforeEach, describe, expect, it } from "vitest";
import { IntelligentModelRouter } from "../intelligentRouter";
import { ProviderRegistry } from "../providerRegistry";
import type { IProviderAdapter, ModelDefinition, ProviderAdapterConfig } from "../types";
import { CircuitBreaker } from "../circuitBreaker";

function createMockAdapter(
  provider: "ollama" | "openrouter" | "openai" | "gemini" | "anthropic",
  isConfigured: boolean,
  models: ModelDefinition[]
): IProviderAdapter {
  const cb = new CircuitBreaker(provider);
  return {
    provider,
    isConfigured,
    circuitBreaker: cb,
    config: {} as ProviderAdapterConfig,
    listModels: async () => models,
    getModelInfo: async (id: string) => models.find((m) => m.id === id) || null,
    chat: async () => {
      throw new Error("mock chat not implemented");
    },
    stream: async function* () {},
    healthCheck: async () => ({
      provider,
      healthy: isConfigured,
      configured: isConfigured,
      modelCount: models.length,
      circuitBreakerStatus: "closed",
      lastChecked: new Date().toISOString(),
    }),
  };
}

describe("IntelligentModelRouter", () => {
  let registry: ProviderRegistry;
  let router: IntelligentModelRouter;

  const localLlama: ModelDefinition = {
    id: "llama3.1",
    name: "Llama 3.1",
    provider: "ollama",
    capabilities: {
      text: true,
      vision: false,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 128000,
      local_or_cloud: "local",
    },
    available: true,
  };

  const localLlava: ModelDefinition = {
    id: "llava",
    name: "LlaVA Vision",
    provider: "ollama",
    capabilities: {
      text: true,
      vision: true,
      tool_calling: false,
      structured_output: true,
      streaming: true,
      context_window: 8192,
      local_or_cloud: "local",
    },
    available: true,
  };

  const cloudClaude: ModelDefinition = {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    capabilities: {
      text: true,
      vision: true,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 200000,
      local_or_cloud: "cloud",
    },
    available: true,
  };

  const cloudGpt: ModelDefinition = {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    capabilities: {
      text: true,
      vision: true,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 128000,
      local_or_cloud: "cloud",
    },
    available: true,
  };

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerAdapter("ollama", createMockAdapter("ollama", true, [localLlama, localLlava]));
    registry.registerAdapter("anthropic", createMockAdapter("anthropic", true, [cloudClaude]));
    registry.registerAdapter("openai", createMockAdapter("openai", true, [cloudGpt]));
    router = new IntelligentModelRouter(registry);
  });

  it("classifies task intents correctly", () => {
    expect(router.classifyTask([{ role: "user", content: "fix the syntax error in this typescript function" }])).toBe(
      "coding"
    );
    expect(
      router.classifyTask([{ role: "user", content: "click the start button and focus the explorer window" }])
    ).toBe("desktop_planning");
    expect(router.classifyTask([{ role: "user", content: "give me a brief summary of this document" }])).toBe(
      "summarization"
    );
    expect(
      router.classifyTask([
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", mimeType: "image/png", dataBase64: "xyz" },
          ],
        },
      ])
    ).toBe("vision");
  });

  it("strictly enforces LOCAL_ONLY policy by never returning a cloud model", async () => {
    const decision = await router.route({
      messages: [{ role: "user", content: "write python code" }],
      policy: "LOCAL_ONLY",
    });

    expect(decision.selectedModel.capabilities.local_or_cloud).toBe("local");
    expect(decision.selectedModel.provider).toBe("ollama");
    expect(decision.fallbackCandidates.every((c) => c.capabilities.local_or_cloud === "local")).toBe(true);
    expect(decision.metadata.policy).toBe("LOCAL_ONLY");
    expect(decision.metadata.selectedReason).toContain("LOCAL_ONLY");
  });

  it("rejects manual override that requests a cloud model under LOCAL_ONLY policy", async () => {
    await expect(
      router.route({
        messages: [{ role: "user", content: "hello" }],
        policy: "LOCAL_ONLY",
        model: "claude-3-5-sonnet",
      })
    ).rejects.toThrow(/Policy violation/);
  });

  it("enforces CLOUD_ONLY policy by never returning a local model", async () => {
    const decision = await router.route({
      messages: [{ role: "user", content: "general question" }],
      policy: "CLOUD_ONLY",
    });

    expect(decision.selectedModel.capabilities.local_or_cloud).toBe("cloud");
    expect(decision.fallbackCandidates.every((c) => c.capabilities.local_or_cloud === "cloud")).toBe(true);
  });

  it("filters candidate models by required capability (vision)", async () => {
    const decision = await router.route({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "inspect this" },
            { type: "image", mimeType: "image/png", dataBase64: "abc" },
          ],
        },
      ],
      policy: "LOCAL_ONLY",
    });

    // Between localLlama (no vision) and localLlava (vision), it must choose localLlava
    expect(decision.selectedModel.id).toBe("llava");
    expect(decision.selectedModel.capabilities.vision).toBe(true);
  });
});
