/**
 * VIOLET AI — Provider Circuit Breaker
 *
 * Prevents cascading latency and exhaustion when upstream providers experience outages,
 * rate-limits (429), or server errors (5xx). Provides fast-fail routing to healthy fallbacks.
 */

import type { AIProviderType } from "./types";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

export class CircuitBreaker {
  readonly provider: AIProviderType;
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  constructor(provider: AIProviderType, options?: CircuitBreakerOptions) {
    this.provider = provider;
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30_000;
    this.halfOpenMaxAttempts = options?.halfOpenMaxAttempts ?? 1;
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const now = Date.now();
      if (now - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
      }
    }
    return this.state;
  }

  isAvailable(): boolean {
    const currentState = this.getState();
    if (currentState === "closed") {
      return true;
    }
    if (currentState === "half-open") {
      return this.halfOpenAttempts < this.halfOpenMaxAttempts;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.state = "closed";
  }

  recordFailure(isTransientOrRateLimit = true): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === "half-open") {
      // Immediate trip back to open
      this.state = "open";
      return;
    }

    if (this.failureCount >= this.failureThreshold || !isTransientOrRateLimit) {
      this.state = "open";
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.state = "closed";
    this.lastFailureTime = 0;
  }

  getMetrics() {
    return {
      provider: this.provider,
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      threshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
    };
  }
}
