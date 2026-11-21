/**
 * VIOLET AI & Lab — Phase 3F Extension: Issue Intelligence & Bug Tracking Center
 *
 * Dedicated real-time monitoring, inspection, and autonomous resolution hub
 * for software engineering defects, test failures, security findings, and model errors.
 * Strictly adheres to owner-in-the-loop safety: autonomous fixes run in isolated
 * Git worktrees and never merge into base branches without explicit owner approval.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitMerge,
  RefreshCw,
  Search,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { globalVioletAIClient, VioletAIClient } from "../../lib/violet/ai/apiClient";
import type {
  IssueCategory,
  IssueRecord,
  IssueSeverity,
  IssueStats,
  IssueStatus,
  SpecializedAgentRole,
} from "../../types/issues";

interface Props {
  apiClient?: VioletAIClient;
  initialSelectedIssueId?: string | null;
  onNavigateToLiveOps?: () => void;
}

const SEVERITY_COLORS: Record<IssueSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.3)" },
  high: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", border: "rgba(249, 115, 22, 0.3)" },
  medium: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308", border: "rgba(234, 179, 8, 0.3)" },
  low: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.3)" },
  info: { bg: "rgba(100, 116, 139, 0.15)", text: "#94a3b8", border: "rgba(100, 116, 139, 0.3)" },
};

const STATUS_COLORS: Record<IssueStatus, { bg: string; text: string }> = {
  open: { bg: "rgba(245, 158, 11, 0.18)", text: "#f59e0b" },
  in_progress: { bg: "rgba(139, 92, 246, 0.18)", text: "#a78bfa" },
  resolved: { bg: "rgba(16, 185, 129, 0.18)", text: "#10b981" },
  closed: { bg: "rgba(107, 114, 128, 0.18)", text: "#9ca3af" },
  reopened: { bg: "rgba(236, 72, 153, 0.18)", text: "#f472b6" },
  blocked: { bg: "rgba(220, 38, 38, 0.25)", text: "#f87171" },
};

export function VioletIssuesCenter({
  apiClient = globalVioletAIClient,
  initialSelectedIssueId = null,
  onNavigateToLiveOps,
}: Props) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [stats, setStats] = useState<IssueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(initialSelectedIssueId);
  const [selectedIssue, setSelectedIssue] = useState<IssueRecord | null>(null);

  // Filters
  const [filterSeverity, setFilterSeverity] = useState<IssueSeverity | "all">("all");
  const [filterStatus, setFilterStatus] = useState<IssueStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<IssueCategory | "all">("all");
  const [filterRole, setFilterRole] = useState<SpecializedAgentRole | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Action execution state
  const [isResolving, setIsResolving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [copiedStack, setCopiedStack] = useState(false);

  // Reassignment state
  const [reassignRole, setReassignRole] = useState<SpecializedAgentRole>("developer");
  const [reassignAgent, setReassignAgent] = useState("");

  // ─── Data Loading ─────────────────────────────────────────────────────────
  const fetchIssuesAndStats = async () => {
    try {
      setLoading(true);
      const [fetchedIssues, fetchedStats] = await Promise.all([
        apiClient.listIssues({
          severity: filterSeverity,
          status: filterStatus,
          category: filterCategory,
          assignedRole: filterRole,
          search: searchQuery || undefined,
        }),
        apiClient.getIssueStats(),
      ]);
      setIssues(fetchedIssues);
      setStats(fetchedStats);

      if (selectedIssueId) {
        const found = fetchedIssues.find((i) => i.id === selectedIssueId);
        if (found) setSelectedIssue(found);
      }
    } catch (err) {
      console.error("Failed to fetch issues or stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchIssuesAndStats();
  }, [filterSeverity, filterStatus, filterCategory, filterRole, searchQuery]);

  // Real-time EventSource updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/v1/issues/stream");
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type: string; issue?: IssueRecord };
          if (payload.type === "issue_updated" && payload.issue) {
            setIssues((prev) => {
              const idx = prev.findIndex((i) => i.id === payload.issue!.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = payload.issue!;
                return next;
              }
              return [payload.issue!, ...prev];
            });

            if (selectedIssueId === payload.issue.id) {
              setSelectedIssue(payload.issue);
            }

            void apiClient.getIssueStats().then(setStats).catch(() => {});
          }
        } catch {
          // ignore parse error
        }
      };
    } catch {
      // EventSource not supported or failed
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [selectedIssueId]);

  // Sync selected issue details
  useEffect(() => {
    if (selectedIssueId) {
      const found = issues.find((i) => i.id === selectedIssueId);
      if (found) {
        setSelectedIssue(found);
        setReassignRole(found.assignedRole);
        setReassignAgent(found.assignedAgent || `agent-${found.assignedRole}`);
      } else {
        void apiClient
          .getIssue(selectedIssueId)
          .then((iss) => {
            setSelectedIssue(iss);
            setReassignRole(iss.assignedRole);
            setReassignAgent(iss.assignedAgent || `agent-${iss.assignedRole}`);
          })
          .catch(() => setSelectedIssue(null));
      }
    } else {
      setSelectedIssue(null);
    }
  }, [selectedIssueId, issues]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const handleResolve = async () => {
    if (!selectedIssue) return;
    try {
      setIsResolving(true);
      setActionMessage(null);
      const updated = await apiClient.resolveIssue(selectedIssue.id);
      setSelectedIssue(updated);
      setActionMessage({
        text: `Fix completed and verified in isolated worktree (${updated.worktreeBranch}). Awaiting owner integration approval.`,
        type: "success",
      });
      await fetchIssuesAndStats();
    } catch (err) {
      setActionMessage({
        text: `Autonomous resolution failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setIsResolving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedIssue) return;
    try {
      setIsApproving(true);
      setActionMessage(null);
      const outcome = await apiClient.approveIssueFix(selectedIssue.id);
      setSelectedIssue(outcome.issue);
      setActionMessage({
        text: `Fix approved and merged into base branch! Integration commit: ${outcome.commitSha.slice(0, 8)}`,
        type: "success",
      });
      await fetchIssuesAndStats();
    } catch (err) {
      setActionMessage({
        text: `Approval failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedIssue) return;
    const reason = window.prompt("Reason for rejecting fix (will reopen issue):", "Fix did not resolve the problem.");
    if (reason === null) return;
    try {
      setActionMessage(null);
      const updated = await apiClient.rejectIssueFix(selectedIssue.id, reason);
      setSelectedIssue(updated);
      setActionMessage({ text: "Fix rejected. Issue has been reopened.", type: "success" });
      await fetchIssuesAndStats();
    } catch (err) {
      setActionMessage({
        text: `Rejection failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    }
  };

  const handleReassign = async () => {
    if (!selectedIssue || !reassignAgent.trim()) return;
    try {
      const updated = await apiClient.assignIssueAgent(selectedIssue.id, reassignAgent.trim(), reassignRole);
      setSelectedIssue(updated);
      setActionMessage({
        text: `Issue reassigned to ${reassignAgent} (${reassignRole}).`,
        type: "success",
      });
      await fetchIssuesAndStats();
    } catch (err) {
      setActionMessage({
        text: `Reassignment failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    }
  };

  const handleCopyStack = () => {
    if (selectedIssue?.stackTrace) {
      navigator.clipboard.writeText(selectedIssue.stackTrace);
      setCopiedStack(true);
      setTimeout(() => setCopiedStack(false), 2000);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 24px", color: "#e2e8f0", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(168, 85, 247, 0.2))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              <Bug size={20} color="#f87171" />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                Issue Intelligence & Bug Tracking
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
                Defect detection, specialized agent assignment, isolated worktree fixes, and owner-governed approval.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onNavigateToLiveOps && (
            <button
              onClick={onNavigateToLiveOps}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 6,
                color: "#cbd5e1",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <ExternalLink size={14} /> Live Operations
            </button>
          )}

          <button
            onClick={() => void fetchIssuesAndStats()}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "rgba(139, 92, 246, 0.15)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              borderRadius: 6,
              color: "#c084fc",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "rgba(30, 41, 59, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>Total Defects</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc" }}>{stats?.total ?? 0}</div>
        </div>

        <div
          style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 6 }}>Open Issues</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>{stats?.open ?? 0}</div>
        </div>

        <div
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>Critical (P0)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#ef4444" }}>{stats?.critical ?? 0}</div>
        </div>

        <div
          style={{
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: "#c084fc", marginBottom: 6 }}>In Progress</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#a855f7" }}>{stats?.inProgress ?? 0}</div>
        </div>

        <div
          style={{
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: "#34d399", marginBottom: 6 }}>Resolved (Awaiting Approval)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>{stats?.resolved ?? 0}</div>
        </div>

        <div
          style={{
            background: "rgba(236, 72, 153, 0.08)",
            border: "1px solid rgba(236, 72, 153, 0.25)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: "#f472b6", marginBottom: 6 }}>Reopened / Blocked</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#ec4899" }}>{stats?.reopened ?? 0}</div>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ────────────────────────────────────────── */}
      <div
        style={{
          background: "rgba(30, 41, 59, 0.3)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 8,
          padding: 14,
          marginBottom: 20,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 240px", minWidth: 200 }}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search issues by title, error, file, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              padding: "7px 10px",
              color: "#f8fafc",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Severity */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as any)}
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              padding: "7px 10px",
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            <option value="all">Severity: All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              padding: "7px 10px",
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            <option value="all">Status: All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="blocked">Blocked</option>
            <option value="reopened">Reopened</option>
            <option value="closed">Closed</option>
          </select>

          {/* Category */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as any)}
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              padding: "7px 10px",
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            <option value="all">Category: All</option>
            <option value="runtime_error">Runtime Error</option>
            <option value="model_provider">Model Provider</option>
            <option value="ollama_connection">Ollama Connection</option>
            <option value="command_failure">Command Failure</option>
            <option value="typescript_error">TypeScript Error</option>
            <option value="test_failure">Test Failure</option>
            <option value="build_failure">Build Failure</option>
            <option value="security_vulnerability">Security</option>
            <option value="review_finding">Review Finding</option>
            <option value="task_dependency">Task Dependency</option>
            <option value="worker_crash">Worker Crash</option>
            <option value="timeout">Timeout</option>
          </select>

          {/* Assigned Role */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              padding: "7px 10px",
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            <option value="all">Assigned Role: All</option>
            <option value="frontend">Frontend Agent</option>
            <option value="backend">Backend Agent</option>
            <option value="database">Database Agent</option>
            <option value="qa">QA Agent</option>
            <option value="security">Security Agent</option>
            <option value="devops">DevOps Agent</option>
            <option value="architect">Architect Agent</option>
            <option value="developer">Developer Agent</option>
          </select>

          {(filterSeverity !== "all" ||
            filterStatus !== "all" ||
            filterCategory !== "all" ||
            filterRole !== "all" ||
            searchQuery) && (
            <button
              onClick={() => {
                setFilterSeverity("all");
                setFilterStatus("all");
                setFilterCategory("all");
                setFilterRole("all");
                setSearchQuery("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Main Layout: Issue List + Detail Inspector ─────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: selectedIssue ? "1fr 1fr" : "1fr", gap: 20 }}>
        {/* Issue List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {issues.length === 0 ? (
            <div
              style={{
                background: "rgba(30, 41, 59, 0.2)",
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                padding: 40,
                textAlign: "center",
                color: "#94a3b8",
              }}
            >
              <Bug size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#cbd5e1" }}>No defects matching criteria</div>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                All systems healthy, or try clearing your active search and filters.
              </p>
            </div>
          ) : (
            issues.map((issue) => {
              const sev = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.info;
              const stat = STATUS_COLORS[issue.status] || STATUS_COLORS.open;
              const isSelected = selectedIssueId === issue.id;

              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssueId(issue.id)}
                  style={{
                    background: isSelected ? "rgba(139, 92, 246, 0.12)" : "rgba(30, 41, 59, 0.35)",
                    border: isSelected ? "1px solid rgba(168, 85, 247, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 8,
                    padding: 14,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Severity Badge */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: 4,
                          background: sev.bg,
                          color: sev.text,
                          border: `1px solid ${sev.border}`,
                        }}
                      >
                        {issue.severity}
                      </span>

                      {/* Status Badge */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: 4,
                          background: stat.bg,
                          color: stat.text,
                        }}
                      >
                        {issue.status.replace("_", " ")}
                      </span>

                      {/* Category */}
                      <span
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          background: "rgba(255, 255, 255, 0.05)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {issue.category.replace("_", " ")}
                      </span>

                      {/* Transient Flag */}
                      {issue.isTransient && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#fbbf24",
                            background: "rgba(245, 158, 11, 0.1)",
                            padding: "2px 5px",
                            borderRadius: 4,
                          }}
                        >
                          Transient
                        </span>
                      )}

                      {/* Recurrence Count */}
                      {issue.retryCount > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#f87171",
                            background: "rgba(239, 68, 68, 0.1)",
                            padding: "2px 5px",
                            borderRadius: 4,
                          }}
                        >
                          Recurred {issue.retryCount}x
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
                      {new Date(issue.detectedAt).toLocaleTimeString()}
                    </div>
                  </div>

                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#f8fafc",
                      margin: "8px 0 4px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {issue.title}
                  </h3>

                  <p
                    style={{
                      fontSize: 12,
                      color: "#94a3b8",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {issue.errorMessage}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 10,
                      fontSize: 12,
                      color: "#64748b",
                      borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                      paddingTop: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <UserCheck size={13} color="#a78bfa" />
                      <span>
                        Assigned: <strong style={{ color: "#cbd5e1" }}>{issue.assignedRole.toUpperCase()}</strong>
                      </span>
                    </div>

                    {issue.sourceFile && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Code2 size={13} />
                        <span>
                          {issue.sourceFile}
                          {issue.lineNumber ? `:${issue.lineNumber}` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Issue Detail Inspector ────────────────────────────────────────── */}
        {selectedIssue && (
          <div
            style={{
              background: "rgba(30, 41, 59, 0.45)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 8,
              padding: 20,
              height: "fit-content",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            {/* Action notification banner */}
            {actionMessage && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background:
                    actionMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  border:
                    actionMessage.type === "success"
                      ? "1px solid rgba(16, 185, 129, 0.3)"
                      : "1px solid rgba(239, 68, 68, 0.3)",
                  color: actionMessage.type === "success" ? "#34d399" : "#f87171",
                }}
              >
                {actionMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{actionMessage.text}</span>
              </div>
            )}

            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                paddingBottom: 14,
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: SEVERITY_COLORS[selectedIssue.severity]?.bg,
                      color: SEVERITY_COLORS[selectedIssue.severity]?.text,
                      border: `1px solid ${SEVERITY_COLORS[selectedIssue.severity]?.border}`,
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedIssue.severity}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: STATUS_COLORS[selectedIssue.status]?.bg,
                      color: STATUS_COLORS[selectedIssue.status]?.text,
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedIssue.status.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>ID: {selectedIssue.id}</span>
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", margin: 0 }}>{selectedIssue.title}</h2>
              </div>

              <button
                onClick={() => setSelectedIssueId(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Metadata Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                fontSize: 12,
                marginBottom: 16,
                background: "rgba(15, 23, 42, 0.4)",
                padding: 12,
                borderRadius: 6,
              }}
            >
              <div>
                <span style={{ color: "#64748b" }}>Category:</span>{" "}
                <strong style={{ color: "#cbd5e1" }}>{selectedIssue.category}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Discovering Agent:</span>{" "}
                <strong style={{ color: "#cbd5e1" }}>{selectedIssue.discoveringAgent}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Assigned Role:</span>{" "}
                <strong style={{ color: "#a78bfa" }}>{selectedIssue.assignedRole.toUpperCase()}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Retry Count:</span>{" "}
                <strong style={{ color: selectedIssue.retryCount >= selectedIssue.maxRetries ? "#ef4444" : "#cbd5e1" }}>
                  {selectedIssue.retryCount} / {selectedIssue.maxRetries}
                </strong>
              </div>
              {selectedIssue.worktreeBranch && (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6 }}>
                  <GitBranch size={13} color="#34d399" />
                  <span style={{ color: "#64748b" }}>Isolated Branch:</span>{" "}
                  <code style={{ color: "#34d399", background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: 3 }}>
                    {selectedIssue.worktreeBranch}
                  </code>
                </div>
              )}
            </div>

            {/* Error Message */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>Error Message</div>
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 12,
                  fontFamily: "ui-monospace, monospace",
                  color: "#f87171",
                  wordBreak: "break-word",
                }}
              >
                {selectedIssue.errorMessage}
              </div>
            </div>

            {/* Stack Trace */}
            {selectedIssue.stackTrace && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Full Stack Trace</span>
                  <button
                    onClick={handleCopyStack}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: copiedStack ? "#34d399" : "#a78bfa",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: "pointer",
                    }}
                  >
                    {copiedStack ? <Check size={12} /> : <Copy size={12} />}
                    {copiedStack ? "Copied" : "Copy Trace"}
                  </button>
                </div>
                <pre
                  style={{
                    background: "rgba(10, 15, 26, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                    color: "#94a3b8",
                    maxHeight: 180,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    margin: 0,
                  }}
                >
                  {selectedIssue.stackTrace}
                </pre>
              </div>
            )}

            {/* Root Cause & Proposed Resolution */}
            {(selectedIssue.rootCause || selectedIssue.proposedResolution) && (
              <div
                style={{
                  background: "rgba(139, 92, 246, 0.08)",
                  border: "1px solid rgba(139, 92, 246, 0.25)",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                {selectedIssue.rootCause && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#c084fc", textTransform: "uppercase" }}>
                      Root Cause
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>{selectedIssue.rootCause}</div>
                  </div>
                )}
                {selectedIssue.proposedResolution && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#c084fc", textTransform: "uppercase" }}>
                      Proposed Resolution
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>
                      {selectedIssue.proposedResolution}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Verification Results & Commit */}
            {selectedIssue.resolutionCommitSha && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399", fontWeight: 600 }}>
                  <GitCommit size={14} />
                  <span>Staged Resolution Commit: {selectedIssue.resolutionCommitSha.slice(0, 8)}</span>
                </div>
                {selectedIssue.verificationResults && (
                  <div style={{ marginTop: 6, color: "#cbd5e1" }}>
                    <div>
                      Tests Passed: <strong>{selectedIssue.verificationResults.testsPassed ? "YES" : "NO"}</strong>
                    </div>
                    <div>
                      Review Verdict:{" "}
                      <strong>{selectedIssue.verificationResults.reviewVerdict || "APPROVED"}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Owner Action Controls ────────────────────────────────────── */}
            <div
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                paddingTop: 16,
                marginTop: 16,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>
                Owner Controls & Safe Execution
              </div>

              {/* Status = resolved -> Owner Approval Required */}
              {selectedIssue.status === "resolved" && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      borderRadius: 6,
                      padding: 10,
                      fontSize: 12,
                      color: "#34d399",
                      marginBottom: 10,
                    }}
                  >
                    Safeguard: Fix is verified on branch <code>{selectedIssue.worktreeBranch}</code>. Only owner
                    approval will merge this into the base branch.
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => void handleApprove()}
                      disabled={isApproving}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "9px 14px",
                        background: "#10b981",
                        border: "none",
                        borderRadius: 6,
                        color: "#ffffff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <GitMerge size={15} />
                      {isApproving ? "Merging into Base..." : "Approve & Merge Integration"}
                    </button>

                    <button
                      onClick={() => void handleReject()}
                      style={{
                        padding: "9px 14px",
                        background: "rgba(239, 68, 68, 0.15)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: 6,
                        color: "#f87171",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Reject Fix
                    </button>
                  </div>
                </div>
              )}

              {/* Status != resolved -> Option to Trigger Autonomous Fix */}
              {selectedIssue.status !== "resolved" && selectedIssue.status !== "closed" && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => void handleResolve()}
                    disabled={isResolving}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 16px",
                      background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                      border: "none",
                      borderRadius: 6,
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Zap size={16} />
                    {isResolving ? "Autonomous Agent Fixing Issue in Worktree..." : "Trigger Autonomous Fix"}
                  </button>
                </div>
              )}

              {/* Agent Reassignment Controls */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: 6,
                  padding: 10,
                  marginTop: 12,
                }}
              >
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Reassign to Specialized Agent</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={reassignRole}
                    onChange={(e) => setReassignRole(e.target.value as any)}
                    style={{
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 4,
                      padding: "5px 8px",
                      color: "#cbd5e1",
                      fontSize: 12,
                    }}
                  >
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend</option>
                    <option value="database">Database</option>
                    <option value="qa">QA</option>
                    <option value="security">Security</option>
                    <option value="devops">DevOps</option>
                    <option value="architect">Architect</option>
                    <option value="developer">Developer</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Agent name"
                    value={reassignAgent}
                    onChange={(e) => setReassignAgent(e.target.value)}
                    style={{
                      flex: 1,
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 4,
                      padding: "5px 8px",
                      color: "#f8fafc",
                      fontSize: 12,
                    }}
                  />

                  <button
                    onClick={() => void handleReassign()}
                    style={{
                      padding: "5px 12px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 4,
                      color: "#e2e8f0",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Reassign
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
