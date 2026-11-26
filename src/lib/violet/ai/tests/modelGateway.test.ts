import { beforeEach, describe, expect, it } from "vitest";
import { AIAuditLogger } from "../auditLogger";
import { ModelGateway } from "../modelGateway";
import { ProviderRegistry } from "../providerRegistry";
import type {
  IProviderAdapter,
  ModelDefinition,
  NormalizedChatResponse,
  ProviderAdapterConfig,
} from "../types";
import { CircuitBreaker } from "../circuitBreaker";

function createMockAdapter(
  provider: "ollama" | "openrouter" | "openai" | "gemini" | "anthropic",
  isConfigured: boolean,
  models: ModelDefinition[],
  chatHandler?: (model: string) => Promise<NormalizedChatResponse>
): IProviderAdapter {
  const cb = new CircuitBreaker(provider);
  return {
    provider,
    isConfigured,
    circuitBreaker: cb,
    config: {} as ProviderAdapterConfig,
    listModels: async () => models,
    getModelInfo: async (id: string) => models.find((m) => m.id === id) || null,
    chat: async (req) => {
      if (chatHandler) return chatHandler(req.model || "default");
      return {
        request_id: req.request_id || "req_1",
        provider,
        model: req.model || "default",
        content: `Response from ${provider}:${req.model}`,
        finish_reason: "stop",
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        latency_ms: 50,
        routing: {
          taskCategory: "general_chat",
          selectedReason: "test",
          policy: "AUTO",
          mode: "auto",
          fallbackUsed: false,
        },
      };
    },
    stream: async function* () {
      yield {
        request_id: "req_1",
        provider,
        model: "default",
        delta: "hello stream",
        finish_reason: "stop",
      };
    },
    healthCheck: async () => ({
      provider,
      healthy: true,
      configured: isConfigured,
      modelCount: models.length,
      circuitBreakerStatus: "closed",
      lastChecked: new Date().toISOString(),
    }),
  };
}

describe("ModelGateway", () => {
  let registry: ProviderRegistry;
  let auditLogger: AIAuditLogger;
  let gateway: ModelGateway;

  const llamaModel: ModelDefinition = {
    id: "llama3",
    name: "Llama 3",
    provider: "ollama",
    capabilities: {
      text: true,
      vision: false,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 8192,
      local_or_cloud: "local",
    },
    available: true,
  };

  const claudeModel: ModelDefinition = {
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

  const gptModel: ModelDefinition = {
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
    auditLogger = new AIAuditLogger();
  });

  it("executes primary candidate successfully on normal path", async () => {
    registry.registerAdapter("ollama", createMockAdapter("ollama", true, [llamaModel]));
    registry.registerAdapter("anthropic", createMockAdapter("anthropic", true, [claudeModel]));
    gateway = new ModelGateway(registry, auditLogger);

    const res = await gateway.chat({
      messages: [{ role: "user", content: "hello" }],
      policy: "LOCAL_ONLY",
    });

    expect(res.provider).toBe("ollama");
    expect(res.model).toBe("llama3");
    expect(res.routing.fallbackUsed).toBe(false);

    const recentLogs = auditLogger.getRecentLogs();
    expect(recentLogs.length).toBe(1);
    expect(recentLogs[0].status).toBe("success");
    expect(recentLogs[0].provider).toBe("ollama");
  });

  it("automatically fails over to fallback candidate if primary candidate fails", async () => {
    let anthropicCalled = false;
    let openaiCalled = false;

    registry.registerAdapter(
      "anthropic",
      createMockAdapter("anthropic", true, [claudeModel], async () => {
        anthropicCalled = true;
        throw new Error("HTTP 429: Rate limit exceeded");
      })
    );

    registry.registerAdapter(
      "openai",
      createMockAdapter("openai", true, [gptModel], async (m) => {
        openaiCalled = true;
        return {
          request_id: "req_fallback",
          provider: "openai",
          model: m,
          content: "Fallback response from OpenAI",
          finish_reason: "stop",
          usage: { prompt_tokens: 15, completion_tokens: 15, total_tokens: 30 },
          latency_ms: 120,
          routing: {
            taskCategory: "coding",
            selectedReason: "fallback",
            policy: "CLOUD_ONLY",
            mode: "auto",
            fallbackUsed: true,
          },
        };
      })
    );

    gateway = new ModelGateway(registry, auditLogger);

    const res = await gateway.chat({
      messages: [{ role: "user", content: "write python code" }],
      policy: "CLOUD_ONLY",
    });

    expect(anthropicCalled).toBe(true);
    expect(openaiCalled).toBe(true);
    expect(res.provider).toBe("openai");
    expect(res.model).toBe("gpt-4o");
    expect(res.routing.fallbackUsed).toBe(true);
    expect(res.routing.originalModel).toBe("claude-3-5-sonnet");
  });

  it("updates and persists user preferences", () => {
    registry.registerAdapter("ollama", createMockAdapter("ollama", true, [llamaModel]));
    gateway = new ModelGateway(registry, auditLogger);

    const updated = gateway.setUserPreferences({
      privacyPolicy: "LOCAL_ONLY",
      costPreference: "minimize_cost",
    });

    expect(updated.privacyPolicy).toBe("LOCAL_ONLY");
    expect(updated.costPreference).toBe("minimize_cost");
    expect(gateway.getUserPreferences().privacyPolicy).toBe("LOCAL_ONLY");
  });
});
