/**
 * VIOLET AI — Anthropic Claude Provider Adapter
 *
 * Implements Anthropic Messages API v1 with streaming, tool use,
 * and high-fidelity vision support.
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

export class AnthropicAdapter extends BaseAdapter {
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(config?: ProviderAdapterConfig) {
    super("anthropic", config || {});
    this.apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = (this.config.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private inferCapabilities(_modelId: string): ModelCapabilities {
    return {
      text: true,
      vision: true,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 200000,
      local_or_cloud: "cloud",
    };
  }

  async listModels(): Promise<ModelDefinition[]> {
    return [
      {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        provider: "anthropic",
        capabilities: this.inferCapabilities("claude-3-7-sonnet"),
        description: "Anthropic's flagship hybrid reasoning model",
        available: this.isConfigured,
        tags: ["cloud", "vision", "tools", "reasoning", "anthropic"],
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        capabilities: this.inferCapabilities("claude-3-5-sonnet"),
        description: "High-intelligence model for coding, vision, and complex reasoning",
        available: this.isConfigured,
        tags: ["cloud", "vision", "tools", "coding", "anthropic"],
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic",
        capabilities: this.inferCapabilities("claude-3-5-haiku"),
        description: "Ultra-fast, cost-effective model for high-throughput tasks",
        available: this.isConfigured,
        tags: ["cloud", "vision", "tools", "low_latency", "anthropic"],
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        provider: "anthropic",
        capabilities: this.inferCapabilities("claude-3-opus"),
        description: "Deep analytical intelligence for complex research",
        available: this.isConfigured,
        tags: ["cloud", "vision", "tools", "anthropic"],
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
      provider: "anthropic",
      capabilities: this.inferCapabilities(modelId),
      available: this.isConfigured,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) {
      return {
        provider: "anthropic",
        healthy: false,
        configured: false,
        modelCount: 0,
        message: "Anthropic API key is not configured (ANTHROPIC_API_KEY missing)",
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    }

    // Health verification via minimal probe
    const startTime = Date.now();
    const { signal, cleanup } = this.createTimeoutSignal(undefined, 6_000);
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal,
      });

      const latencyMs = Date.now() - startTime;
      if (response.ok || response.status === 200) {
        this.circuitBreaker.recordSuccess();
        return {
          provider: "anthropic",
          healthy: true,
          configured: true,
          modelCount: 4,
          latencyMs,
          message: "Anthropic API verified and operational",
          circuitBreakerStatus: this.circuitBreaker.getState(),
          lastChecked: new Date().toISOString(),
        };
      }

      this.circuitBreaker.recordFailure(true);
      return {
        provider: "anthropic",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `Anthropic returned HTTP ${response.status}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.circuitBreaker.recordFailure(true);
      return {
        provider: "anthropic",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `Anthropic connection error: ${err instanceof Error ? err.message : String(err)}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } finally {
      cleanup();
    }
  }

  private formatAnthropicMessages(messages: ChatMessage[]) {
    let system = "";
    const formatted: Array<{ role: "user" | "assistant"; content: unknown }> = [];

    for (const m of messages) {
      if (m.role === "system") {
        system += (system ? "\n\n" : "") + (typeof m.content === "string" ? m.content : this.extractTextContent(m.content));
        continue;
      }

      const role = m.role === "assistant" ? "assistant" : "user";
      if (typeof m.content === "string") {
        formatted.push({ role, content: m.content });
      } else if (Array.isArray(m.content)) {
        const parts = m.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: part.mimeType,
              data: part.dataBase64,
            },
          };
        });
        formatted.push({ role, content: parts });
      }
    }

    return { system: system || undefined, messages: formatted };
  }

  async chat(request: ChatRequest, callerSignal?: AbortSignal): Promise<NormalizedChatResponse> {
    if (!this.isConfigured) {
      throw new Error("Anthropic is not configured (ANTHROPIC_API_KEY is missing)");
    }

    const startTime = Date.now();
    const model = request.model || this.config.defaultModel || "claude-3-5-sonnet-20241022";
    const requestId = request.request_id || `req_ant_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return await this.withRetry(
      async () => {
        const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

        try {
          const { system, messages } = this.formatAnthropicMessages(request.messages);
          const bodyPayload: Record<string, unknown> = {
            model,
            messages,
            max_tokens: request.max_tokens || 4096,
            temperature: request.temperature ?? 0.7,
            stream: false,
          };

          if (system) {
            bodyPayload.system = system;
          }

          if (request.tools && request.tools.length > 0) {
            bodyPayload.tools = request.tools.map((t) => ({
              name: t.function.name,
              description: t.function.description,
              input_schema: t.function.parameters,
            }));
          }

          const response = await fetch(`${this.baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.apiKey!,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(bodyPayload),
            signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`Anthropic HTTP ${response.status}: ${errText || response.statusText}`);
          }

          const data = (await response.json()) as {
            content?: Array<
              | { type: "text"; text: string }
              | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
            >;
            stop_reason?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
          };

          let content = "";
          const toolCalls: ToolCall[] = [];

          for (const item of data.content || []) {
            if (item.type === "text") {
              content += item.text;
            } else if (item.type === "tool_use") {
              toolCalls.push({
                id: item.id,
                name: item.name,
                arguments: item.input || {},
              });
            }
          }

          const latencyMs = Date.now() - startTime;
          const promptTokens = data.usage?.input_tokens ?? this.estimateTokens(JSON.stringify(request.messages));
          const completionTokens = data.usage?.output_tokens ?? this.estimateTokens(content);

          return {
            request_id: requestId,
            provider: "anthropic",
            model,
            content,
            finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
            latency_ms: latencyMs,
            routing: {
              taskCategory: request.task_category || "general_chat",
              selectedReason: `Cloud inference via Anthropic Claude (${model})`,
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
        provider: "anthropic",
        model: request.model || "claude-3-5-sonnet-20241022",
        delta: "",
        finish_reason: "error",
        error: { code: "CONFIG_MISSING", message: "ANTHROPIC_API_KEY missing", retryable: false },
      };
      return;
    }

    const model = request.model || this.config.defaultModel || "claude-3-5-sonnet-20241022";
    const requestId = request.request_id || `req_ant_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

    try {
      const { system, messages } = this.formatAnthropicMessages(request.messages);
      const bodyPayload: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature ?? 0.7,
        stream: true,
      };

      if (system) {
        bodyPayload.system = system;
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(bodyPayload),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Anthropic HTTP ${response.status}: ${errText || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream received from Anthropic");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (callerSignal?.aborted) {
            yield {
              request_id: requestId,
              provider: "anthropic",
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
            try {
              const parsed = JSON.parse(payload) as {
                type?: string;
                delta?: { type?: string; text?: string };
                usage?: { output_tokens?: number };
              };

              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                yield {
                  request_id: requestId,
                  provider: "anthropic",
                  model,
                  delta: parsed.delta.text,
                  finish_reason: null,
                };
              }

              if (parsed.type === "message_stop") {
                this.circuitBreaker.recordSuccess();
                yield {
                  request_id: requestId,
                  provider: "anthropic",
                  model,
                  delta: "",
                  finish_reason: "stop",
                };
                return;
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
        provider: "anthropic",
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
