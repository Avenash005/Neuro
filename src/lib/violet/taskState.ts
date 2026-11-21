import type { VioletStepStatus, VioletTaskStatus } from "../../types/violet";

const taskTransitions: Record<VioletTaskStatus, readonly VioletTaskStatus[]> = {
  requested: ["classified", "cancelled"],
  classified: ["planned", "failed", "cancelled"],
  planned: ["awaiting_approval", "queued", "running", "failed", "cancelled"],
  awaiting_approval: ["queued", "running", "cancelled", "failed"],
  queued: ["running", "cancelled", "failed"],
  running: ["awaiting_human", "awaiting_approval", "validating", "failed", "cancelled"],
  awaiting_human: ["running", "cancelled", "failed"],
  validating: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

const stepTransitions: Record<VioletStepStatus, readonly VioletStepStatus[]> = {
  pending: ["awaiting_approval", "running", "skipped"],
  awaiting_approval: ["running", "failed", "skipped"],
  running: ["completed", "failed", "skipped"],
  completed: [],
  failed: [],
  skipped: [],
};

const terminalTaskStatuses = new Set<VioletTaskStatus>(["completed", "failed", "cancelled"]);
const terminalStepStatuses = new Set<VioletStepStatus>(["completed", "failed", "skipped"]);

export function isTerminalTaskStatus(status: VioletTaskStatus): boolean {
  return terminalTaskStatuses.has(status);
}

export function isTerminalStepStatus(status: VioletStepStatus): boolean {
  return terminalStepStatuses.has(status);
}

export function canTransitionTask(from: VioletTaskStatus, to: VioletTaskStatus): boolean {
  return taskTransitions[from].includes(to);
}

export function transitionTask(from: VioletTaskStatus, to: VioletTaskStatus): VioletTaskStatus {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid VIOLET task transition: ${from} -> ${to}`);
  }
  return to;
}

export function getAvailableTaskTransitions(status: VioletTaskStatus): readonly VioletTaskStatus[] {
  return taskTransitions[status];
}

export function canTransitionStep(from: VioletStepStatus, to: VioletStepStatus): boolean {
  return stepTransitions[from].includes(to);
}

export function transitionStep(from: VioletStepStatus, to: VioletStepStatus): VioletStepStatus {
  if (!canTransitionStep(from, to)) {
    throw new Error(`Invalid VIOLET step transition: ${from} -> ${to}`);
  }
  return to;
}

export function getAvailableStepTransitions(status: VioletStepStatus): readonly VioletStepStatus[] {
  return stepTransitions[status];
}
