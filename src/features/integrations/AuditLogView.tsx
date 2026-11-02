/**
 * Neuron AI — Audit Log View
 *
 * Shows users exactly how their knowledge has been accessed:
 * by them, by syncs, by AI connections, and by external agents.
 */

import { motion } from "framer-motion";
import {
  Search,
  RefreshCw,
  Sparkles,
  Link2,
  Shield,
  Trash2,
  Download,
  Clock,
  Filter,
} from "lucide-react";
import { useState, useEffect } from "react";
import { auditLog } from "../../lib/connectors/mcpServer";
import type { AuditLogEntry, AuditEventType } from "../../types/connectors";

const EVENT_CONFIG: Record<AuditEventType, { icon: React.ReactNode; label: string; color: string }> = {
  search: { icon: <Search size={12} />, label: "Search", color: "var(--brand)" },
  sync: { icon: <RefreshCw size={12} />, label: "Sync", color: "var(--success)" },
  connect: { icon: <Link2 size={12} />, label: "Connect", color: "#0ea5e9" },
  disconnect: { icon: <Link2 size={12} />, label: "Disconnect", color: "var(--text-muted)" },
  ai_access: { icon: <Sparkles size={12} />, label: "AI Access", color: "var(--warning)" },
  export: { icon: <Download size={12} />, label: "Export", color: "var(--brand)" },
  delete: { icon: <Trash2 size={12} />, label: "Delete", color: "var(--error)" },
};

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const config = EVENT_CONFIG[entry.eventType];
  const time = new Date(entry.createdAt);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {/* Event icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: `${config.color}15`,
          color: config.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: config.color,
              background: `${config.color}15`,
              padding: "1px 6px",
              borderRadius: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {config.label}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            by <strong style={{ color: "var(--text-main)" }}>{entry.actor}</strong>
          </span>
        </div>

        <div style={{ fontSize: 13, color: "var(--text-main)", fontWeight: 500, marginTop: 3 }}>
          {entry.summary}
        </div>

        {entry.query && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            Query: "{entry.query}"
          </div>
        )}

        {entry.providerIds && entry.providerIds.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
            {entry.providerIds.map((pid) => (
              <span
                key={pid}
                style={{
                  fontSize: 10,
                  color: "var(--brand)",
                  background: "var(--brand-soft)",
                  padding: "1px 6px",
                  borderRadius: 10,
                }}
              >
                {pid}
              </span>
            ))}
            {entry.itemCount !== undefined && (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {entry.itemCount} items
              </span>
            )}
          </div>
        )}
      </div>

      {/* Time */}
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          flexShrink: 0,
          textAlign: "right",
          lineHeight: 1.4,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Clock size={10} />
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        <br />
        {time.toLocaleDateString([], { month: "short", day: "numeric" })}
      </div>
    </motion.div>
  );
}

export function AuditLogView() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [filterEvent, setFilterEvent] = useState<AuditEventType | "all">("all");
  const [filterActor, setFilterActor] = useState("");

  const refresh = () => {
    setEntries(auditLog.getAll());
  };

  useEffect(() => {
    refresh();
    // Auto-refresh every 10 seconds
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = entries.filter((e) => {
    if (filterEvent !== "all" && e.eventType !== filterEvent) return false;
    if (filterActor && !e.actor.toLowerCase().includes(filterActor.toLowerCase())) return false;
    return true;
  });

  const eventTypes = Object.keys(EVENT_CONFIG) as AuditEventType[];

  return (
    <div style={{ padding: "28px 32px", fontFamily: "var(--font-sans)", maxWidth: 760 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Activity Log
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Every search, sync, and AI access to your knowledge — completely transparent.
            </p>
          </div>
          <button
            onClick={refresh}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Filter size={13} style={{ color: "var(--text-muted)" }} />

        <button
          onClick={() => setFilterEvent("all")}
          style={{
            padding: "3px 10px",
            borderRadius: 20,
            border: `1px solid ${filterEvent === "all" ? "var(--brand)" : "var(--border-color)"}`,
            background: filterEvent === "all" ? "var(--brand-soft)" : "transparent",
            color: filterEvent === "all" ? "var(--brand)" : "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          All
        </button>

        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilterEvent(filterEvent === type ? "all" : type)}
            style={{
              padding: "3px 10px",
              borderRadius: 20,
              border: `1px solid ${filterEvent === type ? EVENT_CONFIG[type].color : "var(--border-color)"}`,
              background: filterEvent === type ? `${EVENT_CONFIG[type].color}15` : "transparent",
              color: filterEvent === type ? EVENT_CONFIG[type].color : "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {EVENT_CONFIG[type].label}
          </button>
        ))}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 20,
          }}
        >
          <Shield size={11} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={filterActor}
            onChange={(e) => setFilterActor(e.target.value)}
            placeholder="Filter by actor…"
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text-main)",
              fontSize: 11,
              width: 130,
            }}
          />
        </div>
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-muted)",
          }}
        >
          <Shield size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No activity yet</div>
          <div style={{ fontSize: 12 }}>
            Run a search or sync an integration to see activity here.
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          {filtered.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
