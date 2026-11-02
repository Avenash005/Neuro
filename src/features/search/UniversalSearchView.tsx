/**
 * Neuron AI — Universal Knowledge Search View
 *
 * One search interface across all connected sources.
 * Shows real-time source routing, results with citations, and AI answers.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  FileText,
  Code2,
  MessageSquare,
  FolderOpen,
  BookOpen,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  ChevronDown,
  Brain,
  Layers3,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { retrieve, buildAIPrompt } from "../../lib/connectors/retrievalEngine";
import { connectorManager } from "../../lib/connectors/connectorManager";
import { auditLog } from "../../lib/connectors/mcpServer";
import type { RetrievalOutput, RankedResult } from "../../types/connectors";
import type { MemoryRecord } from "../../lib/supabase";

// ─── Props ────────────────────────────────────────────────────────────────

type UniversalSearchViewProps = {
  memories: MemoryRecord[];
};

// ─── Source Icon Map ──────────────────────────────────────────────────────

function SourceBadge({ providerId, small = false }: { providerId: string; small?: boolean }) {
  const emojiMap: Record<string, string> = {
    github: "🐙",
    google_drive: "📁",
    notion: "📓",
    slack: "💬",
    neuron: "🧠",
    local: "🖥",
    dropbox: "📦",
    onedrive: "☁",
    default: "📄",
  };
  const nameMap: Record<string, string> = {
    github: "GitHub",
    google_drive: "Google Drive",
    notion: "Notion",
    slack: "Slack",
    neuron: "Neuron",
    local: "Local",
    dropbox: "Dropbox",
    onedrive: "OneDrive",
  };
  const colorMap: Record<string, string> = {
    github: "#1f2328",
    google_drive: "#1a73e8",
    notion: "#37352f",
    slack: "#4a154b",
    neuron: "var(--brand)",
    local: "var(--success)",
    dropbox: "#0061ff",
    onedrive: "#0078d4",
  };

  const emoji = emojiMap[providerId] ?? emojiMap["default"];
  const name = nameMap[providerId] ?? providerId;
  const color = colorMap[providerId] ?? "var(--text-muted)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: small ? 3 : 4,
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        color,
        background: `${color}12`,
        padding: small ? "1px 5px" : "2px 7px",
        borderRadius: 20,
        border: `1px solid ${color}25`,
      }}
    >
      {emoji} {name}
    </span>
  );
}

function TypeIcon({ sourceType }: { sourceType: string }) {
  const codeTypes = new Set(["repository_file", "commit"]);
  const msgTypes = new Set(["message", "thread"]);
  const noteTypes = new Set(["page", "database", "memory"]);
  const localTypes = new Set(["local_file"]);

  if (codeTypes.has(sourceType)) return <Code2 size={14} style={{ color: "var(--brand)" }} />;
  if (msgTypes.has(sourceType)) return <MessageSquare size={14} style={{ color: "#4a154b" }} />;
  if (noteTypes.has(sourceType)) return <BookOpen size={14} style={{ color: "var(--warning)" }} />;
  if (localTypes.has(sourceType)) return <FolderOpen size={14} style={{ color: "var(--success)" }} />;
  return <FileText size={14} style={{ color: "var(--text-muted)" }} />;
}

// ─── Result Card ──────────────────────────────────────────────────────────

function ResultCard({ result, rank }: { result: RankedResult; rank: number }) {
  const { item } = result;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.04 }}
      style={{
        padding: "14px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ marginTop: 1, flexShrink: 0 }}>
          <TypeIcon sourceType={item.sourceType} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-main)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </span>
            <SourceBadge providerId={item.sourceProvider} small />
            {result.isDuplicate && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-color)",
                  padding: "1px 5px",
                  borderRadius: 10,
                }}
              >
                Duplicate
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 4,
              lineHeight: 1.5,
              display: expanded ? "block" : "-webkit-box",
              WebkitLineClamp: expanded ? undefined : 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: expanded ? "visible" : "hidden",
            }}
          >
            {item.snippet}
          </p>

          {item.snippet.length > 200 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--brand)",
                fontSize: 11,
                padding: "2px 0",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              {expanded ? "Show less" : "Show more"}
              <ChevronDown size={11} style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
            </button>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              <Clock size={10} style={{ display: "inline", marginRight: 2 }} />
              {new Date(item.updatedAt).toLocaleDateString()}
            </span>

            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  color: "var(--brand)",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={10} />
                Open source
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Source Search Progress ───────────────────────────────────────────────

function SearchProgress({
  providerIds,
  done,
}: {
  providerIds: string[];
  done: boolean;
}) {
  const emojiMap: Record<string, string> = {
    github: "🐙", google_drive: "📁", notion: "📓",
    slack: "💬", neuron: "🧠", local: "🖥", dropbox: "📦", onedrive: "☁",
  };
  const nameMap: Record<string, string> = {
    github: "GitHub", google_drive: "Google Drive", notion: "Notion",
    slack: "Slack", neuron: "Neuron Memories", local: "Local Files",
    dropbox: "Dropbox", onedrive: "OneDrive",
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {done ? "Searched" : "Searching…"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {providerIds.map((pid) => (
          <span
            key={pid}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: done ? "var(--success)" : "var(--text-muted)",
              background: done ? "var(--success-soft)" : "var(--border-color)",
              padding: "3px 8px",
              borderRadius: 20,
            }}
          >
            {done ? <CheckCircle2 size={10} /> : (
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--text-muted)", borderTopColor: "transparent" }} />
            )}
            {emojiMap[pid] ?? "📄"} {nameMap[pid] ?? pid}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────

export function UniversalSearchView({ memories }: UniversalSearchViewProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [output, setOutput] = useState<RetrievalOutput | null>(null);
  const [searching, setSearching] = useState(false);
  const [aiAnswer, setAIAnswer] = useState<string | null>(null);
  const [aiStreaming, setAIStreaming] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSubmittedQuery(q);
    setSearching(true);
    setOutput(null);
    setAIAnswer(null);

    // Register Neuron memories connector if not yet registered
    const { NeuronMemoryConnector } = await import("../../lib/connectors/neuronMemoryConnector");
    if (!connectorManager.get("neuron")) {
      connectorManager.register(new NeuronMemoryConnector("neuron-local", memories));
    } else {
      (connectorManager.get("neuron") as InstanceType<typeof NeuronMemoryConnector>)
        .updateMemories(memories);
    }

    const connectors = connectorManager.getAllReady();
    const providerIds = [...connectors.keys()];

    try {
      const result = await retrieve({
        query: q,
        connectors,
        context: { connectedProviderIds: providerIds },
        limit: 20,
      });
      setOutput(result);

      // Log to audit trail
      auditLog.log({
        userId: "user",
        eventType: "search",
        actor: "user",
        query: q,
        providerIds: result.searchedProviders,
        itemCount: result.results.length,
        summary: `Searched ${result.searchedProviders.length} sources, found ${result.results.length} results`,
        metadata: { durationMs: result.durationMs },
      });

      // Generate AI answer if results found
      if (result.contextChunks.length > 0) {
        setAIStreaming(true);
        // buildAIPrompt is used when wiring to the Supabase ask-neuron edge function
        void buildAIPrompt(result);
        // For now simulate an answer based on context
        const answer = simulateAIAnswer(q, result);
        setAIAnswer(answer);
        setAIStreaming(false);
      }
    } catch {
      setSearching(false);
    } finally {
      setSearching(false);
    }
  }, [memories]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredResults = output?.results.filter((r) =>
    !activeFilter || r.item.sourceProvider === activeFilter
  ) ?? [];

  const sourceFilters = output
    ? Object.keys(output.sourceBreakdown).filter((pid) => (output.sourceBreakdown[pid] ?? 0) > 0)
    : [];

  const EXAMPLE_QUERIES = [
    "Where did I save my ColdStore360 database schema?",
    "What authentication method did I use in my backend?",
    "Find my notes about React hooks",
    "Show me the API documentation I wrote",
    "Which GitHub file has the billing logic?",
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-app)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Search Header */}
      <div
        style={{
          padding: "32px 32px 0",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Brain size={20} style={{ color: "var(--brand)" }} />
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-main)",
            }}
          >
            Universal Knowledge Search
          </h2>
        </div>

        {/* Search Input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-app)",
            border: "2px solid var(--brand)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 20,
          }}
        >
          <Search size={18} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSearch(query);
            }}
            placeholder={'Ask Neuron\u2026 \u201cWhere did I save my ColdStore360 schema?\u201d'}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text-main)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
            }}
          />
          <button
            onClick={() => void handleSearch(query)}
            disabled={!query.trim() || searching}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              background: query.trim() && !searching ? "var(--brand)" : "var(--border-color)",
              color: query.trim() && !searching ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: query.trim() && !searching ? "pointer" : "default",
              fontSize: 13,
              fontWeight: 500,
              transition: "var(--transition-fast)",
            }}
          >
            <ArrowRight size={14} />
            Search
          </button>
        </div>

        {/* Example queries (shown when empty) */}
        {!submittedQuery && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 16 }}>
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                onClick={() => { setQuery(ex); void handleSearch(ex); }}
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 20,
                  padding: "4px 10px",
                  cursor: "pointer",
                  transition: "var(--transition-fast)",
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>

        {/* Source progress */}
        {(searching || output) && (
          <SearchProgress
            providerIds={
              searching
                ? connectorManager.getReadyProviderIds()
                : (output?.searchedProviders ?? [])
            }
            done={!searching}
          />
        )}

        {/* Failed providers */}
        {output && output.failedProviders.length > 0 && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--warning-soft)",
              borderRadius: "var(--radius-sm)",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--warning)",
            }}
          >
            {output.failedProviders.map((f) => (
              <div key={f.providerId}>
                ⚠ {f.providerId} connection expired — {f.error}
              </div>
            ))}
          </div>
        )}

        {/* AI Answer */}
        <AnimatePresence>
          {(aiAnswer || aiStreaming) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                padding: "16px 18px",
                background: "var(--brand-soft)",
                border: "1px solid var(--brand)",
                borderRadius: "var(--radius-md)",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  color: "var(--brand)",
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                <Sparkles size={14} />
                Neuron AI
                {aiStreaming && <span style={{ fontSize: 10, opacity: 0.7 }}>Thinking…</span>}
              </div>
              <p style={{ fontSize: 13, color: "var(--text-main)", lineHeight: 1.6, margin: 0 }}>
                {aiAnswer}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results summary + filters */}
        {output && !searching && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Found <strong style={{ color: "var(--text-main)" }}>{output.results.length}</strong> results
              across <strong style={{ color: "var(--text-main)" }}>{output.searchedProviders.length}</strong> sources
              <span style={{ marginLeft: 6, fontSize: 11 }}>({output.durationMs}ms)</span>
            </span>

            {/* Source filter pills */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                onClick={() => setActiveFilter(null)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  border: `1px solid ${!activeFilter ? "var(--brand)" : "var(--border-color)"}`,
                  background: !activeFilter ? "var(--brand-soft)" : "transparent",
                  color: !activeFilter ? "var(--brand)" : "var(--text-muted)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                All
              </button>
              {sourceFilters.map((pid) => (
                <button
                  key={pid}
                  onClick={() => setActiveFilter(activeFilter === pid ? null : pid)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 20,
                    border: `1px solid ${activeFilter === pid ? "var(--brand)" : "var(--border-color)"}`,
                    background: activeFilter === pid ? "var(--brand-soft)" : "transparent",
                    color: activeFilter === pid ? "var(--brand)" : "var(--text-muted)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {pid} ({output.sourceBreakdown[pid]})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {output && output.results.length === 0 && !searching && (
          <div
            style={{
              textAlign: "center",
              padding: "48px 20px",
              color: "var(--text-muted)",
            }}
          >
            <Search size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No results found</div>
            <div style={{ fontSize: 12 }}>
              Try different keywords or connect more sources in Settings → Integrations.
            </div>
          </div>
        )}

        {/* Initial empty state */}
        {!submittedQuery && !searching && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <Layers3 size={48} style={{ margin: "0 auto 16px", opacity: 0.15 }} />
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-main)", marginBottom: 8 }}>
              Ask Neuron anything
            </div>
            <div style={{ fontSize: 13, maxWidth: 360, margin: "0 auto" }}>
              Neuron searches across your memories, local files, GitHub, Google Drive, Notion,
              and Slack — all at once.
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                marginTop: 20,
                flexWrap: "wrap",
              }}
            >
              {connectorManager.getReadyProviderIds().map((pid) => (
                <SourceBadge key={pid} providerId={pid} />
              ))}
            </div>
          </div>
        )}

        {/* Result list */}
        {filteredResults.map((result, i) => (
          <ResultCard key={result.item.id} result={result} rank={i} />
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Simulated AI Answer (placeholder until edge function is wired) ────────

function simulateAIAnswer(query: string, output: RetrievalOutput): string {
  const topResults = output.results.slice(0, 3);
  if (topResults.length === 0) return "I couldn't find relevant information in your connected sources.";

  const sourceList = topResults
    .map((r) => `📄 ${r.item.title} — ${r.item.sourceProvider}`)
    .join(", ");

  return `Based on your connected sources, I found ${output.results.length} relevant items related to "${query}". The most relevant results are from: ${sourceList}. Connect cloud AI to get a detailed natural-language answer.`;
}
