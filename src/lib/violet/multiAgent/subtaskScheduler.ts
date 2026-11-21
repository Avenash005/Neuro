/**
 * VIOLET Lab — Phase 3D Subtask DAG Scheduler
 *
 * Decomposes complex user goals into structured subtasks with dependencies,
 * models dependency graphs (DAG), assigns subtasks to suitable AI models,
 * and executes independent subtasks concurrently while enforcing file safety locks.
 */

import type { AgentRole, SubTask } from "../../../types/multiAgent";
import { FileConflictGuard, globalFileConflictGuard } from "./fileConflictGuard";
import { isSupabaseConfigured, supabase } from "../../supabase";

export interface SubTaskDefinition {
  title: string;
  description: string;
  assignedRole: AgentRole;
  targetFiles: string[];
  dependencies?: string[]; // IDs or titles of prerequisites
}

export class SubtaskScheduler {
  private subtasks = new Map<string, SubTask[]>(); // taskId -> SubTasks
  private conflictGuard: FileConflictGuard;

  constructor(conflictGuard: FileConflictGuard = globalFileConflictGuard) {
    this.conflictGuard = conflictGuard;
  }

  /**
   * Registers a set of subtasks for a task.
   */
  async registerSubtasks(
    taskId: string,
    definitions: SubTaskDefinition[],
    userId = "00000000-0000-0000-0000-000000000001",
    runId?: string
  ): Promise<SubTask[]> {
    const list: SubTask[] = definitions.map((def, index) => ({
      id: `sub_${Date.now()}_${index + 1}`,
      taskId,
      runId,
      title: def.title,
      description: def.description,
      assignedRole: def.assignedRole,
      status: "pending",
      dependencies: def.dependencies || [],
      targetFiles: def.targetFiles || [],
      createdAt: new Date().toISOString(),
    }));

    this.subtasks.set(taskId, list);

    if (isSupabaseConfigured && supabase) {
      try {
        for (const st of list) {
          await (supabase.from("agent_subtasks") as any).insert({
            id: st.id,
            task_id: st.taskId,
            run_id: st.runId || null,
            user_id: userId,
            title: st.title,
            description: st.description,
            assigned_role: st.assignedRole,
            assigned_model: st.assignedModel || null,
            status: st.status,
            dependencies: st.dependencies,
            target_files: st.targetFiles,
            created_at: st.createdAt,
          });
        }
      } catch (err) {
        console.warn("Could not persist subtasks to Supabase:", err);
      }
    }

    return list;
  }

  getSubtasks(taskId: string): SubTask[] {
    return this.subtasks.get(taskId) || [];
  }

  /**
   * Returns list of subtasks ready for execution:
   * 1. Status is "pending".
   * 2. All dependencies are "completed".
   * 3. Target files are not locked by another currently executing subtask.
   */
  getReadySubtasks(taskId: string): SubTask[] {
    const all = this.subtasks.get(taskId) || [];
    const completedIds = new Set(all.filter((s) => s.status === "completed").map((s) => s.id));
    const completedTitles = new Set(all.filter((s) => s.status === "completed").map((s) => s.title));

    const currentlyRunning = all.filter((s) => s.status === "running");
    const activeLockedFiles = new Set(currentlyRunning.flatMap((s) => s.targetFiles));

    return all.filter((subtask) => {
      if (subtask.status !== "pending") return false;

      // Check all dependencies satisfied (by ID or Title)
      const depsSatisfied = subtask.dependencies.every(
        (dep) => completedIds.has(dep) || completedTitles.has(dep)
      );
      if (!depsSatisfied) return false;

      // Check target file collision with currently running subtasks
      const hasFileCollision = subtask.targetFiles.some((f) => activeLockedFiles.has(f));
      if (hasFileCollision) return false;

      return true;
    });
  }

  /**
   * Executes subtasks with dependency-aware concurrency.
   */
  async executeDAG(
    taskId: string,
    executor: (subtask: SubTask) => Promise<{ success: boolean; summary: string }>,
    maxConcurrency = 3
  ): Promise<{ allCompleted: boolean; completedCount: number; failedCount: number }> {
    const all = this.subtasks.get(taskId) || [];
    if (all.length === 0) return { allCompleted: true, completedCount: 0, failedCount: 0 };

    let runningCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    while (completedCount + failedCount < all.length) {
      const ready = this.getReadySubtasks(taskId);

      if (ready.length === 0 && runningCount === 0) {
        // Deadlock or unresolvable dependencies
        for (const st of all) {
          if (st.status === "pending") st.status = "blocked";
        }
        break;
      }

      // Dispatch available ready subtasks up to maxConcurrency
      const toDispatch = ready.slice(0, Math.max(0, maxConcurrency - runningCount));

      if (toDispatch.length > 0) {
        for (const subtask of toDispatch) {
          subtask.status = "running";
          subtask.startedAt = new Date().toISOString();
          runningCount++;

          // Acquire file locks for target files
          for (const f of subtask.targetFiles) {
            try {
              this.conflictGuard.acquireLock(taskId, subtask.assignedRole, f);
            } catch {
              // Lock error
            }
          }

          // Execute asynchronously
          void executor(subtask)
            .then((res) => {
              subtask.status = res.success ? "completed" : "failed";
              subtask.resultSummary = res.summary;
              subtask.completedAt = new Date().toISOString();
              if (res.success) completedCount++;
              else failedCount++;
            })
            .catch((err) => {
              subtask.status = "failed";
              subtask.resultSummary = err instanceof Error ? err.message : String(err);
              subtask.completedAt = new Date().toISOString();
              failedCount++;
            })
            .finally(() => {
              runningCount--;
            });
        }
      }

      // Small pause to allow concurrent executions to finish
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    return {
      allCompleted: completedCount === all.length,
      completedCount,
      failedCount,
    };
  }
}

export const globalSubtaskScheduler = new SubtaskScheduler();
