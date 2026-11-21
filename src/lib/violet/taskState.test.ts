import { describe, expect, it } from "vitest";
import {
  canTransitionStep,
  canTransitionTask,
  getAvailableStepTransitions,
  getAvailableTaskTransitions,
  isTerminalStepStatus,
  isTerminalTaskStatus,
  transitionStep,
  transitionTask,
} from "./taskState";

describe("Violet task state transitions", () => {
  it("allows valid linear task transitions", () => {
    expect(transitionTask("requested", "classified")).toBe("classified");
    expect(transitionTask("classified", "planned")).toBe("planned");
    expect(transitionTask("planned", "queued")).toBe("queued");
    expect(transitionTask("queued", "running")).toBe("running");
    expect(transitionTask("running", "validating")).toBe("validating");
    expect(transitionTask("validating", "completed")).toBe("completed");
  });

  it("handles approval and human handoff cycles", () => {
    expect(canTransitionTask("planned", "awaiting_approval")).toBe(true);
    expect(canTransitionTask("awaiting_approval", "running")).toBe(true);
    expect(canTransitionTask("running", "awaiting_human")).toBe(true);
    expect(canTransitionTask("awaiting_human", "running")).toBe(true);
    expect(canTransitionTask("running", "awaiting_approval")).toBe(true);
  });

  it("allows cancellation from non-terminal states", () => {
    expect(canTransitionTask("requested", "cancelled")).toBe(true);
    expect(canTransitionTask("running", "cancelled")).toBe(true);
    expect(canTransitionTask("awaiting_approval", "cancelled")).toBe(true);
    expect(canTransitionTask("awaiting_human", "cancelled")).toBe(true);
  });

  it("blocks transitions from terminal states", () => {
    expect(canTransitionTask("completed", "running")).toBe(false);
    expect(canTransitionTask("failed", "running")).toBe(false);
    expect(canTransitionTask("cancelled", "running")).toBe(false);
    expect(() => transitionTask("completed", "running")).toThrow("Invalid VIOLET task transition");
  });

  it("identifies terminal states correctly", () => {
    expect(isTerminalTaskStatus("completed")).toBe(true);
    expect(isTerminalTaskStatus("failed")).toBe(true);
    expect(isTerminalTaskStatus("cancelled")).toBe(true);
    expect(isTerminalTaskStatus("running")).toBe(false);
    expect(isTerminalTaskStatus("planned")).toBe(false);
  });

  it("returns available task transitions", () => {
    expect(getAvailableTaskTransitions("running")).toContain("validating");
    expect(getAvailableTaskTransitions("running")).toContain("awaiting_human");
    expect(getAvailableTaskTransitions("completed")).toHaveLength(0);
  });
});

describe("Violet step state transitions", () => {
  it("allows normal step execution lifecycle", () => {
    expect(transitionStep("pending", "running")).toBe("running");
    expect(transitionStep("running", "completed")).toBe("completed");
  });

  it("supports approval and skipping for steps", () => {
    expect(transitionStep("pending", "awaiting_approval")).toBe("awaiting_approval");
    expect(transitionStep("awaiting_approval", "running")).toBe("running");
    expect(transitionStep("pending", "skipped")).toBe("skipped");
    expect(transitionStep("running", "failed")).toBe("failed");
  });

  it("blocks invalid transitions from terminal step states", () => {
    expect(canTransitionStep("completed", "running")).toBe(false);
    expect(canTransitionStep("failed", "running")).toBe(false);
    expect(canTransitionStep("skipped", "running")).toBe(false);
    expect(() => transitionStep("completed", "running")).toThrow("Invalid VIOLET step transition");
  });

  it("identifies terminal step states", () => {
    expect(isTerminalStepStatus("completed")).toBe(true);
    expect(isTerminalStepStatus("failed")).toBe(true);
    expect(isTerminalStepStatus("skipped")).toBe(true);
    expect(isTerminalStepStatus("pending")).toBe(false);
    expect(isTerminalStepStatus("running")).toBe(false);
  });

  it("returns available step transitions", () => {
    expect(getAvailableStepTransitions("pending")).toEqual(["awaiting_approval", "running", "skipped"]);
    expect(getAvailableStepTransitions("completed")).toEqual([]);
  });
});
