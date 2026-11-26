import { useEffect, useState, useRef } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  FileCode,
  FolderGit2,
  GitCommit,
  GitPullRequest,
  ListTodo,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  StopCircle,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { globalVioletAIClient, VioletAIClient } from "../../lib/violet/ai/apiClient";
import type {
  AgentEventRecord,
  MultiAgentTaskState,
} from "../../types/multiAgent";

interface Props {
  client?: VioletAIClient;
}

export function VioletMultiAgentLab({ client = globalVioletAIClient }: Props) {
  const [tasks, setTasks] = useState<MultiAgentTaskState[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [copiedMergeCmd, setCopiedMergeCmd] = useState(false);
  const [activeEvents, setActiveEvents] = useState<AgentEventRecord[]>([]);

  // Multi-Model Configuration state
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [archModel, setArchModel] = useState<string>("auto");
  const [devModel, setDevModel] = useState<string>("auto");
  const [revModel, setRevModel] = useState<string>("auto");
  const [activeTab, setActiveTab] = useState<
    "overview" | "subtasks" | "messages" | "findings" | "adrs" | "stream"
  >("overview");

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const activeStreamRef = useRef<AbortController | null>(null);

  // Load tasks on mount
  useEffect(() => {
    let active = true;

    async function loadTasks() {
      try {
        const list = await client.listMultiAgentTasks();
        if (!active) return;
        setTasks(list);
        if (list.length > 0 && !selectedTaskId) {
          setSelectedTaskId(list[0].id);
          setActiveEvents(list[0].events || []);
        }
      } catch (err) {
        console.error("Failed to load multi-agent tasks:", err);
      }
    }

    void loadTasks();
    const interval = setInterval(loadTasks, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [client, selectedTaskId]);

  // Connect to live SSE event stream when active task changes
  useEffect(() => {
    if (!selectedTaskId) return;

    if (activeStreamRef.current) {
      activeStreamRef.current.abort();
    }

    const controller = new AbortController();
    activeStreamRef.current = controller;

    async function listenToEvents() {
      try {
        for await (const evt of client.streamTaskEvents(selectedTaskId!, controller.signal)) {
          setActiveEvents((prev) => {
            if (prev.some((e) => e.id === evt.id)) return prev;
            return [...prev, evt];
          });

          // Refresh task data if a lifecycle event occurs
          if (
            evt.eventType === "developer.committed" ||
            evt.eventType === "reviewer.verdict" ||
            evt.eventType === "reviewer.completed" ||
            evt.eventType === "task.completed" ||
            evt.eventType === "task.failed"
          ) {
            client.getMultiAgentTask(selectedTaskId!).then((updated) => {
              setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            });
          }
        }
      } catch {
        // Stream aborted or connection ended
      }
    }

    void listenToEvents();

    return () => {
      controller.abort();
    };
  }, [client, selectedTaskId]);

  const handleStartTask = async () => {
    const goal = goalInput.trim();
    if (!goal) return;

    setErrorBanner(null);
    setIsStarting(true);

    try {
      const task = await client.startMultiAgentTask({
        goal,
        models: {
          architect:
            archModel !== "auto"
              ? { provider: archModel.split(":")[0] as any, model: archModel.split(":")[1] }
              : undefined,
          developer:
            devModel !== "auto"
              ? { provider: devModel.split(":")[0] as any, model: devModel.split(":")[1] }
              : undefined,
          reviewer:
            revModel !== "auto"
              ? { provider: revModel.split(":")[0] as any, model: revModel.split(":")[1] }
              : undefined,
        },
        maxCorrectionAttempts: 3,
      });
      setTasks((prev) => [task, ...prev]);
      setSelectedTaskId(task.id);
      setActiveEvents(task.events || []);
      setGoalInput("");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancelTask = async () => {
    if (!selectedTaskId) return;
    try {
      await client.cancelMultiAgentTask(selectedTaskId, "Cancelled from workspace");
      const updated = await client.getMultiAgentTask(selectedTaskId);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      alert(`Cancel failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const copyToClipboard = (sha: string) => {
    void navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#10b981";
      case "planning":
      case "implementing":
      case "reviewing":
      case "testing":
        return "#3b82f6";
      case "failed":
        return "#ef4444";
      case "cancelled":
        return "#64748b";
      default:
        return "#f59e0b";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Top Header & Task Launcher ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <FolderGit2 size={20} color="var(--brand)" />
              <span>Autonomous Multi-Agent Software Development Platform</span>
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4, marginBottom: 0 }}>
              Specialized Architect, Developer, and Reviewer agents collaborating concurrently in isolated Git worktrees.
            </p>
          </div>
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#10b98115",
              color: "#10b981",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            <span>Single-User Private Lab (Owner Only)</span>
          </div>
        </div>

        {/* Task Input Box */}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isStarting) void handleStartTask();
            }}
            placeholder="e.g. Implement strict single-user authentication middleware and add isolated Git worktree tests..."
            disabled={isStarting}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 8,
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          />
          <button
            onClick={() => setShowModelConfig(!showModelConfig)}
            title="Configure model allocation per role"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "12px 14px",
              borderRadius: 8,
              background: showModelConfig ? "var(--brand-soft)" : "var(--bg-app)",
              border: `1px solid ${showModelConfig ? "var(--brand)" : "var(--border-color)"}`,
              color: showModelConfig ? "var(--brand)" : "var(--text-muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Sliders size={15} />
            <span>Models</span>
          </button>
          <button
            onClick={handleStartTask}
            disabled={isStarting || !goalInput.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 8,
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: isStarting || !goalInput.trim() ? "not-allowed" : "pointer",
            }}
          >
            {isStarting ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            <span>Start Multi-Agent Run</span>
          </button>
        </div>

        {/* Multi-Model Configuration Drawer */}
        {showModelConfig && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 8,
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                ARCHITECT AGENT (Reasoning)
              </label>
              <select
                value={archModel}
                onChange={(e) => setArchModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                <option value="auto">Auto (Anthropic / High Reasoning)</option>
                <option value="anthropic:claude-3-5-sonnet-latest">Anthropic: Claude 3.5 Sonnet</option>
                <option value="openai:gpt-4o">OpenAI: GPT-4o</option>
                <option value="gemini:gemini-2.5-pro">Google: Gemini 2.5 Pro</option>
                <option value="openrouter:anthropic/claude-3.5-sonnet">OpenRouter: Claude 3.5 Sonnet</option>
                <option value="ollama:deepseek-r1:latest">Ollama: DeepSeek R1 (Local)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                DEVELOPER AGENT (Coding)
              </label>
              <select
                value={devModel}
                onChange={(e) => setDevModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                <option value="auto">Auto (OpenAI / Code Generation)</option>
                <option value="openai:gpt-4o">OpenAI: GPT-4o</option>
                <option value="anthropic:claude-3-5-sonnet-latest">Anthropic: Claude 3.5 Sonnet</option>
                <option value="gemini:gemini-2.5-flash">Google: Gemini 2.5 Flash</option>
                <option value="openrouter:openai/gpt-4o">OpenRouter: GPT-4o</option>
                <option value="ollama:qwen2.5-coder:latest">Ollama: Qwen 2.5 Coder (Local)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                REVIEWER AGENT (Independent QA)
              </label>
              <select
                value={revModel}
                onChange={(e) => setRevModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                <option value="auto">Auto (Cross-Model Independent Review)</option>
                <option value="gemini:gemini-2.0-flash">Google: Gemini 2.0 Flash</option>
                <option value="anthropic:claude-3-5-sonnet-latest">Anthropic: Claude 3.5 Sonnet</option>
                <option value="openai:gpt-4o">OpenAI: GPT-4o</option>
                <option value="openrouter:google/gemini-2.0-flash">OpenRouter: Gemini 2.0 Flash</option>
                <option value="ollama:deepseek-r1:latest">Ollama: DeepSeek R1 (Local)</option>
              </select>
            </div>
          </div>
        )}

        {/* Quick Task Suggestions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Example tasks:</span>
          {[
            "Fix JWT authentication validation and restrict backend endpoints to owner",
            "Refactor Git worktree manager to sanitize paths and prevent traversal",
            "Add end-to-end integration test for concurrent multi-agent execution",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => setGoalInput(prompt)}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 6,
                background: "var(--bg-app)",
                border: "1px solid var(--border-color)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {errorBanner && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "#ef444422",
            border: "1px solid #ef444466",
            color: "#ef4444",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Main Workspace Body ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18 }}>
        {/* Left Sidebar: Task History */}
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Engineering Tasks</h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tasks.length} total</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "640px", overflowY: "auto" }}>
            {tasks.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                No tasks yet. Enter a software engineering goal above.
              </div>
            ) : (
              tasks.map((t) => {
                const isSelected = t.id === selectedTaskId;
                const statusColor = getStatusBadgeColor(t.status);

                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTaskId(t.id);
                      setActiveEvents(t.events || []);
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: isSelected ? "var(--bg-card-hover, rgba(255,255,255,0.06))" : "var(--bg-app)",
                      border: `1px solid ${isSelected ? "var(--brand)" : "var(--border-color)"}`,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: `${statusColor}22`,
                          color: statusColor,
                        }}
                      >
                        {t.status}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(t.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                      {t.goal.length > 70 ? `${t.goal.slice(0, 70)}...` : t.goal}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                      <span>{t.commits?.length || 0} commit(s)</span>
                      <span>${t.totalCostUsd.toFixed(4)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Content Pane: Selected Task Workspace */}
        {selectedTask ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Task Top Bar */}
            <div
              className="card"
              style={{
                padding: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: `${getStatusBadgeColor(selectedTask.status)}22`,
                      color: getStatusBadgeColor(selectedTask.status),
                    }}
                  >
                    {selectedTask.status}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Task ID: {selectedTask.id}</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 6, marginBottom: 0 }}>{selectedTask.goal}</h3>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {selectedTask.status === "planning" ||
                selectedTask.status === "implementing" ||
                selectedTask.status === "reviewing" ? (
                  <button
                    onClick={handleCancelTask}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 6,
                      background: "#ef4444",
                      color: "#fff",
                      border: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <StopCircle size={14} />
                    <span>Cancel Task</span>
                  </button>
                ) : null}

                {selectedTask.integrationBranch && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "#3b82f6",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <GitPullRequest size={14} />
                    <span>Integration: {selectedTask.integrationBranch}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Phase 3D Engineering Workspace Tab Navigation ── */}
            <div
              style={{
                display: "flex",
                gap: 8,
                borderBottom: "1px solid var(--border-color)",
                paddingBottom: 8,
                overflowX: "auto",
              }}
            >
              {[
                { id: "overview", label: "Overview & Execution", icon: Sliders, badge: undefined },
                { id: "subtasks", label: "Subtasks & DAG", icon: ListTodo, badge: selectedTask.subtasks?.length },
                { id: "messages", label: "Agent Collaboration", icon: MessageSquare, badge: selectedTask.messages?.length },
                { id: "findings", label: "Engineering Findings", icon: ShieldAlert, badge: selectedTask.findings?.length },
                { id: "adrs", label: "ADR Decisions", icon: BookOpen, badge: selectedTask.architecturalDecisions?.length },
                { id: "stream", label: "Live Event Stream", icon: Terminal, badge: activeEvents.length },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 6,
                      background: isActive ? "var(--brand-soft)" : "transparent",
                      border: `1px solid ${isActive ? "var(--brand)" : "transparent"}`,
                      color: isActive ? "var(--brand)" : "var(--text-muted)",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 13,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <IconComponent size={14} />
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 10,
                          background: isActive ? "var(--brand)" : "var(--bg-app)",
                          color: isActive ? "#fff" : "var(--text-muted)",
                          border: `1px solid ${isActive ? "transparent" : "var(--border-color)"}`,
                        }}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── TAB 1: OVERVIEW & EXECUTION ── */}
            {activeTab === "overview" && (
              <>
                {/* 3 Specialized Concurrent Agent Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                  {/* Agent 1: Architect */}
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      borderTop: "3px solid #8b5cf6",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "#8b5cf622",
                            color: "#8b5cf6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          A
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>Agent 1 — Architect</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Requirements & Planning</div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            selectedTask.currentRun?.activeAgents[0]?.status === "running"
                              ? "#3b82f622"
                              : selectedTask.currentRun?.activeAgents[0]?.status === "completed"
                              ? "#10b98122"
                              : "#64748b22",
                          color:
                            selectedTask.currentRun?.activeAgents[0]?.status === "running"
                              ? "#3b82f6"
                              : selectedTask.currentRun?.activeAgents[0]?.status === "completed"
                              ? "#10b981"
                              : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {selectedTask.currentRun?.activeAgents[0]?.status || "idle"}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-primary)", background: "var(--bg-app)", padding: 8, borderRadius: 6 }}>
                      {selectedTask.currentRun?.activeAgents[0]?.activity || "Awaiting task execution..."}
                    </div>

                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                      <span>Model:</span>
                      <span style={{ fontWeight: 600 }}>{selectedTask.currentRun?.architectModel || "Auto-routed"}</span>
                    </div>
                  </div>

                  {/* Agent 2: Developer */}
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      borderTop: "3px solid #10b981",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "#10b98122",
                            color: "#10b981",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          D
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>Agent 2 — Developer</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Code & Git Worktree</div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            selectedTask.currentRun?.activeAgents[1]?.status === "running"
                              ? "#3b82f622"
                              : selectedTask.currentRun?.activeAgents[1]?.status === "completed"
                              ? "#10b98122"
                              : "#64748b22",
                          color:
                            selectedTask.currentRun?.activeAgents[1]?.status === "running"
                              ? "#3b82f6"
                              : selectedTask.currentRun?.activeAgents[1]?.status === "completed"
                              ? "#10b981"
                              : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {selectedTask.currentRun?.activeAgents[1]?.status || "idle"}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-primary)", background: "var(--bg-app)", padding: 8, borderRadius: 6 }}>
                      {selectedTask.currentRun?.activeAgents[1]?.activity || "Awaiting architectural plan..."}
                    </div>

                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                      <span>Branch:</span>
                      <span style={{ fontWeight: 600 }}>
                        {selectedTask.currentRun?.activeAgents[1]?.worktreeBranch || `violet/task-${selectedTask.id}/developer`}
                      </span>
                    </div>
                  </div>

                  {/* Agent 3: Reviewer / Tester */}
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      borderTop: "3px solid #f59e0b",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "#f59e0b22",
                            color: "#f59e0b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          R
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>Agent 3 — Reviewer</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Code Review & Verification</div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            selectedTask.currentRun?.activeAgents[2]?.status === "running"
                              ? "#3b82f622"
                              : selectedTask.currentRun?.activeAgents[2]?.status === "completed"
                              ? "#10b98122"
                              : "#64748b22",
                          color:
                            selectedTask.currentRun?.activeAgents[2]?.status === "running"
                              ? "#3b82f6"
                              : selectedTask.currentRun?.activeAgents[2]?.status === "completed"
                              ? "#10b981"
                              : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {selectedTask.currentRun?.activeAgents[2]?.status || "idle"}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-primary)", background: "var(--bg-app)", padding: 8, borderRadius: 6 }}>
                      {selectedTask.currentRun?.activeAgents[2]?.activity || "Awaiting code commit..."}
                    </div>

                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                      <span>Verdict:</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            selectedTask.reviews?.[0]?.verdict === "approved"
                              ? "#10b981"
                              : selectedTask.reviews?.[0]?.verdict === "changes_requested"
                              ? "#f59e0b"
                              : "var(--text-muted)",
                        }}
                      >
                        {selectedTask.reviews?.[0]?.verdict ? selectedTask.reviews[0].verdict.toUpperCase() : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metrics Row: Tokens, Cost, Commits */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                    <DollarSign size={20} color="#10b981" />
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Estimated Cost</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>${selectedTask.totalCostUsd.toFixed(5)}</div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                    <Zap size={20} color="#3b82f6" />
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tokens Consumed</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedTask.totalTokens.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                    <GitCommit size={20} color="#8b5cf6" />
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Git Commits Created</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedTask.commits?.length || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Git Commits & Worktree History */}
                <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <GitCommit size={16} />
                    <span>Isolated Git Commits</span>
                  </h4>

                  {selectedTask.commits && selectedTask.commits.length > 0 ? (
                    selectedTask.commits.map((cmt) => (
                      <div
                        key={cmt.id}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: "var(--bg-app)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <code
                              style={{
                                fontSize: 12,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(139, 92, 246, 0.15)",
                                color: "#8b5cf6",
                                fontWeight: 600,
                              }}
                            >
                              {cmt.commitSha.slice(0, 7)}
                            </code>
                            <button
                              onClick={() => copyToClipboard(cmt.commitSha)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                              title="Copy SHA"
                            >
                              <Copy size={13} />
                            </button>
                            {copiedSha === cmt.commitSha && (
                              <span style={{ fontSize: 11, color: "#10b981" }}>Copied!</span>
                            )}
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{cmt.commitMessage}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {new Date(cmt.createdAt).toLocaleTimeString()}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                          <span>Branch: {cmt.branchName}</span>
                          <span>•</span>
                          <span>+{cmt.insertions} / -{cmt.deletions}</span>
                        </div>

                        {cmt.filesChanged && cmt.filesChanged.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {cmt.filesChanged.map((f) => (
                              <span
                                key={f}
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "var(--bg-card)",
                                  border: "1px solid var(--border-color)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <FileCode size={11} />
                                <span>{f}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 8 }}>
                      No commits yet. The Developer agent will create commits in its isolated worktree.
                    </div>
                  )}
                </div>

                {/* ── Bounded Review & Multi-Model Collaboration History ── */}
                <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <RotateCcw size={16} />
                      <span>Review & Correction Cycles ({selectedTask.reviews?.length || 0})</span>
                    </h4>
                    {selectedTask.maxCycles && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Cycle {selectedTask.currentCycle || 1} of {selectedTask.maxCycles} (Max 3)
                      </span>
                    )}
                  </div>

                  {selectedTask.reviews && selectedTask.reviews.length > 0 ? (
                    selectedTask.reviews.map((rev) => {
                      const isApproved = rev.verdict === "approved";
                      const badgeColor = isApproved ? "#10b981" : "#f59e0b";

                      return (
                        <div
                          key={rev.id}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            background: "var(--bg-app)",
                            border: `1px solid ${isApproved ? "#10b98144" : "#f59e0b44"}`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  background: `${badgeColor}22`,
                                  color: badgeColor,
                                }}
                              >
                                {rev.verdict.toUpperCase()}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>
                                Cycle {rev.cycleNumber || 1} Review
                              </span>
                              {rev.score !== undefined && (
                                <span style={{ fontSize: 11, background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-color)", fontWeight: 600 }}>
                                  Score: {rev.score}/100
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
                              <span>Model: <code style={{ color: "var(--brand)" }}>{rev.reviewerModel || "Independent Reviewer"}</code></span>
                              <span>•</span>
                              <span>{new Date(rev.createdAt).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          {/* Review Summary */}
                          <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                            {rev.reviewNotes}
                          </div>

                          {/* Specific Issues */}
                          {rev.issues && rev.issues.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--bg-card)", padding: 10, borderRadius: 6, border: "1px solid var(--border-color)" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
                                ISSUES IDENTIFIED ({rev.issues.length}):
                              </span>
                              {rev.issues.map((iss, idx) => (
                                <div key={idx} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      padding: "1px 5px",
                                      borderRadius: 3,
                                      background:
                                        iss.severity === "critical"
                                          ? "#ef444422"
                                          : iss.severity === "suggestion"
                                          ? "#3b82f622"
                                          : "#f59e0b22",
                                      color:
                                        iss.severity === "critical"
                                          ? "#ef4444"
                                          : iss.severity === "suggestion"
                                          ? "#3b82f6"
                                          : "#f59e0b",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {iss.severity}
                                  </span>
                                  <span>{iss.description}</span>
                                  {iss.suggestedFix && (
                                    <span style={{ color: "var(--text-muted)" }}>(Fix: {iss.suggestedFix})</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Automated Test Check Output */}
                          {rev.testResults?.output && (
                            <div style={{ background: "var(--bg-card)", padding: 8, borderRadius: 6, fontSize: 11, fontFamily: "monospace" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, color: rev.automatedChecks?.testsPassed ? "#10b981" : "#ef4444" }}>
                                  Automated Tests: {rev.automatedChecks?.testsPassed ? "PASSED" : "FAILED"}
                                </span>
                              </div>
                              <pre style={{ margin: 0, maxHeight: 80, overflowY: "auto", color: "var(--text-muted)" }}>
                                {rev.testResults.output}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 8 }}>
                      No reviews yet. Independent QA Reviewer will inspect commits and tests.
                    </div>
                  )}
                </div>

                {/* ── Owner Controlled Integration & Branch Merging (Requirement 13) ── */}
                {selectedTask.integrationBranch && (
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      border: "1px solid #3b82f644",
                      background: "rgba(59, 130, 246, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Shield size={18} color="#3b82f6" />
                        <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#3b82f6" }}>
                          Owner Control: Integration Ready
                        </h4>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Never auto-merged or pushed to remote
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0 }}>
                      All agent work is isolated in integration branch{" "}
                      <code style={{ color: "#3b82f6", fontWeight: 600 }}>{selectedTask.integrationBranch}</code>.
                      Review the diff and merge into your working branch whenever you are ready:
                    </p>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: 6,
                        background: "var(--bg-app)",
                        border: "1px solid var(--border-color)",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      <span>git checkout {selectedTask.baseBranch || "main"} && git merge --no-ff {selectedTask.integrationBranch}</span>
                      <button
                        onClick={() => {
                          const cmd = `git checkout ${selectedTask.baseBranch || "main"} && git merge --no-ff ${selectedTask.integrationBranch}`;
                          void navigator.clipboard.writeText(cmd);
                          setCopiedMergeCmd(true);
                          setTimeout(() => setCopiedMergeCmd(false), 2000);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: copiedMergeCmd ? "#10b981" : "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        <Copy size={13} />
                        <span>{copiedMergeCmd ? "Copied!" : "Copy Command"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── TAB 2: SUBTASKS & DAG SCHEDULER ── */}
            {activeTab === "subtasks" && (
              <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <ListTodo size={17} color="var(--brand)" />
                      <span>Subtask DAG & Dependency-Aware Scheduling</span>
                    </h4>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                      Autonomous task decomposition with dependency graph tracking and file conflict locks.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                    <span style={{ padding: "4px 8px", borderRadius: 4, background: "#10b98122", color: "#10b981", fontWeight: 600 }}>
                      {(selectedTask.subtasks || []).filter((s) => s.status === "completed").length} Completed
                    </span>
                    <span style={{ padding: "4px 8px", borderRadius: 4, background: "var(--bg-app)", color: "var(--text-muted)", border: "1px solid var(--border-color)" }}>
                      {selectedTask.subtasks?.length || 0} Total
                    </span>
                  </div>
                </div>

                {selectedTask.subtasks && selectedTask.subtasks.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedTask.subtasks.map((sub, idx) => {
                      const isDone = sub.status === "completed";
                      const isRunning = sub.status === "running";
                      const isBlocked = sub.status === "blocked";
                      const statusColor = isDone ? "#10b981" : isRunning ? "#3b82f6" : isBlocked ? "#ef4444" : "#f59e0b";

                      return (
                        <div
                          key={sub.id || idx}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            background: "var(--bg-app)",
                            border: `1px solid ${isRunning ? "var(--brand)" : "var(--border-color)"}`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: `${statusColor}22`,
                                  color: statusColor,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                {isDone ? <CheckCircle2 size={12} /> : isRunning ? <Loader2 size={12} className="spin" /> : <Clock size={12} />}
                                <span>{sub.status.toUpperCase()}</span>
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>
                                {idx + 1}. {sub.title}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background:
                                  sub.assignedRole === "architect"
                                    ? "#8b5cf622"
                                    : sub.assignedRole === "developer"
                                    ? "#10b98122"
                                    : "#f59e0b22",
                                color:
                                  sub.assignedRole === "architect"
                                    ? "#8b5cf6"
                                    : sub.assignedRole === "developer"
                                    ? "#10b981"
                                    : "#f59e0b",
                                fontWeight: 600,
                                textTransform: "uppercase",
                              }}
                            >
                              {sub.assignedRole}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                            {sub.description}
                          </div>

                          {/* Dependencies & Target Files */}
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
                            {sub.dependencies && sub.dependencies.length > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span>Prerequisites:</span>
                                {sub.dependencies.map((dep) => (
                                  <span
                                    key={dep}
                                    style={{
                                      padding: "1px 5px",
                                      borderRadius: 3,
                                      background: "var(--bg-card)",
                                      border: "1px solid var(--border-color)",
                                    }}
                                  >
                                    {dep}
                                  </span>
                                ))}
                              </div>
                            )}

                            {sub.targetFiles && sub.targetFiles.length > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span>Target Files:</span>
                                {sub.targetFiles.map((file) => (
                                  <span
                                    key={file}
                                    style={{
                                      padding: "1px 5px",
                                      borderRadius: 3,
                                      background: "var(--bg-card)",
                                      border: "1px solid var(--border-color)",
                                      color: "var(--brand)",
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    {file}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {sub.resultSummary && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-card)", padding: 6, borderRadius: 4 }}>
                              Result: {sub.resultSummary}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
                    No subtasks decomposed yet. The Architect agent will analyze the repository and define subtasks.
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: AGENT COLLABORATION & PLAN CHALLENGES ── */}
            {activeTab === "messages" && (
              <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquare size={17} color="var(--brand)" />
                    <span>Structured Peer-to-Peer Agent Collaboration</span>
                  </h4>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                    Agents challenge plans, request assistance, and exchange structured messages during execution.
                  </p>
                </div>

                {selectedTask.messages && selectedTask.messages.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {selectedTask.messages.map((msg) => {
                      const typeColor =
                        msg.messageType === "PLAN_PROPOSAL"
                          ? "#8b5cf6"
                          : msg.messageType === "CHALLENGE_PLAN"
                          ? "#ef4444"
                          : msg.messageType === "PLAN_ACCEPTED"
                          ? "#10b981"
                          : msg.messageType === "REQUEST_ASSISTANCE"
                          ? "#06b6d4"
                          : "#3b82f6";

                      return (
                        <div
                          key={msg.id}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            background: "var(--bg-app)",
                            border: `1px solid ${typeColor}44`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: `${typeColor}22`,
                                  color: typeColor,
                                }}
                              >
                                {msg.messageType.replace("_", " ")}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700 }}>
                                {msg.fromRole.toUpperCase()} → {msg.toRole.toUpperCase()}
                              </span>
                            </div>
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </span>
                          </div>

                          <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                            {msg.content}
                          </div>

                          {msg.payload && Object.keys(msg.payload).length > 0 && (
                            <div
                              style={{
                                background: "var(--bg-card)",
                                padding: 8,
                                borderRadius: 6,
                                fontSize: 11,
                                fontFamily: "monospace",
                                color: "var(--text-muted)",
                                maxHeight: 120,
                                overflowY: "auto",
                              }}
                            >
                              <pre style={{ margin: 0 }}>{JSON.stringify(msg.payload, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
                    No structured agent messages recorded yet.
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 4: ENGINEERING INTELLIGENCE FINDINGS ── */}
            {activeTab === "findings" && (
              <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldAlert size={17} color="#ef4444" />
                    <span>Automated Engineering Intelligence & Static Analysis</span>
                  </h4>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                    Automated detection of security vulnerabilities, bugs, missing unit tests, and duplicated code.
                  </p>
                </div>

                {selectedTask.findings && selectedTask.findings.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedTask.findings.map((fnd) => {
                      const isCritical = fnd.severity === "critical";
                      const isHigh = fnd.severity === "high";
                      const isMedium = fnd.severity === "medium";
                      const sevColor = isCritical ? "#ef4444" : isHigh ? "#f97316" : isMedium ? "#f59e0b" : "#3b82f6";

                      return (
                        <div
                          key={fnd.id}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            background: "var(--bg-app)",
                            border: `1px solid ${sevColor}44`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: `${sevColor}22`,
                                  color: sevColor,
                                }}
                              >
                                {fnd.severity}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "var(--bg-card)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {fnd.category}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{fnd.title}</span>
                            </div>

                            {fnd.filePath && (
                              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                {fnd.filePath}{fnd.lineNumber ? `:${fnd.lineNumber}` : ""}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                            {fnd.description}
                          </div>

                          {fnd.suggestedRemediation && (
                            <div
                              style={{
                                padding: "6px 10px",
                                borderRadius: 4,
                                background: "rgba(16, 185, 129, 0.1)",
                                border: "1px solid rgba(16, 185, 129, 0.2)",
                                fontSize: 11,
                                color: "#10b981",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <CheckCircle2 size={13} />
                              <span>Remediation: {fnd.suggestedRemediation}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
                    No engineering findings detected. The codebase passed security and static analysis checks.
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 5: ARCHITECTURAL DECISIONS (ADRs) ── */}
            {activeTab === "adrs" && (
              <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen size={17} color="var(--brand)" />
                    <span>Architectural Decision Records (ADRs)</span>
                  </h4>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                    Persistent architectural decision log tracking technical context, rationale, and consequences.
                  </p>
                </div>

                {selectedTask.architecturalDecisions && selectedTask.architecturalDecisions.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {selectedTask.architecturalDecisions.map((adr) => (
                      <div
                        key={adr.id}
                        style={{
                          padding: 14,
                          borderRadius: 8,
                          background: "var(--bg-app)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "#10b98122",
                                color: "#10b981",
                              }}
                            >
                              {adr.status}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{adr.title}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {new Date(adr.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div style={{ fontSize: 12, color: "var(--text-primary)", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div>
                            <strong style={{ color: "var(--text-muted)" }}>Context: </strong>
                            <span>{adr.context}</span>
                          </div>
                          <div>
                            <strong style={{ color: "var(--text-muted)" }}>Decision: </strong>
                            <span>{adr.decision}</span>
                          </div>
                          <div>
                            <strong style={{ color: "var(--text-muted)" }}>Consequences: </strong>
                            <span>{adr.consequences}</span>
                          </div>
                        </div>

                        {adr.modelsConsulted && adr.modelsConsulted.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
                            <span>Consulted Models:</span>
                            {adr.modelsConsulted.map((m) => (
                              <span
                                key={m}
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "var(--bg-card)",
                                  border: "1px solid var(--border-color)",
                                  fontFamily: "monospace",
                                }}
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
                    No Architectural Decision Records recorded yet for this task.
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 6: LIVE EVENT STREAM ── */}
            {activeTab === "stream" && (
              <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Terminal size={17} color="var(--brand)" />
                    <span>Live Agent SSE Event Stream</span>
                  </h4>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{activeEvents.length} events received</span>
                </div>

                <div
                  style={{
                    maxHeight: 500,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 12,
                    background: "var(--bg-app)",
                    borderRadius: 8,
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {activeEvents.length === 0 ? (
                    <div style={{ color: "var(--text-muted)", padding: 8 }}>Awaiting live agent events...</div>
                  ) : (
                    activeEvents.map((evt) => (
                      <div key={evt.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                          {new Date(evt.createdAt).toLocaleTimeString()}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            flexShrink: 0,
                            color:
                              evt.agentRole === "architect"
                                ? "#8b5cf6"
                                : evt.agentRole === "developer"
                                ? "#10b981"
                                : evt.agentRole === "reviewer"
                                ? "#f59e0b"
                                : "var(--brand)",
                          }}
                        >
                          [{evt.agentRole.toUpperCase()}]
                        </span>
                        <span style={{ color: "var(--text-primary)" }}>{evt.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Select a task on the left or enter a new goal above to launch the autonomous multi-agent pipeline.
          </div>
        )}
      </div>
    </div>
  );
}
