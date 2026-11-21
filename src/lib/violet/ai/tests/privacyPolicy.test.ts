import { describe, expect, it, vi } from "vitest";
import { AIAuditLogger } from "../auditLogger";
import { CircuitBreaker } from "../circuitBreaker";
import { ModelGateway } from "../modelGateway";
import { ProviderRegistry } from "../providerRegistry";
import type { IProviderAdapter, ModelDefinition, ProviderAdapterConfig } from "../types";

describe("Strict Privacy Policy Enforcement & Security Isolation", () => {
  const localModel: ModelDefinition = {
    id: "llama3",
    name: "Llama 3 Local",
    provider: "ollama",
    capabilities: {
      text: true,
      vision: true,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 8192,
      local_or_cloud: "local",
    },
    available: true,
  };

  const cloudModel: ModelDefinition = {
    id: "gpt-4o",
    name: "GPT-4o Cloud",
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

  it("never invokes cloud adapters when policy is LOCAL_ONLY, even when local execution fails", async () => {
    const registry = new ProviderRegistry();
    const auditLogger = new AIAuditLogger();

    const localChatSpy = vi.fn().mockRejectedValue(new Error("Local Ollama GPU out of memory"));
    const cloudChatSpy = vi.fn().mockResolvedValue({ content: "Cloud response" });

    const localAdapter: IProviderAdapter = {
      provider: "ollama",
      isConfigured: true,
      circuitBreaker: new CircuitBreaker("ollama"),
      config: {} as ProviderAdapterConfig,
      listModels: async () => [localModel],
      getModelInfo: async () => localModel,
      chat: localChatSpy,
      stream: async function* () {},
      healthCheck: async () => ({
        provider: "ollama",
        healthy: true,
        configured: true,
        modelCount: 1,
        circuitBreakerStatus: "closed",
        lastChecked: new Date().toISOString(),
      }),
    };

    const cloudAdapter: IProviderAdapter = {
      provider: "openai",
      isConfigured: true,
      circuitBreaker: new CircuitBreaker("openai"),
      config: {} as ProviderAdapterConfig,
      listModels: async () => [cloudModel],
      getModelInfo: async () => cloudModel,
      chat: cloudChatSpy,
      stream: async function* () {},
      healthCheck: async () => ({
        provider: "openai",
        healthy: true,
        configured: true,
        modelCount: 1,
        circuitBreakerStatus: "closed",
        lastChecked: new Date().toISOString(),
      }),
    };

    registry.registerAdapter("ollama", localAdapter);
    registry.registerAdapter("openai", cloudAdapter);

    const gateway = new ModelGateway(registry, auditLogger);

    await expect(
      gateway.chat({
        messages: [{ role: "user", content: "Process confidential tax document" }],
        policy: "LOCAL_ONLY",
      })
    ).rejects.toThrow(/ModelGateway execution failed/);

    // Verify: Local adapter was attempted
    expect(localChatSpy).toHaveBeenCalled();

    // CRITICAL SECURITY ASSERTION: Cloud adapter was NEVER called!
    expect(cloudChatSpy).not.toHaveBeenCalled();
  });

  it("fails gracefully with explanatory message when no local model exists under LOCAL_ONLY", async () => {
    const registry = new ProviderRegistry({ ollama: { enabled: false } });
    const auditLogger = new AIAuditLogger();

    // Only cloud adapter registered
    const cloudAdapter: IProviderAdapter = {
      provider: "openai",
      isConfigured: true,
      circuitBreaker: new CircuitBreaker("openai"),
      config: {} as ProviderAdapterConfig,
      listModels: async () => [cloudModel],
      getModelInfo: async () => cloudModel,
      chat: async () => {
        throw new Error("Should not be called");
      },
      stream: async function* () {},
      healthCheck: async () => ({
        provider: "openai",
        healthy: true,
        configured: true,
        modelCount: 1,
        circuitBreakerStatus: "closed",
        lastChecked: new Date().toISOString(),
      }),
    };

    registry.registerAdapter("openai", cloudAdapter);
    const gateway = new ModelGateway(registry, auditLogger);

    await expect(
      gateway.chat({
        messages: [{ role: "user", content: "Local private query" }],
        policy: "LOCAL_ONLY",
      })
    ).rejects.toThrow(/No local model available satisfying policy 'LOCAL_ONLY'/);
  });

  it("never leaks secret credentials in audit logs or responses", async () => {
    const registry = new ProviderRegistry();
    const auditLogger = new AIAuditLogger();

    const localAdapter: IProviderAdapter = {
      provider: "ollama",
      isConfigured: true,
      circuitBreaker: new CircuitBreaker("ollama"),
      config: { apiKey: "super-secret-api-token-should-never-leak" } as ProviderAdapterConfig,
      listModels: async () => [localModel],
      getModelInfo: async () => localModel,
      chat: async (req) => ({
        request_id: req.request_id || "req_test",
        provider: "ollama",
        model: "llama3",
        content: "Safe content",
        finish_reason: "stop",
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        latency_ms: 25,
        routing: {
          taskCategory: "general_chat",
          selectedReason: "local test",
          policy: "LOCAL_ONLY",
          mode: "auto",
          fallbackUsed: false,
        },
      }),
      stream: async function* () {},
      healthCheck: async () => ({
        provider: "ollama",
        healthy: true,
        configured: true,
        modelCount: 1,
        circuitBreakerStatus: "closed",
        lastChecked: new Date().toISOString(),
      }),
    };

    registry.registerAdapter("ollama", localAdapter);
    const gateway = new ModelGateway(registry, auditLogger);

    const res = await gateway.chat({
      messages: [{ role: "user", content: "my password is 1234" }],
      policy: "LOCAL_ONLY",
    });

    const serializedResponse = JSON.stringify(res);
    expect(serializedResponse).not.toContain("super-secret-api-token");

    const logs = auditLogger.getRecentLogs();
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain("super-secret-api-token");
    // Verify prompt content itself is not persisted in structured audit logs
    expect(serializedLogs).not.toContain("my password is 1234");
  });
});
