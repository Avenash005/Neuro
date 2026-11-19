import type {
  VioletApprovalRequest,
  VioletHumanHandoff,
  VioletTask,
  VioletTaskEvent,
} from "../../types/violet";
import { isSupabaseConfigured, supabase } from "../supabase";
import { globalVioletAuditLogger } from "./auditLogger";

export interface VioletStateChange {
  type: "tasks" | "approvals" | "handoffs" | "events";
  data: unknown;
}

class VioletService {
  private inMemoryTasks: VioletTask[] = [];
  private inMemoryApprovals: VioletApprovalRequest[] = [];
  private inMemoryHandoffs: VioletHumanHandoff[] = [];
  private readonly listeners = new Set<(change: VioletStateChange) => void>();

  constructor() {
    globalVioletAuditLogger.subscribe((event) => {
      this.notifyListeners({ type: "events", data: event });
    });
  }

  subscribe(listener: (change: VioletStateChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(change: VioletStateChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (err) {
        console.error("VioletService listener error:", err);
      }
    }
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async saveTask(task: VioletTask): Promise<VioletTask> {
    const existingIndex = this.inMemoryTasks.findIndex((t) => t.id === task.id);
    if (existingIndex >= 0) {
      this.inMemoryTasks[existingIndex] = { ...task, updatedAt: new Date().toISOString() };
    } else {
      this.inMemoryTasks.unshift({ ...task });
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("agent_tasks") as any).upsert({
          id: task.id,
          user_id: task.userId,
          goal: task.goal,
          source: task.source,
          status: task.status,
          plan: task.plan as any,
          constraints: task.constraints as any,
          execution_budget: task.executionBudget as any,
          error_code: task.errorCode,
          error_summary: task.errorSummary,
          started_at: task.startedAt,
          completed_at: task.completedAt,
        });

        // Upsert steps
        for (const step of task.plan) {
          await (supabase.from("agent_task_steps") as any).upsert({
            id: step.id,
            task_id: task.id,
            user_id: task.userId,
            step_order: step.order,
            title: step.title,
            tool_name: step.toolName,
            risk: step.risk,
            status: step.status,
            arguments_hash: step.argumentsHash || null,
            arguments_preview: step.argumentsPreview || ({} as any),
            result_summary: step.resultSummary || null,
            evidence: step.evidence || ([] as any),
            error_code: step.errorCode || null,
            started_at: step.startedAt || null,
            completed_at: step.completedAt || null,
          });
        }
      } catch (err) {
        console.warn("Could not sync task to Supabase, running with local in-memory store:", err);
      }
    }

    this.notifyListeners({ type: "tasks", data: this.inMemoryTasks });
    return task;
  }

  async getTask(taskId: string): Promise<VioletTask | undefined> {
    const local = this.inMemoryTasks.find((t) => t.id === taskId);
    if (local) return local;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await (supabase.from("agent_tasks") as any)
          .select("*")
          .eq("id", taskId)
          .single();
        if (data && !error) {
          const task: VioletTask = {
            id: data.id,
            userId: data.user_id,
            goal: data.goal,
            source: data.source as any,
            status: data.status as any,
            plan: (data.plan as any) || [],
            constraints: (data.constraints as any) || {},
            executionBudget: (data.execution_budget as any) || { maxDurationMs: 60000, maxToolCalls: 25 },
            errorCode: data.error_code,
            errorSummary: data.error_summary,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            startedAt: data.started_at,
            completedAt: data.completed_at,
          };
          this.inMemoryTasks.unshift(task);
          return task;
        }
      } catch {
        // fallback
      }
    }
    return undefined;
  }

  async listTasks(): Promise<VioletTask[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await (supabase.from("agent_tasks") as any)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (data && !error && data.length > 0) {
          this.inMemoryTasks = data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            goal: d.goal,
            source: d.source,
            status: d.status,
            plan: d.plan || [],
            constraints: d.constraints || {},
            executionBudget: d.execution_budget || { maxDurationMs: 60000, maxToolCalls: 25 },
            errorCode: d.error_code,
            errorSummary: d.error_summary,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
            startedAt: d.started_at,
            completedAt: d.completed_at,
          }));
        }
      } catch {
        // fallback to in-memory
      }
    }
    return [...this.inMemoryTasks];
  }

  // ─── Approvals ─────────────────────────────────────────────────────────────

  async saveApproval(approval: VioletApprovalRequest): Promise<VioletApprovalRequest> {
    const existingIdx = this.inMemoryApprovals.findIndex((a) => a.id === approval.id);
    if (existingIdx >= 0) {
      this.inMemoryApprovals[existingIdx] = approval;
    } else {
      this.inMemoryApprovals.unshift(approval);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("agent_approvals") as any).upsert({
          id: approval.id,
          task_id: approval.taskId,
          step_id: approval.stepId,
          operation: approval.operation,
          consequence: approval.consequence,
          arguments_hash: approval.argumentsHash,
          arguments_preview: approval.argumentsPreview as any,
          status: approval.status,
          expires_at: approval.expiresAt,
          decided_at: approval.decidedAt,
          consumed_at: approval.consumedAt,
        });
      } catch (err) {
        console.warn("Could not save approval to Supabase:", err);
      }
    }

    this.notifyListeners({ type: "approvals", data: this.inMemoryApprovals });
    return approval;
  }

  async respondApproval(approvalId: string, approved: boolean): Promise<VioletApprovalRequest | undefined> {
    const approval = this.inMemoryApprovals.find((a) => a.id === approvalId);
    if (!approval) return undefined;

    const updated: VioletApprovalRequest = {
      ...approval,
      status: approved ? "approved" : "rejected",
      decidedAt: new Date().toISOString(),
    };

    return this.saveApproval(updated);
  }

  listApprovals(taskId?: string): VioletApprovalRequest[] {
    if (taskId) {
      return this.inMemoryApprovals.filter((a) => a.taskId === taskId);
    }
    return [...this.inMemoryApprovals];
  }

  // ─── Human Handoffs ────────────────────────────────────────────────────────

  async saveHandoff(handoff: VioletHumanHandoff): Promise<VioletHumanHandoff> {
    const existingIdx = this.inMemoryHandoffs.findIndex((h) => h.id === handoff.id);
    if (existingIdx >= 0) {
      this.inMemoryHandoffs[existingIdx] = handoff;
    } else {
      this.inMemoryHandoffs.unshift(handoff);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("agent_handoffs") as any).upsert({
          id: handoff.id,
          task_id: handoff.taskId,
          step_id: handoff.stepId || null,
          reason: handoff.reason,
          instructions: handoff.instructions,
          visible_client: handoff.visibleClient,
          status: handoff.status,
          resumed_at: handoff.resumedAt,
          expires_at: handoff.expiresAt,
        });
      } catch (err) {
        console.warn("Could not save handoff to Supabase:", err);
      }
    }

    this.notifyListeners({ type: "handoffs", data: this.inMemoryHandoffs });
    return handoff;
  }

  async resumeHandoff(handoffId: string): Promise<VioletHumanHandoff | undefined> {
    const handoff = this.inMemoryHandoffs.find((h) => h.id === handoffId);
    if (!handoff) return undefined;

    const updated: VioletHumanHandoff = {
      ...handoff,
      status: "resumed",
      resumedAt: new Date().toISOString(),
    };

    return this.saveHandoff(updated);
  }

  listHandoffs(taskId?: string): VioletHumanHandoff[] {
    if (taskId) {
      return this.inMemoryHandoffs.filter((h) => h.taskId === taskId);
    }
    return [...this.inMemoryHandoffs];
  }

  // ─── Audit Events ──────────────────────────────────────────────────────────

  listAuditEvents(taskId?: string, limit = 50): VioletTaskEvent[] {
    return globalVioletAuditLogger.getEvents(taskId, limit);
  }
}

export const violetService = new VioletService();
