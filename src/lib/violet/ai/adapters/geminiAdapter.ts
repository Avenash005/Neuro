/**
 * VIOLET AI — Google Gemini Provider Adapter
 *
 * Implements Gemini REST API with native multimodal, function calling,
 * and streaming SSE capabilities.
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

export class GeminiAdapter extends BaseAdapter {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private cachedModels: ModelDefinition[] = [];
  private lastModelFetch = 0;

  constructor(config?: ProviderAdapterConfig) {
    super("gemini", config || {});
    this.apiKey = this.config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    this.baseUrl = (this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private inferCapabilities(modelId: string): ModelCapabilities {
    const lower = modelId.toLowerCase();
    const isPro = lower.includes("pro");
    return {
      text: true,
      vision: true,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: isPro ? 2000000 : 1000000,
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
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        method: "GET",
        signal,
      });

      if (!response.ok) {
        return this.cachedModels.length > 0 ? this.cachedModels : this.getStandardModels();
      }

      const data = (await response.json()) as {
        models?: Array<{
          name: string;
          displayName?: string;
          description?: string;
          supportedGenerationMethods?: string[];
        }>;
      };

      const raw = data.models || [];
      const relevant = raw.filter((m) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        (m.name.includes("gemini-2") || m.name.includes("gemini-1.5"))
      );

      this.cachedModels = relevant.map((m) => {
        const cleanId = m.name.replace(/^models\//, "");
        return {
          id: cleanId,
          name: m.displayName || cleanId,
          provider: "gemini",
          capabilities: this.inferCapabilities(cleanId),
          description: m.description?.slice(0, 160) || "Google Gemini multimodal model",
          available: true,
          tags: ["cloud", "vision", "tools", "gemini"],
        };
      });

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
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "gemini",
        capabilities: {
          text: true,
          vision: true,
          tool_calling: true,
          structured_output: true,
          streaming: true,
          context_window: 1048576,
          local_or_cloud: "cloud",
        },
        available: this.isConfigured,
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        provider: "gemini",
        capabilities: {
          text: true,
          vision: true,
          tool_calling: true,
          structured_output: true,
          streaming: true,
          context_window: 2097152,
          local_or_cloud: "cloud",
        },
        available: this.isConfigured,
      },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        provider: "gemini",
        capabilities: {
          text: true,
          vision: true,
          tool_calling: true,
          structured_output: true,
          streaming: true,
          context_window: 1048576,
          local_or_cloud: "cloud",
        },
        available: this.isConfigured,
      },
    ];
  }

  async getModelInfo(modelId: string): Promise<ModelDefinition | null> {
    const models = await this.listModels();
    const cleanId = modelId.replace(/^models\//, "");
    const found = models.find((m) => m.id === cleanId);
    if (found) return found;

    return {
      id: cleanId,
      name: cleanId,
      provider: "gemini",
      capabilities: this.inferCapabilities(cleanId),
      available: this.isConfigured,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) {
      return {
        provider: "gemini",
        healthy: false,
        configured: false,
        modelCount: 0,
        message: "Gemini API key is not configured (GEMINI_API_KEY missing)",
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    const { signal, cleanup } = this.createTimeoutSignal(undefined, 6_000);
    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        method: "GET",
        signal,
      });

      const latencyMs = Date.now() - startTime;
      if (response.ok) {
        this.circuitBreaker.recordSuccess();
        return {
          provider: "gemini",
          healthy: true,
          configured: true,
          modelCount: this.cachedModels.length || 3,
          latencyMs,
          message: "Gemini API verified and operational",
          circuitBreakerStatus: this.circuitBreaker.getState(),
          lastChecked: new Date().toISOString(),
        };
      }

      this.circuitBreaker.recordFailure(true);
      return {
        provider: "gemini",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `Gemini returned HTTP ${response.status}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.circuitBreaker.recordFailure(true);
      return {
        provider: "gemini",
        healthy: false,
        configured: true,
        modelCount: 0,
        latencyMs,
        message: `Gemini connection failed: ${err instanceof Error ? err.message : String(err)}`,
        circuitBreakerStatus: this.circuitBreaker.getState(),
        lastChecked: new Date().toISOString(),
      };
    } finally {
      cleanup();
    }
  }

  private formatGeminiContents(messages: ChatMessage[]) {
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    for (const m of messages) {
      if (m.role === "system") {
        const text = typeof m.content === "string" ? m.content : this.extractTextContent(m.content);
        systemInstruction = { parts: [{ text }] };
        continue;
      }

      const role = m.role === "assistant" ? "model" : "user";
      const parts: Array<Record<string, unknown>> = [];

      if (typeof m.content === "string") {
        parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "text") {
            parts.push({ text: part.text });
          } else if (part.type === "image") {
            parts.push({
              inlineData: {
                mimeType: part.mimeType,
                data: part.dataBase64,
              },
            });
          }
        }
      }

      contents.push({ role, parts });
    }

    return { contents, systemInstruction };
  }

  async chat(request: ChatRequest, callerSignal?: AbortSignal): Promise<NormalizedChatResponse> {
    if (!this.isConfigured) {
      throw new Error("Gemini is not configured (GEMINI_API_KEY is missing)");
    }

    const startTime = Date.now();
    const model = (request.model || this.config.defaultModel || "gemini-2.0-flash").replace(/^models\//, "");
    const requestId = request.request_id || `req_gem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return await this.withRetry(
      async () => {
        const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

        try {
          const { contents, systemInstruction } = this.formatGeminiContents(request.messages);
          const bodyPayload: Record<string, unknown> = {
            contents,
            generationConfig: {
              temperature: request.temperature ?? 0.7,
              ...(request.max_tokens ? { maxOutputTokens: request.max_tokens } : {}),
            },
          };

          if (systemInstruction) {
            bodyPayload.systemInstruction = systemInstruction;
          }

          if (request.tools && request.tools.length > 0) {
            bodyPayload.tools = [
              {
                functionDeclarations: request.tools.map((t) => ({
                  name: t.function.name,
                  description: t.function.description,
                  parameters: t.function.parameters,
                })),
              },
            ];
          }

          const response = await fetch(`${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
            signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`Gemini HTTP ${response.status}: ${errText || response.statusText}`);
          }

          const data = (await response.json()) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: { name: string; args: Record<string, unknown> };
                }>;
              };
              finishReason?: string;
            }>;
            usageMetadata?: {
              promptTokenCount?: number;
              candidatesTokenCount?: number;
              totalTokenCount?: number;
            };
          };

          const candidate = data.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          let content = "";
          const toolCalls: ToolCall[] = [];

          for (const p of parts) {
            if (p.text) content += p.text;
            if (p.functionCall) {
              toolCalls.push({
                id: `tc_${toolCalls.length}_${Date.now()}`,
                name: p.functionCall.name,
                arguments: p.functionCall.args || {},
              });
            }
          }

          const latencyMs = Date.now() - startTime;
          const promptTokens = data.usageMetadata?.promptTokenCount ?? this.estimateTokens(JSON.stringify(request.messages));
          const completionTokens = data.usageMetadata?.candidatesTokenCount ?? this.estimateTokens(content);

          return {
            request_id: requestId,
            provider: "gemini",
            model,
            content,
            finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: data.usageMetadata?.totalTokenCount ?? (promptTokens + completionTokens),
            },
            latency_ms: latencyMs,
            routing: {
              taskCategory: request.task_category || "general_chat",
              selectedReason: `Cloud inference via Google Gemini (${model})`,
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
        provider: "gemini",
        model: request.model || "gemini-2.0-flash",
        delta: "",
        finish_reason: "error",
        error: { code: "CONFIG_MISSING", message: "GEMINI_API_KEY missing", retryable: false },
      };
      return;
    }

    const model = (request.model || this.config.defaultModel || "gemini-2.0-flash").replace(/^models\//, "");
    const requestId = request.request_id || `req_gem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { signal, cleanup } = this.createTimeoutSignal(callerSignal);

    try {
      const { contents, systemInstruction } = this.formatGeminiContents(request.messages);
      const bodyPayload: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          ...(request.max_tokens ? { maxOutputTokens: request.max_tokens } : {}),
        },
      };

      if (systemInstruction) {
        bodyPayload.systemInstruction = systemInstruction;
      }

      const response = await fetch(
        `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          signal,
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Gemini HTTP ${response.status}: ${errText || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream received from Gemini");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (callerSignal?.aborted) {
            yield {
              request_id: requestId,
              provider: "gemini",
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
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                  finishReason?: string;
                }>;
                usageMetadata?: {
                  promptTokenCount?: number;
                  candidatesTokenCount?: number;
                  totalTokenCount?: number;
                };
              };

              const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (delta) {
                yield {
                  request_id: requestId,
                  provider: "gemini",
                  model,
                  delta,
                  finish_reason: null,
                };
              }

              if (parsed.candidates?.[0]?.finishReason) {
                this.circuitBreaker.recordSuccess();
                yield {
                  request_id: requestId,
                  provider: "gemini",
                  model,
                  delta: "",
                  finish_reason: "stop",
                  usage: {
                    prompt_tokens: parsed.usageMetadata?.promptTokenCount ?? 0,
                    completion_tokens: parsed.usageMetadata?.candidatesTokenCount ?? 0,
                    total_tokens: parsed.usageMetadata?.totalTokenCount ?? 0,
                  },
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
        provider: "gemini",
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
