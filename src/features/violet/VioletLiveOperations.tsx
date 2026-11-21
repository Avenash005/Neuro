/**
 * VIOLET AI & Lab — Phase 3F Live Operations & Agent Observability Center
 *
 * Dedicated real-time monitoring and control dashboard for all AI agents,
 * their models, skills, tools, files, tasks, resource usage, and collaboration.
 * Connected directly to authentic backend state — zero fabricated or fake data.
 */

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  FileCode,
  GitCommit,
  GitMerge,
  Layers,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Terminal,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { globalVioletAIClient, VioletAIClient } from "../../lib/violet/ai/apiClient";
import type {
  EventStreamFilter,
  LiveAgent,
  LiveAgentDetail,
  OperationsSummary,
  ResourceTelemetry,
  TaskTraceability,
  WorkflowDAG,
} from "../../types/liveOperations";
import type { AgentEventRecord, MultiAgentTaskState } from "../../types/multiAgent";
import type { IssueRecord } from "../../types/issues";

interface Props {
  apiClient?: VioletAIClient;
  onNavigateToIssues?: (issueId?: string) => void;
}

export function VioletLiveOperations({ apiClient = globalVioletAIClient, onNavigateToIssues }: Props) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<LiveAgentDetail | null>(null);
  const [inspectorTab, setInspectorTab] = useState<
    "overview" | "skills" | "tools" | "files" | "model" | "logs" | "git" | "communication"
  >("overview");

  const [activeTasks, setActiveTasks] = useState<MultiAgentTaskState[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [workflowDAG, setWorkflowDAG] = useState<WorkflowDAG | null>(null);
  const [traceability, setTraceability] = useState<TaskTraceability | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const [telemetry, setTelemetry] = useState<ResourceTelemetry | null>(null);
  const [events, setEvents] = useState<AgentEventRecord[]>([]);
  const [activeIssues, setActiveIssues] = useState<IssueRecord[]>([]);

  // Event Filters
  const [eventRoleFilter, setEventRoleFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [eventSearchQuery, setEventSearchQuery] = useState<string>("");

  // Control Actions State
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionType: "cancel" | "retry" | "approve";
    taskId: string;
  } | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // ─── Fetch All Live State ─────────────────────────────────────────────────
  const fetchOperationsData = async () => {
    try {
      const [sum, ags, tasksList, resTel, openIssues] = await Promise.all([
        apiClient.getOperationsSummary(),
        apiClient.getLiveAgents(),
        apiClient.listMultiAgentTasks(),
        apiClient.getResourceTelemetry(),
        apiClient.listIssues({ status: "open" }).catch(() => [] as IssueRecord[]),
      ]);

      setSummary(sum);
      setAgents(ags);
      setActiveTasks(tasksList);
      setTelemetry(resTel);
      setActiveIssues(openIssues);

      // Default selected task
      if (!selectedTaskId && tasksList.length > 0) {
        setSelectedTaskId(tasksList[0].id);
      }

      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error("Failed to fetch live operations data:", err);
    }
  };

  // Fetch events with filters
  const fetchFilteredEvents = async () => {
    try {
      const filter: EventStreamFilter = {
        taskId: selectedTaskId || undefined,
        agentRole: eventRoleFilter !== "all" ? (eventRoleFilter as any) : undefined,
        eventType: eventTypeFilter || undefined,
        search: eventSearchQuery || undefined,
        limit: 100,
      };
      const evts = await apiClient.getOperationsEvents(filter);
      setEvents(evts);
    } catch (err) {
      console.warn("Could not load filtered events:", err);
    }
  };

  // Initial and Auto-Refresh Interval
  useEffect(() => {
    void fetchOperationsData();
    void fetchFilteredEvents();

    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchOperationsData();
      void fetchFilteredEvents();
    }, 4000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedTaskId, eventRoleFilter, eventTypeFilter, eventSearchQuery]);

  // When task changes, load DAG & Traceability
  useEffect(() => {
    if (!selectedTaskId) return;

    void (async () => {
      try {
        const [dag, trace] = await Promise.all([
          apiClient.getWorkflowDAG(selectedTaskId).catch(() => null),
          apiClient.getTaskTraceability(selectedTaskId).catch(() => null),
        ]);
        setWorkflowDAG(dag);
        setTraceability(trace);
      } catch (err) {
        console.warn("Could not load workflow details:", err);
      }
    })();
  }, [selectedTaskId]);

  // When selected agent changes, load Agent Details
  useEffect(() => {
    if (!selectedAgentId) {
      setAgentDetail(null);
      return;
    }

    void (async () => {
      try {
        const detail = await apiClient.getLiveAgentDetail(selectedAgentId);
        setAgentDetail(detail);
      } catch (err) {
        console.warn(`Could not load details for agent ${selectedAgentId}:`, err);
      }
    })();
  }, [selectedAgentId]);

  // Load Diff on demand
  const handleLoadDiff = async (taskId: string) => {
    setLoadingDiff(true);
    try {
      const diff = await apiClient.getTaskDiff(taskId);
      setDiffContent(diff);
    } catch (err) {
      setDiffContent(`Failed to load diff: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingDiff(false);
    }
  };

  // ─── Owner Controls Handlers ──────────────────────────────────────────────
  const handlePauseTask = async (taskId: string) => {
    setActionInProgress(taskId);
    try {
      await apiClient.pauseTask(taskId);
      await fetchOperationsData();
    } catch (err) {
      alert(`Pause failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleResumeTask = async (taskId: string) => {
    setActionInProgress(taskId);
    try {
      await apiClient.resumeTask(taskId);
      await fetchOperationsData();
    } catch (err) {
      alert(`Resume failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmModal) return;
    const { actionType, taskId } = confirmModal;
    setConfirmModal(null);
    setActionInProgress(taskId);

    try {
      if (actionType === "cancel") {
        await apiClient.cancelMultiAgentTask(taskId, "Cancelled from Live Operations Center");
      } else if (actionType === "retry") {
        await apiClient.retryTask(taskId);
      } else if (actionType === "approve") {
        const res = await apiClient.approveIntegration(taskId);
        alert(`Integration approved! Branch '${res.branch}' merged successfully into base branch.`);
      }
      await fetchOperationsData();
    } catch (err) {
      alert(`Action '${actionType}' failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // ─── Status & Time Formatters ─────────────────────────────────────────────
  const getStatusBadge = (status: string, isStale?: boolean) => {
    if (isStale) {
      return (
        <span className="badge badge-stale" style={{ background: "#7f1d1d", color: "#fca5a5" }}>
          ● Stale (Heartbeat Ceased)
        </span>
      );
    }
    switch (status) {
      case "working":
      case "running":
      case "implementing":
        return <span className="badge badge-active" style={{ background: "#065f46", color: "#6ee7b7" }}>● Working</span>;
      case "planning":
        return <span className="badge badge-planning" style={{ background: "#1e3a8a", color: "#93c5fd" }}>● Planning</span>;
      case "reviewing":
        return <span className="badge badge-review" style={{ background: "#581c87", color: "#d8b4fe" }}>● Reviewing</span>;
      case "waiting":
      case "queued":
        return <span className="badge badge-queued" style={{ background: "#78350f", color: "#fde68a" }}>● Queued</span>;
      case "completed":
        return <span className="badge badge-completed" style={{ background: "#064e3b", color: "#a7f3d0" }}>✓ Completed</span>;
      case "failed":
        return <span className="badge badge-failed" style={{ background: "#7f1d1d", color: "#fca5a5" }}>✗ Failed</span>;
      case "paused":
        return <span className="badge badge-paused" style={{ background: "#78350f", color: "#fef08a" }}>⏸ Paused</span>;
      default:
        return <span className="badge badge-idle" style={{ background: "#1e293b", color: "#94a3b8" }}>○ Idle</span>;
    }
  };

  const formatRelativeTime = (timestamp?: string) => {
    if (!timestamp) return "Never";
    const deltaMs = Date.now() - new Date(timestamp).getTime();
    if (deltaMs < 5000) return "Just now";
    if (deltaMs < 60000) return `${Math.floor(deltaMs / 1000)}s ago`;
    if (deltaMs < 3600000) return `${Math.floor(deltaMs / 60000)}m ago`;
    return `${Math.floor(deltaMs / 3600000)}h ago`;
  };

  return (
    <div className="violet-live-operations" style={{ display: "flex", flexDirection: "column", gap: 24, padding: "4px 0" }}>
      {/* ── Top Header & Operations Control Bar ─────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Activity className="text-brand" size={24} />
            <span>Live Operations & Agent Observability Center</span>
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Real-time telemetry, heartbeat tracking, workflow DAG, and owner oversight across all active AI agents.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: autoRefresh ? "rgba(16, 185, 129, 0.1)" : "transparent",
              color: autoRefresh ? "#10b981" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: autoRefresh ? "#10b981" : "#64748b" }} />
            <span>{autoRefresh ? "Live Stream (Active)" : "Live Stream (Paused)"}</span>
          </button>

          <button
            onClick={() => {
              setIsRefreshing(true);
              void fetchOperationsData().then(() => setIsRefreshing(false));
            }}
            disabled={isRefreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? "spin" : ""} />
            <span>Refresh ({formatRelativeTime(lastRefreshedAt.toISOString())})</span>
          </button>
        </div>
      </div>

      {/* ── Active Defect & Issue Alert Banner ──────────────────────────────── */}
      {activeIssues.length > 0 && (
        <section
          style={{
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.08))",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AlertCircle size={18} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f87171" }}>
                  {activeIssues.length} Active {activeIssues.length === 1 ? "Defect" : "Defects"} Encountered by Agents
                </div>
                <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                  Most recent: <strong style={{ color: "#f8fafc" }}>{activeIssues[0].title}</strong> &bull; Discovered by:{" "}
                  <code>{activeIssues[0].discoveringAgent}</code> &bull; Assigned to:{" "}
                  <strong style={{ color: "#a78bfa" }}>{activeIssues[0].assignedRole.toUpperCase()}</strong>
                  {activeIssues[0].retryCount >= activeIssues[0].maxRetries && (
                    <span style={{ color: "#ef4444", fontWeight: 700, marginLeft: 8 }}>[TASK BLOCKED]</span>
                  )}
                </div>
              </div>
            </div>

            {onNavigateToIssues && (
              <button
                onClick={() => onNavigateToIssues(activeIssues[0].id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  borderRadius: 6,
                  color: "#fca5a5",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span>Inspect in Issues Center</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          <div
            style={{
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              background: "rgba(0, 0, 0, 0.25)",
              padding: "6px 10px",
              borderRadius: 4,
              color: "#fca5a5",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeIssues[0].errorMessage}
          </div>
        </section>
      )}

      {/* ── 1. Operations Overview Metrics Bar ──────────────────────────────── */}
      {summary && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "Active Agents", value: summary.activeAgents, icon: Zap, color: "#10b981" },
            { label: "Idle / Standby", value: summary.idleAgents, icon: Clock, color: "#64748b" },
            { label: "Stale / Blocked", value: summary.staleAgents, icon: AlertTriangle, color: summary.staleAgents > 0 ? "#ef4444" : "#64748b" },
            { label: "Running Workflows", value: summary.runningWorkflows, icon: Workflow, color: "#3b82f6" },
            { label: "Queued Tasks", value: summary.queuedTasks, icon: Layers, color: "#f59e0b" },
            { label: "Completed Tasks", value: summary.completedTasks, icon: CheckCircle2, color: "#10b981" },
            { label: "Total Model Calls", value: summary.totalModelCalls, icon: Brain, color: "#8b5cf6" },
            { label: "Total Tokens", value: summary.totalTokens.total.toLocaleString(), icon: Terminal, color: "#06b6d4" },
            { label: "Est. Provider Cost", value: `$${summary.estimatedProviderCostUsd.toFixed(4)}`, icon: Shield, color: "#ec4899" },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                    {item.label}
                  </span>
                  <Icon size={16} style={{ color: item.color }} />
                </div>
                <span style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            );
          })}
        </section>
      )}

      {/* ── 2. Live Agent Activity Grid ────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={18} className="text-brand" />
            <span>Live Agent Monitoring Grid ({agents.length} Registered)</span>
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Click any agent card to inspect tools, skills, memory, logs and Git worktree
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {agents.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            const deltaHeartbeat = Date.now() - new Date(agent.lastHeartbeat).getTime();
            const isFreshHeartbeat = deltaHeartbeat < 15000;

            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                style={{
                  background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--surface)",
                  border: isSelected ? "2px solid var(--brand)" : "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: 16,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "all 0.15s ease",
                }}
              >
                {/* Agent Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{agent.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: agent.executionMode === "local" ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)",
                          color: agent.executionMode === "local" ? "#10b981" : "#3b82f6",
                          fontWeight: 600,
                        }}
                      >
                        {agent.executionMode.toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Role: <strong>{agent.role}</strong>
                    </span>
                  </div>
                  <div>{getStatusBadge(agent.status, agent.isStale)}</div>
                </div>

                {/* Model & Provider Info */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <Brain size={14} style={{ color: "#8b5cf6" }} />
                  <span>
                    {agent.provider} / <strong>{agent.model}</strong>
                  </span>
                </div>

                {/* Current Activity */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Activity size={13} style={{ color: agent.status === "working" ? "#10b981" : "#94a3b8" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {agent.activity}
                  </span>
                </div>

                {/* Assigned Skills & Active Tools */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {agent.assignedSkills.slice(0, 3).map((s, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.06)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                  {agent.activeTools.slice(0, 2).map((t, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "#818cf8",
                      }}
                    >
                      tool:{t}
                    </span>
                  ))}
                </div>

                {/* Heartbeat & Worktree Footer */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    borderTop: "1px solid var(--border-color)",
                    paddingTop: 8,
                    marginTop: 2,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: isFreshHeartbeat ? "#10b981" : agent.isStale ? "#ef4444" : "#f59e0b",
                      }}
                    />
                    Heartbeat: {formatRelativeTime(agent.lastHeartbeat)}
                  </span>

                  <span>Tokens: {agent.tokens.total.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 3. Interactive Workflow Visualization & Task Traceability ───────── */}
      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Left: Workflow DAG Visualizer */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <Workflow size={16} className="text-brand" />
              <span>Live Workflow DAG Visualization</span>
            </h3>

            {/* Task selector dropdown */}
            <select
              value={selectedTaskId || ""}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            >
              {activeTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}: {t.goal.slice(0, 40)}...
                </option>
              ))}
            </select>
          </div>

          {workflowDAG ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Root Task Node */}
              <div
                style={{
                  background: "rgba(99, 102, 241, 0.12)",
                  border: "1px solid var(--brand)",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Task Goal: {workflowDAG.taskGoal}</span>
                  {getStatusBadge(workflowDAG.taskStatus)}
                </div>
              </div>

              {/* Subtasks and Execution Flow */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Execution Nodes & Dependencies:
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                  {workflowDAG.nodes
                    .filter((n) => n.type !== "task")
                    .map((node) => (
                      <div
                        key={node.id}
                        style={{
                          background: "rgba(0,0,0,0.25)",
                          border: "1px solid var(--border-color)",
                          borderRadius: 6,
                          padding: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#818cf8" }}>
                            [{node.type.toUpperCase()}]
                          </span>
                          {getStatusBadge(node.status)}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{node.label}</span>
                        {node.assignedAgentRole && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Agent: <strong>{node.assignedAgentRole}</strong> ({node.assignedModel || "Default"})
                          </span>
                        )}
                        {node.blockedBy && node.blockedBy.length > 0 && (
                          <span style={{ fontSize: 10, color: "#f59e0b" }}>
                            Blocked by: {node.blockedBy.join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Owner Controls Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Owner Controls:</span>
                {workflowDAG.isPaused ? (
                  <button
                    onClick={() => handleResumeTask(workflowDAG.taskId)}
                    disabled={actionInProgress === workflowDAG.taskId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "#10b981",
                      color: "#fff",
                      border: "none",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <Play size={14} /> Resume Task
                  </button>
                ) : (
                  <button
                    onClick={() => handlePauseTask(workflowDAG.taskId)}
                    disabled={actionInProgress === workflowDAG.taskId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "#f59e0b",
                      color: "#000",
                      border: "none",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <Pause size={14} /> Pause Task
                  </button>
                )}

                <button
                  onClick={() =>
                    setConfirmModal({
                      isOpen: true,
                      title: "Cancel Task Execution",
                      description: "Are you sure you want to halt all running agents and delete temporary worktrees?",
                      actionType: "cancel",
                      taskId: workflowDAG.taskId,
                    })
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <X size={14} /> Cancel
                </button>

                <button
                  onClick={() =>
                    setConfirmModal({
                      isOpen: true,
                      title: "Retry Multi-Agent Task",
                      description: "Rerun planning and development stages from scratch?",
                      actionType: "retry",
                      taskId: workflowDAG.taskId,
                    })
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <RotateCcw size={14} /> Retry
                </button>

                <button
                  onClick={() => handleLoadDiff(workflowDAG.taskId)}
                  disabled={loadingDiff}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <Code2 size={14} /> View Diff
                </button>

                <button
                  onClick={() =>
                    setConfirmModal({
                      isOpen: true,
                      title: "Approve Integration Branch",
                      description: `Fast-forward or merge integration branch into main repo branch?`,
                      actionType: "approve",
                      taskId: workflowDAG.taskId,
                    })
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    fontSize: 12,
                    cursor: "pointer",
                    marginLeft: "auto",
                  }}
                >
                  <GitMerge size={14} /> Approve Integration
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Select a task to visualize its real-time workflow DAG.
            </div>
          )}
        </div>

        {/* Right: Task Traceability & Artifact Inspection */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <FileCode size={16} className="text-brand" />
            <span>Task & File Traceability</span>
          </h3>

          {traceability ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Target Files Accessed:</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {traceability.filesAccessed.map((f, i) => (
                    <span key={i} style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Files Modified & Committed:</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {traceability.filesModified.map((f, i) => (
                    <span key={i} style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Commits Created ({traceability.commits.length}):</span>
                {traceability.commits.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <GitCommit size={13} style={{ color: "#3b82f6" }} />
                    <span style={{ fontFamily: "monospace", fontSize: 11 }}>{c.commitSha.slice(0, 7)}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.commitMessage}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Tests Executed:</span>
                {traceability.testsExecuted.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    {t.passed ? <CheckCircle2 size={13} style={{ color: "#10b981" }} /> : <AlertTriangle size={13} style={{ color: "#ef4444" }} />}
                    <span>{t.outputSummary}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No task trace loaded.</span>
          )}
        </div>
      </section>

      {/* ── Inline Diff Inspector ─────────────────────────────────────────── */}
      {diffContent && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Code2 size={16} className="text-brand" />
              <span>Unified Git Diff Preview (Task {selectedTaskId})</span>
            </span>
            <button
              onClick={() => setDiffContent(null)}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={16} />
            </button>
          </div>
          <pre
            style={{
              background: "#0f172a",
              color: "#e2e8f0",
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              maxHeight: 250,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {diffContent}
          </pre>
        </section>
      )}

      {/* ── 4. Hardware & Provider Resource Telemetry ──────────────────────── */}
      {telemetry && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Server size={16} className="text-brand" />
            <span>Resource & Model Telemetry (Real Measured Values)</span>
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {/* Host RAM */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Host RAM Usage
              </span>
              <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0" }}>
                {telemetry.system.memoryUsagePercent}%
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {(telemetry.system.memoryUsageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB /{" "}
                {(telemetry.system.memoryTotalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB Measured
              </span>
            </div>

            {/* Host CPU */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Host CPU Load
              </span>
              <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0" }}>
                {telemetry.system.cpuUsagePercent !== null ? `${telemetry.system.cpuUsagePercent}%` : "Measured via OS"}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Node.js runtime active telemetry</span>
            </div>

            {/* GPU / VRAM (Strictly transparent without fake data) */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                GPU / VRAM Status
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", margin: "6px 0" }}>
                {telemetry.gpu.statusMessage}
              </div>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {telemetry.gpu.available ? "Hardware telemetry connected" : "Hardware probe not attached"}
              </span>
            </div>

            {/* Provider Latencies */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Provider Latencies
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4, fontSize: 11 }}>
                {telemetry.providers.map((p) => (
                  <div key={p.provider} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{p.provider}:</span>
                    <strong>{p.avgLatencyMs > 0 ? `${p.avgLatencyMs} ms` : "Standby"}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 5. Live Unified Event Stream ───────────────────────────────────── */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-color)",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Terminal size={16} className="text-brand" />
            <span>Live Unified Event Stream ({events.length} events)</span>
          </h3>

          {/* Filter Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={eventRoleFilter}
              onChange={(e) => setEventRoleFilter(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            >
              <option value="all">All Roles</option>
              <option value="orchestrator">Orchestrator</option>
              <option value="architect">Architect</option>
              <option value="developer">Developer</option>
              <option value="reviewer">Reviewer</option>
            </select>

            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            >
              <option value="">All Event Types</option>
              <option value="started">Started</option>
              <option value="tool">Tool</option>
              <option value="commit">Commit</option>
              <option value="review">Review</option>
              <option value="test">Test</option>
              <option value="integration">Integration</option>
              <option value="error">Error</option>
            </select>

            <input
              type="text"
              placeholder="Search events..."
              value={eventSearchQuery}
              onChange={(e) => setEventSearchQuery(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 12,
                width: 150,
              }}
            />
          </div>
        </div>

        {/* Event List */}
        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "#090d16",
            padding: 10,
            borderRadius: 6,
          }}
        >
          {events.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
              No matching events found.
            </span>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 12,
                  padding: "4px 6px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ color: "#64748b", fontFamily: "monospace", fontSize: 10, minWidth: 60 }}>
                  {new Date(evt.createdAt).toLocaleTimeString()}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background:
                      evt.agentRole === "architect"
                        ? "rgba(59, 130, 246, 0.2)"
                        : evt.agentRole === "developer"
                        ? "rgba(16, 185, 129, 0.2)"
                        : evt.agentRole === "reviewer"
                        ? "rgba(168, 85, 247, 0.2)"
                        : "rgba(100, 116, 139, 0.2)",
                    color:
                      evt.agentRole === "architect"
                        ? "#60a5fa"
                        : evt.agentRole === "developer"
                        ? "#34d399"
                        : evt.agentRole === "reviewer"
                        ? "#c084fc"
                        : "#94a3b8",
                    minWidth: 70,
                    textAlign: "center",
                  }}
                >
                  {evt.agentRole}
                </span>
                <span style={{ color: "#f8fafc", flex: 1 }}>{evt.message}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── 6. Agent Detail Inspector Modal / Drawer ────────────────────────── */}
      {selectedAgentId && agentDetail && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "550px",
            maxWidth: "90vw",
            background: "var(--surface)",
            borderLeft: "1px solid var(--border-color)",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Inspector Header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{agentDetail.name}</h3>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ID: {agentDetail.id} | Role: {agentDetail.role}
              </span>
            </div>
            <button
              onClick={() => setSelectedAgentId(null)}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={20} />
            </button>
          </div>

          {/* 8 Inspector Tabs */}
          <div
            style={{
              display: "flex",
              overflowX: "auto",
              borderBottom: "1px solid var(--border-color)",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            {[
              { key: "overview", label: "Overview" },
              { key: "skills", label: "Skills" },
              { key: "tools", label: "Tools" },
              { key: "files", label: "Files" },
              { key: "model", label: "Model" },
              { key: "logs", label: "Logs" },
              { key: "git", label: "Git" },
              { key: "communication", label: "Communication" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setInspectorTab(t.key as any)}
                style={{
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: inspectorTab === t.key ? 700 : 500,
                  border: "none",
                  background: "transparent",
                  borderBottom: inspectorTab === t.key ? "2px solid var(--brand)" : "2px solid transparent",
                  color: inspectorTab === t.key ? "var(--brand)" : "var(--text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            {inspectorTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div>
                  <strong>Status:</strong> {getStatusBadge(agentDetail.status, agentDetail.isStale)}
                </div>
                <div>
                  <strong>Current Task:</strong> {agentDetail.taskGoal}
                </div>
                <div>
                  <strong>Model:</strong> {agentDetail.provider} / {agentDetail.model}
                </div>
                <div>
                  <strong>Execution Mode:</strong> {agentDetail.executionMode.toUpperCase()}
                </div>
                <div>
                  <strong>Execution Duration:</strong> {Math.round(agentDetail.durationMs / 1000)} seconds
                </div>
                <div>
                  <strong>Total Tokens:</strong> {agentDetail.tokens.total.toLocaleString()}
                </div>
                <div>
                  <strong>Estimated Cost:</strong> ${agentDetail.estimatedCostUsd.toFixed(6)}
                </div>
                <div>
                  <strong>Last Heartbeat:</strong> {formatRelativeTime(agentDetail.lastHeartbeat)}
                </div>
              </div>
            )}

            {inspectorTab === "skills" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {agentDetail.skillsDetail.map((s, idx) => (
                  <div key={idx} style={{ background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#818cf8" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{s.description}</div>
                  </div>
                ))}
              </div>
            )}

            {inspectorTab === "tools" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Allowed Tools:</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {agentDetail.toolsDetail.map((t, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "#818cf8",
                        fontSize: 12,
                      }}
                    >
                      {t.name} (executed: {t.executionCount})
                    </span>
                  ))}
                </div>

                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginTop: 10 }}>
                  Recent Tool Executions:
                </span>
                {agentDetail.recentToolExecutions.map((te, idx) => (
                  <div key={idx} style={{ background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 6, fontSize: 12 }}>
                    <strong>{te.toolName}</strong> - {te.inputSummary}
                  </div>
                ))}
              </div>
            )}

            {inspectorTab === "files" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
                <div>
                  <strong>Files Opened:</strong>
                  <ul>
                    {agentDetail.files.opened.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Files Modified:</strong>
                  <ul>
                    {agentDetail.files.modified.map((f, i) => (
                      <li key={i} style={{ color: "#10b981" }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {inspectorTab === "model" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
                <div>
                  <strong>Temperature:</strong> {agentDetail.modelConfig.temperature}
                </div>
                <div>
                  <strong>Max Tokens:</strong> {agentDetail.modelConfig.maxTokens}
                </div>
                <div>
                  <strong>Context Window Usage:</strong> {agentDetail.modelConfig.usedContextTokens} /{" "}
                  {agentDetail.modelConfig.contextWindow} tokens
                </div>
                <div>
                  <strong>Average Latency:</strong> {agentDetail.modelConfig.avgLatencyMs} ms
                </div>
                <div>
                  <strong>System Prompt Preview:</strong>
                  <pre
                    style={{
                      background: "#090d16",
                      padding: 8,
                      borderRadius: 4,
                      fontSize: 11,
                      whiteSpace: "pre-wrap",
                      marginTop: 4,
                    }}
                  >
                    {agentDetail.modelConfig.systemPromptPreview}
                  </pre>
                </div>
              </div>
            )}

            {inspectorTab === "logs" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                {agentDetail.executionLogs.map((log) => (
                  <div key={log.id} style={{ background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 4 }}>
                    <span style={{ color: "#64748b" }}>{new Date(log.createdAt).toLocaleTimeString()}:</span>{" "}
                    <strong>{log.eventType}</strong> - {log.message}
                  </div>
                ))}
              </div>
            )}

            {inspectorTab === "git" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
                <div>
                  <strong>Branch:</strong> {agentDetail.git.currentBranch}
                </div>
                <div>
                  <strong>Base Branch:</strong> {agentDetail.git.baseBranch}
                </div>
                <div>
                  <strong>Worktree Path:</strong> {agentDetail.git.worktreePath || "None"}
                </div>
                {agentDetail.git.latestCommitSha && (
                  <div>
                    <strong>Latest Commit:</strong> {agentDetail.git.latestCommitSha} (
                    {agentDetail.git.latestCommitMessage})
                  </div>
                )}
                <div>
                  <strong>Insertions / Deletions:</strong> +{agentDetail.git.insertions} / -
                  {agentDetail.git.deletions}
                </div>
              </div>
            )}

            {inspectorTab === "communication" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <span>Messages Sent: {agentDetail.communication.messagesSent.length}</span>
                <span>Messages Received: {agentDetail.communication.messagesReceived.length}</span>
                {agentDetail.communication.pendingReview && (
                  <div>
                    <strong>Latest Review Verdict:</strong>{" "}
                    {agentDetail.communication.pendingReview.verdict.toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Confirmation Modal for Destructive Actions ─────────────────────── */}
      {confirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              padding: 24,
              maxWidth: 420,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={22} style={{ color: "#ef4444" }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{confirmModal.title}</h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{confirmModal.description}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleConfirmAction}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
