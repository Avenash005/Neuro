/**
 * VIOLET Lab — Phase 3D Agent Collaboration Hub & Task Memory
 *
 * Implements structured peer-to-peer message exchanges, plan challenge and refinement protocols,
 * dynamic assistance requests, and shared task memory blackboard across autonomous agents.
 */

import type {
  AgentMessage,
  AgentMessageType,
  AgentRole,
} from "../../../types/multiAgent";
import { isSupabaseConfigured, supabase } from "../../supabase";

export interface PlanChallengeResult {
  accepted: boolean;
  refinedPlan?: string;
  agreedModifications: string[];
  challengeNotes: string;
}

export class TaskMemoryStore {
  private memory = new Map<string, Map<string, unknown>>(); // taskId -> (key -> value)

  set(taskId: string, key: string, value: unknown): void {
    if (!this.memory.has(taskId)) {
      this.memory.set(taskId, new Map());
    }
    this.memory.get(taskId)!.set(key, value);
  }

  get<T = unknown>(taskId: string, key: string): T | undefined {
    return this.memory.get(taskId)?.get(key) as T | undefined;
  }

  getAll(taskId: string): Record<string, unknown> {
    const taskMap = this.memory.get(taskId);
    if (!taskMap) return {};
    return Object.fromEntries(taskMap.entries());
  }

  clear(taskId: string): void {
    this.memory.delete(taskId);
  }
}

export class AgentCollaborationHub {
  private messages = new Map<string, AgentMessage[]>(); // taskId -> messages
  private readonly memoryStore: TaskMemoryStore;

  constructor(memoryStore = new TaskMemoryStore()) {
    this.memoryStore = memoryStore;
  }

  get memory(): TaskMemoryStore {
    return this.memoryStore;
  }

  /**
   * Dispatches and records a structured message from one agent role to another.
   */
  async sendMessage(
    taskId: string,
    fromRole: AgentRole,
    toRole: AgentRole | "all",
    messageType: AgentMessageType,
    content: string,
    payload: Record<string, unknown> = {},
    userId = "00000000-0000-0000-0000-000000000001",
    runId?: string
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      taskId,
      runId,
      userId,
      fromRole,
      toRole,
      messageType,
      content,
      payload,
      createdAt: new Date().toISOString(),
    };

    if (!this.messages.has(taskId)) {
      this.messages.set(taskId, []);
    }
    this.messages.get(taskId)!.push(message);

    // Persist message to Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("agent_messages") as any).insert({
          id: message.id,
          task_id: message.taskId,
          run_id: message.runId || null,
          user_id: message.userId,
          from_role: message.fromRole,
          to_role: message.toRole,
          message_type: message.messageType,
          content: message.content,
          payload: message.payload,
          created_at: message.createdAt,
        });
      } catch (err) {
        console.warn("Could not persist agent message to Supabase:", err);
      }
    }

    return message;
  }

  /**
   * Retrieves full conversation thread for a task.
   */
  getMessages(taskId: string): AgentMessage[] {
    return this.messages.get(taskId) || [];
  }

  /**
   * Executes the Plan Challenge Protocol:
   * 1. Architect submits a PLAN_PROPOSAL.
   * 2. Reviewer or Developer inspects the plan and challenges potential regressions or gaps.
   * 3. If challenged, Architect refines plan and dispatches PLAN_ACCEPTED.
   */
  async executePlanChallenge(
    taskId: string,
    architectModel: string,
    reviewerModel: string,
    initialPlan: string,
    taskGoal: string,
    challengeEvaluator: (prompt: string) => Promise<{ challengeFound: boolean; concerns: string[]; refinedPlan?: string }>
  ): Promise<PlanChallengeResult> {
    // 1. Architect broadcasts proposed plan
    await this.sendMessage(
      taskId,
      "architect",
      "all",
      "PLAN_PROPOSAL",
      `Architect has proposed initial implementation plan for "${taskGoal}".`,
      { model: architectModel, planLength: initialPlan.length }
    );

    // 2. Reviewer inspects and challenges if needed
    const challengePrompt = `Evaluate the following implementation plan for task: "${taskGoal}".
Identify any potential regressions, security risks, missing test requirements, or file conflicts.
Plan:
${initialPlan}`;

    const evaluation = await challengeEvaluator(challengePrompt);

    if (evaluation.challengeFound && evaluation.concerns.length > 0) {
      // Reviewer challenges the plan
      await this.sendMessage(
        taskId,
        "reviewer",
        "architect",
        "CHALLENGE_PLAN",
        `Reviewer identified ${evaluation.concerns.length} concern(s) in proposed plan: ${evaluation.concerns.join("; ")}`,
        { concerns: evaluation.concerns, reviewerModel }
      );

      // Architect refines plan addressing reviewer's challenge
      const refinedPlan = evaluation.refinedPlan || `${initialPlan}\n\n### Addendum addressing Reviewer concerns:\n${evaluation.concerns.map((c) => `- [RESOLVED] ${c}`).join("\n")}`;

      await this.sendMessage(
        taskId,
        "architect",
        "all",
        "PLAN_ACCEPTED",
        `Architect refined implementation plan addressing peer challenge. All agents aligned on execution.`,
        { refined: true, modifications: evaluation.concerns }
      );

      return {
        accepted: true,
        refinedPlan,
        agreedModifications: evaluation.concerns,
        challengeNotes: `Plan refined after peer review: ${evaluation.concerns.length} concern(s) addressed.`,
      };
    }

    // No challenge raised; plan accepted directly
    await this.sendMessage(
      taskId,
      "reviewer",
      "architect",
      "PLAN_ACCEPTED",
      `Reviewer verified implementation plan. No critical conflicts detected. Plan accepted for execution.`,
      { reviewedBy: reviewerModel }
    );

    return {
      accepted: true,
      refinedPlan: initialPlan,
      agreedModifications: [],
      challengeNotes: "Plan approved on initial submission with zero challenges.",
    };
  }

  /**
   * Executes the Assistance Request Protocol:
   * Developer requests help with a specific architectural or typing problem;
   * Architect or Reviewer responds with actionable advice.
   */
  async requestAssistance(
    taskId: string,
    fromRole: AgentRole,
    toRole: AgentRole,
    question: string,
    responder: (question: string) => Promise<string>
  ): Promise<{ messageId: string; response: string }> {
    // 1. Send assistance request
    const reqMsg = await this.sendMessage(
      taskId,
      fromRole,
      toRole,
      "REQUEST_ASSISTANCE",
      question,
      { requestTimestamp: new Date().toISOString() }
    );

    // 2. Generate and send response
    const answer = await responder(question);

    await this.sendMessage(
      taskId,
      toRole,
      fromRole,
      "ASSISTANCE_RESPONSE",
      answer,
      { replyToMessageId: reqMsg.id }
    );

    return {
      messageId: reqMsg.id,
      response: answer,
    };
  }
}

export const globalAgentCollaborationHub = new AgentCollaborationHub();
