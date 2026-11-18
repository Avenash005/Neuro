import { describe, expect, it } from "vitest";
import { canTransitionTask, transitionTask } from "./taskState";

describe("VIOLET task state machine", () => {
  it("allows approval and human handoff transitions", () => {
    expect(transitionTask("planned", "awaiting_approval")).toBe("awaiting_approval");
    expect(transitionTask("running", "awaiting_human")).toBe("awaiting_human");
    expect(transitionTask("awaiting_human", "running")).toBe("running");
  });

  it("does not allow tasks to skip validation before completion", () => {
    expect(canTransitionTask("running", "completed")).toBe(false);
    expect(() => transitionTask("running", "completed")).toThrow("Invalid VIOLET task transition");
  });

  it("keeps terminal states terminal", () => {
    expect(canTransitionTask("completed", "running")).toBe(false);
    expect(canTransitionTask("failed", "queued")).toBe(false);
    expect(canTransitionTask("cancelled", "running")).toBe(false);
  });
});
