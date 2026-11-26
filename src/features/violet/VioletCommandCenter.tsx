import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Bug,
  Camera,
  Check,
  Clock,
  Code2,
  Cpu,
  Globe,
  Layers,
  MessageSquare,
  Monitor,
  MousePointer,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Square,
  Terminal,
  Workflow,
  X,
} from "lucide-react";
import type {
  VioletApprovalRequest,
  VioletHumanHandoff,
  VioletTask,
  VioletTaskEvent,
} from "../../types/violet";
import { createDefaultToolRegistry } from "../../lib/violet/builtInTools";
import {
  VioletLocalAgentClient,
  type LocalAgentCapabilities,
  type ProcessEntry,
  type ScreenCaptureResult,
  type UIElementEntry,
  type WindowInfoEntry,
} from "../../lib/violet/localAgentClient";
import { VioletTaskOrchestrator } from "../../lib/violet/taskOrchestrator";
import { violetService } from "../../lib/violet/violetService";
import { VioletIntelligencePanel } from "./VioletIntelligencePanel";
import { VioletMultiAgentLab } from "./VioletMultiAgentLab";
import { VioletLiveOperations } from "./VioletLiveOperations";
import { VioletAgentStudio } from "./VioletAgentStudio";
import { VioletIssuesCenter } from "./VioletIssuesCenter";

export function VioletCommandCenter() {
  const [activeTab, setActiveTab] = useState<"overview" | "intelligence" | "multiagent" | "studio" | "liveops" | "issues" | "tasks" | "desktop" | "tools" | "agent" | "audit">("overview");
  const [goalInput, setGoalInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [tasks, setTasks] = useState<VioletTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<VioletApprovalRequest[]>([]);
  const [handoffs, setHandoffs] = useState<VioletHumanHandoff[]>([]);
  const [auditEvents, setAuditEvents] = useState<VioletTaskEvent[]>([]);

  // Emergency stop state
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);

  // Live desktop & windows state
  const [screenshot, setScreenshot] = useState<ScreenCaptureResult | null>(null);
  const [capturingScreen, setCapturingScreen] = useState(false);
  const [windowsList, setWindowsList] = useState<WindowInfoEntry[]>([]);
  const [loadingWindows, setLoadingWindows] = useState(false);
  const [selectedWindowHandle, setSelectedWindowHandle] = useState<number | null>(null);
  const [windowElements, setWindowElements] = useState<UIElementEntry[]>([]);
  const [inspectingUI, setInspectingUI] = useState(false);
  const [processesList, setProcessesList] = useState<ProcessEntry[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [processFilter, setProcessFilter] = useState("");
  const [inputTestText, setInputTestText] = useState("");
  const [inputTestCoords, setInputTestCoords] = useState<{ x: number; y: number }>({ x: 500, y: 500 });

  // Local Agent status
  const [agentHealth, setAgentHealth] = useState<{
    online: boolean;
    version?: string;
    loading: boolean;
    error?: string;
  }>({ online: false, loading: true });
  const [agentCapabilities, setAgentCapabilities] = useState<LocalAgentCapabilities | null>(null);

  const localAgentClient = useMemo(() => new VioletLocalAgentClient(), []);
  const toolRegistry = useMemo(() => createDefaultToolRegistry({ localAgentClient }), [localAgentClient]);
  const orchestrator = useMemo(() => new VioletTaskOrchestrator(toolRegistry), [toolRegistry]);

  // Load initial data and subscribe to updates
  useEffect(() => {
    let active = true;

    async function loadData() {
      const loadedTasks = await violetService.listTasks();
      if (!active) return;
      setTasks(loadedTasks);
      if (loadedTasks.length > 0 && !selectedTaskId) {
        setSelectedTaskId(loadedTasks[0].id);
      }
      setApprovals(violetService.listApprovals());
      setHandoffs(violetService.listHandoffs());
      setAuditEvents(violetService.listAuditEvents());
    }

    void loadData();

    const unsubscribe = violetService.subscribe(() => {
      if (!active) return;
      void violetService.listTasks().then((t) => setTasks([...t]));
      setApprovals(violetService.listApprovals());
      setHandoffs(violetService.listHandoffs());
      setAuditEvents(violetService.listAuditEvents());
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Probe local agent health on mount
  useEffect(() => {
    checkAgentHealth();
  }, [localAgentClient]);

  const checkAgentHealth = async () => {
    setAgentHealth((prev) => ({ ...prev, loading: true, error: undefined }));
    const health = await localAgentClient.health();
    if (health.online) {
      setAgentHealth({ online: true, version: health.version, loading: false });
      try {
        const caps = await localAgentClient.getCapabilities();
        setAgentCapabilities(caps);
      } catch {
        // Capabilities require token; health does not
      }
    } else {
      setAgentHealth({
        online: false,
        loading: false,
        error: health.error || "Local agent service is offline on 127.0.0.1:8765",
      });
      setAgentCapabilities(null);
    }
  };

  const handleTriggerEmergencyStop = async () => {
    try {
      const res = await localAgentClient.triggerEmergencyStop("Triggered manually from Command Center");
      setEmergencyStopped(true);
      setEmergencyReason(res.reason || "Manual user override");
      // Abort any active tasks
      for (const t of tasks) {
        if (t.status === "running" || t.status === "awaiting_approval") {
          const cancelled = orchestrator.cancelTask(t, "Aborted by Emergency Stop");
          void violetService.saveTask(cancelled);
        }
      }
    } catch (err) {
      console.error("Failed to trigger emergency stop:", err);
    }
  };

  const handleResumeEmergencyStop = async () => {
    try {
      await localAgentClient.resumeEmergencyStop();
      setEmergencyStopped(false);
      setEmergencyReason(null);
    } catch (err) {
      console.error("Failed to resume from emergency stop:", err);
    }
  };

  const handleCaptureScreen = async () => {
    setCapturingScreen(true);
    try {
      const res = await localAgentClient.captureScreen({ quality: 80, maxDimension: 1200 });
      setScreenshot(res);
    } catch (err) {
      console.error("Failed to capture screen:", err);
    } finally {
      setCapturingScreen(false);
    }
  };

  const handleListWindows = async () => {
    setLoadingWindows(true);
    try {
      const res = await localAgentClient.listWindows({ includeMinimized: false });
      setWindowsList(res.windows);
    } catch (err) {
      console.error("Failed to list windows:", err);
    } finally {
      setLoadingWindows(false);
    }
  };

  const handleFocusWindow = async (handle: number) => {
    try {
      await localAgentClient.focusWindow({ handle });
      void handleListWindows();
    } catch (err) {
      console.error("Failed to focus window:", err);
    }
  };

  const handleInspectWindowUI = async (handle: number, title?: string) => {
    setSelectedWindowHandle(handle);
    setInspectingUI(true);
    try {
      const res = await localAgentClient.inspectWindowUI({ handle, title, max_depth: 3, max_elements: 50 });
      setWindowElements(res.elements);
    } catch (err) {
      console.error("Failed to inspect window UI:", err);
    } finally {
      setInspectingUI(false);
    }
  };

  const handleListProcesses = async () => {
    setLoadingProcesses(true);
    try {
      const res = await localAgentClient.listProcesses({ limit: 40, filter_name: processFilter || undefined });
      setProcessesList(res.processes);
    } catch (err) {
      console.error("Failed to list processes:", err);
    } finally {
      setLoadingProcesses(false);
    }
  };

  const handleTerminateProcess = async (pid: number) => {
    if (!window.confirm(`Are you sure you want to terminate process PID ${pid}?`)) return;
    try {
      await localAgentClient.terminateProcess({ pid, force: false, reason: "Terminated from Command Center" });
      void handleListProcesses();
    } catch (err) {
      alert(`Failed to terminate process: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSendTestClick = async () => {
    try {
      await localAgentClient.executeMouseAction({ action: "click", x: inputTestCoords.x, y: inputTestCoords.y });
      alert(`Clicked at (${inputTestCoords.x}, ${inputTestCoords.y})`);
    } catch (err) {
      alert(`Click failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSendTestType = async () => {
    if (!inputTestText) return;
    try {
      await localAgentClient.executeKeyboardAction({ action: "type", text: inputTestText });
      setInputTestText("");
    } catch (err) {
      alert(`Type failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleLaunchTask = async (textToRun?: string) => {
    const goal = (textToRun || goalInput).trim();
    if (!goal || isExecuting) return;

    setIsExecuting(true);
    setGoalInput("");

    try {
      const task = orchestrator.createTask({
        userId: "local-user",
        goal,
        source: "desktop",
      });
      const planned = orchestrator.planTask(task);
      await violetService.saveTask(planned);
      setSelectedTaskId(planned.id);

      // Execute task
      const approvalsMap = new Map<string, VioletApprovalRequest>();
      for (const appr of violetService.listApprovals(planned.id)) {
        approvalsMap.set(appr.stepId, appr);
      }

      const completed = await orchestrator.executeTask(planned, {
        userId: "local-user",
        grantedScopes: [
          "knowledge:read",
          "computer:files:read",
          "computer:files:write",
          "computer:screen:read",
          "computer:command:run",
        ],
        registry: toolRegistry,
        approvals: approvalsMap,
      });

      await violetService.saveTask(completed);

      // Check if step created approval
      for (const step of completed.plan) {
        if (step.status === "awaiting_approval") {
          const appr = violetService.listApprovals(completed.id).find((a) => a.stepId === step.id);
          if (appr) {
            await violetService.saveApproval(appr);
          }
        }
      }
    } catch (err) {
      console.error("Task execution failed:", err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleApprove = async (approvalId: string) => {
    const updatedApproval = await violetService.respondApproval(approvalId, true);
    if (!updatedApproval) return;

    const task = tasks.find((t) => t.id === updatedApproval.taskId);
    if (!task) return;

    // Resume execution
    setIsExecuting(true);
    try {
      const approvalsMap = new Map<string, VioletApprovalRequest>();
      approvalsMap.set(updatedApproval.stepId, updatedApproval);

      const continued = await orchestrator.executeTask(task, {
        userId: "local-user",
        grantedScopes: [
          "knowledge:read",
          "computer:files:read",
          "computer:files:write",
          "computer:screen:read",
          "computer:command:run",
        ],
        registry: toolRegistry,
        approvals: approvalsMap,
      });
      await violetService.saveTask(continued);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReject = async (approvalId: string) => {
    const updatedApproval = await violetService.respondApproval(approvalId, false);
    if (!updatedApproval) return;

    const task = tasks.find((t) => t.id === updatedApproval.taskId);
    if (!task) return;

    const cancelled = orchestrator.cancelTask(task, "User rejected approval request");
    await violetService.saveTask(cancelled);
  };

  const handleResumeHandoff = async (handoffId: string) => {
    const updatedHandoff = await violetService.resumeHandoff(handoffId);
    if (!updatedHandoff) return;

    const task = tasks.find((t) => t.id === updatedHandoff.taskId);
    if (!task) return;

    setIsExecuting(true);
    try {
      const continued = await orchestrator.executeTask(task, {
        userId: "local-user",
        grantedScopes: [
          "knowledge:read",
          "computer:files:read",
          "computer:files:write",
          "computer:screen:read",
          "computer:command:run",
        ],
        registry: toolRegistry,
      });
      await violetService.saveTask(continued);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const cancelled = orchestrator.cancelTask(task, "Manually cancelled by user");
    await violetService.saveTask(cancelled);
  };

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || tasks[0];
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const waitingHandoffs = handoffs.filter((h) => h.status === "waiting");
  const registeredTools = toolRegistry.list();

  return (
    <main className="main-content" style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 20px" }}>
      {/* ── Top Header / Status Bar ────────────────────────────────────────── */}
      <section className="welcome" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Bot size={14} /> VIOLET PERSONAL AI OPERATING SYSTEM
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "6px 0 4px" }}>VIOLET Command Center</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
              Central orchestrator coordinating your knowledge, Windows PC, browser sessions and agents.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Orchestrator Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: "var(--brand-soft)",
                color: "var(--brand)",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--border-color)",
              }}
            >
              <Cpu size={15} />
              <span>Core Orchestrator Active</span>
            </div>

            {/* Windows Agent Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: agentHealth.online ? "var(--success-soft)" : "var(--warning-soft)",
                color: agentHealth.online ? "var(--success)" : "var(--warning)",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--border-color)",
              }}
            >
              <Monitor size={15} />
              <span>
                {agentHealth.online
                  ? `PC Agent Online (v${agentHealth.version || "0.1.0"})`
                  : "PC Agent Disconnected"}
              </span>
              <button
                onClick={checkAgentHealth}
                title="Probe local agent status"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: "inherit",
                  padding: 2,
                }}
              >
                <RefreshCw size={13} className={agentHealth.loading ? "spin" : ""} />
              </button>
            </div>

            {/* Emergency Stop Button */}
            <button
              onClick={emergencyStopped ? handleResumeEmergencyStop : handleTriggerEmergencyStop}
              title={emergencyStopped ? "Resume desktop automation" : "Instantly halt desktop inputs and tasks"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 10,
                background: emergencyStopped ? "var(--danger)" : "var(--danger-soft)",
                color: emergencyStopped ? "#fff" : "var(--danger)",
                fontSize: 12,
                fontWeight: 750,
                border: "1px solid var(--danger)",
                cursor: "pointer",
                boxShadow: emergencyStopped ? "0 0 12px rgba(239, 68, 68, 0.4)" : "none",
              }}
            >
              <Square size={13} fill={emergencyStopped ? "#fff" : "currentColor"} />
              <span>{emergencyStopped ? "EMERGENCY STOP ENGAGED (RESUME)" : "EMERGENCY STOP"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── Emergency Stop Alert Banner ────────────────────────────────────── */}
      {emergencyStopped && (
        <section
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            background: "var(--danger-soft)",
            border: "2px solid var(--danger)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ShieldAlert size={26} color="var(--danger)" />
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--danger)" }}>
                EMERGENCY STOP IS ACTIVE
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-primary)" }}>
                All desktop input and ongoing agent actions are strictly blocked. Reason: {emergencyReason || "User intervention"}.
              </p>
            </div>
          </div>
          <button
            onClick={handleResumeEmergencyStop}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              background: "var(--success)",
              color: "#fff",
              border: "none",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Resume Operations
          </button>
        </section>
      )}

      {/* ── Pending Approvals Banner ───────────────────────────────────────── */}
      {pendingApprovals.length > 0 && (
        <section
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            background: "var(--warning-soft)",
            border: "1px solid var(--warning)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <ShieldAlert size={20} color="var(--warning)" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--warning)" }}>
              {pendingApprovals.length} Action{pendingApprovals.length === 1 ? "" : "s"} Require Your Approval
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingApprovals.map((appr) => (
              <div
                key={appr.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--bg-app)",
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code style={{ fontSize: 13, fontWeight: 650, color: "var(--brand)" }}>{appr.operation}</code>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>SHA-256: {appr.argumentsHash.slice(0, 12)}…</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 4 }}>{appr.consequence}</div>
                  <pre
                    style={{
                      fontSize: 11,
                      marginTop: 6,
                      background: "rgba(0,0,0,0.05)",
                      padding: "4px 8px",
                      borderRadius: 4,
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(appr.argumentsPreview, null, 2)}
                  </pre>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleApprove(appr.id)}
                    disabled={isExecuting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: "var(--brand)",
                      color: "#fff",
                      border: "none",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <Check size={14} /> Approve &amp; Execute
                  </button>
                  <button
                    onClick={() => handleReject(appr.id)}
                    disabled={isExecuting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-color)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Active Human Handoff Banner ────────────────────────────────────── */}
      {waitingHandoffs.length > 0 && (
        <section
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            background: "rgba(59, 130, 246, 0.12)",
            border: "1px solid rgba(59, 130, 246, 0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <AlertTriangle size={20} color="#3b82f6" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#3b82f6" }}>
              Human Intervention Required (Security / Takeover Challenge)
            </h3>
          </div>
          {waitingHandoffs.map((h) => (
            <div
              key={h.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                <strong>Reason:</strong> {h.reason.toUpperCase()} — {h.instructions} (Target: {h.visibleClient})
              </div>
              <button
                onClick={() => handleResumeHandoff(h.id)}
                disabled={isExecuting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <Check size={14} /> I Have Completed This / Resume Task
              </button>
            </div>
          ))}
        </section>
      )}

      {/* ── Goal Input & Task Launcher ─────────────────────────────────────── */}
      <section className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Launch a VIOLET Task</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>
          Enter a goal. VIOLET will decompose the goal, check tool permissions, request approval if sensitive, and execute.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLaunchTask();
            }}
            placeholder="e.g. Check system health and ping the orchestrator..."
            style={{
              flex: 1,
              minWidth: 280,
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--bg-app)",
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          />
          <button
            onClick={() => handleLaunchTask()}
            disabled={isExecuting || !goalInput.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 10,
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: isExecuting ? "not-allowed" : "pointer",
            }}
          >
            {isExecuting ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
            <span>Plan &amp; Execute</span>
          </button>
        </div>

        {/* Quick Launch Suggestions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>Quick launch:</span>
          {[
            "Check system health and ping",
            "Capture Windows PC screen snapshot",
            "List files in approved workspace folder",
            "Search knowledge memories for project architecture",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleLaunchTask(prompt)}
              disabled={isExecuting}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 8,
                background: "var(--bg-app)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {/* ── Navigation Tabs ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border-color)", marginBottom: 20 }}>
        {[
          { key: "overview", label: "Overview", icon: Bot },
          { key: "intelligence", label: "Multi-Model Intelligence", icon: Sparkles },
          { key: "multiagent", label: "Multi-Agent Lab", icon: Workflow },
          { key: "studio", label: "Agent Studio", icon: Layers },
          { key: "liveops", label: "Live Operations", icon: Activity },
          { key: "issues", label: "Issues & Bugs", icon: Bug },
          { key: "tasks", label: `Tasks & Timeline (${tasks.length})`, icon: Clock },
          { key: "desktop", label: "Live Desktop & Windows", icon: Monitor },
          { key: "tools", label: `Tool Registry (${registeredTools.length})`, icon: Terminal },
          { key: "agent", label: "Windows PC Agent", icon: Cpu },
          { key: "audit", label: `Audit Log (${auditEvents.length})`, icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                border: "none",
                background: "transparent",
                borderBottom: isSelected ? "2px solid var(--brand)" : "2px solid transparent",
                color: isSelected ? "var(--brand)" : "var(--text-muted)",
                fontWeight: isSelected ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab: Overview ──────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <section className="dashboard-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {[
            {
              title: "Windows Computer Agent",
              detail: "Screen capture, files, UIA, process control, allowlisted commands.",
              icon: Monitor,
              status: agentHealth.online ? "Online & Ready" : "Disconnected",
              statusColor: agentHealth.online ? "var(--success)" : "var(--warning)",
            },
            {
              title: "Browser Agent",
              detail: "Playwright visible sessions with human takeover on CAPTCHA/MFA.",
              icon: Globe,
              status: "Phase 3 Foundation Ready",
              statusColor: "var(--brand)",
            },
            {
              title: "Developer Agent",
              detail: "GitHub repository inspection, bug analysis, tests, branches, PRs.",
              icon: Code2,
              status: "Phase 5 Connector Ready",
              statusColor: "var(--brand)",
            },
            {
              title: "Communication Agent",
              detail: "Official WhatsApp Cloud, Telegram, Slack, Gmail with draft-first safety.",
              icon: MessageSquare,
              status: "Phase 5 Architecture Ready",
              statusColor: "var(--brand)",
            },
            {
              title: "Shopping Intelligence",
              detail: "Swiggy, Zepto, Blinkit catalog price comparison and checkout approval.",
              icon: ShoppingBag,
              status: "Phase 5 Architecture Ready",
              statusColor: "var(--brand)",
            },
            {
              title: "Knowledge & Memory Engine",
              detail: "Neuro long-term memories, semantic vector search, entity graph.",
              icon: Brain,
              status: "Operational",
              statusColor: "var(--success)",
            },
            {
              title: "Workflows & Automation",
              detail: "Scheduled tasks, event-driven triggers, bounded retry policies.",
              icon: Workflow,
              status: "Phase 6 Roadmap Ready",
              statusColor: "var(--brand)",
            },
            {
              title: "Policy & Audit Gateway",
              detail: "Cryptographic SHA-256 argument hashes, 5-tier risk gate, secret redaction.",
              icon: Shield,
              status: "Operational",
              statusColor: "var(--success)",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <article className="card" key={card.title} style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--brand-soft)",
                      color: "var(--brand)",
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-color)",
                      color: card.statusColor,
                      fontWeight: 600,
                    }}
                  >
                    {card.status}
                  </span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 14 }}>{card.title}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>{card.detail}</p>
              </article>
            );
          })}
        </section>
      )}

      {/* ── Tab: Multi-Model Intelligence ──────────────────────────────────── */}
      {activeTab === "intelligence" && (
        <section style={{ marginBottom: 20 }}>
          <VioletIntelligencePanel />
        </section>
      )}

      {/* ── Tab: Multi-Agent Lab ───────────────────────────────────────────── */}
      {activeTab === "multiagent" && (
        <section style={{ marginBottom: 20 }}>
          <VioletMultiAgentLab />
        </section>
      )}

      {/* ── Tab: Agent Studio ──────────────────────────────────────────────── */}
      {activeTab === "studio" && (
        <section style={{ marginBottom: 20 }}>
          <VioletAgentStudio />
        </section>
      )}

      {/* ── Tab: Live Operations ───────────────────────────────────────────── */}
      {activeTab === "liveops" && (
        <section style={{ marginBottom: 20 }}>
          <VioletLiveOperations onNavigateToIssues={() => setActiveTab("issues")} />
        </section>
      )}

      {/* ── Tab: Issues & Bugs Center ───────────────────────────────────────── */}
      {activeTab === "issues" && (
        <section style={{ marginBottom: 20 }}>
          <VioletIssuesCenter onNavigateToLiveOps={() => setActiveTab("liveops")} />
        </section>
      )}

      {/* ── Tab: Tasks & Timeline ──────────────────────────────────────────── */}
      {activeTab === "tasks" && (
        <section style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
          {/* Task List Sidebar */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Tasks ({tasks.length})</h3>
            {tasks.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>
                No tasks yet. Launch a task above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tasks.map((t) => {
                  const isSelected = t.id === selectedTaskId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: isSelected ? "var(--brand-soft)" : "var(--bg-app)",
                        border: isSelected ? "1px solid var(--brand)" : "1px solid var(--border-color)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 650, color: "var(--text-muted)" }}>{t.id.slice(0, 12)}</span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 6,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background:
                              t.status === "completed"
                                ? "var(--success-soft)"
                                : t.status === "failed"
                                  ? "var(--danger-soft)"
                                  : t.status === "awaiting_approval"
                                    ? "var(--warning-soft)"
                                    : "var(--brand-soft)",
                            color:
                              t.status === "completed"
                                ? "var(--success)"
                                : t.status === "failed"
                                  ? "var(--danger)"
                                  : t.status === "awaiting_approval"
                                    ? "var(--warning)"
                                    : "var(--brand)",
                          }}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.goal}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        {t.plan.length} steps • {new Date(t.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Task Details & Step Timeline */}
          <div className="card" style={{ padding: 20 }}>
            {selectedTask ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Task Details • {selectedTask.id}
                    </span>
                    <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{selectedTask.goal}</h2>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      <span>Source: {selectedTask.source}</span>
                      <span>Created: {new Date(selectedTask.createdAt).toLocaleString()}</span>
                      {selectedTask.completedAt && <span>Completed: {new Date(selectedTask.completedAt).toLocaleTimeString()}</span>}
                    </div>
                  </div>

                  {selectedTask.status !== "completed" && selectedTask.status !== "failed" && selectedTask.status !== "cancelled" && (
                    <button
                      onClick={() => handleCancelTask(selectedTask.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "var(--danger-soft)",
                        color: "var(--danger)",
                        border: "1px solid var(--danger)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Square size={13} /> Cancel Task
                    </button>
                  )}
                </div>

                {selectedTask.errorSummary && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
                    <strong>Error:</strong> {selectedTask.errorSummary}
                  </div>
                )}

                {/* Step Timeline */}
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Execution Plan ({selectedTask.plan.length} Steps)</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {selectedTask.plan.map((step, idx) => (
                    <div
                      key={step.id}
                      style={{
                        display: "flex",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 10,
                        background: "var(--bg-app)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          background:
                            step.status === "completed"
                              ? "var(--success)"
                              : step.status === "running"
                                ? "var(--brand)"
                                : step.status === "failed"
                                  ? "var(--danger)"
                                  : "var(--border-color)",
                          color: "#fff",
                        }}
                      >
                        {step.status === "completed" ? <Check size={14} /> : idx + 1}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{step.title}</span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontWeight: 650,
                              background: "rgba(0,0,0,0.06)",
                            }}
                          >
                            Risk: {step.risk}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <code style={{ fontSize: 12, color: "var(--brand)" }}>{step.toolName}</code>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Status: {step.status}</span>
                        </div>

                        {step.resultSummary && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, background: "rgba(0,0,0,0.03)", padding: "6px 10px", borderRadius: 6 }}>
                            <strong>Result:</strong> {step.resultSummary}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: 40 }}>
                Select a task to view execution details.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Tab: Live Desktop & Windows ───────────────────────────────────── */}
      {activeTab === "desktop" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Top Row: Screen Capture & Input Test Sandbox */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Screen Capture Card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Camera size={16} /> Desktop Screen Observation
                  </h3>
                  <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "2px 0 0" }}>
                    On-demand screen frame capture with privacy consent guarantee.
                  </p>
                </div>
                <button
                  onClick={handleCaptureScreen}
                  disabled={capturingScreen || !agentHealth.online}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: capturingScreen || !agentHealth.online ? "not-allowed" : "pointer",
                  }}
                >
                  <RefreshCw size={13} className={capturingScreen ? "spin" : ""} />
                  <span>{capturingScreen ? "Capturing..." : "Capture Screen"}</span>
                </button>
              </div>

              {screenshot && screenshot.blobUrl ? (
                <div>
                  <div
                    style={{
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid var(--border-color)",
                      background: "#000",
                      maxHeight: 320,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <img
                      src={screenshot.blobUrl}
                      alt="Desktop Frame"
                      style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                    <span>Resolution: {screenshot.width} × {screenshot.height} px</span>
                    <span>Size: {Math.round(screenshot.byteLength / 1024)} KB</span>
                    <span>Captured: {screenshot.timestamp ? new Date(screenshot.timestamp).toLocaleTimeString() : "Just now"}</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    height: 200,
                    borderRadius: 8,
                    border: "1px dashed var(--border-color)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                    gap: 8,
                  }}
                >
                  <Camera size={28} opacity={0.4} />
                  <span>No screenshot captured yet. Click "Capture Screen" to observe.</span>
                </div>
              )}
            </div>

            {/* Input Test Sandbox Card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <MousePointer size={16} /> Controlled Desktop Input Sandbox
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "2px 0 0" }}>
                  Safely trigger direct mouse actions and text input through verified coordinates.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Mouse Test */}
                <div style={{ background: "var(--bg-app)", padding: 14, borderRadius: 8, border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Mouse Move & Click</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 12, color: "var(--text-muted)" }}>X:</label>
                    <input
                      type="number"
                      value={inputTestCoords.x}
                      onChange={(e) => setInputTestCoords((prev) => ({ ...prev, x: Number(e.target.value) }))}
                      style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-color)", fontSize: 12 }}
                    />
                    <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Y:</label>
                    <input
                      type="number"
                      value={inputTestCoords.y}
                      onChange={(e) => setInputTestCoords((prev) => ({ ...prev, y: Number(e.target.value) }))}
                      style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-color)", fontSize: 12 }}
                    />
                    <button
                      onClick={handleSendTestClick}
                      disabled={!agentHealth.online || emergencyStopped}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        background: "var(--brand)",
                        color: "#fff",
                        border: "none",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Click (X, Y)
                    </button>
                  </div>
                </div>

                {/* Keyboard Test */}
                <div style={{ background: "var(--bg-app)", padding: 14, borderRadius: 8, border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Keyboard Typing</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Text to type..."
                      value={inputTestText}
                      onChange={(e) => setInputTestText(e.target.value)}
                      style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-color)", fontSize: 12 }}
                    />
                    <button
                      onClick={handleSendTestType}
                      disabled={!inputTestText.trim() || !agentHealth.online || emergencyStopped}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        background: "var(--brand)",
                        color: "#fff",
                        border: "none",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Type Text
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Window Discovery & Accessibility Tree */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Layers size={16} /> Open Windows & UI Automation Hierarchy
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "2px 0 0" }}>
                  Enumerate visible Windows and inspect accessible control trees (buttons, edit controls, menus).
                </p>
              </div>
              <button
                onClick={handleListWindows}
                disabled={loadingWindows || !agentHealth.online}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--brand)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: loadingWindows || !agentHealth.online ? "not-allowed" : "pointer",
                }}
              >
                <RefreshCw size={13} className={loadingWindows ? "spin" : ""} />
                <span>{loadingWindows ? "Scanning..." : "Enumerate Windows"}</span>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Window List */}
              <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {windowsList.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 20, textAlign: "center" }}>
                    Click "Enumerate Windows" to discover visible desktop applications.
                  </div>
                ) : (
                  windowsList.map((win) => {
                    const isSelected = selectedWindowHandle === win.handle;
                    return (
                      <div
                        key={win.handle}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: isSelected ? "var(--brand-soft)" : "var(--bg-app)",
                          border: isSelected ? "1px solid var(--brand)" : "1px solid var(--border-color)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
                          <strong>{win.title || "(Untitled Window)"}</strong>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            PID: {win.process_id} • Proc: {win.process_name}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => handleFocusWindow(win.handle)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "rgba(0,0,0,0.05)",
                              border: "none",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            Focus
                          </button>
                          <button
                            onClick={() => handleInspectWindowUI(win.handle, win.title)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "var(--brand)",
                              color: "#fff",
                              border: "none",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            Inspect UI
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Inspected Elements */}
              <div style={{ maxHeight: 300, overflowY: "auto", background: "var(--bg-app)", padding: 12, borderRadius: 8, border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  UI Elements {windowElements.length > 0 ? `(${windowElements.length})` : ""}
                </div>
                {inspectingUI ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: 20 }}>
                    Traversing accessibility tree...
                  </div>
                ) : windowElements.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: 20 }}>
                    Select "Inspect UI" on any window to examine its accessible controls.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {windowElements.map((el) => (
                      <div
                        key={el.element_id}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "#fff",
                          border: "1px solid var(--border-color)",
                          fontSize: 11,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 650, color: "var(--brand)" }}>[{el.control_type}]</span>{" "}
                          <span>{el.name || el.automation_id || "(Unnamed)"}</span>
                        </div>
                        {el.bounds && (
                          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
                            {el.bounds.left},{el.bounds.top} ({el.bounds.width}×{el.bounds.height})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row: Running Processes */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Cpu size={16} /> Process Manager &amp; Resource Usage
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "2px 0 0" }}>
                  Monitor running processes and terminate runaway tasks with safety checks.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={processFilter}
                  onChange={(e) => setProcessFilter(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-color)", fontSize: 12, width: 140 }}
                />
                <button
                  onClick={handleListProcesses}
                  disabled={loadingProcesses || !agentHealth.online}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 6,
                    background: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: loadingProcesses || !agentHealth.online ? "not-allowed" : "pointer",
                  }}
                >
                  <RefreshCw size={12} className={loadingProcesses ? "spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 250, overflowY: "auto" }}>
              {processesList.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 20, textAlign: "center" }}>
                  Click "Refresh" to view active processes.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "8px 10px" }}>PID</th>
                      <th style={{ padding: "8px 10px" }}>Name</th>
                      <th style={{ padding: "8px 10px" }}>Memory</th>
                      <th style={{ padding: "8px 10px" }}>Status</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processesList.map((proc) => (
                      <tr key={proc.pid} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                        <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{proc.pid}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>{proc.name}</td>
                        <td style={{ padding: "6px 10px" }}>{proc.memory_mb ? `${proc.memory_mb} MB` : "N/A"}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.05)" }}>
                            {proc.status}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>
                          <button
                            onClick={() => handleTerminateProcess(proc.pid)}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 4,
                              background: "var(--danger-soft)",
                              color: "var(--danger)",
                              border: "1px solid var(--danger)",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Terminate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Tab: Tool Registry ─────────────────────────────────────────────── */}
      {activeTab === "tools" && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Registered Tools ({registeredTools.length})</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "2px 0 0" }}>
                Tools available to the task orchestrator and specialized sub-agents.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {registeredTools.map((tool) => (
              <div
                key={tool.name}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <code style={{ fontSize: 14, fontWeight: 750, color: "var(--brand)" }}>{tool.name}</code>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 6,
                      background:
                        tool.risk === "destructive" || tool.risk === "financial"
                          ? "var(--danger-soft)"
                          : tool.risk === "external_side_effect"
                            ? "var(--warning-soft)"
                            : "var(--success-soft)",
                      color:
                        tool.risk === "destructive" || tool.risk === "financial"
                          ? "var(--danger)"
                          : tool.risk === "external_side_effect"
                            ? "var(--warning)"
                            : "var(--success)",
                    }}
                  >
                    {tool.risk}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>{tool.description}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.05)" }}>
                    Domain: {tool.domain}
                  </span>
                  <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.05)" }}>
                    Timeout: {tool.timeoutMs / 1000}s
                  </span>
                  {tool.requiredScopes.map((scope) => (
                    <span key={scope} style={{ padding: "2px 6px", borderRadius: 4, background: "var(--brand-soft)", color: "var(--brand)" }}>
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Windows PC Agent ──────────────────────────────────────────── */}
      {activeTab === "agent" && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Windows Local Agent Service</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "2px 0 0" }}>
                Runs locally on your Windows 11 PC under your user account at <code>http://127.0.0.1:8765</code>.
              </p>
            </div>
            <button
              onClick={checkAgentHealth}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                background: "var(--brand)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} className={agentHealth.loading ? "spin" : ""} /> Check Health
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
            <div style={{ padding: 14, borderRadius: 10, background: "var(--bg-app)", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Agent Status</div>
              <strong style={{ display: "block", fontSize: 16, marginTop: 4, color: agentHealth.online ? "var(--success)" : "var(--warning)" }}>
                {agentHealth.online ? "Online (Loopback :8765)" : "Offline"}
              </strong>
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: "var(--bg-app)", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Package Location</div>
              <strong style={{ display: "block", fontSize: 14, marginTop: 4 }}>apps/violet-local-agent</strong>
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: "var(--bg-app)", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Security Model</div>
              <strong style={{ display: "block", fontSize: 14, marginTop: 4 }}>Loopback only • Scoped roots</strong>
            </div>
          </div>

          {agentCapabilities && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                Discovered Capabilities ({agentCapabilities.capabilities.length})
              </h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {agentCapabilities.capabilities.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "var(--brand-soft)",
                      color: "var(--brand)",
                      fontWeight: 600,
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>How to Start the Local Agent</h3>
          <div style={{ background: "rgba(0,0,0,0.06)", padding: "12px 16px", borderRadius: 8, fontSize: 13, fontFamily: "monospace", marginBottom: 16 }}>
            cd apps/violet-local-agent<br />
            uv run uvicorn violet_agent.main:run --host 127.0.0.1 --port 8765
          </div>
        </section>
      )}

      {/* ── Tab: Audit Log ─────────────────────────────────────────────────── */}
      {activeTab === "audit" && (
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Audit Event Stream</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            Every tool call, approval decision, handoff and task transition is recorded with secret redaction.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-color)",
                  fontSize: 13,
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <code style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.05)", fontWeight: 700 }}>
                    {evt.eventType}
                  </code>
                  <span style={{ color: "var(--text-primary)" }}>{evt.summary}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {new Date(evt.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
