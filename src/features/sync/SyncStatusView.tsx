/**
 * Neuron AI — Sync Status View
 *
 * Shows real-time sync status, active conflicts, and sync history.
 * Users can manually trigger a sync and resolve any conflicts here.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  HardDrive,
  ArrowUpFromLine,
  ArrowDownToLine,
  WifiOff,
  GitMerge,
  Clock,
  FileText,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  listSyncConflicts,
  listSyncRecords,
} from "../../lib/localDb";
import { runSync, resolveConflict } from "../../lib/syncEngine";
import type { SyncConflict, SyncRecord } from "../../types/local";
import type { SupabaseClient } from "@supabase/supabase-js";

type SyncStatusViewProps = {
  supabaseClient?: SupabaseClient;
  userId?: string;
  isOnline?: boolean;
};

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConflictCard({
  conflict,
  onKeepLocal,
  onKeepCloud,
  resolving,
}: {
  conflict: SyncConflict;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  resolving: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px",
        background: "var(--bg-card)",
        border: "1px solid var(--warning)",
        borderRadius: "var(--radius-md)",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          color: "var(--warning)",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        <AlertTriangle size={15} />
        ⚠ Sync Conflict — {conflict.fileName}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            padding: "12px",
            background: "var(--bg-app)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text-muted)",
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            <HardDrive size={12} />
            LOCAL VERSION
          </div>
          <div style={{ fontSize: 12, color: "var(--text-main)" }}>
            {conflict.fileName}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Modified{" "}
            {new Date(conflict.localModifiedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "monospace",
              marginTop: 4,
            }}
          >
            {conflict.localHash.slice(0, 12)}…
          </div>
        </div>

        <div
          style={{
            padding: "12px",
            background: "var(--bg-app)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text-muted)",
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            <Cloud size={12} />
            CLOUD VERSION
          </div>
          <div style={{ fontSize: 12, color: "var(--text-main)" }}>
            {conflict.fileName}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Modified{" "}
            {new Date(conflict.cloudModifiedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "monospace",
              marginTop: 4,
            }}
          >
            {conflict.cloudHash.slice(0, 12)}…
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onKeepLocal}
          disabled={resolving}
          style={{
            flex: 1,
            padding: "8px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-main)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <HardDrive size={12} />
          Keep Local
        </button>
        <button
          onClick={onKeepCloud}
          disabled={resolving}
          style={{
            flex: 1,
            padding: "8px",
            background: "var(--brand-soft)",
            border: "1px solid var(--brand)",
            borderRadius: "var(--radius-sm)",
            color: "var(--brand)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Cloud size={12} />
          Keep Cloud
        </button>
      </div>
    </div>
  );
}

function SyncRecordRow({ record }: { record: SyncRecord }) {
  const statusIcons: Record<SyncRecord["status"], React.ReactNode> = {
    complete: <CheckCircle2 size={13} style={{ color: "var(--success)" }} />,
    uploading: <ArrowUpFromLine size={13} style={{ color: "var(--brand)" }} />,
    downloading: <ArrowDownToLine size={13} style={{ color: "var(--brand)" }} />,
    pending: <Clock size={13} style={{ color: "var(--text-muted)" }} />,
    conflict: <AlertTriangle size={13} style={{ color: "var(--warning)" }} />,
    error: <AlertTriangle size={13} style={{ color: "var(--error)" }} />,
  };

  const changeLabels: Record<SyncRecord["changeType"], string> = {
    new: "New",
    modified: "Modified",
    deleted: "Deleted",
    renamed: "Renamed",
    conflict: "Conflict",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {statusIcons[record.status]}
      <FileText size={12} style={{ color: "var(--text-muted)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-main)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {record.fileName}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          background: "var(--border-color)",
          padding: "1px 6px",
          borderRadius: 10,
        }}
      >
        {changeLabels[record.changeType]}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {record.resolvedAt ? formatRelativeTime(record.resolvedAt) : "—"}
      </span>
    </div>
  );
}

export function SyncStatusView({
  supabaseClient,
  userId,
  isOnline = navigator.onLine,
}: SyncStatusViewProps) {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    uploaded: number;
    downloaded: number;
    conflicts: number;
  } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const refreshData = useCallback(async () => {
    const [c, r] = await Promise.all([listSyncConflicts(), listSyncRecords()]);
    setConflicts(c);
    // Show most recent records first
    setRecords(r.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleSync = async () => {
    if (!supabaseClient || !userId || !isOnline) return;
    setSyncing(true);
    setSyncResult(null);

    try {
      const result = await runSync({
        userId,
        supabaseClient,
        listener: (event) => {
          if (event.type === "conflict") {
            setConflicts((prev) => [...prev, event.conflict]);
          }
        },
      });
      setSyncResult(result);
      showToast(
        `Sync complete — ${result.uploaded} uploaded, ${result.downloaded} downloaded`
      );
      await refreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleResolve = async (conflictId: string, resolution: "keep_local" | "keep_cloud") => {
    if (!supabaseClient || !userId) return;
    setResolvingId(conflictId);
    try {
      await resolveConflict(conflictId, resolution, userId, supabaseClient);
      setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
      showToast(`Conflict resolved — kept ${resolution === "keep_local" ? "local" : "cloud"} version`);
      await refreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not resolve conflict");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div
      style={{
        padding: "28px 32px",
        fontFamily: "var(--font-sans)",
        maxWidth: 720,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-main)",
              marginBottom: 4,
            }}
          >
            Sync Status
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: isOnline ? "var(--success)" : "var(--warning)",
            }}
          >
            {isOnline ? (
              <>
                <CheckCircle2 size={12} />
                Internet connected
              </>
            ) : (
              <>
                <WifiOff size={12} />
                Offline — sync paused
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => void handleSync()}
          disabled={syncing || !isOnline || !supabaseClient}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            background: syncing ? "var(--brand-soft)" : "var(--brand)",
            color: syncing ? "var(--brand)" : "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: syncing ? "default" : "pointer",
            fontSize: 13,
            fontWeight: 500,
            opacity: !isOnline || !supabaseClient ? 0.5 : 1,
          }}
        >
          <RefreshCw
            size={14}
            style={{ animation: syncing ? "spin 1s linear infinite" : "none" }}
          />
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div
          style={{
            padding: "14px 16px",
            background: "var(--warning-soft)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius-md)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--warning)",
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            <WifiOff size={14} />
            Internet unavailable
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            <div>✓ Local files available</div>
            <div>✓ Local search available</div>
            <div>✓ Local AI available</div>
            <div style={{ opacity: 0.6, marginTop: 4 }}>
              ☁ Cloud synchronization paused
            </div>
          </div>
        </div>
      )}

      {/* Last sync result */}
      {syncResult && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "14px 16px",
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            borderRadius: "var(--radius-md)",
            marginBottom: 20,
            display: "flex",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--success)" }}>
            <ArrowUpFromLine size={14} />
            {syncResult.uploaded} uploaded
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--brand)" }}>
            <ArrowDownToLine size={14} />
            {syncResult.downloaded} checked
          </div>
          {syncResult.conflicts > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--warning)" }}>
              <GitMerge size={14} />
              {syncResult.conflicts} conflicts
            </div>
          )}
        </motion.div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--warning)",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertTriangle size={14} />
            {conflicts.length} Unresolved Conflict{conflicts.length > 1 ? "s" : ""}
          </h3>
          {conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              resolving={resolvingId === conflict.id}
              onKeepLocal={() => void handleResolve(conflict.id, "keep_local")}
              onKeepCloud={() => void handleResolve(conflict.id, "keep_cloud")}
            />
          ))}
        </div>
      )}

      {/* Sync History */}
      <div>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-main)",
            marginBottom: 12,
          }}
        >
          Recent Sync Activity
        </h3>

        {records.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px",
              color: "var(--text-muted)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          >
            No sync history yet. Run a sync to see activity here.
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
            {records.map((record) => (
              <SyncRecordRow key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 16px",
              background: "var(--text-main)",
              color: "var(--bg-card)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 500,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={14} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
