/**
 * VIOLET AI — Provider Registry
 *
 * Central registry managing all AI provider adapters, their lifecycle,
 * configuration, active catalog aggregation, and health checks.
 */

import { AnthropicAdapter } from "./adapters/anthropicAdapter";
import { GeminiAdapter } from "./adapters/geminiAdapter";
import { OllamaAdapter } from "./adapters/ollamaAdapter";
import { OpenAIAdapter } from "./adapters/openaiAdapter";
import { OpenRouterAdapter } from "./adapters/openrouterAdapter";
import type {
  AIProviderType,
  IProviderAdapter,
  ModelDefinition,
  ProviderAdapterConfig,
  ProviderHealth,
} from "./types";

export interface ProviderRegistryConfig {
  ollama?: ProviderAdapterConfig;
  openrouter?: ProviderAdapterConfig;
  openai?: ProviderAdapterConfig;
  gemini?: ProviderAdapterConfig;
  anthropic?: ProviderAdapterConfig;
}

export class ProviderRegistry {
  private adapters = new Map<AIProviderType, IProviderAdapter>();

  constructor(customConfigs?: ProviderRegistryConfig) {
    this.initializeDefaultAdapters(customConfigs);
  }

  private initializeDefaultAdapters(configs?: ProviderRegistryConfig): void {
    this.adapters.set("ollama", new OllamaAdapter(configs?.ollama));
    this.adapters.set("openrouter", new OpenRouterAdapter(configs?.openrouter));
    this.adapters.set("openai", new OpenAIAdapter(configs?.openai));
    this.adapters.set("gemini", new GeminiAdapter(configs?.gemini));
    this.adapters.set("anthropic", new AnthropicAdapter(configs?.anthropic));
  }

  getAdapter(provider: AIProviderType): IProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  registerAdapter(provider: AIProviderType, adapter: IProviderAdapter): void {
    this.adapters.set(provider, adapter);
  }

  getAllAdapters(): IProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getConfiguredProviders(): AIProviderType[] {
    return Array.from(this.adapters.entries())
      .filter(([_, adapter]) => adapter.isConfigured)
      .map(([provider]) => provider);
  }

  async listAllModels(): Promise<ModelDefinition[]> {
    const results: ModelDefinition[] = [];
    const adapters = this.getAllAdapters();

    // Fetch models in parallel across all adapters
    const promises = adapters.map(async (adapter) => {
      try {
        const models = await adapter.listModels();
        return models;
      } catch {
        return [];
      }
    });

    const lists = await Promise.all(promises);
    for (const list of lists) {
      results.push(...list);
    }

    return results;
  }

  async getModel(modelId: string, providerHint?: AIProviderType): Promise<ModelDefinition | null> {
    if (providerHint) {
      const adapter = this.adapters.get(providerHint);
      if (adapter) {
        return await adapter.getModelInfo(modelId);
      }
    }

    // Search across all adapters
    for (const adapter of this.adapters.values()) {
      const info = await adapter.getModelInfo(modelId);
      if (info) return info;
    }

    return null;
  }

  async checkAllHealth(): Promise<Record<AIProviderType, ProviderHealth>> {
    const healthMap: Partial<Record<AIProviderType, ProviderHealth>> = {};
    const promises = Array.from(this.adapters.entries()).map(async ([provider, adapter]) => {
      try {
        const health = await adapter.healthCheck();
        healthMap[provider] = health;
      } catch (err) {
        healthMap[provider] = {
          provider,
          healthy: false,
          configured: adapter.isConfigured,
          modelCount: 0,
          message: `Health probe threw: ${err instanceof Error ? err.message : String(err)}`,
          circuitBreakerStatus: "open",
          lastChecked: new Date().toISOString(),
        };
      }
    });

    await Promise.all(promises);
    return healthMap as Record<AIProviderType, ProviderHealth>;
  }
}

export const globalProviderRegistry = new ProviderRegistry();
