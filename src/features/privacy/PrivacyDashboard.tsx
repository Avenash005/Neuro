/**
 * Neuron AI — Privacy & Data Control Dashboard
 *
 * Shows the user exactly what data exists locally vs cloud,
 * where AI processing happens, and lets them control all of it.
 */

import { motion } from "framer-motion";
import {
  Shield,
  HardDrive,
  Cloud,
  FolderOpen,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  Cpu,
  EyeOff,
  Info,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  loadLocalSettings,
  saveLocalSettings,
  listConnectedFolders,
  getLocalStats,
} from "../../lib/localDb";
import {
  pickFolder,
  connectFolder,
  disconnectFolder,
  updateFolderStorageMode,
  scanFolder,
} from "../../lib/localFileSystem";
import {
  stopSyncingFolder,
  deleteCloudData,
} from "../../lib/syncEngine";
import type { LocalSettings, ConnectedFolder, StorageMode } from "../../types/local";
import { DEFAULT_LOCAL_SETTINGS } from "../../types/local";

type PrivacyDashboardProps = {
  supabaseClient?: import("@supabase/supabase-js").SupabaseClient;
  userId?: string;
  cloudMemoryCount?: number;
  cloudStorageBytes?: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StorageModeSelector({
  value,
  onChange,
}: {
  value: StorageMode;
  onChange: (mode: StorageMode) => void;
}) {
  const modes: { id: StorageMode; icon: string; label: string; description: string }[] = [
    {
      id: "local",
      icon: "🔒",
      label: "Local Only",
      description: "Never leaves this device",
    },
    {
      id: "hybrid",
      icon: "⚡",
      label: "Hybrid",
      description: "Local + selective cloud sync",
    },
    {
      id: "cloud",
      icon: "☁",
      label: "Cloud",
      description: "Synced across devices",
    },
  ];

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          style={{
            flex: 1,
            padding: "10px 8px",
            borderRadius: "var(--radius-sm)",
            border: `2px solid ${value === m.id ? "var(--brand)" : "var(--border-color)"}`,
            background: value === m.id ? "var(--brand-soft)" : "var(--bg-card)",
            color: value === m.id ? "var(--brand)" : "var(--text-main)",
            cursor: "pointer",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 500,
            transition: "var(--transition-fast)",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
          <div>{m.label}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {m.description}
          </div>
        </button>
      ))}
    </div>
  );
}

function SyncToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-main)" }}>
            Cloud Sync
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {enabled
              ? "Your selected knowledge synchronizes between devices."
              : "New data remains on this device only."}
          </div>
        </div>
        <button
          onClick={() => onChange(!enabled)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: enabled ? "var(--brand)" : "var(--text-muted)",
            padding: 0,
          }}
          aria-label={enabled ? "Disable cloud sync" : "Enable cloud sync"}
        >
          {enabled ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
        </button>
      </div>

      {!enabled && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "var(--warning-soft)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--warning)",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <Info size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <strong>Disabling sync does not delete your cloud data.</strong> Existing cloud files
            remain until you explicitly delete them. Use "Delete Cloud Data" below if you want
            to remove everything from the cloud.
          </div>
        </div>
      )}
    </div>
  );
}

function FolderRow({
  folder,
  onChangeMode,
  onRemove,
  onRescan,
}: {
  folder: ConnectedFolder;
  onChangeMode: (id: string, mode: StorageMode) => void;
  onRemove: (id: string) => void;
  onRescan: (id: string) => void;
}) {
  const statusColors: Record<ConnectedFolder["indexStatus"], string> = {
    idle: "var(--text-muted)",
    scanning: "var(--warning)",
    indexing: "var(--brand)",
    ready: "var(--success)",
    error: "var(--error)",
  };

  const statusLabels: Record<ConnectedFolder["indexStatus"], string> = {
    idle: "Not scanned",
    scanning: "Scanning…",
    indexing: "Indexing…",
    ready: "Ready",
    error: "Error",
  };

  const modeIcons: Record<StorageMode, string> = {
    local: "🔒",
    hybrid: "⚡",
    cloud: "☁",
  };

  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <FolderOpen size={18} style={{ color: "var(--brand)", flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--text-main)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {folder.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {folder.fileCount} files · {formatBytes(folder.totalSizeBytes)} ·{" "}
          <span style={{ color: statusColors[folder.indexStatus] }}>
            {statusLabels[folder.indexStatus]}
          </span>
        </div>
      </div>

      {/* Storage mode pill */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["local", "hybrid", "cloud"] as StorageMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onChangeMode(folder.id, mode)}
            style={{
              padding: "3px 8px",
              borderRadius: 20,
              border: `1px solid ${folder.storageMode === mode ? "var(--brand)" : "var(--border-color)"}`,
              background: folder.storageMode === mode ? "var(--brand-soft)" : "transparent",
              color: folder.storageMode === mode ? "var(--brand)" : "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
              transition: "var(--transition-fast)",
            }}
          >
            {modeIcons[mode]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => onRescan(folder.id)}
          title="Re-scan folder"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 4,
            borderRadius: 6,
          }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => onRemove(folder.id)}
          title="Disconnect folder"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--error)",
            padding: 4,
            borderRadius: 6,
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export function PrivacyDashboard({
  supabaseClient,
  userId,
  cloudMemoryCount = 0,
  cloudStorageBytes = 0,
}: PrivacyDashboardProps) {
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [folders, setFolders] = useState<ConnectedFolder[]>([]);
  const [localStats, setLocalStats] = useState({ fileCount: 0, totalBytes: 0 });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"overview" | "folders" | "ai" | "sync">(
    "overview"
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const refreshData = useCallback(async () => {
    const [s, f, stats] = await Promise.all([
      loadLocalSettings(),
      listConnectedFolders(),
      getLocalStats(),
    ]);
    setSettings(s);
    setFolders(f);
    setLocalStats(stats);
  }, []);

  useEffect(() => {
    void refreshData();
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshData]);

  const saveSetting = async (patch: Partial<LocalSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await saveLocalSettings(updated);
  };

  const handleAddFolder = async () => {
    try {
      const handle = await pickFolder();
      if (!handle) return;
      const folder = await connectFolder(handle, settings.storageMode);
      setFolders((prev) => [...prev, folder]);
      showToast(`Connected "${folder.name}"`);
      // Auto-scan
      await handleRescan(folder.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not connect folder");
    }
  };

  const handleRescan = async (folderId: string) => {
    setScanningId(folderId);
    try {
      const changed = await scanFolder(folderId);
      showToast(`Scanned: ${changed} new or changed files`);
      await refreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  };

  const handleChangeMode = async (folderId: string, mode: StorageMode) => {
    await updateFolderStorageMode(folderId, mode);
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, storageMode: mode } : f))
    );
    showToast(`Folder storage mode updated to ${mode}`);
  };

  const handleDisconnect = async (folderId: string) => {
    await disconnectFolder(folderId);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    showToast("Folder disconnected — local index removed");
    await refreshData();
  };

  const handleStopSync = async (folderId: string) => {
    if (!supabaseClient) return;
    await stopSyncingFolder(folderId, supabaseClient);
    showToast("Sync stopped. Cloud data preserved.");
    await refreshData();
  };

  const handleDeleteCloud = async (folderId: string) => {
    if (!supabaseClient || !userId) return;
    await deleteCloudData(folderId, userId, supabaseClient);
    setShowDeleteConfirm(null);
    showToast("Cloud data deleted for this folder");
    await refreshData();
  };

  const sections = [
    { id: "overview", label: "Overview", icon: Shield },
    { id: "folders", label: "Connected Folders", icon: FolderOpen },
    { id: "ai", label: "AI Processing", icon: Cpu },
    { id: "sync", label: "Sync Control", icon: RefreshCw },
  ] as const;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "var(--bg-app)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Section Nav */}
      <div
        style={{
          width: 200,
          borderRight: "1px solid var(--border-color)",
          padding: "20px 12px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 12,
            paddingLeft: 8,
          }}
        >
          Privacy & Data
        </div>
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as typeof activeSection)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background:
                activeSection === id ? "var(--brand-soft)" : "transparent",
              color:
                activeSection === id ? "var(--brand)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: activeSection === id ? 600 : 400,
              textAlign: "left",
              transition: "var(--transition-fast)",
              marginBottom: 2,
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}

        {/* Offline indicator */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 20,
            paddingLeft: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: isOnline ? "var(--success)" : "var(--warning)",
            }}
          >
            {isOnline ? (
              <CheckCircle2 size={12} />
            ) : (
              <WifiOff size={12} />
            )}
            {isOnline ? "Online" : "Offline — local only"}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "28px 32px",
        }}
      >
        {/* ── Overview ─────────────────────────────────────────────── */}
        {activeSection === "overview" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-main)",
                marginBottom: 6,
              }}
            >
              Privacy & Data Control
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Your knowledge belongs to you. See exactly what's stored where and
              who processes it.
            </p>

            {/* Stats grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
                marginBottom: 24,
              }}
            >
              {[
                {
                  icon: HardDrive,
                  label: "Local Files",
                  value: localStats.fileCount.toLocaleString(),
                  sub: formatBytes(localStats.totalBytes),
                  color: "var(--brand)",
                },
                {
                  icon: Cloud,
                  label: "Cloud Files",
                  value: cloudMemoryCount.toLocaleString(),
                  sub: formatBytes(cloudStorageBytes),
                  color: "#0ea5e9",
                },
                {
                  icon: FolderOpen,
                  label: "Connected Folders",
                  value: folders.length.toString(),
                  sub: `${folders.filter((f) => f.storageMode === "local").length} local only`,
                  color: "var(--warning)",
                },
                {
                  icon: Cpu,
                  label: "AI Processing",
                  value: settings.localAIEnabled ? "Local" : "Cloud",
                  sub: settings.localAIEnabled ? "On device" : "Supabase",
                  color: settings.localAIEnabled ? "var(--success)" : "#0ea5e9",
                },
              ].map(({ icon: Icon, label, value, sub, color }) => (
                <div
                  key={label}
                  style={{
                    padding: "16px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: `${color}18`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <span
                      style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}
                    >
                      {label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--text-main)",
                    }}
                  >
                    {value}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Default Storage Mode */}
            <div
              style={{
                marginBottom: 16,
                padding: "20px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-main)", marginBottom: 8 }}>
                Default Storage Mode
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Applied to new folders and notes unless you override it per-item.
              </p>
              <StorageModeSelector
                value={settings.storageMode}
                onChange={(mode) => void saveSetting({ storageMode: mode })}
              />
            </div>

            {/* Cloud sync toggle */}
            <SyncToggle
              enabled={settings.cloudSyncEnabled}
              onChange={(v) => void saveSetting({ cloudSyncEnabled: v })}
            />
          </motion.div>
        )}

        {/* ── Connected Folders ─────────────────────────────────────── */}
        {activeSection === "folders" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
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
                  Connected Folders
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Neuron only accesses folders you explicitly authorize.
                </p>
              </div>
              <button
                onClick={() => void handleAddFolder()}
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
                <FolderOpen size={14} />
                Connect Folder
              </button>
            </div>

            {folders.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "48px 20px",
                  color: "var(--text-muted)",
                  background: "var(--bg-card)",
                  border: "2px dashed var(--border-color)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <FolderOpen
                  size={40}
                  style={{ margin: "0 auto 12px", opacity: 0.3 }}
                />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No folders connected</div>
                <div style={{ fontSize: 12 }}>
                  Click "Connect Folder" to give Neuron access to a folder on your computer.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {folders.map((folder) => (
                  <div key={folder.id}>
                    <FolderRow
                      folder={
                        scanningId === folder.id
                          ? { ...folder, indexStatus: "scanning" }
                          : folder
                      }
                      onChangeMode={handleChangeMode}
                      onRemove={handleDisconnect}
                      onRescan={handleRescan}
                    />

                    {/* Per-folder sync actions */}
                    {folder.storageMode !== "local" && supabaseClient && (
                      <div
                        style={{
                          padding: "8px 16px",
                          background: "var(--bg-app)",
                          border: "1px solid var(--border-color)",
                          borderTop: "none",
                          borderRadius: "0 0 var(--radius-sm) var(--radius-sm)",
                          display: "flex",
                          gap: 8,
                        }}
                      >
                        <button
                          onClick={() => handleStopSync(folder.id)}
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px 8px",
                          }}
                        >
                          Stop Syncing
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(folder.id)}
                          style={{
                            fontSize: 11,
                            color: "var(--error)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px 8px",
                          }}
                        >
                          Delete Cloud Data
                        </button>
                      </div>
                    )}

                    {/* Delete confirm */}
                    {showDeleteConfirm === folder.id && (
                      <div
                        style={{
                          padding: "12px 16px",
                          background: "var(--error-soft)",
                          border: "1px solid var(--error)",
                          borderRadius: "var(--radius-sm)",
                          marginTop: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                            color: "var(--error)",
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          <AlertTriangle size={14} />
                          Delete Cloud Data for "{folder.name}"?
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                          This permanently removes all cloud copies of these files. Local files
                          are NOT affected.
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleDeleteCloud(folder.id)}
                            style={{
                              padding: "6px 14px",
                              background: "var(--error)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Delete from Cloud
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            style={{
                              padding: "6px 14px",
                              background: "var(--bg-card)",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border-color)",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── AI Processing ────────────────────────────────────────── */}
        {activeSection === "ai" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-main)",
                marginBottom: 6,
              }}
            >
              AI Processing
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Choose where your knowledge is processed. Local AI never sends data
              to the internet.
            </p>

            {/* Local AI */}
            <div
              style={{
                marginBottom: 16,
                padding: "20px",
                background: "var(--bg-card)",
                border: `1px solid ${settings.localAIEnabled ? "var(--success)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-md)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "var(--success-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--success)",
                    }}
                  >
                    <Cpu size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-main)" }}>
                      🟢 Local AI (Ollama)
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Runs entirely on this device
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    void saveSetting({ localAIEnabled: !settings.localAIEnabled })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: settings.localAIEnabled ? "var(--success)" : "var(--text-muted)",
                    padding: 0,
                  }}
                >
                  {settings.localAIEnabled ? (
                    <ToggleRight size={36} />
                  ) : (
                    <ToggleLeft size={36} />
                  )}
                </button>
              </div>

              {settings.localAIEnabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label
                      style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}
                    >
                      Ollama Base URL
                    </label>
                    <input
                      type="text"
                      value={settings.ollamaBaseUrl}
                      onChange={(e) => void saveSetting({ ollamaBaseUrl: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg-app)",
                        border: "1px solid var(--border-color)",
                        borderRadius: 6,
                        color: "var(--text-main)",
                        fontSize: 13,
                        fontFamily: "monospace",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}
                      >
                        Chat Model
                      </label>
                      <input
                        type="text"
                        value={settings.ollamaChatModel}
                        onChange={(e) => void saveSetting({ ollamaChatModel: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "var(--bg-app)",
                          border: "1px solid var(--border-color)",
                          borderRadius: 6,
                          color: "var(--text-main)",
                          fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}
                      >
                        Embedding Model
                      </label>
                      <input
                        type="text"
                        value={settings.ollamaEmbeddingModel}
                        onChange={(e) =>
                          void saveSetting({ ollamaEmbeddingModel: e.target.value })
                        }
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "var(--bg-app)",
                          border: "1px solid var(--border-color)",
                          borderRadius: 6,
                          color: "var(--text-main)",
                          fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cloud AI */}
            <div
              style={{
                padding: "20px",
                background: "var(--bg-card)",
                border: `1px solid ${settings.cloudAIEnabled ? "var(--brand)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-md)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "var(--brand-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--brand)",
                    }}
                  >
                    <Cloud size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-main)" }}>
                      ☁ Cloud AI
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      More powerful — data sent to Supabase edge
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    void saveSetting({ cloudAIEnabled: !settings.cloudAIEnabled })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: settings.cloudAIEnabled ? "var(--brand)" : "var(--text-muted)",
                    padding: 0,
                  }}
                >
                  {settings.cloudAIEnabled ? (
                    <ToggleRight size={36} />
                  ) : (
                    <ToggleLeft size={36} />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Sync Control ─────────────────────────────────────────── */}
        {activeSection === "sync" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-main)",
                marginBottom: 6,
              }}
            >
              Sync Control
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Understand the difference between stopping sync and deleting cloud data.
            </p>

            <SyncToggle
              enabled={settings.cloudSyncEnabled}
              onChange={(v) => void saveSetting({ cloudSyncEnabled: v })}
            />

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                {
                  icon: EyeOff,
                  title: "Stop Syncing",
                  desc: "New changes on this device will no longer be uploaded. Existing cloud data remains intact. You can re-enable sync at any time.",
                  color: "var(--warning)",
                  safe: true,
                },
                {
                  icon: Trash2,
                  title: "Delete Cloud Data",
                  desc: "Permanently removes all cloud copies. Local files are not affected. This action cannot be undone.",
                  color: "var(--error)",
                  safe: false,
                },
              ].map(({ icon: Icon, title, desc, color, safe }) => (
                <div
                  key={title}
                  style={{
                    padding: 16,
                    background: "var(--bg-card)",
                    border: `1px solid ${safe ? "var(--border-color)" : "var(--error)"}`,
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      color,
                    }}
                  >
                    <Icon size={16} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                background: "var(--brand-soft)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: "var(--brand)",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <Info size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                Neuron uses <strong>content hashes</strong> and <strong>timestamps</strong> to
                detect changes. Only modified files are ever uploaded — not the whole folder.
                Conflicts are always shown to you for manual resolution.
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
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
        </div>
      )}
    </div>
  );
}
