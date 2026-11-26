import { describe, it, expect, beforeEach } from "vitest";
import { SubtaskScheduler, SubTaskDefinition } from "../subtaskScheduler";
import { FileConflictGuard } from "../fileConflictGuard";

describe("SubtaskScheduler (DAG & Concurrency)", () => {
  let conflictGuard: FileConflictGuard;
  let scheduler: SubtaskScheduler;

  beforeEach(() => {
    conflictGuard = new FileConflictGuard();
    scheduler = new SubtaskScheduler(conflictGuard);
  });

  it("registers subtasks and initializes status to pending", async () => {
    const definitions: SubTaskDefinition[] = [
      {
        title: "Setup Auth Interface",
        description: "Define TokenPayload interface",
        assignedRole: "architect",
        targetFiles: ["src/auth/types.ts"],
        dependencies: [],
      },
      {
        title: "Implement JWT Validator",
        description: "Verify tokens using crypto utils",
        assignedRole: "developer",
        targetFiles: ["src/auth/validator.ts"],
        dependencies: ["Setup Auth Interface"],
      },
    ];

    const subtasks = await scheduler.registerSubtasks("task-dag-1", definitions);
    expect(subtasks.length).toBe(2);
    expect(subtasks[0].title).toBe("Setup Auth Interface");
    expect(subtasks[0].status).toBe("pending");
    expect(subtasks[1].title).toBe("Implement JWT Validator");
    expect(subtasks[1].dependencies).toEqual(["Setup Auth Interface"]);
  });

  it("identifies ready subtasks whose dependencies are satisfied", async () => {
    const definitions: SubTaskDefinition[] = [
      {
        title: "Task A",
        description: "Initial task",
        assignedRole: "architect",
        targetFiles: ["src/a.ts"],
      },
      {
        title: "Task B",
        description: "Depends on Task A",
        assignedRole: "developer",
        targetFiles: ["src/b.ts"],
        dependencies: ["Task A"],
      },
    ];

    const subtasks = await scheduler.registerSubtasks("task-dag-2", definitions);

    // Initially, only Task A is ready
    let ready = scheduler.getReadySubtasks("task-dag-2");
    expect(ready.length).toBe(1);
    expect(ready[0].title).toBe("Task A");

    // Mark Task A as completed
    subtasks[0].status = "completed";

    // Now Task B should be ready
    ready = scheduler.getReadySubtasks("task-dag-2");
    expect(ready.length).toBe(1);
    expect(ready[0].title).toBe("Task B");
  });

  it("prevents subtasks from running concurrently if target files collide", async () => {
    const definitions: SubTaskDefinition[] = [
      {
        title: "Worker 1 Modifying Config",
        description: "Updates config.json",
        assignedRole: "developer",
        targetFiles: ["src/config.json"],
      },
      {
        title: "Worker 2 Modifying Config",
        description: "Also updates config.json",
        assignedRole: "developer",
        targetFiles: ["src/config.json"],
      },
    ];

    const subtasks = await scheduler.registerSubtasks("task-dag-3", definitions);

    // Simulate Worker 1 starting execution
    subtasks[0].status = "running";

    // Worker 2 has colliding targetFiles with currently running Worker 1
    const ready = scheduler.getReadySubtasks("task-dag-3");
    expect(ready.length).toBe(0); // Worker 2 is held back until Worker 1 finishes!

    // When Worker 1 completes, Worker 2 becomes ready
    subtasks[0].status = "completed";
    const readyAfter = scheduler.getReadySubtasks("task-dag-3");
    expect(readyAfter.length).toBe(1);
    expect(readyAfter[0].title).toBe("Worker 2 Modifying Config");
  });

  it("executes an entire DAG with dependency-aware concurrency", async () => {
    const executionOrder: string[] = [];

    const definitions: SubTaskDefinition[] = [
      {
        title: "Step 1: Architecture",
        description: "Plan changes",
        assignedRole: "architect",
        targetFiles: ["src/arch.ts"],
      },
      {
        title: "Step 2A: Feature Implementation",
        description: "Develop feature",
        assignedRole: "developer",
        targetFiles: ["src/feature.ts"],
        dependencies: ["Step 1: Architecture"],
      },
      {
        title: "Step 2B: Utility Implementation",
        description: "Develop independent utility",
        assignedRole: "developer",
        targetFiles: ["src/utils.ts"],
        dependencies: ["Step 1: Architecture"],
      },
      {
        title: "Step 3: Integration & Review",
        description: "Review both implementations",
        assignedRole: "reviewer",
        targetFiles: ["src/feature.ts", "src/utils.ts"],
        dependencies: ["Step 2A: Feature Implementation", "Step 2B: Utility Implementation"],
      },
    ];

    await scheduler.registerSubtasks("task-dag-4", definitions);

    const executor = async (subtask: any) => {
      executionOrder.push(subtask.title);
      // Small simulated async work
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { success: true, summary: `${subtask.title} succeeded` };
    };

    const outcome = await scheduler.executeDAG("task-dag-4", executor, 2);

    expect(outcome.allCompleted).toBe(true);
    expect(outcome.completedCount).toBe(4);
    expect(outcome.failedCount).toBe(0);

    // Verify ordering respects DAG constraints:
    // Step 1 must be executed first
    expect(executionOrder[0]).toBe("Step 1: Architecture");
    // Step 3 must be executed last after both 2A and 2B
    expect(executionOrder[3]).toBe("Step 3: Integration & Review");
    expect(executionOrder.slice(1, 3)).toContain("Step 2A: Feature Implementation");
    expect(executionOrder.slice(1, 3)).toContain("Step 2B: Utility Implementation");
  });
});
