/**
 * VIOLET AI — AI Observability & Structured Audit Logger
 *
 * Implements strict privacy-preserving structured logging.
 * Logs execution metadata, routing reason, latency, tokens, and error summaries.
 * NEVER logs raw prompt contents, user message bodies, or secret API credentials.
 */

import type { AuditLogRecord } from "./types";

export class AIAuditLogger {
  private inMemoryLogs: AuditLogRecord[] = [];
  private readonly maxRecords: number;
  private readonly listeners = new Set<(record: AuditLogRecord) => void>();

  constructor(maxRecords = 500) {
    this.maxRecords = maxRecords;
  }

  record(entry: AuditLogRecord): void {
    // Sanitize any potential accidental secrets or sensitive fields
    const sanitized: AuditLogRecord = {
      requestId: entry.requestId,
      timestamp: entry.timestamp || new Date().toISOString(),
      provider: entry.provider,
      model: entry.model,
      taskCategory: entry.taskCategory,
      routingReason: entry.routingReason,
      privacyPolicy: entry.privacyPolicy,
      durationMs: Math.max(0, entry.durationMs),
      tokens: {
        prompt_tokens: entry.tokens?.prompt_tokens ?? 0,
        completion_tokens: entry.tokens?.completion_tokens ?? 0,
        total_tokens: entry.tokens?.total_tokens ?? 0,
      },
      status: entry.status,
      errorCode: entry.errorCode,
      fallbackUsed: Boolean(entry.fallbackUsed),
    };

    this.inMemoryLogs.unshift(sanitized);
    if (this.inMemoryLogs.length > this.maxRecords) {
      this.inMemoryLogs.pop();
    }

    for (const listener of this.listeners) {
      try {
        listener(sanitized);
      } catch (err) {
        console.error("AIAuditLogger listener error:", err);
      }
    }
  }

  getRecentLogs(limit = 50): AuditLogRecord[] {
    return this.inMemoryLogs.slice(0, limit);
  }

  clear(): void {
    this.inMemoryLogs = [];
  }

  subscribe(listener: (record: AuditLogRecord) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSummaryMetrics() {
    const totalRequests = this.inMemoryLogs.length;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    const providerCounts: Record<string, number> = {};
    const taskCategoryCounts: Record<string, number> = {};

    for (const log of this.inMemoryLogs) {
      if (log.status === "success") successfulRequests++;
      if (log.status === "error") failedRequests++;
      totalTokens += log.tokens.total_tokens;
      totalLatency += log.durationMs;

      providerCounts[log.provider] = (providerCounts[log.provider] || 0) + 1;
      taskCategoryCounts[log.taskCategory] = (taskCategoryCounts[log.taskCategory] || 0) + 1;
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
      totalTokens,
      providerDistribution: providerCounts,
      taskCategoryDistribution: taskCategoryCounts,
    };
  }
}

export const globalAIAuditLogger = new AIAuditLogger();
