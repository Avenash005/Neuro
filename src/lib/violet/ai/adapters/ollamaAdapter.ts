/**
 * VIOLET AI — Ollama Local Provider Adapter
 *
 * Implements local inference using Ollama's HTTP REST API.
 * Guarantees zero data egress: requests are strictly confined to localhost.
 */

import { BaseAdapter } from "./baseAdapter";
import type {
  ChatRequest,
  ModelCapabilities,
  ModelDefinition,
  NormalizedChatResponse,
  NormalizedStreamChunk,
  ProviderAdapterConfig,
  ProviderHealth,
  ToolCall,
} from "../types";

export interface OllamaModelTag {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export class OllamaAdapter extends BaseAdapter {
  private readonly baseUrl: string;
  private cachedModels: ModelDefinition[] = [];
  private lastModelFetch = 0;

  constructor(config?: ProviderAdapterConfig) {
    super("ollama", config || {});
    this.baseUrl = (this.config.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
  }

  get isConfigured(): boolean {
    if (this.config.enabled === false) return false;
    // Ollama does not require an API key; it is configured by having a reachable host URL
    return true;
  }

  private inferCapabilities(modelName: string): ModelCapabilities {
    const lower = modelName.toLowerCase();
    const isVision =
      lower.includes("vision") ||
      lower.includes("llava") ||
      lower.includes("bakllava") ||
      lower.includes("minicpm-v") ||
      lower.includes("moondream");

    const isToolCapable =
      lower.includes("llama3.1") ||
      lower.includes("llama3.2") ||
      lower.includes("llama3.3") ||
      lower.includes("mistral") ||
      lower.includes("qwen2.5") ||
      lower.includes("command-r") ||
      lower.includes("hermes3") ||
      lower.includes("nemotron");

    const isCoding =
      lower.includes("coder") ||
      lower.includes("codellama") ||
      lower.includes("deepseek-coder") ||
      lower.includes("starcoder");

    // Standard context window estimates for common Ollama models
    let contextWindow = 8192;
    if (lower.includes("llama3.1") || lower.includes("llama3.2") || lower.includes("llama3.3")) {
      contextWindow = 128000;
    } else if (lower.includes("mistral") || lower.includes("qwen")) {
      contextWindow = 32768;
    }

    return {
      text: true,
      vision: isVision,
      tool_calling: isToolCapable || isCoding,
      structured_output: true,
      streaming: true,
      context_window: contextWindow,
      local_or_cloud: "local",
    };
  }

  async listModels(): Promise<ModelDefinition[]> {
    if (this.config.enabled === false) return [];
    const now = Date.now();
    // Cache for 15 seconds to avoid hammering local port
    if (this.cachedModels.length > 0 && now - this.lastModelFetch < 15_000) {
      return this.cachedModels;
    }

    const { signal, cleanup } = this.createTimeoutSignal(undefined, 8_000);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal,
      });

      if (!response.ok) {
        return this.cachedModels;
      }

      const data = (await response.json()) as { models?: OllamaModelTag[] };
      const rawModels = data.models || [];

      this.cachedModels = rawModels.map((m) => {
        const caps = this.inferCapabilities(m.name);
        return {
          id: m.name,
          name: m.name,
          provider: "ollama",
          capabilities: caps,
          description: `Local model (${m.details?.parameter_size || "unknown size"}, ${m.details?.quantization_level || "quantized"})`,
          available: true,
          tags: ["local", caps.vision ? "vision" : "text", caps.tool_calling ? "tools" : "standard"],
        };
      });

      this.lastModelFetch = now;
      return this.cachedModels;
    } catch {
      // Return cached models or empty list if offline
      return this.cachedModels;
    } finally {
      cleanup();
    }
  }

  async getModelInfo(modelId: string): Promise<ModelDefinition | null> {
    const models = await this.listModels();
    const found = models.find((m) => m.id === modelId || m.name === modelId);
    if (found) return found;

    // If not found in tags, construct inferred model definition
    return {
      id: modelId,
      name: modelId,
      provider: "ollama",
      capabilities: this.inferCapabilities(modelId),
      available: true,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    const { signal, cleanup } = this.createTimeoutSignal(undefined, 4_000);

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal,
      });

      const latencyMs = Date.now() - startTime;
      if (response.ok) {
        const data = (await response.json()) as { models?: OllamaModelTag[] };
        const modelCount = data.models?.length || 0;
        this.circuitBreaker.recordSuccess();

        return {
          provider: "ollama",
          healthy: true,
          configured: true,
          modelCount,
          latencyMs,
          message: `Ollama operational at ${this.baseUrl} with ${modelCount} local models`,
          circuitBreakerStatus: this.circuitBreaker.getState(),
          lastChecked: new Date().toISOString(),
        };
      }

      this.circuitBreaker.recordFailure(true);
      return {
        provider: "ollama",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `Ollama returned HTTP ${response.status}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.circuitBreaker.recordFailure(true);
      return {
        provider: "ollama",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `Ollama is offline or unreachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } finally {
      cleanup();
    }
  }

  private formatMessages(messages: ChatRequest["messages"]) {
    return messages.map((m) => {
      let content = "";
      const images: string[] = [];

      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "text") {
            content += (content ? "\n" : "") + part.text;
          } else if (part.type === "image") {
            images.push(part.dataBase64);
          }
        }
      }

      return {
        role: m.role,
        content,
        ...(images.length > 0 ? { images } : {}),
      };
    });
  }

  async chat(request: ChatRequest, callerSignal?: AbortSignal): Promise<NormalizedChatResponse> {
    const startTime = Date.now();
    const model = request.model || this.config.defaultModel || "llama3";
    const requestId = request.request_id || `req_ollama_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return await this.withRetry(
      async () => {
        const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

        try {
          const bodyPayload: Record<string, unknown> = {
            model,
            messages: this.formatMessages(request.messages),
            stream: false,
            options: {
              temperature: request.temperature ?? 0.7,
              ...(request.max_tokens ? { num_predict: request.max_tokens } : {}),
            },
          };

          // Attach tools if supported
          if (request.tools && request.tools.length > 0) {
            bodyPayload.tools = request.tools;
          }

          const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
            signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`Ollama HTTP ${response.status}: ${errText || response.statusText}`);
          }

          const data = (await response.json()) as {
            message?: {
              role: string;
              content: string;
              tool_calls?: Array<{
                function: { name: string; arguments: Record<string, unknown> };
              }>;
            };
            done_reason?: string;
            prompt_eval_count?: number;
            eval_count?: number;
          };

          const latencyMs = Date.now() - startTime;
          const content = data.message?.content || "";

          let toolCalls: ToolCall[] | undefined;
          if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
            toolCalls = data.message.tool_calls.map((tc, idx) => ({
              id: `tc_${idx}_${Date.now()}`,
              name: tc.function.name,
              arguments: tc.function.arguments || {},
            }));
          }

          const promptTokens = data.prompt_eval_count ?? this.estimateTokens(JSON.stringify(request.messages));
          const completionTokens = data.eval_count ?? this.estimateTokens(content);

          return {
            request_id: requestId,
            provider: "ollama",
            model,
            content,
            finish_reason: toolCalls ? "tool_calls" : "stop",
            tool_calls: toolCalls,
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
            latency_ms: latencyMs,
            routing: {
              taskCategory: request.task_category || "general_chat",
              selectedReason: `Local inference on Ollama (${model})`,
              policy: request.policy || "AUTO",
              mode: request.model ? "manual" : "auto",
              fallbackUsed: false,
            },
          };
        } finally {
          cleanup();
        }
      },
      callerSignal
    );
  }

  async *stream(
    request: ChatRequest,
    callerSignal?: AbortSignal
  ): AsyncGenerator<NormalizedStreamChunk, void, unknown> {
    const model = request.model || this.config.defaultModel || "llama3";
    const requestId = request.request_id || `req_ollama_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

    try {
      const bodyPayload = {
        model,
        messages: this.formatMessages(request.messages),
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          ...(request.max_tokens ? { num_predict: request.max_tokens } : {}),
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Ollama HTTP ${response.status}: ${errText || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream received from Ollama");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (callerSignal?.aborted) {
            yield {
              request_id: requestId,
              provider: "ollama",
              model,
              delta: "",
              finish_reason: "cancelled",
            };
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const chunk = JSON.parse(trimmed) as {
                message?: { content?: string };
                done?: boolean;
                prompt_eval_count?: number;
                eval_count?: number;
              };

              const delta = chunk.message?.content || "";
              if (delta) {
                yield {
                  request_id: requestId,
                  provider: "ollama",
                  model,
                  delta,
                  finish_reason: null,
                };
              }

              if (chunk.done) {
                this.circuitBreaker.recordSuccess();
                yield {
                  request_id: requestId,
                  provider: "ollama",
                  model,
                  delta: "",
                  finish_reason: "stop",
                  usage: {
                    prompt_tokens: chunk.prompt_eval_count ?? 0,
                    completion_tokens: chunk.eval_count ?? 0,
                    total_tokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
                  },
                };
                return;
              }
            } catch {
              // Ignore malformed JSON chunks in NDJSON stream
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      this.circuitBreaker.recordFailure(true);
      yield {
        request_id: requestId,
        provider: "ollama",
        model,
        delta: "",
        finish_reason: "error",
        error: this.normalizeError(err),
      };
    } finally {
      cleanup();
    }
  }
}
