/**
 * VIOLET AI — Base Provider Adapter
 *
 * Implements shared lifecycle, retry loops, timeout handling, circuit breaker tracking,
 * and standard error normalization across all AI providers.
 */

import { CircuitBreaker } from "../circuitBreaker";
import type {
  AIProviderType,
  ChatMessage,
  ChatRequest,
  IProviderAdapter,
  ModelDefinition,
  NormalizedChatResponse,
  NormalizedError,
  NormalizedStreamChunk,
  ProviderAdapterConfig,
  ProviderHealth,
  TokenUsage,
} from "../types";

export abstract class BaseAdapter implements IProviderAdapter {
  readonly provider: AIProviderType;
  readonly config: ProviderAdapterConfig;
  readonly circuitBreaker: CircuitBreaker;

  constructor(provider: AIProviderType, config: ProviderAdapterConfig) {
    this.provider = provider;
    this.config = {
      timeoutMs: 45_000,
      maxRetries: 2,
      ...config,
    };
    this.circuitBreaker = new CircuitBreaker(provider, {
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
    });
  }

  abstract get isConfigured(): boolean;

  abstract listModels(): Promise<ModelDefinition[]>;
  abstract getModelInfo(modelId: string): Promise<ModelDefinition | null>;
  abstract chat(request: ChatRequest, signal?: AbortSignal): Promise<NormalizedChatResponse>;
  abstract stream(
    request: ChatRequest,
    signal?: AbortSignal
  ): AsyncGenerator<NormalizedStreamChunk, void, unknown>;
  abstract healthCheck(): Promise<ProviderHealth>;

  /**
   * Executes an async operation with bounded retries and exponential backoff.
   */
  protected async withRetry<T>(
    operation: (attempt: number) => Promise<T>,
    signal?: AbortSignal,
    maxRetries = this.config.maxRetries ?? 2
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      if (signal?.aborted) {
        throw new Error("Request cancelled by caller");
      }

      try {
        const result = await operation(attempt);
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (err) {
        lastError = err;
        const normalized = this.normalizeError(err);

        // If not retryable or on the last attempt, fail immediately
        if (!normalized.retryable || attempt > maxRetries) {
          this.circuitBreaker.recordFailure(normalized.retryable);
          throw err;
        }

        // Wait with jittered exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 200, 8000);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, backoffMs);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("Request cancelled during retry backoff"));
            });
          }
        });
      }
    }

    throw lastError;
  }

  /**
   * Creates a combined AbortSignal enforcing the configured timeout.
   */
  protected createTimeoutSignal(callerSignal?: AbortSignal, customTimeoutMs?: number): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const timeoutMs = customTimeoutMs || this.config.timeoutMs || 45_000;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let callerAbortListener: (() => void) | undefined;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerAbortListener = () => controller.abort(callerSignal.reason);
        callerSignal.addEventListener("abort", callerAbortListener);
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer);
        if (callerSignal && callerAbortListener) {
          callerSignal.removeEventListener("abort", callerAbortListener);
        }
      },
    };
  }

  /**
   * Normalizes unknown errors to standard NormalizedError.
   */
  normalizeError(error: unknown): NormalizedError {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      const e = error as Record<string, unknown>;
      return {
        code: String(e.code || "PROVIDER_ERROR"),
        message: String(e.message || "Unknown provider error"),
        retryable: Boolean(e.retryable ?? false),
        provider: this.provider,
        statusCode: typeof e.statusCode === "number" ? e.statusCode : undefined,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    const isRateLimit = lower.includes("429") || lower.includes("rate limit") || lower.includes("quota exceeded");
    const isTimeout = lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort");
    const isNetwork = lower.includes("fetch failed") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("econnreset");
    const isServer5xx = lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("504") || lower.includes("bad gateway");

    return {
      code: isRateLimit ? "RATE_LIMIT" : isTimeout ? "TIMEOUT" : isNetwork ? "NETWORK_ERROR" : isServer5xx ? "SERVER_ERROR" : "PROVIDER_ERROR",
      message,
      retryable: isRateLimit || isTimeout || isNetwork || isServer5xx,
      provider: this.provider,
    };
  }

  /**
   * Extracts text representation from messages.
   */
  protected extractTextContent(content: ChatMessage["content"]): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("\n");
    }
    return "";
  }

  /**
   * Estimates rough token count based on character length if provider provides none.
   */
  protected estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  protected normalizeUsage(
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
    promptText = "",
    completionText = ""
  ): TokenUsage {
    if (usage && typeof usage.total_tokens === "number") {
      return {
        prompt_tokens: usage.prompt_tokens ?? this.estimateTokens(promptText),
        completion_tokens: usage.completion_tokens ?? this.estimateTokens(completionText),
        total_tokens: usage.total_tokens,
      };
    }

    const promptTokens = this.estimateTokens(promptText);
    const completionTokens = this.estimateTokens(completionText);
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
  }
}
