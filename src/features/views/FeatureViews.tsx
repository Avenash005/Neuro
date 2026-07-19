import { motion } from "framer-motion";
import {
  ChevronDown,
  Code2,
  FileText,
  Download,
  Globe2,
  Grid2X2,
  Link2,
  Mic,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Star,
  UploadCloud,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { collections, recentItems } from "../../data/mockData";
import type { MemoryRecord } from "../../lib/supabase";
import type { LibraryItem } from "../../types/app";
import { formatFileSize } from "../../lib/uploads";

type LibraryViewProps = {
  onSearch: (query: string) => void;
  openCapture: () => void;
  memories: MemoryRecord[];
  onRetry: (memoryId: string) => Promise<void>;
  onDownload: (path: string, filename: string) => Promise<void>;
};

export function LibraryView({ onSearch, openCapture, memories, onRetry, onDownload }: LibraryViewProps) {
  const syncedItems: LibraryItem[] = memories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    description: memory.original_filename ? `${memory.original_filename} · ${memory.file_size ? formatFileSize(memory.file_size) : "Private file"}` : memory.content || `${memory.kind} captured in Neuron`,
    meta: `${memory.kind} · ${memory.processing_status === "ready" ? "AI processed" : memory.processing_status === "failed" ? "Processing failed" : "Queued for processing"}`,
    tag: "Synced",
    icon: memory.kind === "Voice" ? Mic : memory.kind === "Link" ? Link2 : memory.kind === "Upload" ? UploadCloud : FileText,
    color: memory.kind === "Voice" ? "orange" : memory.kind === "Link" ? "green" : "violet",
    processingStatus: memory.processing_status,
    storagePath: memory.storage_path ?? undefined,
    originalFilename: memory.original_filename ?? undefined,
  }));
  const allItems = [
    ...syncedItems,
    ...recentItems,
    { title: "Local-first software", description: "Principles for resilient apps that work without a network connection.", meta: "Article · 9 min", tag: "Architecture", icon: Globe2, color: "green" },
    { title: "Vector search experiments", description: "Benchmarks and learnings from hybrid semantic retrieval.", meta: "Code note · 6 blocks", tag: "AI", icon: Code2, color: "violet" },
  ];

  return (
    <main className="page-content">
      <PageIntro eyebrow="Your memory" title="Library" description="Everything you’ve saved, understood and connected." action={<button className="primary-action" onClick={openCapture}><Plus size={17} /> Add memory</button>} />
      <div className="library-toolbar">
        <div className="compact-search"><Search size={17} /><input placeholder="Search your library" onKeyDown={(event) => { if (event.key === "Enter") onSearch(event.currentTarget.value); }} /></div>
        <button><Grid2X2 size={16} /> All types <ChevronDown size={14} /></button><button>Recently added <ChevronDown size={14} /></button>
      </div>
      <div className="library-list">
        {allItems.map((item, index) => {
          const Icon = item.icon;
          return <article key={`${item.title}-${index}`} className="library-row"><span className={`file-icon ${item.color}`}><Icon size={19} /></span><div><span>{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p></div><small>{item.meta}</small>{item.processingStatus === "failed" && item.id ? <button title="Retry processing" onClick={() => void onRetry(item.id!)}><RotateCw size={16} /></button> : item.storagePath && item.originalFilename ? <button title="Download private file" onClick={() => void onDownload(item.storagePath!, item.originalFilename!)}><Download size={16} /></button> : <button><Star size={16} /></button>}</article>;
        })}
      </div>
    </main>
  );
}

export function CollectionsView() {
  return (
    <main className="page-content">
      <PageIntro eyebrow="Organized by AI" title="Collections" description="Living spaces that grow and reorganize with your knowledge." action={<button className="primary-action"><Plus size={17} /> New collection</button>} />
      <div className="collections-grid">{collections.map((collection, index) => <motion.article key={collection.name} className="collection-card" whileHover={{ y: -4 }}><div className="collection-visual" style={{ background: `linear-gradient(145deg, ${collection.color}18, ${collection.color}08)` }}><span style={{ backgroundColor: collection.color }}>{collection.initials}</span><div className="paper-stack one" /><div className="paper-stack two" /></div><div className="collection-copy"><span>{index < 2 ? "Favorite" : "Smart collection"}</span><h3>{collection.name}</h3><p>{collection.count} memories · Updated today</p></div></motion.article>)}</div>
    </main>
  );
}

export function GraphView() {
  return (
    <main className="page-content graph-page">
      <PageIntro eyebrow="42 connections this week" title="Knowledge graph" description="See how your ideas, projects and sources shape each other." action={<button className="primary-action"><Sparkles size={17} /> Find connections</button>} />
      <div className="graph-canvas">
        <div className="graph-tip"><Sparkles size={15} /><span>Neuron found 3 new links in your recent notes</span><X size={14} /></div>
        <svg viewBox="0 0 900 520" role="img" aria-label="Interactive knowledge graph">
          <g className="graph-lines"><line x1="450" y1="255" x2="230" y2="160"/><line x1="450" y1="255" x2="686" y2="140"/><line x1="450" y1="255" x2="690" y2="360"/><line x1="450" y1="255" x2="220" y2="365"/><line x1="230" y1="160" x2="120" y2="270"/><line x1="230" y1="160" x2="330" y2="70"/><line x1="686" y1="140" x2="790" y2="250"/><line x1="690" y1="360" x2="545" y2="442"/><line x1="220" y1="365" x2="95" y2="425"/></g>
          <GraphNode x={450} y={255} r={64} label="Neuron" sub="Project" color="#6657d9" main/><GraphNode x={230} y={160} r={45} label="React" sub="Topic" color="#4c9db6"/><GraphNode x={686} y={140} r={48} label="AI memory" sub="Topic" color="#b45d8b"/><GraphNode x={690} y={360} r={43} label="Offline first" sub="Idea" color="#168c75"/><GraphNode x={220} y={365} r={46} label="Product" sub="Collection" color="#de793d"/><GraphNode x={120} y={270} r={32} label="Redux" sub="Tech" color="#806cd9"/><GraphNode x={330} y={70} r={31} label="Atlas" sub="Project" color="#4d7db4"/><GraphNode x={790} y={250} r={31} label="Qdrant" sub="Tech" color="#a65b79"/><GraphNode x={545} y={442} r={33} label="Sync" sub="Idea" color="#4a9b79"/><GraphNode x={95} y={425} r={29} label="Maya" sub="Person" color="#bd7550"/>
        </svg>
        <div className="graph-legend"><span><i className="project" />Projects</span><span><i className="topic" />Topics</span><span><i className="source" />Sources</span><span><i className="people" />People</span></div>
      </div>
    </main>
  );
}

function GraphNode({ x, y, r, label, sub, color, main = false }: { x: number; y: number; r: number; label: string; sub: string; color: string; main?: boolean }) {
  return <g className={`graph-node ${main ? "main" : ""}`}><circle cx={x} cy={y} r={r + 8} fill={`${color}12`} /><circle cx={x} cy={y} r={r} fill={color} /><text x={x} y={y - 3} textAnchor="middle" fill="white" className="node-label">{label}</text><text x={x} y={y + 17} textAnchor="middle" fill="white" opacity=".72" className="node-sub">{sub}</text></g>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action: ReactNode }) {
  return <section className="page-intro"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</section>;
}
