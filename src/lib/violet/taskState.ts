import type { VioletTaskStatus } from "../../types/violet";

const transitions: Record<VioletTaskStatus, VioletTaskStatus[]> = {
  requested: ["classified", "cancelled"],
  classified: ["planned", "failed", "cancelled"],
  planned: ["awaiting_approval", "queued", "failed", "cancelled"],
  awaiting_approval: ["queued", "cancelled", "failed"],
  queued: ["running", "cancelled", "failed"],
  running: ["awaiting_human", "validating", "failed", "cancelled"],
  awaiting_human: ["running", "cancelled", "failed"],
  validating: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionTask(from: VioletTaskStatus, to: VioletTaskStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionTask(from: VioletTaskStatus, to: VioletTaskStatus): VioletTaskStatus {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid VIOLET task transition: ${from} -> ${to}`);
  }
  return to;
}
