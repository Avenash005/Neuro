import type { VioletTaskEvent } from "../../types/violet";

const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|apikey|api_key|credential|private_key/i;

const REDACTION_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Bearer tokens
  { regex: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, replacement: "Bearer [REDACTED]" },
  // JWT tokens (3 base64url segments separated by dots starting with eyJ)
  { regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: "[REDACTED_JWT]" },
  // OpenAI API Keys
  { regex: /sk-[A-Za-z0-9_-]{20,}/g, replacement: "[REDACTED_API_KEY]" },
  // NVIDIA NIM API Keys
  { regex: /nvapi-[A-Za-z0-9_-]{20,}/g, replacement: "[REDACTED_API_KEY]" },
  // GitHub Tokens
  { regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { regex: /github_pat_[A-Za-z0-9_]{40,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
];

/**
 * Redact secrets and sensitive substrings from text.
 */
export function redactSensitiveString(text: string): string {
  let redacted = text;
  for (const { regex, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(regex, replacement);
  }
  return redacted;
}

/**
 * Deeply redact sensitive keys and values from objects and arrays.
 */
export function redactSensitiveData<T>(value: T, depth = 0): T {
  if (depth > 10 || value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return redactSensitiveString(value) as unknown as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitiveData(val, depth + 1);
    }
  }
  return result as T;
}

export class VioletAuditLogger {
  private readonly events: VioletTaskEvent[] = [];
  private readonly listeners = new Set<(event: VioletTaskEvent) => void>();
  private readonly maxCapacity: number;

  constructor(maxCapacity = 500) {
    this.maxCapacity = maxCapacity;
  }

  record(eventInput: Omit<VioletTaskEvent, "id" | "createdAt">): VioletTaskEvent {
    const redactedDetails = redactSensitiveData(eventInput.details || {});
    const redactedSummary = redactSensitiveString(eventInput.summary || "");

    const event: VioletTaskEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      taskId: eventInput.taskId,
      userId: eventInput.userId,
      eventType: eventInput.eventType,
      summary: redactedSummary,
      details: redactedDetails,
      createdAt: new Date().toISOString(),
    };

    this.events.unshift(event);
    if (this.events.length > this.maxCapacity) {
      this.events.length = this.maxCapacity;
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Audit listener threw error:", err);
      }
    }

    return event;
  }

  getEvents(taskId?: string, limit = 100): VioletTaskEvent[] {
    const filtered = taskId ? this.events.filter((e) => e.taskId === taskId) : this.events;
    return filtered.slice(0, limit);
  }

  subscribe(listener: (event: VioletTaskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.events.length = 0;
  }
}

export const globalVioletAuditLogger = new VioletAuditLogger();
