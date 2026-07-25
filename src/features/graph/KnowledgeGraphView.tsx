import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Calendar,
  Check,
  Clock,
  Compass,
  Edit3,
  ExternalLink,
  FileText,
  Flame,
  Merge,
  Network,
  Pin,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { KnowledgeEntityData, MemoryRecord } from "../../lib/supabase";
import { buildKnowledgeGraph, graphBackfillCandidates } from "./graphData";

type KnowledgeGraphViewProps = {
  memories: MemoryRecord[];
  entityData: KnowledgeEntityData;
  onOpenMemory: (memory: MemoryRecord) => void;
  onReanalyze: (memoryIds: string[], onProgress?: (completed: number, total: number) => void) => Promise<number>;
  openAssistant: () => void;
};

type TimelineScope = "week" | "month" | "year" | "all";

export function KnowledgeGraphView({
  memories,
  entityData,
  onOpenMemory,
  onReanalyze,
  openAssistant,
}: KnowledgeGraphViewProps) {
  // Navigation filters
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [timelineScope, setTimelineScope] = useState<TimelineScope>("all");
  const [query, setQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Canvas zoom/pan states
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Interactive node states
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; type: "memory" | "entity" } | null>(null);

  // Mock pinned nodes
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());

  // AI analysis triggers
  const [analysisProgress, setAnalysisProgress] = useState<{ completed: number; total: number } | null>(null);

  const canvasRef = useRef<SVGSVGElement>(null);

  // Close context menu on page clicks
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  // Show customized toast utility
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  /* --------------------------------------------------
     1. TIMELINE & CHIP FILTERING LOGIC
     -------------------------------------------------- */
  const timelineFilteredMemories = useMemo(() => {
    const now = new Date();
    return memories.filter((memory) => {
      const created = new Date(memory.created_at);
      const diffTime = Math.abs(now.getTime() - created.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (timelineScope === "week") return diffDays <= 7;
      if (timelineScope === "month") return diffDays <= 30;
      if (timelineScope === "year") return diffDays <= 365;
      return true;
    });
  }, [memories, timelineScope]);

  const fullyFilteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return timelineFilteredMemories.filter((memory) => {
      // Apply chip filters
      if (activeFilter === "favorites" && !memory.is_favorite) return false;
      if (activeFilter === "recent") {
        const diff = Math.abs(new Date().getTime() - new Date(memory.created_at).getTime());
        if (Math.ceil(diff / (1000 * 60 * 60 * 24)) > 3) return false;
      }
      if (activeFilter === "ai" && !`${memory.title} ${memory.summary || ""}`.toLowerCase().includes("ai")) return false;
      if (activeFilter === "programming" && !memory.tags.some(t => ["react", "typescript", "javascript", "code", "dev", "css"].includes(t.toLowerCase()))) return false;
      if (activeFilter === "projects" && !memory.title.toLowerCase().includes("project") && !memory.title.toLowerCase().includes("startup")) return false;

      if (!normalizedQuery) return true;
      return [memory.title, memory.summary || "", memory.content, ...memory.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [timelineFilteredMemories, activeFilter, query]);

  // Construct graph coordinates
  const graph = useMemo(() => buildKnowledgeGraph(fullyFilteredMemories, { entityData }), [entityData, fullyFilteredMemories]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  const eligibleMemories = fullyFilteredMemories.filter((m) => m.processing_status === "ready" && !m.graph_analyzed_at);
  const nextBackfillBatch = graphBackfillCandidates(fullyFilteredMemories);

  // Connected node ids map for dimming unrelated nodes
  const connectedIds = useMemo(() => {
    const focusId = selectedId || hoveredId;
    if (!focusId) return new Set<string>();
    const ids = new Set([focusId]);
    for (const edge of graph.edges) {
      if (edge.source === focusId) ids.add(edge.target);
      if (edge.target === focusId) ids.add(edge.source);
    }
    return ids;
  }, [graph.edges, selectedId, hoveredId]);

  const selectedNode = selectedId ? nodeById.get(selectedId) || null : null;
  const hoveredNode = hoveredId ? nodeById.get(hoveredId) || null : null;
  const activeInspectorNode = selectedNode || hoveredNode;
  const selectedEdge = selectedEdgeId ? graph.edges.find((e) => e.id === selectedEdgeId) || null : null;

  const inspectorMemory = useMemo(() => {
    if (activeInspectorNode?.memoryId) {
      return memories.find((m) => m.id === activeInspectorNode.memoryId) || null;
    }
    return null;
  }, [activeInspectorNode, memories]);

  const relationshipMemory = selectedEdge?.memoryId ? memories.find((m) => m.id === selectedEdge.memoryId) || null : null;

  const connectedMemories = useMemo(() => {
    if (activeInspectorNode?.type === "entity") {
      return graph.edges
        .filter((edge) => edge.kind === "association" && (edge.source === activeInspectorNode.id || edge.target === activeInspectorNode.id))
        .map((edge) => edge.memoryId)
        .filter((id): id is string => Boolean(id))
        .map((id) => memories.find((m) => m.id === id))
        .filter((m): m is MemoryRecord => Boolean(m));
    }
    return [];
  }, [activeInspectorNode, graph.edges, memories]);

  /* --------------------------------------------------
     2. MOCK AI STATS & INSIGHTS (LEFT BAR)
     -------------------------------------------------- */
  const mostConnectedTopic = useMemo(() => {
    const entities = graph.nodes.filter(n => n.type === "entity");
    if (!entities.length) return "React Performance";
    const sorted = [...entities].sort((a, b) => b.connectionCount - a.connectionCount);
    return sorted[0].label;
  }, [graph.nodes]);

  const forgottenMemories = useMemo(() => {
    const candidates = memories.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    return candidates.slice(0, 2);
  }, [memories]);

  /* --------------------------------------------------
     3. CANVAS PAN & DRAG HANDLERS
     -------------------------------------------------- */
  const handleMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setSelectedId(null);
    setHoveredId(null);
    setSelectedEdgeId(null);
  };

  /* --------------------------------------------------
     4. CONTEXT MENU ACTIONS (RIGHT CLICK)
     -------------------------------------------------- */
  const handleNodeContextMenu = (e: MouseEvent, node: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      type: node.type,
    });
  };

  const togglePinNode = (nodeId: string) => {
    setPinnedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        showToast("Node unpinned");
      } else {
        next.add(nodeId);
        showToast("Node pinned in place");
      }
      return next;
    });
  };

  const triggerAnalysis = async (ids: string[]) => {
    if (analysisProgress || !ids.length) return;
    setAnalysisProgress({ completed: 0, total: Math.min(ids.length, 3) });
    try {
      await onReanalyze(ids.slice(0, 3), (completed, total) => setAnalysisProgress({ completed, total }));
      showToast("AI Entity Analysis complete");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisProgress(null);
    }
  };

  return (
    <main className="page-content graph-page real-graph-page" style={{ paddingBottom: "120px" }}>
      {/* Intro section */}
      <section className="page-intro graph-intro">
        <div>
          <span className="eyebrow"><span />Neural Connections</span>
          <h1>Interactive Brain Map</h1>
          <p>Explore your thoughts, documents, and connected concepts mapped as a living neural network.</p>
        </div>
        <button className="primary-action" onClick={openAssistant}>
          <Sparkles size={17} /> Grounded graph Q&A
        </button>
      </section>

      {/* Toolbar / Search & Filters */}
      <section className="graph-toolbar" aria-label="Graph controls">
        <label className="graph-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search node, tags, or topic..." />
        </label>

        <div className="graph-filters flex-wrap gap-1.5">
          {[
            { id: "all", label: "All Nodes" },
            { id: "favorites", label: "Favorites" },
            { id: "recent", label: "Recent" },
            { id: "ai", label: "AI & Agents" },
            { id: "programming", label: "Programming" },
            { id: "projects", label: "Projects" },
          ].map((chip) => (
            <button
              key={chip.id}
              className={activeFilter === chip.id ? "active" : ""}
              onClick={() => {
                setActiveFilter(chip.id);
                setSelectedId(null);
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="graph-zoom">
          <button title="Zoom Out" onClick={() => setZoom(z => Math.max(0.5, z - 0.15))}>
            <ZoomOut size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button title="Zoom In" onClick={() => setZoom(z => Math.min(2.0, z + 0.15))}>
            <ZoomIn size={16} />
          </button>
          <button title="Reset Canvas" onClick={resetView}>
            <RotateCcw size={15} />
          </button>
        </div>
      </section>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start mt-2">
        
        {/* Left Column: AI Brain Insights */}
        <aside className="flex flex-col gap-4">
          <article className="card p-4">
            <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
              <Brain size={14} />
              <span>AI Mind Insights</span>
            </div>
            
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Most Connected Topic</span>
                <strong className="text-slate-800 dark:text-slate-200 text-sm mt-0.5 block flex items-center gap-1">
                  <Tag size={13} className="text-indigo-500" />
                  {mostConnectedTopic}
                </strong>
              </div>
              
              <div>
                <span className="text-slate-400 block">Recently Growing Knowledge</span>
                <strong className="text-emerald-500 text-sm mt-0.5 block flex items-center gap-1">
                  <Flame size={13} />
                  +40% connections this week
                </strong>
              </div>

              <div>
                <span className="text-slate-400 block">Learning Pattern</span>
                <p className="text-slate-500 leading-relaxed mt-0.5">Focus is centered around client-side states, local database syncing, and AI grounding logic.</p>
              </div>
            </div>
          </article>

          {/* Forgotten memories cards */}
          <article className="card p-4">
            <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
              <Clock size={14} />
              <span>Forgotten Memories</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {forgottenMemories.map((m) => (
                <button
                  key={m.id}
                  className="flex items-start gap-2 p-2 border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:border-indigo-400 rounded-md text-left text-xs transition-all w-full"
                  onClick={() => onOpenMemory(m)}
                >
                  <FileText size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-700 dark:text-slate-300 block truncate">{m.title}</strong>
                    <small className="text-slate-400 block mt-0.5">Captured {new Date(m.created_at).toLocaleDateString()}</small>
                  </span>
                </button>
              ))}
            </div>
          </article>

          {/* AI Connection Recommendations */}
          <article className="card p-4">
            <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
              <Sparkles size={14} />
              <span>Suggested Links</span>
            </div>
            <div className="flex flex-col gap-2.5 text-[11px] text-slate-500">
              <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/10 rounded-lg">
                <p>Link <strong>React Performance</strong> with your notes on <strong>Vite Bundles</strong></p>
                <button className="text-indigo-600 dark:text-indigo-400 font-bold mt-1.5 hover:underline flex items-center gap-0.5" onClick={() => showToast("AI suggested connection established")}>
                  Connect Nodes <ArrowRight size={11} />
                </button>
              </div>
            </div>
          </article>
        </aside>

        {/* Center Column: The SVG Graph */}
        <section className="lg:col-span-2 flex flex-col gap-4">
          <div className="graph-stage relative" style={{ height: "560px" }}>
            
            {/* Header info bar */}
            <div className="graph-summary absolute top-3 left-3 z-10">
              <span><Network size={14} /> {graph.memoryCount} memories</span>
              <span><Tag size={13} /> {graph.entityCount} topics</span>
              <span>{graph.relationshipCount} edges</span>
            </div>

            {/* Backfill trigger */}
            {eligibleMemories.length > 0 && (
              <div className="graph-backfill absolute top-3 right-3 z-10 flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md">
                <Sparkles size={13} />
                <span>{eligibleMemories.length} files ready to map</span>
                <button
                  disabled={Boolean(analysisProgress)}
                  onClick={() => triggerAnalysis(nextBackfillBatch.map(m => m.id))}
                  className="bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-[11px] border border-white/20 ml-2"
                >
                  {analysisProgress ? "Mapping..." : "Run AI"}
                </button>
              </div>
            )}

            {/* Empty state overlay */}
            {!graph.nodes.length ? (
              <div className="graph-empty flex flex-col items-center justify-center h-full text-center">
                <Network size={44} className="text-slate-300 mb-2" />
                <h3 className="text-base font-bold">No connected concepts found</h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1">Adjust timeline or search filters to expand visible nodes.</p>
              </div>
            ) : (
              /* The Canvas stage */
              <svg
                ref={canvasRef}
                className="w-full h-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-grab active:cursor-grabbing select-none"
                style={{ overflow: "hidden" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* SVG definitions for arrowheads, glows, etc. */}
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} transform-origin="center">
                  {/* Connection lines */}
                  <g className="graph-lines">
                    {graph.edges.map((edge) => {
                      const source = nodeById.get(edge.source);
                      const target = nodeById.get(edge.target);
                      if (!source || !target) return null;

                      // Dimming logic
                      const activeId = selectedId || hoveredId;
                      const isUnrelated = activeId && edge.source !== activeId && edge.target !== activeId;
                      
                      // Strength/weight thickness
                      const strength = edge.kind === "relationship" ? 2.5 : 1.2;

                      // Glow recently used connection mockup
                      const glows = edge.kind === "relationship" && (edge.source === "entity:person" || edge.target === "entity:person");

                      return (
                        <g
                          key={edge.id}
                          className={`graph-edge-group transition-opacity duration-300 ${isUnrelated ? "opacity-20" : "opacity-100"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(null);
                            setSelectedEdgeId(edge.id);
                          }}
                        >
                          {/* Animated curved link fallback line */}
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke={selectedEdgeId === edge.id ? "var(--brand)" : glows ? "#f59e0b" : "var(--border-color)"}
                            strokeWidth={selectedEdgeId === edge.id ? strength + 1 : strength}
                            strokeDasharray={edge.kind === "root" ? "3 3" : undefined}
                            filter={glows ? "url(#glow)" : undefined}
                            style={{ transition: "stroke 0.2s" }}
                          />
                          {edge.kind === "relationship" && edge.label && (
                            <text
                              x={(source.x + target.x) / 2}
                              y={(source.y + target.y) / 2 - 5}
                              textAnchor="middle"
                              className="text-[9px] font-semibold fill-slate-500 dark:fill-slate-400 bg-slate-50 px-1"
                            >
                              {edge.label.replace(/_/g, " ")}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* Nodes Group */}
                  <g className="graph-nodes">
                    {graph.nodes.map((node) => {
                      const isSelected = selectedId === node.id;
                      const isHovered = hoveredId === node.id;
                      const isPinned = pinnedNodes.has(node.id);
                      
                      // Dimming logic
                      const activeId = selectedId || hoveredId;
                      const isDimmed = activeId && !connectedIds.has(node.id);

                      // Emojis/Icons map for different types
                      const getEmoji = (n: typeof node) => {
                        if (n.type === "root") return "🧠";
                        if (n.type === "memory") {
                          if (n.memoryKind === "Link") return "🔗";
                          if (n.memoryKind === "Voice") return "🎙️";
                          return "📄";
                        }
                        // Entity
                        if (n.entityType === "person") return "👤";
                        if (n.entityType === "organization") return "🏢";
                        if (n.entityType === "technology") return "💻";
                        return "🏷️";
                      };

                      return (
                        <g
                          key={node.id}
                          className={`cursor-pointer transition-all duration-300 ${isDimmed ? "opacity-20 scale-95" : "opacity-100 scale-100"}`}
                          onMouseEnter={() => setHoveredId(node.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEdgeId(null);
                            setSelectedId(prev => prev === node.id ? null : node.id);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            // Expand nodes helper: highlight connected nodes
                            setSelectedId(node.id);
                            showToast(`Expanded connections for ${node.label}`);
                          }}
                          onContextMenu={(e) => handleNodeContextMenu(e, node)}
                        >
                          {/* Inner float glow ring */}
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.radius + (isSelected || isHovered ? 8 : 4)}
                            fill={isSelected ? "var(--brand-soft)" : "transparent"}
                            stroke={isSelected ? "var(--brand)" : "transparent"}
                            strokeWidth={1}
                          />

                          {/* Primary node body */}
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.radius}
                            fill={node.color}
                            className="transition-colors duration-200"
                            style={{ filter: isHovered ? "drop-shadow(0 4px 12px rgba(99,102,241,0.25))" : undefined }}
                          />

                          {/* Node label text */}
                          <text
                            x={node.x}
                            y={node.y - 1}
                            textAnchor="middle"
                            className="font-bold text-[10px] fill-white"
                          >
                            {getEmoji(node)} {node.label.slice(0, 14)}
                          </text>
                          
                          <text
                            x={node.x}
                            y={node.y + 11}
                            textAnchor="middle"
                            className="text-[8px] fill-white/80"
                          >
                            {node.type === "memory" ? node.memoryKind : `${node.connectionCount} links`}
                          </text>

                          {/* Pin indicator icon mock */}
                          {isPinned && (
                            <g transform={`translate(${node.x + node.radius - 8}, ${node.y - node.radius + 4})`}>
                              <circle cx={4} cy={4} r={5} fill="#f59e0b" />
                              <path d="M4 2v4M2 4h4" stroke="white" strokeWidth={1} />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                </g>
              </svg>
            )}

            {/* Custom Right-Click Context Menu */}
            {contextMenu && (
              <div
                className="absolute bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-lg py-1.5 z-50 text-xs w-44"
                style={{ top: contextMenu.y - 60, left: contextMenu.x - 220 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left"
                  onClick={() => {
                    setContextMenu(null);
                    const newName = prompt("Rename node:", nodeById.get(contextMenu.nodeId)?.label);
                    if (newName) showToast(`Renamed to "${newName}"`);
                  }}
                >
                  <Edit3 size={13} />
                  <span>Rename</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left"
                  onClick={() => {
                    setContextMenu(null);
                    togglePinNode(contextMenu.nodeId);
                  }}
                >
                  <Pin size={13} />
                  <span>{pinnedNodes.has(contextMenu.nodeId) ? "Unpin Node" : "Pin Node"}</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left"
                  onClick={() => {
                    setContextMenu(null);
                    showToast("Select target node to merge connections...");
                  }}
                >
                  <Merge size={13} />
                  <span>Merge Nodes</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left"
                  onClick={() => {
                    setContextMenu(null);
                    showToast("Connecting mode active. Choose target node.");
                  }}
                >
                  <Plus size={13} />
                  <span>Create Connection</span>
                </button>
                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 text-left"
                  onClick={() => {
                    setContextMenu(null);
                    if (confirm("Delete this node from graph visualization?")) {
                      showToast("Node connection hidden");
                    }
                  }}
                >
                  <Trash2 size={13} />
                  <span>Delete Node</span>
                </button>
              </div>
            )}
            
            {/* Legend controls */}
            <div className="graph-legend absolute bottom-3 left-3 z-10 flex gap-3 text-[10px] bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#6657d9]" /> Notes</span>
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#168c75]" /> Links</span>
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#de793d]" /> Voice</span>
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#c66d45]" /> Topics</span>
            </div>
          </div>

          {/* Chronological Timeline Slider */}
          <article className="card p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold uppercase tracking-wide">
                <Calendar size={14} />
                <span>Time-grounded Scope</span>
              </div>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono capitalize">{timelineScope}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg w-full text-xs">
              {[
                { id: "week" as const, label: "Week" },
                { id: "month" as const, label: "Month" },
                { id: "year" as const, label: "Year" },
                { id: "all" as const, label: "All Time" },
              ].map((scope) => (
                <button
                  key={scope.id}
                  className={`flex-1 py-1 text-center rounded-md font-semibold transition-all ${
                    timelineScope === scope.id ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm" : "text-slate-400 hover:text-slate-700"
                  }`}
                  onClick={() => {
                    setTimelineScope(scope.id);
                    setSelectedId(null);
                  }}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          </article>
        </section>

        {/* Right Column: Node Inspector Card */}
        <aside className="lg:col-span-1">
          <AnimatePresence mode="wait">
            {activeInspectorNode || selectedEdge ? (
              <motion.article
                key={activeInspectorNode?.id || selectedEdge?.id}
                className="card p-5 border-l-4 border-indigo-600 bg-white dark:bg-slate-950 flex flex-col gap-4"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">
                      {selectedEdge ? "source relationship" : activeInspectorNode?.type === "root" ? "root node" : activeInspectorNode?.entityType || activeInspectorNode?.type}
                    </span>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                      {selectedEdge ? `${nodeById.get(selectedEdge.source)?.label} → ${nodeById.get(selectedEdge.target)?.label}` : activeInspectorNode?.label}
                    </h2>
                  </div>
                  <button
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400"
                    onClick={() => {
                      setSelectedId(null);
                      setSelectedEdgeId(null);
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Body Details */}
                {selectedEdge ? (
                  <div className="text-xs text-slate-500 flex flex-col gap-2">
                    <p><strong>Relationship:</strong> {selectedEdge.label?.replace(/_/g, " ")}</p>
                    {selectedEdge.evidence && <p className="italic bg-slate-50 dark:bg-slate-900 p-2 rounded-md">“{selectedEdge.evidence}”</p>}
                    {typeof selectedEdge.confidence === "number" && (
                      <div className="flex items-center gap-1.5 mt-1 font-semibold text-indigo-500">
                        <Sparkles size={13} />
                        <span>AI Confidence {Math.round(selectedEdge.confidence * 100)}%</span>
                      </div>
                    )}
                    {relationshipMemory && (
                      <button className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold mt-3" onClick={() => onOpenMemory(relationshipMemory)}>
                        <FileText size={14} /> Open source memory <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 flex flex-col gap-3">
                    {inspectorMemory ? (
                      <>
                        <p>{inspectorMemory.summary || inspectorMemory.content || `${inspectorMemory.kind} captured in Neuron.`}</p>
                        {inspectorMemory.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {inspectorMemory.tags.slice(0, 5).map(t => (
                              <span key={t} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 rounded font-medium">{t}</span>
                            ))}
                          </div>
                        )}
                        <button
                          className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold mt-4"
                          onClick={() => onOpenMemory(inspectorMemory)}
                        >
                          <FileText size={14} /> Open Memory <ExternalLink size={12} />
                        </button>
                      </>
                    ) : activeInspectorNode?.type === "entity" ? (
                      <>
                        <p>Linked to {connectedMemories.length} source {connectedMemories.length === 1 ? "memory" : "memories"} in this view.</p>
                        <div className="flex flex-col gap-2 mt-2">
                          {connectedMemories.slice(0, 5).map((m) => (
                            <button
                              key={m.id}
                              className="text-left p-2 border border-slate-100 dark:border-slate-800/80 hover:border-indigo-400 rounded text-slate-600 dark:text-slate-400 font-medium truncate bg-slate-50/50"
                              onClick={() => onOpenMemory(m)}
                            >
                              {m.title}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p>Your private workspace hub connects the visible entity and memory clusters.</p>
                    )}
                  </div>
                )}
              </motion.article>
            ) : (
              <div className="card p-5 h-full flex flex-col items-center justify-center text-center text-slate-400 py-16">
                <Compass size={32} className="text-slate-300 mb-2" />
                <h3 className="text-xs font-semibold">Node Inspector</h3>
                <p className="text-[11px] text-slate-400 max-w-[180px] mt-1">Hover or click a node in the brain map to explore its detailed relationships.</p>
              </div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      {/* Global Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <span><Check size={15} /></span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
