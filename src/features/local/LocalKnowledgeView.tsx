/**
 * Neuron AI — Local Knowledge View
 *
 * Shows all locally indexed files across connected folders.
 * Supports filtering by folder, storage mode, and index status.
 * Lets users re-scan, change storage mode, and see indexing progress.
 */

import { motion } from "framer-motion";
import {
  FolderOpen,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  FileCode2,
  File,
  HardDrive,
  Cpu,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  listConnectedFolders,
  listLocalFiles,
} from "../../lib/localDb";
import {
  scanFolder,
} from "../../lib/localFileSystem";
import {
  indexPendingFiles,
  type IndexingProgress,
} from "../../lib/localIndexer";
import { loadLocalSettings } from "../../lib/localDb";
import type { ConnectedFolder, LocalFileEntry, StorageMode } from "../../types/local";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function FileTypeIcon({ ext }: { ext: string }) {
  const codeExts = new Set(["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "sql"]);
  const textExts = new Set(["md", "txt", "csv", "json", "yaml", "yml"]);

  if (codeExts.has(ext))
    return <FileCode2 size={14} style={{ color: "var(--brand)" }} />;
  if (textExts.has(ext))
    return <FileText size={14} style={{ color: "var(--success)" }} />;
  return <File size={14} style={{ color: "var(--text-muted)" }} />;
}

function StorageBadge({ mode }: { mode: StorageMode }) {
  const config: Record<StorageMode, { icon: string; label: string; color: string }> = {
    local: { icon: "🔒", label: "Local", color: "var(--text-muted)" },
    hybrid: { icon: "⚡", label: "Hybrid", color: "var(--warning)" },
    cloud: { icon: "☁", label: "Cloud", color: "var(--brand)" },
  };
  const { icon, label, color } = config[mode];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color,
        background: `${color}18`,
        padding: "2px 6px",
        borderRadius: 20,
        border: `1px solid ${color}30`,
      }}
    >
      {icon} {label}
    </span>
  );
}

function StatusBadge({ status }: { status: LocalFileEntry["indexStatus"] }) {
  const config: Record<LocalFileEntry["indexStatus"], { label: string; color: string; icon: React.ReactNode }> = {
    ready: { label: "Ready", color: "var(--success)", icon: <CheckCircle2 size={10} /> },
    pending: { label: "Pending", color: "var(--text-muted)", icon: <Clock size={10} /> },
    processing: { label: "Indexing…", color: "var(--warning)", icon: <Cpu size={10} /> },
    error: { label: "Error", color: "var(--error)", icon: <AlertCircle size={10} /> },
    skipped: { label: "Skipped", color: "var(--text-muted)", icon: <Clock size={10} /> },
  };
  const { label, color, icon } = config[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        fontWeight: 600,
        color,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      style={{
        height: 4,
        background: "var(--border-color)",
        borderRadius: 2,
        overflow: "hidden",
        marginTop: 6,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "var(--brand)",
          transition: "width 0.3s ease",
          borderRadius: 2,
        }}
      />
    </div>
  );
}

type SortKey = "name" | "size" | "modified" | "status";

export function LocalKnowledgeView() {
  const [folders, setFolders] = useState<ConnectedFolder[]>([]);
  const [files, setFiles] = useState<LocalFileEntry[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LocalFileEntry["indexStatus"] | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortDesc, setSortDesc] = useState(true);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [indexingFolderId, setIndexingFolderId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshData = useCallback(async () => {
    const [f, allFiles] = await Promise.all([
      listConnectedFolders(),
      listLocalFiles(selectedFolder ?? undefined),
    ]);
    setFolders(f);
    setFiles(allFiles);
  }, [selectedFolder]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleScan = async (folderId: string) => {
    setScanningId(folderId);
    try {
      const changed = await scanFolder(folderId, (p) => {
        setIndexingProgress({ processed: p.scanned, total: p.total, currentFile: p.currentFile });
      });
      await refreshData();
      // changed is used only for side effect
      void changed;
    } finally {
      setScanningId(null);
      setIndexingProgress(null);
    }
  };

  const handleIndex = async (folderId: string) => {
    const settings = await loadLocalSettings();
    setIndexingFolderId(folderId);
    abortRef.current = new AbortController();

    try {
      await indexPendingFiles({
        folderId,
        ollamaEnabled: settings.localAIEnabled,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaEmbeddingModel: settings.ollamaEmbeddingModel,
        onProgress: setIndexingProgress,
      });
      await refreshData();
    } finally {
      setIndexingFolderId(null);
      setIndexingProgress(null);
    }
  };

  const toggleFolder = (id: string) => {
    setSelectedFolder((prev) => (prev === id ? null : id));
  };

  const filteredFiles = files
    .filter((f) => {
      if (selectedFolder && f.folderId !== selectedFolder) return false;
      if (statusFilter !== "all" && f.indexStatus !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          f.fileName.toLowerCase().includes(q) ||
          f.extractedText?.toLowerCase().includes(q) ||
          f.tags.some((t) => t.includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.fileName.localeCompare(b.fileName);
      else if (sortKey === "size") cmp = a.fileSizeBytes - b.fileSizeBytes;
      else if (sortKey === "modified") cmp = a.modifiedAt.localeCompare(b.modifiedAt);
      else if (sortKey === "status") cmp = a.indexStatus.localeCompare(b.indexStatus);
      return sortDesc ? -cmp : cmp;
    });

  const pendingCount = files.filter((f) => f.indexStatus === "pending").length;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "var(--bg-app)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Folder Sidebar */}
      <div
        style={{
          width: 220,
          borderRight: "1px solid var(--border-color)",
          padding: "16px 12px",
          flexShrink: 0,
          overflow: "auto",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10,
            paddingLeft: 8,
          }}
        >
          Local Folders
        </div>

        {/* "All" option */}
        <button
          onClick={() => { setSelectedFolder(null); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "7px 10px",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: !selectedFolder ? "var(--brand-soft)" : "transparent",
            color: !selectedFolder ? "var(--brand)" : "var(--text-muted)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: !selectedFolder ? 600 : 400,
            textAlign: "left",
            transition: "var(--transition-fast)",
            marginBottom: 2,
          }}
        >
          <HardDrive size={14} />
          All Local Files
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              background: "var(--border-color)",
              padding: "1px 5px",
              borderRadius: 10,
            }}
          >
            {files.length}
          </span>
        </button>

        {folders.map((folder) => {
          const folderFiles = files.filter((f) => f.folderId === folder.id);
          const isActive = selectedFolder === folder.id;
          const isScanning = scanningId === folder.id;
          const isIndexing = indexingFolderId === folder.id;

          return (
            <div key={folder.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "7px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: isActive ? "var(--brand-soft)" : "transparent",
                  marginBottom: 2,
                }}
              >
                <button
                  onClick={() => toggleFolder(folder.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: isActive ? "var(--brand)" : "var(--text-muted)",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    padding: 0,
                    textAlign: "left",
                    overflow: "hidden",
                  }}
                >
                  <FolderOpen size={14} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {folder.name}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      background: "var(--border-color)",
                      padding: "1px 5px",
                      borderRadius: 10,
                      flexShrink: 0,
                    }}
                  >
                    {folderFiles.length}
                  </span>
                </button>

                <button
                  onClick={() => void handleScan(folder.id)}
                  disabled={isScanning || isIndexing}
                  title="Re-scan"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: "2px",
                    opacity: isScanning ? 0.5 : 1,
                  }}
                >
                  <RefreshCw
                    size={11}
                    style={{
                      animation: isScanning ? "spin 1s linear infinite" : "none",
                    }}
                  />
                </button>
              </div>

              {/* Indexing progress */}
              {(isScanning || isIndexing) && indexingProgress && (
                <div style={{ padding: "0 10px 8px" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {indexingProgress.currentFile}
                  </div>
                  <ProgressBar
                    value={indexingProgress.processed}
                    total={indexingProgress.total}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Index pending button */}
        {pendingCount > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
            <button
              onClick={() => {
                const fId = selectedFolder ?? folders[0]?.id;
                if (fId) void handleIndex(fId);
              }}
              style={{
                width: "100%",
                padding: "7px 10px",
                background: "var(--brand)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "center",
              }}
            >
              <Cpu size={12} />
              Index {pendingCount} files
            </button>
          </div>
        )}
      </div>

      {/* File List */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Toolbar */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--bg-card)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: 1,
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              padding: "7px 12px",
            }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search local files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "none",
                border: "none",
                outline: "none",
                color: "var(--text-main)",
                fontSize: 13,
                flex: 1,
              }}
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            style={{
              padding: "7px 10px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-main)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="error">Error</option>
            <option value="skipped">Skipped</option>
          </select>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={{
              padding: "7px 10px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-main)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <option value="modified">Modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="status">Status</option>
          </select>

          <button
            onClick={() => setSortDesc((d) => !d)}
            style={{
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              padding: "7px 8px",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            {sortDesc ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {/* File rows */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>
          {filteredFiles.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "var(--text-muted)",
              }}
            >
              <HardDrive size={40} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No local files found</div>
              <div style={{ fontSize: 12 }}>
                {folders.length === 0
                  ? "Connect a folder in Privacy & Data Control to start indexing."
                  : "Scan a folder to discover files."}
              </div>
            </div>
          ) : (
            <div>
              {/* Summary row */}
              <div
                style={{
                  padding: "10px 0 6px",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-color)",
                  marginBottom: 6,
                  display: "flex",
                  gap: 16,
                }}
              >
                <span>{filteredFiles.length} files</span>
                <span>
                  {formatBytes(filteredFiles.reduce((a, f) => a + f.fileSizeBytes, 0))}
                </span>
                <span style={{ color: "var(--success)" }}>
                  {filteredFiles.filter((f) => f.indexStatus === "ready").length} indexed
                </span>
                {pendingCount > 0 && (
                  <span style={{ color: "var(--warning)" }}>{pendingCount} pending</span>
                )}
              </div>

              {filteredFiles.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: "var(--radius-sm)",
                    borderBottom: "1px solid var(--border-color)",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <FileTypeIcon ext={file.fileType} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-main)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.fileName}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.filePath}
                    </div>
                    {file.summary && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontStyle: "italic",
                        }}
                      >
                        {file.summary}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <StatusBadge status={file.indexStatus} />
                    <StorageBadge mode={file.storageMode} />
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {formatBytes(file.fileSizeBytes)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
