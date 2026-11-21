import { describe, it, expect, beforeEach } from "vitest";
import { AgentCollaborationHub, TaskMemoryStore } from "../agentCollaboration";

describe("AgentCollaborationHub & TaskMemoryStore", () => {
  let memoryStore: TaskMemoryStore;
  let hub: AgentCollaborationHub;

  beforeEach(() => {
    memoryStore = new TaskMemoryStore();
    hub = new AgentCollaborationHub(memoryStore);
  });

  describe("TaskMemoryStore (Blackboard)", () => {
    it("stores, retrieves, and clears shared task context", () => {
      memoryStore.set("task-1", "architecturalPattern", "CQRS");
      memoryStore.set("task-1", "targetBranch", "feat/auth");
      memoryStore.set("task-2", "framework", "React");

      expect(memoryStore.get("task-1", "architecturalPattern")).toBe("CQRS");
      expect(memoryStore.get("task-1", "targetBranch")).toBe("feat/auth");
      expect(memoryStore.get("task-2", "framework")).toBe("React");

      const allTask1 = memoryStore.getAll("task-1");
      expect(allTask1).toEqual({
        architecturalPattern: "CQRS",
        targetBranch: "feat/auth",
      });

      memoryStore.clear("task-1");
      expect(memoryStore.get("task-1", "architecturalPattern")).toBeUndefined();
      expect(memoryStore.getAll("task-1")).toEqual({});
      expect(memoryStore.get("task-2", "framework")).toBe("React");
    });
  });

  describe("Structured Messaging Protocol", () => {
    it("sends and retrieves structured agent messages", async () => {
      const msg1 = await hub.sendMessage(
        "task-msg-1",
        "architect",
        "developer",
        "PLAN_PROPOSAL",
        "Proposed architecture plan for single-user auth",
        { steps: 3, targetFiles: ["src/auth.ts"] }
      );

      expect(msg1.id).toBeDefined();
      expect(msg1.fromRole).toBe("architect");
      expect(msg1.toRole).toBe("developer");
      expect(msg1.messageType).toBe("PLAN_PROPOSAL");
      expect(msg1.payload?.steps).toBe(3);

      const msg2 = await hub.sendMessage(
        "task-msg-1",
        "developer",
        "architect",
        "STATUS_UPDATE",
        "Finished step 1"
      );

      const conversation = hub.getMessages("task-msg-1");
      expect(conversation.length).toBe(2);
      expect(conversation[0].id).toBe(msg1.id);
      expect(conversation[1].id).toBe(msg2.id);
    });
  });

  describe("Plan Challenge & Refinement Protocol", () => {
    it("handles plan challenge from peer reviewer and produces refined plan", async () => {
      const initialPlan = "Plan: Modify auth middleware directly in production handler.";
      const goal = "Secure owner endpoints";

      const challengeEvaluator = async () => {
        return {
          challengeFound: true,
          concerns: [
            "Missing regression unit tests for invalid tokens",
            "Potential race condition in token cache",
          ],
          refinedPlan:
            "Refined Plan: Modify auth middleware with isolated test suites and synchronous token validation.",
        };
      };

      const result = await hub.executePlanChallenge(
        "task-challenge-1",
        "claude-3-5-sonnet",
        "gemini-2.5-pro",
        initialPlan,
        goal,
        challengeEvaluator
      );

      expect(result.accepted).toBe(true);
      expect(result.agreedModifications.length).toBe(2);
      expect(result.refinedPlan).toContain("Refined Plan");

      const messages = hub.getMessages("task-challenge-1");
      expect(messages.length).toBe(3);
      expect(messages[0].messageType).toBe("PLAN_PROPOSAL");
      expect(messages[1].messageType).toBe("CHALLENGE_PLAN");
      expect(messages[2].messageType).toBe("PLAN_ACCEPTED");
    });

    it("approves plan directly when reviewer finds zero concerns", async () => {
      const initialPlan = "Plan: Comprehensive architecture with unit tests and rollback plan.";
      const goal = "Add rate limiter";

      const challengeEvaluator = async () => ({
        challengeFound: false,
        concerns: [],
      });

      const result = await hub.executePlanChallenge(
        "task-no-challenge",
        "claude-3-5-sonnet",
        "gemini-2.5-pro",
        initialPlan,
        goal,
        challengeEvaluator
      );

      expect(result.accepted).toBe(true);
      expect(result.refinedPlan).toBe(initialPlan);
      expect(result.agreedModifications.length).toBe(0);

      const messages = hub.getMessages("task-no-challenge");
      expect(messages.length).toBe(2);
      expect(messages[0].messageType).toBe("PLAN_PROPOSAL");
      expect(messages[1].messageType).toBe("PLAN_ACCEPTED");
    });
  });

  describe("Dynamic Assistance Request Protocol", () => {
    it("dispatches assistance request and receives peer response", async () => {
      const responder = async (q: string) => {
        expect(q).toContain("How should we mock the Git worktree?");
        return "Use a temporary directory with git init and isolated branch creation.";
      };

      const outcome = await hub.requestAssistance(
        "task-assist-1",
        "developer",
        "architect",
        "How should we mock the Git worktree?",
        responder
      );

      expect(outcome.messageId).toBeDefined();
      expect(outcome.response).toContain("Use a temporary directory");

      const messages = hub.getMessages("task-assist-1");
      expect(messages.length).toBe(2);
      expect(messages[0].messageType).toBe("REQUEST_ASSISTANCE");
      expect(messages[1].messageType).toBe("ASSISTANCE_RESPONSE");
      expect(messages[1].payload?.replyToMessageId).toBe(outcome.messageId);
    });
  });
});
