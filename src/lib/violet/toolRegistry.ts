import type {
  VioletToolContext,
  VioletToolExecutor,
  VioletToolManifest,
  VioletToolResult,
} from "../../types/violet";
import { globalVioletAuditLogger } from "./auditLogger";

export interface RegisteredTool {
  manifest: Readonly<VioletToolManifest>;
  executor?: VioletToolExecutor;
}

export class VioletToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(manifest: VioletToolManifest, executor?: VioletToolExecutor): void {
    if (!manifest.name.trim()) throw new Error("Tool name is required");
    if (!manifest.version.trim()) throw new Error("Tool version is required");
    if (!Number.isInteger(manifest.timeoutMs) || manifest.timeoutMs <= 0) {
      throw new Error("Tool timeoutMs must be a positive integer");
    }
    if (this.tools.has(manifest.name)) {
      throw new Error(`Tool already registered: ${manifest.name}`);
    }
    this.tools.set(manifest.name, {
      manifest: Object.freeze({ ...manifest }),
      executor,
    });
  }

  get(name: string): VioletToolManifest | undefined {
    return this.tools.get(name)?.manifest;
  }

  getExecutor(name: string): VioletToolExecutor | undefined {
    return this.tools.get(name)?.executor;
  }

  list(): VioletToolManifest[] {
    return Array.from(this.tools.values()).map((t) => t.manifest);
  }

  listAvailable(grantedScopes: string[]): VioletToolManifest[] {
    const scopes = new Set(grantedScopes);
    return this.list().filter(
      (tool) => tool.enabled && tool.requiredScopes.every((scope) => scopes.has(scope))
    );
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: VioletToolContext
  ): Promise<VioletToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        status: "failed",
        summary: `Tool '${name}' is not registered`,
        recoverable: false,
        evidence: [],
        errorCode: "TOOL_NOT_FOUND",
      };
    }

    if (!tool.manifest.enabled) {
      return {
        status: "failed",
        summary: `Tool '${name}' is disabled`,
        recoverable: false,
        evidence: [],
        errorCode: "TOOL_DISABLED",
      };
    }

    if (!tool.executor) {
      return {
        status: "failed",
        summary: `Tool '${name}' has no execution handler`,
        recoverable: false,
        evidence: [],
        errorCode: "NO_EXECUTOR",
      };
    }

    globalVioletAuditLogger.record({
      taskId: context.taskId,
      userId: context.userId,
      eventType: "tool.invoking",
      summary: `Invoking tool ${name}`,
      details: { tool: name, stepId: context.stepId, arguments: args },
    });

    const timeoutMs = tool.manifest.timeoutMs;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const mergedSignal = context.signal
        ? anyAbortSignal([context.signal, controller.signal])
        : controller.signal;

      const result = await tool.executor(args, {
        ...context,
        signal: mergedSignal,
      });

      globalVioletAuditLogger.record({
        taskId: context.taskId,
        userId: context.userId,
        eventType: "tool.result",
        summary: `Tool ${name} finished with status: ${result.status}`,
        details: { tool: name, stepId: context.stepId, status: result.status, summary: result.summary },
      });

      return result;
    } catch (err: unknown) {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError") ||
        controller.signal.aborted;

      const summary = isAbort
        ? `Tool '${name}' timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : `Tool '${name}' failed with an unknown error`;

      const errorCode = isAbort ? "TIMEOUT" : "EXECUTION_ERROR";

      globalVioletAuditLogger.record({
        taskId: context.taskId,
        userId: context.userId,
        eventType: "tool.error",
        summary: `Tool ${name} failed: ${summary}`,
        details: { tool: name, stepId: context.stepId, errorCode, error: summary },
      });

      return {
        status: "failed",
        summary,
        recoverable: isAbort,
        evidence: [],
        errorCode,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

function anyAbortSignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
