/**
 * VIOLET AI — Multi-Model Gateway
 *
 * Primary coordinator managing intelligent routing, adapter invocation,
 * privacy policy enforcement, resilient fallback sequences, response normalization,
 * and structured audit observability.
 */

import { globalAIAuditLogger, AIAuditLogger } from "./auditLogger";
import { IntelligentModelRouter, type RoutingDecision } from "./intelligentRouter";
import { globalProviderRegistry, ProviderRegistry } from "./providerRegistry";
import type {
  ChatRequest,
  NormalizedChatResponse,
  NormalizedStreamChunk,
  UserPreferences,
} from "./types";

export class ModelGateway {
  readonly registry: ProviderRegistry;
  readonly router: IntelligentModelRouter;
  readonly auditLogger: AIAuditLogger;
  private userPreferences: UserPreferences = {
    routingMode: "auto",
    privacyPolicy: "AUTO",
    costPreference: "balance",
    latencyPreference: "standard",
    fallbackEnabled: true,
  };

  constructor(
    registry: ProviderRegistry = globalProviderRegistry,
    auditLogger: AIAuditLogger = globalAIAuditLogger
  ) {
    this.registry = registry;
    this.router = new IntelligentModelRouter(this.registry);
    this.auditLogger = auditLogger;
  }

  getUserPreferences(): UserPreferences {
    return { ...this.userPreferences };
  }

  setUserPreferences(prefs: Partial<UserPreferences>): UserPreferences {
    this.userPreferences = { ...this.userPreferences, ...prefs };
    return this.getUserPreferences();
  }

  /**
   * Non-streaming chat completion with automatic routing and resilient fallback.
   */
  async chat(request: ChatRequest, signal?: AbortSignal): Promise<NormalizedChatResponse> {
    const startTime = Date.now();
    const requestId = request.request_id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectivePolicy = request.policy || this.userPreferences.privacyPolicy;

    // 1. Route to primary candidate and fallback sequence
    const decision: RoutingDecision = await this.router.route(
      { ...request, policy: effectivePolicy },
      this.userPreferences
    );

    const candidatesToTry = [decision.selectedModel];
    if (this.userPreferences.fallbackEnabled && decision.fallbackCandidates.length > 0) {
      candidatesToTry.push(...decision.fallbackCandidates.slice(0, 3));
    }

    let lastError: Error | null = null;
    const attemptedModels: string[] = [];

    // 2. Execution loop with fallback
    for (let i = 0; i < candidatesToTry.length; i++) {
      const candidate = candidatesToTry[i];
      attemptedModels.push(`${candidate.provider}:${candidate.id}`);

      // Policy check: Strictly enforce LOCAL_ONLY on every attempt!
      if (effectivePolicy === "LOCAL_ONLY" && candidate.capabilities.local_or_cloud !== "local") {
        continue;
      }

      const adapter = this.registry.getAdapter(candidate.provider);
      if (!adapter) continue;

      try {
        const candidateRequest: ChatRequest = {
          ...request,
          request_id: requestId,
          model: candidate.id,
          provider: candidate.provider,
          task_category: decision.metadata.taskCategory,
          policy: effectivePolicy,
        };

        const response = await adapter.chat(candidateRequest, signal);

        // Augment response with routing metadata
        const finalRouting = {
          ...decision.metadata,
          policy: effectivePolicy,
          fallbackUsed: i > 0,
          originalModel: i > 0 ? decision.selectedModel.id : undefined,
          attemptedModels,
          selectedReason:
            i > 0
              ? `${decision.metadata.selectedReason} [Fallback engaged: switched to ${candidate.id} after previous candidate failure].`
              : decision.metadata.selectedReason,
        };

        response.routing = finalRouting;
        response.latency_ms = Date.now() - startTime;

        // Structured Audit Logging
        this.auditLogger.record({
          requestId: response.request_id,
          timestamp: new Date().toISOString(),
          provider: response.provider,
          model: response.model,
          taskCategory: finalRouting.taskCategory,
          routingReason: finalRouting.selectedReason,
          privacyPolicy: effectivePolicy,
          durationMs: response.latency_ms,
          tokens: response.usage,
          status: "success",
          fallbackUsed: finalRouting.fallbackUsed,
        });

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // If caller cancelled, do not attempt fallbacks
        if (signal?.aborted) {
          throw err;
        }

        // If policy is LOCAL_ONLY and no more local candidates exist, stop
        if (effectivePolicy === "LOCAL_ONLY" && candidatesToTry.every((c) => c.capabilities.local_or_cloud === "local")) {
          // Log failure
          this.auditLogger.record({
            requestId,
            timestamp: new Date().toISOString(),
            provider: candidate.provider,
            model: candidate.id,
            taskCategory: decision.metadata.taskCategory,
            routingReason: `Failed local candidate ${candidate.id} under LOCAL_ONLY: ${lastError.message}`,
            privacyPolicy: effectivePolicy,
            durationMs: Date.now() - startTime,
            tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            status: "error",
            errorCode: "LOCAL_EXECUTION_FAILED",
            fallbackUsed: i > 0,
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    this.auditLogger.record({
      requestId,
      timestamp: new Date().toISOString(),
      provider: decision.selectedModel.provider,
      model: decision.selectedModel.id,
      taskCategory: decision.metadata.taskCategory,
      routingReason: `All candidates failed. Last error: ${lastError?.message}`,
      privacyPolicy: effectivePolicy,
      durationMs,
      tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      status: "error",
      errorCode: "ALL_CANDIDATES_FAILED",
      fallbackUsed: attemptedModels.length > 1,
    });

    throw new Error(
      `ModelGateway execution failed across all candidate models [${attemptedModels.join(", ")}]: ${
        lastError?.message || "Unknown error"
      }`
    );
  }

  /**
   * Streaming chat completion with automatic routing.
   */
  async *stream(
    request: ChatRequest,
    signal?: AbortSignal
  ): AsyncGenerator<NormalizedStreamChunk, void, unknown> {
    const startTime = Date.now();
    const requestId = request.request_id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectivePolicy = request.policy || this.userPreferences.privacyPolicy;

    let decision: RoutingDecision;
    try {
      decision = await this.router.route(
        { ...request, policy: effectivePolicy },
        this.userPreferences
      );
    } catch (err) {
      yield {
        request_id: requestId,
        provider: "ollama",
        model: request.model || "unknown",
        delta: "",
        finish_reason: "error",
        error: {
          code: "ROUTING_FAILED",
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      };
      return;
    }

    const candidate = decision.selectedModel;
    const adapter = this.registry.getAdapter(candidate.provider);

    if (!adapter) {
      yield {
        request_id: requestId,
        provider: candidate.provider,
        model: candidate.id,
        delta: "",
        finish_reason: "error",
        error: {
          code: "ADAPTER_NOT_FOUND",
          message: `Provider adapter for '${candidate.provider}' is not registered`,
          retryable: false,
        },
      };
      return;
    }

    // Yield initial chunk containing routing metadata
    yield {
      request_id: requestId,
      provider: candidate.provider,
      model: candidate.id,
      delta: "",
      finish_reason: null,
      routing: decision.metadata,
    };

    let totalTokens = 0;
    let accumulatedContent = "";

    try {
      const candidateRequest: ChatRequest = {
        ...request,
        request_id: requestId,
        model: candidate.id,
        provider: candidate.provider,
        task_category: decision.metadata.taskCategory,
        policy: effectivePolicy,
      };

      for await (const chunk of adapter.stream(candidateRequest, signal)) {
        if (chunk.delta) accumulatedContent += chunk.delta;
        if (chunk.usage) totalTokens = chunk.usage.total_tokens;
        yield chunk;
      }

      this.auditLogger.record({
        requestId,
        timestamp: new Date().toISOString(),
        provider: candidate.provider,
        model: candidate.id,
        taskCategory: decision.metadata.taskCategory,
        routingReason: decision.metadata.selectedReason,
        privacyPolicy: effectivePolicy,
        durationMs: Date.now() - startTime,
        tokens: {
          prompt_tokens: Math.ceil(JSON.stringify(request.messages).length / 4),
          completion_tokens: Math.ceil(accumulatedContent.length / 4),
          total_tokens: totalTokens || Math.ceil((JSON.stringify(request.messages).length + accumulatedContent.length) / 4),
        },
        status: "success",
        fallbackUsed: false,
      });
    } catch (err) {
      this.auditLogger.record({
        requestId,
        timestamp: new Date().toISOString(),
        provider: candidate.provider,
        model: candidate.id,
        taskCategory: decision.metadata.taskCategory,
        routingReason: `Streaming error: ${err instanceof Error ? err.message : String(err)}`,
        privacyPolicy: effectivePolicy,
        durationMs: Date.now() - startTime,
        tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        status: signal?.aborted ? "cancelled" : "error",
        errorCode: signal?.aborted ? "CANCELLED" : "STREAM_ERROR",
        fallbackUsed: false,
      });

      yield {
        request_id: requestId,
        provider: candidate.provider,
        model: candidate.id,
        delta: "",
        finish_reason: signal?.aborted ? "cancelled" : "error",
        error: {
          code: signal?.aborted ? "CANCELLED" : "STREAM_ERROR",
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      };
    }
  }
}

export const globalModelGateway = new ModelGateway();
