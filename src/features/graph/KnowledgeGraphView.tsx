import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ExternalLink, FileText, Network, RotateCcw, Search, Sparkles, Tag, ZoomIn, ZoomOut } from "lucide-react";
import type { KnowledgeEntityData, MemoryKind, MemoryRecord } from "../../lib/supabase";
import { buildKnowledgeGraph, type KnowledgeGraphNode } from "./graphData";

type GraphFilter = "all" | Lowercase<MemoryKind>;

type KnowledgeGraphViewProps = {
  memories: MemoryRecord[];
  entityData: KnowledgeEntityData;
  onOpenMemory: (memory: MemoryRecord) => void;
  openAssistant: () => void;
};

const FILTERS: Array<{ value: GraphFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "note", label: "Notes" },
  { value: "upload", label: "Uploads" },
  { value: "link", label: "Links" },
  { value: "voice", label: "Voice" },
];

function shortLabel(label: string, length = 19) {
  return label.length > length ? `${label.slice(0, length - 1)}…` : label;
}

export function KnowledgeGraphView({ memories, entityData, onOpenMemory, openAssistant }: KnowledgeGraphViewProps) {
  const [filter, setFilter] = useState<GraphFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return memories.filter((memory) => {
      if (filter !== "all" && memory.kind.toLowerCase() !== filter) return false;
      if (!normalizedQuery) return true;
      return [memory.title, memory.summary || "", memory.content, ...memory.tags].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [filter, memories, query]);
  const graph = useMemo(() => buildKnowledgeGraph(filteredMemories, { entityData }), [entityData, filteredMemories]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selectedNode = selectedId ? nodeById.get(selectedId) || null : null;
  const selectedEdge = selectedEdgeId ? graph.edges.find((edge) => edge.id === selectedEdgeId) || null : null;
  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set([selectedId]);
    for (const edge of graph.edges) {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    }
    return ids;
  }, [graph.edges, selectedId]);
  const selectedMemory = selectedNode?.memoryId ? memories.find((memory) => memory.id === selectedNode.memoryId) || null : null;
  const relationshipMemory = selectedEdge?.memoryId ? memories.find((memory) => memory.id === selectedEdge.memoryId) || null : null;
  const connectedMemories = selectedNode?.type === "entity"
    ? graph.edges.filter((edge) => edge.kind === "association" && (edge.source === selectedNode.id || edge.target === selectedNode.id)).map((edge) => edge.memoryId).filter((id): id is string => Boolean(id)).map((id) => memories.find((memory) => memory.id === id)).filter((memory): memory is MemoryRecord => Boolean(memory))
    : [];
  const viewWidth = 1000 / zoom;
  const viewHeight = 620 / zoom;
  const viewBox = `${(1000 - viewWidth) / 2} ${(620 - viewHeight) / 2} ${viewWidth} ${viewHeight}`;

  useEffect(() => {
    if (selectedId && !nodeById.has(selectedId)) setSelectedId(null);
    if (selectedEdgeId && !graph.edges.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [graph.edges, nodeById, selectedEdgeId, selectedId]);

  const chooseNode = (node: KnowledgeGraphNode) => { setSelectedEdgeId(null); setSelectedId((current) => current === node.id ? null : node.id); };

  return (
    <main className="page-content graph-page real-graph-page">
      <section className="page-intro graph-intro">
        <div><span>{graph.edges.length} source-linked connections</span><h1>Knowledge graph</h1><p>Explore typed entities and relationships generated from your private memories.</p></div>
        <button className="primary-action" onClick={openAssistant}><Sparkles size={17} /> Ask about connections</button>
      </section>

      <section className="graph-toolbar" aria-label="Graph controls">
        <label className="graph-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a memory or topic" /></label>
        <div className="graph-filters">{FILTERS.map((option) => <button key={option.value} className={filter === option.value ? "active" : ""} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div>
        <div className="graph-zoom"><button aria-label="Zoom out" disabled={zoom <= .75} onClick={() => setZoom((current) => Math.max(.75, current - .25))}><ZoomOut size={16} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 1.75} onClick={() => setZoom((current) => Math.min(1.75, current + .25))}><ZoomIn size={16} /></button><button aria-label="Reset graph view" onClick={() => { setZoom(1); setSelectedId(null); setSelectedEdgeId(null); }}><RotateCcw size={15} /></button></div>
      </section>

      <section className="graph-stage">
        <div className="graph-summary"><span><Network size={15} /> {graph.memoryCount} memories</span><span><Tag size={14} /> {graph.entityCount} {graph.source === "entities" ? "entities" : "topics"}</span><span>{graph.relationshipCount} relationships</span><span>{graph.source === "entities" ? "Typed extraction" : "Tag fallback"}</span></div>
        {!graph.nodes.length ? <div className="graph-empty"><Network size={38} /><h2>{memories.length ? "No memories match these filters" : "Your graph is ready to grow"}</h2><p>{memories.length ? "Clear the search or choose another memory type." : "Capture your first memory and Neuron will map its topics here."}</p>{(query || filter !== "all") && <button onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>}</div>
        : <div className="graph-canvas real-graph-canvas">
          <svg viewBox={viewBox} role="img" aria-label={`Knowledge graph with ${graph.memoryCount} memories and ${graph.entityCount} entities`}>
            <g className="graph-lines">{graph.edges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;
              const muted = Boolean(selectedId && edge.source !== selectedId && edge.target !== selectedId);
              const relationshipProps = edge.kind === "relationship" ? { role: "button", tabIndex: 0, onClick: () => { setSelectedId(null); setSelectedEdgeId(edge.id); }, onKeyDown: (event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(null); setSelectedEdgeId(edge.id); } } } : {};
              return <g key={edge.id} className={`graph-edge ${edge.kind} ${selectedEdgeId === edge.id ? "selected" : ""} ${muted ? "muted" : ""}`} aria-label={edge.kind === "relationship" ? `Relationship ${edge.label?.replace(/_/g, " ")}` : undefined} {...relationshipProps}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />{edge.kind === "relationship" && edge.label && <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 5} textAnchor="middle">{shortLabel(edge.label.replace(/_/g, " "), 16)}</text>}</g>;
            })}</g>
            <g>{graph.nodes.map((node) => {
              const selected = selectedId === node.id;
              const muted = Boolean(selectedId && !connectedIds.has(node.id));
              return <g key={node.id} className={`real-graph-node ${node.type} ${selected ? "selected" : ""} ${muted ? "muted" : ""}`} role="button" tabIndex={0} aria-label={`${node.type}: ${node.label}, ${node.connectionCount} connections`} onClick={() => chooseNode(node)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseNode(node); } }}>
                <circle cx={node.x} cy={node.y} r={node.radius + (selected ? 9 : 6)} fill={`${node.color}18`} />
                <circle cx={node.x} cy={node.y} r={node.radius} fill={node.color} />
                <text x={node.x} y={node.y - 2} textAnchor="middle" fill="white" className="node-label">{shortLabel(node.label, node.type === "memory" ? 16 : 18)}</text>
                <text x={node.x} y={node.y + 14} textAnchor="middle" fill="white" className="node-sub">{node.type === "memory" ? node.memoryKind : `${node.connectionCount} links`}</text>
              </g>;
            })}</g>
          </svg>
          <div className="graph-legend"><span><i className="memory" />Memories</span><span><i className="entity" />Entities</span><span><i className="relationship" />Relationships</span><span><i className="root" />Your brain</span></div>
          {(selectedNode || selectedEdge) && <aside className="graph-inspector"><button className="graph-inspector-close" onClick={() => { setSelectedId(null); setSelectedEdgeId(null); }} aria-label="Close graph details">×</button>{selectedEdge ? <><span>source-linked relationship</span><h2>{nodeById.get(selectedEdge.source)?.label} → {nodeById.get(selectedEdge.target)?.label}</h2><p><strong>{selectedEdge.label?.replace(/_/g, " ")}</strong>{selectedEdge.evidence ? ` — “${selectedEdge.evidence}”` : ""}</p>{typeof selectedEdge.confidence === "number" && <div className="graph-confidence">Confidence {Math.round(selectedEdge.confidence * 100)}%</div>}{relationshipMemory && <button className="graph-open-memory" onClick={() => onOpenMemory(relationshipMemory)}><FileText size={15} /> Open source memory <ExternalLink size={13} /></button>}</> : selectedNode && <><span>{selectedNode.entityType || selectedNode.type}</span><h2>{selectedNode.label}</h2>{selectedMemory ? <><p>{selectedMemory.summary || selectedMemory.content || `${selectedMemory.kind} saved in Neuron.`}</p><div className="graph-inspector-tags">{selectedMemory.tags.slice(0, 5).map((tag) => <small key={tag}>{tag}</small>)}</div><button className="graph-open-memory" onClick={() => onOpenMemory(selectedMemory)}><FileText size={15} /> Open memory <ExternalLink size={13} /></button></> : selectedNode.type === "entity" ? <><p>Connected to {connectedMemories.length} source {connectedMemories.length === 1 ? "memory" : "memories"} in this view.</p><div className="graph-topic-memories">{connectedMemories.slice(0, 5).map((memory) => <button key={memory.id} onClick={() => onOpenMemory(memory)}>{memory.title}</button>)}</div></> : <p>Your private workspace hub connects the visible entity and memory clusters.</p>}</>}</aside>}
        </div>}
      </section>
    </main>
  );
}
