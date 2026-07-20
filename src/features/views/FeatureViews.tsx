import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  Code2,
  FileText,
  FolderPlus,
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
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { recentItems } from "../../data/mockData";
import type { CollectionRecord, MemoryRecord } from "../../lib/supabase";
import type { LibraryItem } from "../../types/app";
import { formatFileSize } from "../../lib/uploads";

type LibraryViewProps = {
  onSearch: (query: string) => void;
  openCapture: () => void;
  memories: MemoryRecord[];
  onRetry: (memoryId: string) => Promise<void>;
  onDownload: (path: string, filename: string) => Promise<void>;
  onDelete: (memory: MemoryRecord) => Promise<void>;
  collections: CollectionRecord[];
  onToggleFavorite: (memoryId: string, isFavorite: boolean) => Promise<void>;
  onToggleCollection: (collectionId: string, memoryId: string) => Promise<void>;
  openMemoryId?: string | null;
  onOpenedMemory?: () => void;
};

type LibrarySelection = {
  item: LibraryItem;
  memory?: MemoryRecord;
};

function memoryToLibraryItem(memory: MemoryRecord): LibraryItem {
  return {
    id: memory.id,
    title: memory.title,
    description: memory.summary || memory.content || memory.extracted_text?.slice(0, 180) || (memory.original_filename ? `${memory.original_filename} · ${memory.file_size ? formatFileSize(memory.file_size) : "Private file"}` : `${memory.kind} captured in Neuron`),
    meta: `${memory.kind} · ${memory.processing_status === "ready" ? "AI processed" : memory.processing_status === "failed" ? "Processing failed" : "Queued for processing"}`,
    tag: "Synced",
    icon: memory.kind === "Voice" ? Mic : memory.kind === "Link" ? Link2 : memory.kind === "Upload" ? UploadCloud : FileText,
    color: memory.kind === "Voice" ? "orange" : memory.kind === "Link" ? "green" : "violet",
    processingStatus: memory.processing_status,
    storagePath: memory.storage_path ?? undefined,
    originalFilename: memory.original_filename ?? undefined,
  };
}

export function LibraryView({ onSearch, openCapture, memories, onRetry, onDownload, onDelete, collections, onToggleFavorite, onToggleCollection, openMemoryId, onOpenedMemory }: LibraryViewProps) {
  const [selection, setSelection] = useState<LibrarySelection | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const syncedItems: LibraryItem[] = memories.map(memoryToLibraryItem);
  const previewItems = [
    ...recentItems,
    { title: "Local-first software", description: "Principles for resilient apps that work without a network connection.", meta: "Article · 9 min", tag: "Architecture", icon: Globe2, color: "green" },
    { title: "Vector search experiments", description: "Benchmarks and learnings from hybrid semantic retrieval.", meta: "Code note · 6 blocks", tag: "AI", icon: Code2, color: "violet" },
  ];
  const allItems = memories.length ? syncedItems : previewItems;
  const visibleItems = allItems
    .filter((item) => typeFilter === "all" || memories.find((memory) => memory.id === item.id)?.kind.toLowerCase() === typeFilter)
    .sort((left, right) => {
      if (sortOrder === "title") return left.title.localeCompare(right.title);
      const leftDate = memories.find((memory) => memory.id === left.id)?.created_at || "";
      const rightDate = memories.find((memory) => memory.id === right.id)?.created_at || "";
      return sortOrder === "oldest" ? leftDate.localeCompare(rightDate) : rightDate.localeCompare(leftDate);
    });

  useEffect(() => {
    if (!selection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selection]);

  useEffect(() => {
    if (!openMemoryId) return;
    const memory = memories.find((candidate) => candidate.id === openMemoryId);
    if (!memory) return;
    setSelection({ item: memoryToLibraryItem(memory), memory });
    onOpenedMemory?.();
  }, [memories, onOpenedMemory, openMemoryId]);

  return (
    <>
    <main className="page-content">
      <PageIntro eyebrow="Your memory" title="Library" description="Everything you’ve saved, understood and connected." action={<button className="primary-action" onClick={openCapture}><Plus size={17} /> Add memory</button>} />
      <div className="library-toolbar">
        <div className="compact-search"><Search size={17} /><input placeholder="Search your library" onKeyDown={(event) => { if (event.key === "Enter") onSearch(event.currentTarget.value); }} /></div>
        <label className="library-select"><Grid2X2 size={16} /><select aria-label="Filter memory type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="note">Notes</option><option value="upload">Uploads</option><option value="link">Links</option><option value="voice">Voice</option></select><ChevronDown size={14} /></label>
        <label className="library-select"><select aria-label="Sort memories" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="recent">Recently added</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select><ChevronDown size={14} /></label>
      </div>
      <div className="library-list">
        {visibleItems.map((item, index) => {
          const Icon = item.icon;
          const memory = item.id ? memories.find((candidate) => candidate.id === item.id) : undefined;
          return (
            <article key={item.id ?? `${item.title}-${index}`} className="library-row">
              <button className="library-open-button" onClick={() => setSelection({ item, memory })} aria-label={`Open ${item.title}`}>
                <span className={`file-icon ${item.color}`}><Icon size={19} /></span>
                <span className="library-row-copy"><span>{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p></span>
                <small>{item.meta}</small>
              </button>
              <div className="library-row-actions">
                {memory && <button className={`library-row-action ${memory.is_favorite ? "starred" : ""}`} title={memory.is_favorite ? "Remove favorite" : "Favorite"} aria-label={`${memory.is_favorite ? "Remove" : "Add"} ${item.title} ${memory.is_favorite ? "from" : "to"} favorites`} onClick={() => void onToggleFavorite(memory.id, !memory.is_favorite)}><Star size={16} fill={memory.is_favorite ? "currentColor" : "none"} /></button>}
                {item.processingStatus === "failed" && item.id
                  ? <button className="library-row-action" title="Retry processing" aria-label={`Retry ${item.title}`} onClick={() => void onRetry(item.id!)}><RotateCw size={16} /></button>
                  : item.storagePath && item.originalFilename
                    ? <button className="library-row-action" title="Download private file" aria-label={`Download ${item.originalFilename}`} onClick={() => void onDownload(item.storagePath!, item.originalFilename!)}><Download size={16} /></button>
                    : null}
              </div>
            </article>
          );
        })}
      </div>
    </main>
    {selection && <MemoryDetail selection={selection.memory ? { ...selection, memory: memories.find((memory) => memory.id === selection.memory!.id) || selection.memory } : selection} collections={collections} onClose={() => setSelection(null)} onRetry={onRetry} onDownload={onDownload} onDelete={onDelete} onToggleFavorite={onToggleFavorite} onToggleCollection={onToggleCollection} />}
    </>
  );
}

function MemoryDetail({ selection, collections, onClose, onRetry, onDownload, onDelete, onToggleFavorite, onToggleCollection }: {
  selection: LibrarySelection;
  collections: CollectionRecord[];
  onClose: () => void;
  onRetry: (memoryId: string) => Promise<void>;
  onDownload: (path: string, filename: string) => Promise<void>;
  onDelete: (memory: MemoryRecord) => Promise<void>;
  onToggleFavorite: (memoryId: string, isFavorite: boolean) => Promise<void>;
  onToggleCollection: (collectionId: string, memoryId: string) => Promise<void>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [organizingId, setOrganizingId] = useState<string | null>(null);
  const { item, memory } = selection;
  const content = memory?.content.trim() || memory?.extracted_text?.trim() || item.description;
  const separateExtraction = Boolean(
    memory?.content.trim() &&
    memory?.extracted_text?.trim() &&
    memory.content.trim() !== memory.extracted_text.trim(),
  );
  const created = memory
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(memory.created_at))
    : null;

  const permanentlyDelete = async () => {
    if (!memory || deleting) return;
    setDeleting(true);
    try {
      await onDelete(memory);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card memory-detail-modal" role="dialog" aria-modal="true" aria-labelledby="memory-detail-title">
        <div className="modal-header">
          <div><span className="card-kicker"><FileText size={14} /> {memory?.kind ?? item.tag}</span><h2 id="memory-detail-title">{item.title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close memory"><X size={19} /></button>
        </div>
        <div className="memory-detail-meta">
          <span>{item.meta}</span>
          {created && <span>Saved {created}</span>}
          {memory?.original_filename && <span>{memory.original_filename}{memory.file_size ? ` · ${formatFileSize(memory.file_size)}` : ""}</span>}
        </div>
        <div className="memory-detail-body">
          {memory?.summary && <section><h3>AI summary</h3><p>{memory.summary}</p></section>}
          <section><h3>{memory?.kind === "Note" ? "Note" : "Content"}</h3><p className="memory-detail-content">{content}</p></section>
          {separateExtraction && <section><h3>Extracted text</h3><p className="memory-detail-content">{memory!.extracted_text}</p></section>}
          {memory && <section><h3>Collections</h3><div className="memory-collections">{collections.length ? collections.map((collection) => { const included = collection.memory_ids.includes(memory.id); return <button key={collection.id} className={included ? "selected" : ""} disabled={organizingId === collection.id} onClick={() => { setOrganizingId(collection.id); void onToggleCollection(collection.id, memory.id).finally(() => setOrganizingId(null)); }}><FolderPlus size={14} /> {collection.name}{included ? " · Added" : ""}</button>; }) : <p>Create a collection first, then return here to organize this memory.</p>}</div></section>}
        </div>
        <div className="modal-footer memory-detail-footer">
          <span>{memory ? "Private to your Neuron account" : "Library preview"}</span>
          <div>
            {memory?.processing_status === "failed" && <button className="cancel" onClick={() => void onRetry(memory.id)}><RotateCw size={14} /> Retry processing</button>}
            {memory?.storage_path && memory.original_filename && <button className="save" onClick={() => void onDownload(memory.storage_path!, memory.original_filename!)}><Download size={14} /> Download</button>}
            {memory && <button className="cancel" onClick={() => void onToggleFavorite(memory.id, !memory.is_favorite)}><Star size={14} fill={memory.is_favorite ? "currentColor" : "none"} /> {memory.is_favorite ? "Favorited" : "Favorite"}</button>}
            {memory && !confirmingDelete && <button className="danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={14} /> Delete</button>}
            {memory && confirmingDelete && <><button className="cancel" disabled={deleting} onClick={() => setConfirmingDelete(false)}>Keep memory</button><button className="danger" disabled={deleting} onClick={() => void permanentlyDelete()}><Trash2 size={14} /> {deleting ? "Deleting…" : "Delete permanently"}</button></>}
            {!confirmingDelete && <button className="cancel" onClick={onClose}>Close</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

type CollectionsViewProps = {
  collections: CollectionRecord[];
  memories: MemoryRecord[];
  onCreate: (name: string) => Promise<CollectionRecord>;
  onDelete: (collectionId: string) => Promise<void>;
  onOpenMemory: (memory: MemoryRecord) => void;
  onRemoveMemory: (collectionId: string, memoryId: string) => Promise<void>;
};

export function CollectionsView({ collections, memories, onCreate, onDelete, onOpenMemory, onRemoveMemory }: CollectionsViewProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = collections.find((collection) => collection.id === selectedId) || null;
  const createNewCollection = async () => {
    const normalized = name.trim();
    if (!normalized || busy) return;
    setBusy(true);
    setCollectionError(null);
    try {
      const collection = await onCreate(normalized);
      setName("");
      setCreating(false);
      setSelectedId(collection.id);
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Could not create this collection.");
    } finally {
      setBusy(false);
    }
  };
  const selectedMemories = selected ? selected.memory_ids.map((id) => memories.find((memory) => memory.id === id)).filter((memory): memory is MemoryRecord => Boolean(memory)) : [];
  return (
    <main className="page-content">
      <PageIntro eyebrow="Organized by AI" title="Collections" description="Living spaces that grow and reorganize with your knowledge." action={<button className="primary-action" onClick={() => setCreating(true)}><Plus size={17} /> New collection</button>} />
      {creating && <form className="collection-create" onSubmit={(event) => { event.preventDefault(); void createNewCollection(); }}><input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Collection name" /><button className="primary-action" disabled={busy || !name.trim()} type="submit">{busy ? "Creating…" : "Create"}</button><button type="button" disabled={busy} onClick={() => { setCreating(false); setName(""); setCollectionError(null); }}>Cancel</button>{collectionError && <span className="collection-error">{collectionError}</span>}</form>}
      {selected ? <section className="collection-detail"><div className="collection-detail-head"><button onClick={() => setSelectedId(null)}><ArrowLeft size={16} /> All collections</button><div><span style={{ backgroundColor: selected.color }}>{selected.name.slice(0, 2).toUpperCase()}</span><div><h2>{selected.name}</h2><p>{selectedMemories.length} {selectedMemories.length === 1 ? "memory" : "memories"}</p></div></div><button className="collection-delete" onClick={() => { if (!window.confirm(`Delete “${selected.name}”? Memories will be kept.`)) return; setBusy(true); void onDelete(selected.id).then(() => setSelectedId(null)).catch((error) => setCollectionError(error instanceof Error ? error.message : "Could not delete collection.")).finally(() => setBusy(false)); }} disabled={busy}><Trash2 size={15} /> Delete collection</button></div>{collectionError && <div className="collection-detail-error">{collectionError}</div>}<div className="collection-memory-list">{selectedMemories.length ? selectedMemories.map((memory) => <article key={memory.id}><button onClick={() => onOpenMemory(memory)}><span className={`file-icon ${memory.kind === "Link" ? "green" : memory.kind === "Voice" ? "orange" : "violet"}`}><FileText size={17} /></span><span><strong>{memory.title}</strong><small>{memory.summary || memory.content || `${memory.kind} memory`}</small></span></button><button title="Remove from collection" aria-label={`Remove ${memory.title} from ${selected.name}`} onClick={() => void onRemoveMemory(selected.id, memory.id)}><X size={16} /></button></article>) : <div className="collection-empty"><FolderPlus size={30} /><h3>This collection is empty</h3><p>Open a memory in Library and add it from the Collections section.</p></div>}</div></section>
      : collections.length ? <div className="collections-grid">{collections.map((collection) => <motion.button type="button" key={collection.id} className="collection-card" whileHover={{ y: -4 }} onClick={() => { setSelectedId(collection.id); setCollectionError(null); }}><div className="collection-visual" style={{ background: `linear-gradient(145deg, ${collection.color}18, ${collection.color}08)` }}><span style={{ backgroundColor: collection.color }}>{collection.name.slice(0, 2).toUpperCase()}</span><div className="paper-stack one" /><div className="paper-stack two" /></div><div className="collection-copy"><span>Private collection</span><h3>{collection.name}</h3><p>{collection.memory_ids.length} {collection.memory_ids.length === 1 ? "memory" : "memories"} · Synced</p></div></motion.button>)}</div>
      : <div className="collections-empty"><FolderPlus size={34} /><h2>Create your first collection</h2><p>Group related memories and keep the organization synced across devices.</p><button className="primary-action" onClick={() => setCreating(true)}><Plus size={16} /> New collection</button></div>}
    </main>
  );
}

export function GraphView({ openAssistant }: { openAssistant: () => void }) {
  return (
    <main className="page-content graph-page">
      <PageIntro eyebrow="42 connections this week" title="Knowledge graph" description="See how your ideas, projects and sources shape each other." action={<button className="primary-action" onClick={openAssistant}><Sparkles size={17} /> Find connections</button>} />
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
