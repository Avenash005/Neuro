import type {
  VioletApprovalRequest,
  VioletExecutionBudget,
  VioletHumanHandoff,
  VioletRiskLevel,
  VioletTask,
  VioletTaskStep,
} from "../../types/violet";
import { createApprovalRequest, consumeApproval } from "./approvalManager";
import { globalVioletAuditLogger } from "./auditLogger";
import { evaluateVioletToolAsync } from "./policy";
import { transitionTask } from "./taskState";
import { VioletToolRegistry } from "./toolRegistry";

export interface OrchestrationContext {
  userId: string;
  grantedScopes: string[];
  registry: VioletToolRegistry;
  approvals?: Map<string, VioletApprovalRequest>;
  signal?: AbortSignal;
  localAgentToken?: string;
  localAgentUrl?: string;
}

export interface StepExecutionOutcome {
  step: VioletTaskStep;
  taskStatus: VioletTask["status"];
  approvalRequest?: VioletApprovalRequest;
  handoff?: VioletHumanHandoff;
}

const DEFAULT_BUDGET: VioletExecutionBudget = {
  maxDurationMs: 60_000,
  maxToolCalls: 25,
  maxRetriesPerStep: 1,
};

export class VioletTaskOrchestrator {
  private readonly registry: VioletToolRegistry;

  constructor(registry: VioletToolRegistry) {
    this.registry = registry;
  }

  createTask(params: {
    id?: string;
    userId: string;
    goal: string;
    source?: VioletTask["source"];
    constraints?: Record<string, unknown>;
    budget?: Partial<VioletExecutionBudget>;
    plan?: VioletTaskStep[];
  }): VioletTask {
    const now = new Date().toISOString();
    const taskId = params.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const plan = params.plan ? params.plan.map((s, idx) => ({ ...s, taskId, order: idx })) : [];

    const task: VioletTask = {
      id: taskId,
      userId: params.userId,
      goal: params.goal.trim(),
      source: params.source || "web",
      status: plan.length > 0 ? "planned" : "requested",
      plan,
      constraints: params.constraints || {},
      executionBudget: { ...DEFAULT_BUDGET, ...params.budget },
      errorCode: null,
      errorSummary: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };

    globalVioletAuditLogger.record({
      taskId: task.id,
      userId: task.userId,
      eventType: "task.created",
      summary: `Created task: ${task.goal}`,
      details: { goal: task.goal, source: task.source },
    });

    return task;
  }

  planTask(task: VioletTask): VioletTask {
    if (task.plan.length > 0) {
      return task;
    }

    const steps = this.decomposeGoal(task.id, task.goal);
    const updatedStatus = transitionTask(
      task.status === "requested" ? "classified" : task.status,
      "planned"
    );

    const plannedTask: VioletTask = {
      ...task,
      status: updatedStatus,
      plan: steps,
      updatedAt: new Date().toISOString(),
    };

    globalVioletAuditLogger.record({
      taskId: plannedTask.id,
      userId: plannedTask.userId,
      eventType: "task.planned",
      summary: `Planned ${steps.length} steps for goal: ${plannedTask.goal}`,
      details: { stepsCount: steps.length, stepTitles: steps.map((s) => s.title) },
    });

    return plannedTask;
  }

  private decomposeGoal(taskId: string, goal: string): VioletTaskStep[] {
    const lower = goal.toLowerCase();
    const steps: VioletTaskStep[] = [];

    if (lower.includes("ping") || lower.includes("health")) {
      steps.push(this.makeStep(taskId, 0, "Check system health", "system.ping", {}, "read_only"));
    } else if (lower.includes("screen") || lower.includes("screenshot") || lower.includes("capture")) {
      steps.push(this.makeStep(taskId, 0, "Capture desktop screen", "computer.screen.capture", {}, "read_only"));
    } else if (lower.includes("search") || lower.includes("find") || lower.includes("memory")) {
      steps.push(
        this.makeStep(
          taskId,
          0,
          "Search knowledge memories",
          "knowledge.search",
          { query: goal.replace(/^(search|find|lookup)\s+/i, "").trim() },
          "read_only"
        )
      );
    } else if (lower.includes("list") && (lower.includes("file") || lower.includes("folder") || lower.includes("dir"))) {
      const pathMatch = goal.match(/(?:in|at|folder)\s+([A-Za-z]:[\\/][^\s]+|[\w.-]+)/i);
      const targetPath = pathMatch ? pathMatch[1] : ".";
      steps.push(this.makeStep(taskId, 0, "List files in directory", "computer.files.list", { path: targetPath }, "read_only"));
    } else if (lower.includes("create file") || lower.includes("write file") || lower.includes("new file")) {
      const pathMatch = goal.match(/(?:file|at|path)\s+([A-Za-z]:[\\/][^\s]+|[\w.-]+)/i);
      const targetPath = pathMatch ? pathMatch[1] : "./violet-note.txt";
      steps.push(
        this.makeStep(
          taskId,
          0,
          "Create workspace text file",
          "computer.files.create",
          { path: targetPath, content: `Created by VIOLET for goal: ${goal}` },
          "reversible"
        )
      );
    } else {
      steps.push(this.makeStep(taskId, 0, "Verify system availability", "system.ping", {}, "read_only"));
      steps.push(
        this.makeStep(
          taskId,
          1,
          "Query personal knowledge base",
          "knowledge.search",
          { query: goal },
          "read_only"
        )
      );
    }

    return steps;
  }

  private makeStep(
    taskId: string,
    order: number,
    title: string,
    toolName: string,
    args: Record<string, unknown>,
    risk: VioletRiskLevel
  ): VioletTaskStep {
    return {
      id: `step_${taskId}_${order}_${Math.random().toString(36).slice(2, 6)}`,
      taskId,
      order,
      title,
      toolName,
      arguments: args,
      risk,
      expectedEvidence: ["reference"],
      status: "pending",
      argumentsPreview: args,
      resultSummary: null,
      evidence: [],
      errorCode: null,
      startedAt: null,
      completedAt: null,
    };
  }

  async runNextStep(
    task: VioletTask,
    context: OrchestrationContext
  ): Promise<{ task: VioletTask; outcome: StepExecutionOutcome | null }> {
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return { task, outcome: null };
    }

    const stepIndex = task.plan.findIndex((s) => s.status === "pending" || s.status === "awaiting_approval");
    if (stepIndex === -1) {
      const completedTask: VioletTask = {
        ...task,
        status: "completed",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      globalVioletAuditLogger.record({
        taskId: task.id,
        userId: task.userId,
        eventType: "task.completed",
        summary: `Task completed successfully: ${task.goal}`,
        details: { totalSteps: task.plan.length },
      });
      return { task: completedTask, outcome: null };
    }

    const step = task.plan[stepIndex];
    const toolManifest = this.registry.get(step.toolName);

    if (!toolManifest) {
      const failedStep: VioletTaskStep = {
        ...step,
        status: "failed",
        errorCode: "TOOL_NOT_FOUND",
        resultSummary: `Tool '${step.toolName}' is not registered`,
        completedAt: new Date().toISOString(),
      };
      const updatedPlan = [...task.plan];
      updatedPlan[stepIndex] = failedStep;
      const failedTask: VioletTask = {
        ...task,
        status: "failed",
        plan: updatedPlan,
        errorCode: "TOOL_NOT_FOUND",
        errorSummary: `Step ${step.title} failed: Tool not found`,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      return { task: failedTask, outcome: { step: failedStep, taskStatus: "failed" } };
    }

    const existingApproval = context.approvals?.get(step.id);
    const policyDecision = await evaluateVioletToolAsync(toolManifest, {
      enabled: true,
      grantedScopes: context.grantedScopes,
      approval: existingApproval,
      arguments: step.arguments,
    });

    if (!policyDecision.allowed) {
      const rejectedStep: VioletTaskStep = {
        ...step,
        status: "failed",
        errorCode: "POLICY_REJECTED",
        resultSummary: policyDecision.reason,
        completedAt: new Date().toISOString(),
      };
      const updatedPlan = [...task.plan];
      updatedPlan[stepIndex] = rejectedStep;
      const failedTask: VioletTask = {
        ...task,
        status: "failed",
        plan: updatedPlan,
        errorCode: "POLICY_REJECTED",
        errorSummary: policyDecision.reason,
        updatedAt: new Date().toISOString(),
      };
      return { task: failedTask, outcome: { step: rejectedStep, taskStatus: "failed" } };
    }

    if (policyDecision.requiresApproval) {
      const approvalRequest =
        existingApproval ||
        (await createApprovalRequest({
          taskId: task.id,
          stepId: step.id,
          operation: step.toolName,
          consequence: policyDecision.reason,
          argumentsPreview: step.arguments,
        }));

      const awaitingStep: VioletTaskStep = {
        ...step,
        status: "awaiting_approval",
        argumentsHash: approvalRequest.argumentsHash,
      };
      const updatedPlan = [...task.plan];
      updatedPlan[stepIndex] = awaitingStep;

      const awaitingTask: VioletTask = {
        ...task,
        status: "awaiting_approval",
        plan: updatedPlan,
        updatedAt: new Date().toISOString(),
      };

      globalVioletAuditLogger.record({
        taskId: task.id,
        userId: task.userId,
        eventType: "step.awaiting_approval",
        summary: `Approval required for ${step.title}: ${policyDecision.reason}`,
        details: { stepId: step.id, operation: step.toolName, consequence: policyDecision.reason },
      });

      return {
        task: awaitingTask,
        outcome: {
          step: awaitingStep,
          taskStatus: "awaiting_approval",
          approvalRequest,
        },
      };
    }

    let runningTask = task;
    if (task.status !== "running") {
      runningTask = {
        ...task,
        status: "running",
        startedAt: task.startedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const runningStep: VioletTaskStep = {
      ...step,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    runningTask.plan[stepIndex] = runningStep;

    if (existingApproval && existingApproval.status === "approved") {
      try {
        const consumed = consumeApproval(existingApproval);
        context.approvals?.set(step.id, consumed);
      } catch {
        // ignore if already consumed
      }
    }

    const toolResult = await this.registry.execute(step.toolName, step.arguments, {
      taskId: task.id,
      stepId: step.id,
      userId: context.userId,
      signal: context.signal,
      localAgentToken: context.localAgentToken,
      localAgentUrl: context.localAgentUrl,
    });

    if (toolResult.status === "needs_human") {
      const handoff: VioletHumanHandoff = {
        id: `hnd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        taskId: task.id,
        stepId: step.id,
        reason: "captcha",
        instructions: toolResult.summary || "Human intervention required to complete security challenge",
        visibleClient: "desktop",
        status: "waiting",
        createdAt: new Date().toISOString(),
      };

      const awaitingHumanTask: VioletTask = {
        ...runningTask,
        status: "awaiting_human",
        updatedAt: new Date().toISOString(),
      };

      return {
        task: awaitingHumanTask,
        outcome: {
          step: runningStep,
          taskStatus: "awaiting_human",
          handoff,
        },
      };
    }

    if (toolResult.status === "succeeded") {
      const completedStep: VioletTaskStep = {
        ...runningStep,
        status: "completed",
        resultSummary: toolResult.summary,
        evidence: toolResult.evidence,
        completedAt: new Date().toISOString(),
      };
      const updatedPlan = [...runningTask.plan];
      updatedPlan[stepIndex] = completedStep;

      const hasMore = updatedPlan.some((s) => s.status === "pending" || s.status === "awaiting_approval");
      const nextTaskStatus = hasMore ? "running" : "completed";

      const updatedTask: VioletTask = {
        ...runningTask,
        status: nextTaskStatus,
        plan: updatedPlan,
        updatedAt: new Date().toISOString(),
        completedAt: hasMore ? null : new Date().toISOString(),
      };

      return {
        task: updatedTask,
        outcome: {
          step: completedStep,
          taskStatus: nextTaskStatus,
        },
      };
    }

    const failedStep: VioletTaskStep = {
      ...runningStep,
      status: "failed",
      errorCode: toolResult.errorCode || "EXECUTION_FAILED",
      resultSummary: toolResult.summary,
      completedAt: new Date().toISOString(),
    };
    const updatedPlan = [...runningTask.plan];
    updatedPlan[stepIndex] = failedStep;

    const failedTask: VioletTask = {
      ...runningTask,
      status: "failed",
      plan: updatedPlan,
      errorCode: toolResult.errorCode || "STEP_FAILED",
      errorSummary: `Step '${step.title}' failed: ${toolResult.summary}`,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    return {
      task: failedTask,
      outcome: {
        step: failedStep,
        taskStatus: "failed",
      },
    };
  }

  async executeTask(
    taskInput: VioletTask,
    context: OrchestrationContext
  ): Promise<VioletTask> {
    let currentTask = taskInput.plan.length === 0 ? this.planTask(taskInput) : taskInput;

    const startTime = Date.now();
    let callCount = 0;
    const maxCalls = currentTask.executionBudget.maxToolCalls;
    const maxDuration = currentTask.executionBudget.maxDurationMs;

    while (
      currentTask.status !== "completed" &&
      currentTask.status !== "failed" &&
      currentTask.status !== "cancelled" &&
      currentTask.status !== "awaiting_approval" &&
      currentTask.status !== "awaiting_human"
    ) {
      if (context.signal?.aborted) {
        return this.cancelTask(currentTask, "Cancelled by user");
      }

      if (Date.now() - startTime > maxDuration) {
        return this.failTask(currentTask, "BUDGET_TIMEOUT", `Exceeded max execution duration of ${maxDuration}ms`);
      }

      if (callCount >= maxCalls) {
        return this.failTask(currentTask, "BUDGET_TOOL_CALLS", `Exceeded max allowed tool calls (${maxCalls})`);
      }

      callCount++;
      const { task: nextTask } = await this.runNextStep(currentTask, context);
      currentTask = nextTask;
    }

    return currentTask;
  }

  cancelTask(task: VioletTask, reason = "Task cancelled"): VioletTask {
    const updatedStatus = task.status !== "completed" && task.status !== "failed" ? "cancelled" : task.status;
    const cancelledTask: VioletTask = {
      ...task,
      status: updatedStatus,
      errorSummary: reason,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    globalVioletAuditLogger.record({
      taskId: task.id,
      userId: task.userId,
      eventType: "task.cancelled",
      summary: `Task cancelled: ${reason}`,
      details: { reason },
    });
    return cancelledTask;
  }

  private failTask(task: VioletTask, errorCode: string, errorSummary: string): VioletTask {
    const failedTask: VioletTask = {
      ...task,
      status: "failed",
      errorCode,
      errorSummary,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    globalVioletAuditLogger.record({
      taskId: task.id,
      userId: task.userId,
      eventType: "task.failed",
      summary: `Task failed: ${errorSummary}`,
      details: { errorCode, errorSummary },
    });
    return failedTask;
  }
}
