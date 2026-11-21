/**
 * VIOLET AI — Intelligent Model Router
 *
 * Implements context-aware task classification, multi-factor model scoring,
 * strict privacy policy enforcement (AUTO, LOCAL_ONLY, CLOUD_ONLY),
 * fallback sequence generation, and transparent routing explanations.
 */

import type { ProviderRegistry } from "./providerRegistry";
import type {
  ChatMessage,
  ChatRequest,
  ModelDefinition,
  PrivacyPolicy,
  RoutingMetadata,
  TaskCategory,
  UserPreferences,
} from "./types";

export interface RoutingDecision {
  selectedModel: ModelDefinition;
  fallbackCandidates: ModelDefinition[];
  metadata: RoutingMetadata;
}

export class IntelligentModelRouter {
  private readonly registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Classifies user intent and messages into a primary task category.
   */
  classifyTask(messages: ChatMessage[], explicitCategory?: TaskCategory): TaskCategory {
    if (explicitCategory) {
      return explicitCategory;
    }

    // Inspect user messages
    let combinedText = "";
    let hasImages = false;

    for (const m of messages) {
      if (typeof m.content === "string") {
        combinedText += " " + m.content;
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "text") combinedText += " " + part.text;
          if (part.type === "image") hasImages = true;
        }
      }
    }

    if (hasImages) {
      return "vision";
    }

    const text = combinedText.toLowerCase();

    // 1. Desktop Planning / OS Automation
    if (
      text.includes("click") ||
      text.includes("window") ||
      text.includes("desktop") ||
      text.includes("application") ||
      text.includes("launch") ||
      text.includes("process") ||
      text.includes("keyboard") ||
      text.includes("type into") ||
      text.includes("screen") ||
      text.includes("mouse") ||
      text.includes("explorer") ||
      text.includes("powershell") ||
      text.includes("file in folder")
    ) {
      return "desktop_planning";
    }

    // 2. Coding
    if (
      text.includes("function") ||
      text.includes("class ") ||
      text.includes("const ") ||
      text.includes("def ") ||
      text.includes("return ") ||
      text.includes("code") ||
      text.includes("debug") ||
      text.includes("refactor") ||
      text.includes("git ") ||
      text.includes("pull request") ||
      text.includes("typescript") ||
      text.includes("python") ||
      text.includes("compile") ||
      text.includes("syntax error") ||
      text.includes("stack trace") ||
      text.includes("api endpoint")
    ) {
      return "coding";
    }

    // 3. Reasoning
    if (
      text.includes("proof") ||
      text.includes("calculate") ||
      text.includes("algorithm") ||
      text.includes("step by step logic") ||
      text.includes("deduce") ||
      text.includes("analyze trade-offs") ||
      text.includes("complex decision") ||
      text.includes("solve equation")
    ) {
      return "reasoning";
    }

    // 4. Summarization
    if (
      text.includes("summarize") ||
      text.includes("summary") ||
      text.includes("tl;dr") ||
      text.includes("briefing") ||
      text.includes("key takeaways") ||
      text.includes("condense") ||
      text.includes("recap")
    ) {
      return "summarization";
    }

    // 5. Structured Output
    if (
      text.includes("json") ||
      text.includes("schema") ||
      text.includes("extract fields") ||
      text.includes("output as table") ||
      text.includes("csv format") ||
      text.includes("strict format")
    ) {
      return "structured_output";
    }

    return "general_chat";
  }

  /**
   * Filters and ranks candidate models based on task, policies, and health.
   */
  async route(request: ChatRequest, preferences?: Partial<UserPreferences>): Promise<RoutingDecision> {
    const policy: PrivacyPolicy = request.policy || preferences?.privacyPolicy || "AUTO";
    const taskCategory = this.classifyTask(request.messages, request.task_category);
    const hasImages = request.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image")
    );
    const requiresTools = Boolean((request.tools && request.tools.length > 0) || taskCategory === "desktop_planning");

    // All available models across providers
    const allModels = await this.registry.listAllModels();

    // ─── Policy Filter ────────────────────────────────────────────────────────
    let candidates = allModels.filter((model) => {
      if (policy === "LOCAL_ONLY") {
        return model.capabilities.local_or_cloud === "local";
      }
      if (policy === "CLOUD_ONLY") {
        return model.capabilities.local_or_cloud === "cloud";
      }
      return true; // AUTO allows both
    });

    // ─── Capability Filter ────────────────────────────────────────────────────
    candidates = candidates.filter((model) => {
      if (hasImages && !model.capabilities.vision) {
        return false;
      }
      if (requiresTools && !model.capabilities.tool_calling) {
        return false;
      }
      return true;
    });

    // ─── Circuit Breaker & Configured Check ────────────────────────────────────
    candidates = candidates.filter((model) => {
      const adapter = this.registry.getAdapter(model.provider);
      if (!adapter) return false;
      if (!adapter.isConfigured) return false;
      if (!adapter.circuitBreaker.isAvailable()) return false;
      return true;
    });

    // Handle Manual Model Override
    if (request.model) {
      const exactModel = allModels.find((m) => m.id === request.model || m.name === request.model);
      if (exactModel) {
        // Enforce policy even on manual override: LOCAL_ONLY MUST NOT use cloud!
        if (policy === "LOCAL_ONLY" && exactModel.capabilities.local_or_cloud !== "local") {
          throw new Error(
            `Policy violation: Manual selection '${exactModel.id}' is a cloud model, but policy is set to strictly LOCAL_ONLY.`
          );
        }
        if (policy === "CLOUD_ONLY" && exactModel.capabilities.local_or_cloud !== "cloud") {
          throw new Error(
            `Policy violation: Manual selection '${exactModel.id}' is a local model, but policy is set to CLOUD_ONLY.`
          );
        }

        const remainingFallbacks = candidates.filter((c) => c.id !== exactModel.id);
        return {
          selectedModel: exactModel,
          fallbackCandidates: remainingFallbacks,
          metadata: {
            taskCategory,
            selectedReason: `Manual override: user specified model '${exactModel.name}' (${exactModel.provider}). Policy '${policy}' satisfied.`,
            policy,
            mode: "manual",
            fallbackUsed: false,
            evaluatedCandidatesCount: candidates.length,
          },
        };
      }
    }

    // If no candidate satisfies the hard policy/capability constraints
    if (candidates.length === 0) {
      if (policy === "LOCAL_ONLY") {
        throw new Error(
          `No local model available satisfying policy 'LOCAL_ONLY'. Ollama may be offline or no local model installed with required capabilities (Vision: ${hasImages}, Tools: ${requiresTools}). Data will NOT leave your machine.`
        );
      }
      throw new Error(
        `No available models found for task '${taskCategory}' with policy '${policy}'. Ensure at least one provider (Ollama, OpenRouter, OpenAI, Gemini, Anthropic) is configured and healthy.`
      );
    }

    // ─── Multi-Factor Scoring ─────────────────────────────────────────────────
    const costPref = request.cost_preference || preferences?.costPreference || "balance";
    const latencyPref = request.latency_preference || preferences?.latencyPreference || "standard";
    const preferredProvider = preferences?.defaultProvider;

    const scoredCandidates = candidates.map((candidate) => {
      let score = 50; // base score

      // Provider affinity
      if (preferredProvider && candidate.provider === preferredProvider) {
        score += 25;
      }

      // Local preference in AUTO mode when task is desktop automation or sensitive
      if (policy === "AUTO" && candidate.capabilities.local_or_cloud === "local") {
        if (taskCategory === "desktop_planning") score += 20;
        if (costPref === "minimize_cost") score += 30;
      }

      // Task affinity bonuses
      switch (taskCategory) {
        case "coding":
          if (candidate.id.includes("claude-3-5-sonnet") || candidate.id.includes("claude-3-7-sonnet")) score += 40;
          if (candidate.id.includes("gpt-4o")) score += 30;
          if (candidate.id.includes("coder") || candidate.id.includes("qwen2.5")) score += 25;
          break;
        case "vision":
          if (candidate.id.includes("gemini") || candidate.id.includes("claude-3-5-sonnet") || candidate.id.includes("gpt-4o")) score += 35;
          if (candidate.id.includes("llava") || candidate.id.includes("vision")) score += 20;
          break;
        case "reasoning":
          if (candidate.id.includes("o1") || candidate.id.includes("o3") || candidate.id.includes("claude-3-7-sonnet")) score += 45;
          if (candidate.id.includes("gemini-1.5-pro")) score += 30;
          break;
        case "desktop_planning":
          if (candidate.capabilities.tool_calling) score += 25;
          if (candidate.capabilities.local_or_cloud === "local") score += 15;
          break;
        case "summarization":
          if (candidate.capabilities.context_window >= 128000) score += 20;
          if (candidate.id.includes("haiku") || candidate.id.includes("mini") || candidate.id.includes("flash")) score += 15;
          break;
        case "structured_output":
          if (candidate.capabilities.structured_output) score += 20;
          break;
        default:
          break;
      }

      // Latency Preference
      if (latencyPref === "low_latency") {
        if (candidate.id.includes("flash") || candidate.id.includes("haiku") || candidate.id.includes("mini")) {
          score += 25;
        }
      }

      // Cost Preference
      if (costPref === "minimize_cost") {
        if (candidate.capabilities.local_or_cloud === "local") score += 30;
        if (candidate.id.includes("mini") || candidate.id.includes("flash") || candidate.id.includes("haiku")) score += 20;
      } else if (costPref === "max_performance") {
        if (candidate.id.includes("sonnet") || candidate.id.includes("pro") || candidate.id.includes("gpt-4o")) score += 30;
      }

      return { candidate, score };
    });

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    const winner = scoredCandidates[0].candidate;
    const fallbacks = scoredCandidates.slice(1).map((s) => s.candidate);

    // Build transparent explanation
    const localCloudStr = winner.capabilities.local_or_cloud === "local" ? "local" : "cloud";
    const reasonParts: string[] = [];

    reasonParts.push(`Classified task as '${taskCategory}'.`);
    if (policy !== "AUTO") {
      reasonParts.push(`Enforced privacy policy '${policy}'.`);
    }
    reasonParts.push(
      `Selected ${localCloudStr} model '${winner.name}' on provider '${winner.provider}' (score: ${scoredCandidates[0].score}).`
    );
    if (hasImages) {
      reasonParts.push("Verified vision capability.");
    }
    if (requiresTools) {
      reasonParts.push("Verified tool calling capability.");
    }
    if (fallbacks.length > 0) {
      reasonParts.push(`${fallbacks.length} fallback candidates available.`);
    }

    return {
      selectedModel: winner,
      fallbackCandidates: fallbacks,
      metadata: {
        taskCategory,
        selectedReason: reasonParts.join(" "),
        policy,
        mode: "auto",
        fallbackUsed: false,
        evaluatedCandidatesCount: scoredCandidates.length,
      },
    };
  }
}
