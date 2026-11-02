/**
 * Neuron AI — AI Connections & MCP Settings
 *
 * Lets users connect external AI apps (Claude, ChatGPT, custom agents)
 * to Neuron's knowledge via the MCP protocol.
 * Fine-grained permission control per connection.
 */

import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Key,
  CheckCircle2,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  Clock,
  Info,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  DEFAULT_MCP_CAPABILITIES,
  registerAIConnection,
  revokeAIConnection,
  getAIConnections,
  auditLog,
} from "../../lib/connectors/mcpServer";
import { connectorManager } from "../../lib/connectors/connectorManager";
import type { AIConnection, AuditLogEntry } from "../../types/connectors";

// ─── Known AI Apps ────────────────────────────────────────────────────────

const KNOWN_AI_APPS = [
  { id: "claude", name: "Claude", emoji: "🟠", description: "Anthropic Claude desktop or API" },
  { id: "chatgpt", name: "ChatGPT", emoji: "🟢", description: "OpenAI ChatGPT plugins or API" },
  { id: "custom", name: "Custom Agent", emoji: "🤖", description: "Any MCP-compatible AI agent" },
];

// ─── Connection Card ──────────────────────────────────────────────────────

function ConnectionCard({
  connection,
  onRevoke,
  onToggleCapability,
}: {
  connection: AIConnection;
  onRevoke: () => void;
  onToggleCapability: (tool: string, enabled: boolean) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    if (!connection.apiKey) return;
    void navigator.clipboard.writeText(connection.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const readTools = connection.capabilities.filter((c) => !["create_memory", "update_memory", "delete_memory"].includes(c.tool));
  const writeTools = connection.capabilities.filter((c) => ["create_memory", "update_memory", "delete_memory"].includes(c.tool));

  return (
    <div
      style={{
        padding: "16px",
        background: "var(--bg-card)",
        border: `1px solid ${connection.isActive ? "var(--success)" : "var(--border-color)"}`,
        borderRadius: "var(--radius-md)",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>
            {KNOWN_AI_APPS.find((a) => connection.name.toLowerCase().includes(a.id))?.emoji ?? "🤖"}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-main)" }}>
              {connection.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {connection.lastUsedAt
                ? `Last used: ${new Date(connection.lastUsedAt).toLocaleString()}`
                : "Never used"}
            </div>
          </div>
        </div>
        <button
          onClick={onRevoke}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--error)",
            padding: 4,
            borderRadius: 6,
          }}
          title="Revoke access"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* API Key */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          API Key
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            background: "var(--bg-app)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <Key size={12} style={{ color: "var(--text-muted)" }} />
          <code
            style={{
              flex: 1,
              fontSize: 11,
              color: "var(--text-main)",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {showKey ? connection.apiKey : "sk-neuron-••••••••••••••••••••••••"}
          </code>
          <button
            onClick={() => setShowKey((s) => !s)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}
          >
            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={copyKey}
            style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "var(--success)" : "var(--text-muted)", padding: 2 }}
          >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Capabilities */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Read Permissions
        </div>
        {readTools.map((cap) => (
          <div
            key={cap.tool}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 0",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: "var(--text-main)", fontWeight: 500 }}>
                {cap.tool}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>
                {cap.description}
              </span>
            </div>
            <button
              onClick={() => onToggleCapability(cap.tool, !cap.enabled)}
              style={{ background: "none", border: "none", cursor: "pointer", color: cap.enabled ? "var(--brand)" : "var(--text-muted)", padding: 0 }}
            >
              {cap.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
            </button>
          </div>
        ))}

        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Write Permissions (disabled by default)
        </div>
        {writeTools.map((cap) => (
          <div
            key={cap.tool}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 0",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: "var(--text-main)", fontWeight: 500 }}>
                {cap.tool}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>
                {cap.description}
              </span>
            </div>
            <button
              onClick={() => onToggleCapability(cap.tool, !cap.enabled)}
              style={{ background: "none", border: "none", cursor: "pointer", color: cap.enabled ? "var(--warning)" : "var(--text-muted)", padding: 0 }}
            >
              {cap.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
            </button>
          </div>
        ))}
      </div>

      {/* Source access */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Source Access
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {connection.allowedProviderIds.map((pid) => (
            <span
              key={pid}
              style={{
                fontSize: 10,
                color: "var(--brand)",
                background: "var(--brand-soft)",
                padding: "2px 7px",
                borderRadius: 10,
              }}
            >
              {pid}
            </span>
          ))}
          {connection.allowLocalFiles && (
            <span style={{ fontSize: 10, color: "var(--warning)", background: "var(--warning-soft)", padding: "2px 7px", borderRadius: 10 }}>
              local files
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Connection Modal ─────────────────────────────────────────────────

function AddConnectionModal({
  onAdd,
  onClose,
}: {
  onAdd: (connection: AIConnection) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [allowLocalFiles, setAllowLocalFiles] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(connectorManager.getReadyProviderIds().filter((p) => p !== "local"))
  );

  const generate = (): AIConnection => {
    const id = `aic_${Date.now()}`;
    const apiKey = `sk-neuron-${id}-${Math.random().toString(36).slice(2, 18)}`;
    return {
      id,
      userId: "user",
      name: name.trim() || "Custom Agent",
      type: "api_key",
      apiKey,
      capabilities: DEFAULT_MCP_CAPABILITIES.map((c) => ({ ...c })),
      allowedProviderIds: [...selectedProviders],
      allowLocalFiles,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      isActive: true,
    };
  };

  const toggleProvider = (pid: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const readyProviders = connectorManager.getReadyProviderIds().filter((p) => p !== "local");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxHeight: "80vh",
          overflow: "auto",
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          padding: "24px",
          border: "1px solid var(--border-color)",
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-main)", marginBottom: 16 }}>
          Connect an AI
        </h3>

        {/* AI app selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {KNOWN_AI_APPS.map((app) => (
            <button
              key={app.id}
              onClick={() => setName(app.name)}
              style={{
                flex: 1,
                padding: "8px 6px",
                background: name === app.name ? "var(--brand-soft)" : "var(--bg-app)",
                border: `1px solid ${name === app.name ? "var(--brand)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                textAlign: "center",
                fontSize: 11,
                color: name === app.name ? "var(--brand)" : "var(--text-muted)",
              }}
            >
              <div style={{ fontSize: 20 }}>{app.emoji}</div>
              {app.name}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          Connection Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Claude Desktop"
          style={{
            width: "100%",
            padding: "9px 12px",
            background: "var(--bg-app)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-main)",
            fontSize: 13,
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        />

        {/* Source permissions */}
        {readyProviders.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Allow access to:
            </div>
            {readyProviders.map((pid) => (
              <div
                key={pid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  cursor: "pointer",
                }}
                onClick={() => toggleProvider(pid)}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `2px solid ${selectedProviders.has(pid) ? "var(--brand)" : "var(--border-color)"}`,
                    background: selectedProviders.has(pid) ? "var(--brand)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {selectedProviders.has(pid) && <CheckCircle2 size={10} style={{ color: "#fff" }} />}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-main)" }}>{pid}</span>
              </div>
            ))}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                cursor: "pointer",
              }}
              onClick={() => setAllowLocalFiles((v) => !v)}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `2px solid ${allowLocalFiles ? "var(--warning)" : "var(--border-color)"}`,
                  background: allowLocalFiles ? "var(--warning)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {allowLocalFiles && <CheckCircle2 size={10} style={{ color: "#fff" }} />}
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-main)" }}>Local Files</span>
                <span style={{ fontSize: 10, color: "var(--warning)", marginLeft: 6 }}>
                  (sensitive — enable with care)
                </span>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            padding: "8px 10px",
            background: "var(--brand-soft)",
            borderRadius: "var(--radius-sm)",
            fontSize: 11,
            color: "var(--brand)",
            marginBottom: 14,
            display: "flex",
            gap: 6,
          }}
        >
          <Info size={11} style={{ marginTop: 1, flexShrink: 0 }} />
          Write permissions are disabled by default. You can enable them after creating the connection.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              const conn = generate();
              registerAIConnection(conn);
              onAdd(conn);
              onClose();
            }}
            disabled={!name.trim()}
            style={{
              flex: 1,
              padding: "9px",
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            Generate API Key
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "9px 16px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── AI Connections View ──────────────────────────────────────────────────

export function AIConnectionsView() {
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [recentAudit, setRecentAudit] = useState<AuditLogEntry[]>([]);

  const refresh = () => {
    setConnections(getAIConnections());
    setRecentAudit(auditLog.getByEvent("ai_access").slice(0, 10));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleRevoke = (id: string) => {
    revokeAIConnection(id);
    refresh();
  };

  const handleToggleCapability = (connectionId: string, tool: string, enabled: boolean) => {
    setConnections((prev) =>
      prev.map((c) =>
        c.id === connectionId
          ? {
              ...c,
              capabilities: c.capabilities.map((cap) =>
                cap.tool === tool ? { ...cap, enabled } : cap
              ),
            }
          : c
      )
    );
  };

  return (
    <div
      style={{
        padding: "28px 32px",
        fontFamily: "var(--font-sans)",
        maxWidth: 720,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
            AI Connections
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Connect external AI assistants to search your Neuron knowledge base.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Plus size={14} />
          Connect AI
        </button>
      </div>

      {/* Supported apps */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {KNOWN_AI_APPS.map((app) => (
          <div
            key={app.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <span>{app.emoji}</span>
            {app.name}
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <Sparkles size={12} />
          Any MCP client
        </div>
      </div>

      {/* Connections */}
      {connections.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            background: "var(--bg-card)",
            border: "2px dashed var(--border-color)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-muted)",
          }}
        >
          <Key size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No AI connections yet</div>
          <div style={{ fontSize: 12 }}>
            Connect Claude, ChatGPT, or any MCP-compatible AI to search your knowledge.
          </div>
        </div>
      ) : (
        connections.map((conn) => (
          <ConnectionCard
            key={conn.id}
            connection={conn}
            onRevoke={() => handleRevoke(conn.id)}
            onToggleCapability={(tool, enabled) => handleToggleCapability(conn.id, tool, enabled)}
          />
        ))
      )}

      {/* Recent AI access audit */}
      {recentAudit.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)", marginBottom: 12 }}>
            Recent AI Access
          </h3>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            {recentAudit.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border-color)",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--brand-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Sparkles size={12} style={{ color: "var(--brand)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-main)" }}>
                    {entry.summary}
                  </div>
                  {entry.query && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Query: "{entry.query}"
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={10} />
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <AddConnectionModal
          onAdd={() => refresh()}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
