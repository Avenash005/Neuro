/**
 * VIOLET AI — OpenAI Provider Adapter
 *
 * Implements official OpenAI chat completion, streaming, and tool-calling endpoints.
 */

import { BaseAdapter } from "./baseAdapter";
import type {
  ChatMessage,
  ChatRequest,
  ModelCapabilities,
  ModelDefinition,
  NormalizedChatResponse,
  NormalizedStreamChunk,
  ProviderAdapterConfig,
  ProviderHealth,
  ToolCall,
} from "../types";

export class OpenAIAdapter extends BaseAdapter {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private cachedModels: ModelDefinition[] = [];
  private lastModelFetch = 0;

  constructor(config?: ProviderAdapterConfig) {
    super("openai", config || {});
    this.apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = (this.config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private inferCapabilities(modelId: string): ModelCapabilities {
    const lower = modelId.toLowerCase();
    const isVision = lower.includes("gpt-4o") || lower.includes("vision");
    const isReasoning = lower.startsWith("o1") || lower.startsWith("o3");
    let contextWindow = 128000;
    if (isReasoning) contextWindow = 200000;

    return {
      text: true,
      vision: isVision,
      tool_calling: !isReasoning || lower.includes("mini"),
      structured_output: true,
      streaming: true,
      context_window: contextWindow,
      local_or_cloud: "cloud",
    };
  }

  async listModels(): Promise<ModelDefinition[]> {
    if (!this.isConfigured) {
      return this.getStandardModels();
    }

    const now = Date.now();
    if (this.cachedModels.length > 0 && now - this.lastModelFetch < 60_000) {
      return this.cachedModels;
    }

    const { signal, cleanup } = this.createTimeoutSignal(undefined, 8_000);
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal,
      });

      if (!response.ok) {
        return this.cachedModels.length > 0 ? this.cachedModels : this.getStandardModels();
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const raw = data.data || [];

      // Filter to relevant chat models
      const relevant = raw.filter(
        (m) =>
          m.id.startsWith("gpt-4") ||
          m.id.startsWith("o1") ||
          m.id.startsWith("o3") ||
          m.id.startsWith("chatgpt")
      );

      this.cachedModels = relevant.map((m) => ({
        id: m.id,
        name: m.id,
        provider: "openai",
        capabilities: this.inferCapabilities(m.id),
        available: true,
        tags: ["cloud", "openai"],
      }));

      this.lastModelFetch = now;
      return this.cachedModels;
    } catch {
      return this.cachedModels.length > 0 ? this.cachedModels : this.getStandardModels();
    } finally {
      cleanup();
    }
  }

  private getStandardModels(): ModelDefinition[] {
    return [
      {
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
        available: this.isConfigured,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
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
        available: this.isConfigured,
      },
      {
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        capabilities: {
          text: true,
          vision: false,
          tool_calling: true,
          structured_output: true,
          streaming: true,
          context_window: 200000,
          local_or_cloud: "cloud",
        },
        available: this.isConfigured,
      },
    ];
  }

  async getModelInfo(modelId: string): Promise<ModelDefinition | null> {
    const models = await this.listModels();
    const found = models.find((m) => m.id === modelId);
    if (found) return found;

    return {
      id: modelId,
      name: modelId,
      provider: "openai",
      capabilities: this.inferCapabilities(modelId),
      available: this.isConfigured,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) {
      return {
        provider: "openai",
        healthy: false,
        configured: false,
        modelCount: 0,
        message: "OpenAI API key is not configured (OPENAI_API_KEY missing)",
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    const { signal, cleanup } = this.createTimeoutSignal(undefined, 6_000);
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal,
      });

      const latencyMs = Date.now() - startTime;
      if (response.ok) {
        this.circuitBreaker.recordSuccess();
        return {
          provider: "openai",
          healthy: true,
          configured: true,
          modelCount: this.cachedModels.length || 3,
          latencyMs,
          message: "OpenAI API verified and operational",
          circuitBreakerStatus: this.circuitBreaker.getState(),
          lastChecked: new Date().toISOString(),
        };
      }

      this.circuitBreaker.recordFailure(true);
      return {
        provider: "openai",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `OpenAI returned HTTP ${response.status}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.circuitBreaker.recordFailure(true);
      return {
        provider: "openai",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `OpenAI connection failed: ${err instanceof Error ? err.message : String(err)}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } finally {
      cleanup();
    }
  }

  private formatOpenAIMessages(messages: ChatMessage[]) {
    return messages.map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      if (Array.isArray(m.content)) {
        const parts = m.content.map((p) => {
          if (p.type === "text") return { type: "text", text: p.text };
          return {
            type: "image_url",
            image_url: { url: `data:${p.mimeType};base64,${p.dataBase64}` },
          };
        });
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: "" };
    });
  }

  async chat(request: ChatRequest, callerSignal?: AbortSignal): Promise<NormalizedChatResponse> {
    if (!this.isConfigured) {
      throw new Error("OpenAI is not configured (OPENAI_API_KEY is missing)");
    }

    const startTime = Date.now();
    const model = request.model || this.config.defaultModel || "gpt-4o";
    const requestId = request.request_id || `req_oai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return await this.withRetry(
      async () => {
        const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

        try {
          const bodyPayload: Record<string, unknown> = {
            model,
            messages: this.formatOpenAIMessages(request.messages),
            stream: false,
            temperature: request.temperature ?? 0.7,
            ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
          };

          if (request.tools && request.tools.length > 0) {
            bodyPayload.tools = request.tools;
          }

          const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(bodyPayload),
            signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`OpenAI HTTP ${response.status}: ${errText || response.statusText}`);
          }

          const data = (await response.json()) as {
            choices?: Array<{
              message?: {
                content?: string;
                tool_calls?: Array<{
                  id: string;
                  function: { name: string; arguments: string };
                }>;
              };
              finish_reason?: string;
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };

          const choice = data.choices?.[0];
          const content = choice?.message?.content || "";
          const latencyMs = Date.now() - startTime;

          let toolCalls: ToolCall[] | undefined;
          if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
            toolCalls = choice.message.tool_calls.map((tc) => {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments);
              } catch {
                parsedArgs = { raw: tc.function.arguments };
              }
              return { id: tc.id, name: tc.function.name, arguments: parsedArgs };
            });
          }

          const promptTokens = data.usage?.prompt_tokens ?? this.estimateTokens(JSON.stringify(request.messages));
          const completionTokens = data.usage?.completion_tokens ?? this.estimateTokens(content);

          return {
            request_id: requestId,
            provider: "openai",
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
              selectedReason: `Cloud inference via OpenAI (${model})`,
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
    if (!this.isConfigured) {
      yield {
        request_id: request.request_id || "req_err",
        provider: "openai",
        model: request.model || "gpt-4o",
        delta: "",
        finish_reason: "error",
        error: { code: "CONFIG_MISSING", message: "OPENAI_API_KEY missing", retryable: false },
      };
      return;
    }

    const model = request.model || this.config.defaultModel || "gpt-4o";
    const requestId = request.request_id || `req_oai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

    try {
      const bodyPayload = {
        model,
        messages: this.formatOpenAIMessages(request.messages),
        stream: true,
        temperature: request.temperature ?? 0.7,
        ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`OpenAI HTTP ${response.status}: ${errText || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream received from OpenAI");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (callerSignal?.aborted) {
            yield {
              request_id: requestId,
              provider: "openai",
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
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
              this.circuitBreaker.recordSuccess();
              yield {
                request_id: requestId,
                provider: "openai",
                model,
                delta: "",
                finish_reason: "stop",
              };
              return;
            }

            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
              };
              const delta = parsed.choices?.[0]?.delta?.content || "";
              if (delta) {
                yield {
                  request_id: requestId,
                  provider: "openai",
                  model,
                  delta,
                  finish_reason: null,
                };
              }
            } catch {
              // Ignore incomplete SSE chunk
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
        provider: "openai",
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
