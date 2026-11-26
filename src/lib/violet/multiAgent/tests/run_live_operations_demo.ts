/**
 * VIOLET AI & Lab — Live Operations End-to-End Execution Demonstration
 */

import { MultiAgentOrchestrator } from "../agentOrchestrator";
import { LiveOperationsService } from "../liveOperationsService";
import { ModelGateway } from "../../ai/modelGateway";
import { ProviderRegistry } from "../../ai/providerRegistry";
import { AIAuditLogger } from "../../ai/auditLogger";
import { GitWorktreeManager } from "../../git/worktreeManager";
import type { IProviderAdapter, ModelDefinition, ProviderAdapterConfig } from "../../ai/types";
import { CircuitBreaker } from "../../ai/circuitBreaker";

async function runDemo() {
  console.log("================================================================================");
  console.log("  VIOLET LAB — PHASE 3F LIVE OPERATIONS & OBSERVABILITY DEMONSTRATION");
  console.log("================================================================================\n");

  // 1. Create simulated multi-model adapters
  const registry = new ProviderRegistry({
    ollama: { enabled: false },
    openrouter: { enabled: false },
  });

  const createMockAdapter = (provider: "anthropic" | "openai"): IProviderAdapter => {
    const modelDef: ModelDefinition = {
      id: provider === "anthropic" ? "claude-3-5-sonnet" : "gpt-4o",
      name: provider === "anthropic" ? "Claude 3.5 Sonnet" : "GPT-4o",
      provider,
      capabilities: { text: true, vision: false, tool_calling: true, structured_output: true, streaming: true, context_window: 128000, local_or_cloud: "cloud" },
      available: true,
    };

    return {
      provider,
      isConfigured: true,
      circuitBreaker: new CircuitBreaker(provider),
      config: {} as ProviderAdapterConfig,
      listModels: async () => [modelDef],
      getModelInfo: async () => modelDef,
      chat: async ({ messages }) => {
        const rawContent = messages[messages.length - 1].content;
        const lastMsg = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        let content = "";
        if (lastMsg.includes("Principal Software Architect")) {
          content = "1. Implementation Plan\n- Target: src/lib/liveOpsDemo.ts\n- Add telemetry collector and heartbeat monitor.";
        } else if (lastMsg.includes("Software Developer")) {
          content = `[SUMMARY]: Added liveOpsDemo telemetry module.\n[FILE: src/lib/liveOpsDemo.ts]\nexport const liveOpsTelemetry = { status: "operational", timestamp: "${new Date().toISOString()}" };\n`;
        } else {
          content = "[VERDICT]: APPROVED\n[SCORE]: 98\n[SUMMARY]: Excellent clean implementation.";
        }
        return {
          request_id: `req_${Date.now()}`,
          content,
          model: modelDef.id,
          provider,
          usage: { prompt_tokens: 650, completion_tokens: 180, total_tokens: 830 },
          latency_ms: 120,
          finish_reason: "stop" as const,
          routing: { provider, model: modelDef.id, taskCategory: "coding" as const, selectedReason: "mock", policy: "AUTO" as const, mode: "auto" as const, fallbackUsed: false },
        };
      },
      stream: async function* () {},
      healthCheck: async () => ({ provider, healthy: true, configured: true, modelCount: 1, circuitBreakerStatus: "closed", lastChecked: new Date().toISOString() }),
    };
  };

  registry.registerAdapter("anthropic", createMockAdapter("anthropic"));
  registry.registerAdapter("openai", createMockAdapter("openai"));

  const auditLogger = new AIAuditLogger();
  const gateway = new ModelGateway(registry, auditLogger);
  const gitManager = new GitWorktreeManager();
  const orchestrator = new MultiAgentOrchestrator(gateway, gitManager, 3);
  const liveOps = new LiveOperationsService(orchestrator, gateway, gitManager);

  console.log("1. Starting Multi-Agent Task via Orchestrator...");
  const task = await orchestrator.startTask({
    taskId: "task-liveops-demo-01",
    goal: "Implement live telemetry monitoring and heartbeat observability",
    autoMergeOnApproval: false,
  });
  console.log(`   Task Started: ID=${task.id}, Status=${task.status}`);

  console.log("\n2. Querying Live Operations Summary...");
  let summary = liveOps.getOperationsSummary();
  console.log(`   Total Registered Agents : ${summary.totalRegisteredAgents}`);
  console.log(`   Active Running Agents   : ${summary.activeAgents}`);
  console.log(`   Idle / Standby Agents   : ${summary.idleAgents}`);
  console.log(`   Running Workflows       : ${summary.runningWorkflows}`);

  console.log("\n3. Testing Owner Pause & Resume Controls...");
  await liveOps.pauseTask(task.id);
  const pausedTask = orchestrator.getTask(task.id);
  console.log(`   Task status after Pause  : ${pausedTask?.status} (isPaused=${pausedTask?.isPaused})`);

  await liveOps.resumeTask(task.id);
  const resumedTask = orchestrator.getTask(task.id);
  console.log(`   Task status after Resume : ${resumedTask?.status} (isPaused=${resumedTask?.isPaused})`);

  console.log("\n4. Awaiting Pipeline Completion...");
  const startWait = Date.now();
  while (Date.now() - startWait < 8000) {
    const current = orchestrator.getTask(task.id);
    if (current?.status === "completed" || current?.status === "failed") break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const finalTask = orchestrator.getTask(task.id);
  console.log(`   Task Final Status : ${finalTask?.status}`);
  console.log(`   Commits Recorded  : ${finalTask?.commits.length}`);
  console.log(`   Reviews Recorded  : ${finalTask?.reviews.length}`);
  console.log(`   Integration Branch: ${finalTask?.integrationBranch}`);

  console.log("\n5. Querying Live Agents Grid...");
  const liveAgents = liveOps.getLiveAgents();
  for (const ag of liveAgents) {
    console.log(`   - ${ag.name} (${ag.role}) | Status: ${ag.status} | Mode: ${ag.executionMode} | Heartbeat: ${ag.lastHeartbeat}`);
  }

  console.log("\n6. Inspecting Workflow DAG...");
  const dag = liveOps.getWorkflowDAG(task.id);
  console.log(`   DAG Total Nodes : ${dag?.nodes.length}`);
  console.log(`   DAG Total Edges : ${dag?.edges.length}`);
  for (const n of dag?.nodes || []) {
    console.log(`     Node [${n.type.toUpperCase()}] ${n.id} : ${n.label} (status=${n.status})`);
  }

  console.log("\n7. Inspecting Hardware & Resource Telemetry...");
  const telemetry = liveOps.getResourceTelemetry();
  console.log(`   Host RAM Usage   : ${telemetry.system.memoryUsagePercent}% (${(telemetry.system.memoryUsageBytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
  console.log(`   Host CPU Load    : ${telemetry.system.cpuUsagePercent ?? "Measured via OS"}%`);
  console.log(`   GPU Telemetry    : ${telemetry.gpu.statusMessage}`);
  console.log(`   Total Tokens     : ${liveOps.getOperationsSummary().totalTokens.total.toLocaleString()}`);
  console.log(`   Total Cost (USD) : $${liveOps.getOperationsSummary().estimatedProviderCostUsd.toFixed(6)}`);

  console.log("\n8. Testing Owner Approval of Integration Branch...");
  if (finalTask?.integrationBranch) {
    console.log(`   Approving integration branch: ${finalTask.integrationBranch}`);
    // Owner approval call
    const approvalResult = await liveOps.approveIntegration(task.id);
    console.log(`   Approval Succeeded : ${approvalResult.success}`);
    console.log(`   Merged Commit SHA  : ${approvalResult.commitSha}`);
  }

  console.log("\n================================================================================");
  console.log("  PHASE 3F LIVE OPERATIONS DEMONSTRATION COMPLETED SUCCESSFULLY!");
  console.log("================================================================================");
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
