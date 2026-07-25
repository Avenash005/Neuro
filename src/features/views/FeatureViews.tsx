import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  FolderPlus,
  Download,
  Grid2X2,
  Link2,
  Mic,
  Plus,
  RotateCw,
  Search,
  Star,
  Trash2,
  UploadCloud,
  X,
  Calendar,
  Sparkles,
  Brain,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
    description: memory.content || memory.extracted_text || `${memory.kind} captured in Neuron`,
    meta: `${memory.kind} · ${memory.processing_status === "ready" ? "AI processed" : memory.processing_status === "failed" ? "Processing failed" : "Queued"}`,
    tag: memory.kind,
    icon: memory.kind === "Voice" ? Mic : memory.kind === "Link" ? Link2 : memory.kind === "Upload" ? UploadCloud : FileText,
    color: memory.kind === "Voice" ? "orange" : memory.kind === "Link" ? "green" : "violet",
    processingStatus: memory.processing_status,
    storagePath: memory.storage_path ?? undefined,
    originalFilename: memory.original_filename ?? undefined,
  };
}

export function LibraryView({
  onSearch,
  openCapture,
  memories,
  onRetry,
  onDownload,
  onDelete,
  collections,
  onToggleFavorite,
  onToggleCollection,
  openMemoryId,
  onOpenedMemory,
}: LibraryViewProps) {
  const [selection, setSelection] = useState<LibrarySelection | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  
  const syncedItems: LibraryItem[] = memories.map(memoryToLibraryItem);
  const allItems = memories.length ? syncedItems : [];
  
  const visibleItems = allItems
    .filter((item) => {
      const memory = memories.find((m) => m.id === item.id);
      return typeFilter === "all" || memory?.kind.toLowerCase() === typeFilter;
    })
    .sort((left, right) => {
      if (sortOrder === "title") return left.title.localeCompare(right.title);
      const leftDate = memories.find((m) => m.id === left.id)?.created_at || "";
      const rightDate = memories.find((m) => m.id === right.id)?.created_at || "";
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
        <PageIntro
          eyebrow="AI Second Brain"
          title="Library"
          description="Everything you’ve saved, indexed, and connected."
          action={
            <button className="capture-button" onClick={openCapture} style={{ width: "auto", padding: "0 18px" }}>
              <Plus size={16} /> Add Memory
            </button>
          }
        />

        <div className="library-toolbar">
          <div className="compact-search">
            <Search size={16} />
            <input
              placeholder="Search library..."
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch(event.currentTarget.value);
              }}
            />
          </div>
          <div className="library-filters">
            <label className="library-select">
              <Grid2X2 size={14} />
              <select aria-label="Filter memory type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                <option value="note">Notes</option>
                <option value="upload">Files</option>
                <option value="link">Links</option>
                <option value="voice">Voice</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <label className="library-select">
              <select aria-label="Sort memories" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="recent">Recently Added</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title A–Z</option>
              </select>
              <ChevronDown size={12} />
            </label>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          memories.length === 0 ? (
            /* Premium Empty State */
            <div className="empty-state">
              <div className="empty-illustration">
                <Brain size={44} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">No memories yet</h3>
              <p className="text-sm text-slate-500 max-w-sm">Capture thoughts, upload PDFs, save links, or record voice memos to build your second brain.</p>
              <button className="capture-button" onClick={openCapture} style={{ width: "auto", padding: "0 24px", marginTop: "8px" }}>
                <Plus size={16} /> Upload your first memory
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-illustration">
                <Search size={44} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">No matches found</h3>
              <p className="text-sm text-slate-500">Try adjusting your type filters or search criteria.</p>
            </div>
          )
        ) : (
          <div className="library-list">
            {visibleItems.map((item, index) => {
              const Icon = item.icon;
              const memory = item.id ? memories.find((candidate) => candidate.id === item.id) : undefined;
              const formattedDate = memory
                ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(memory.created_at))
                : "";

              return (
                <motion.article
                  key={item.id ?? `${item.title}-${index}`}
                  className="library-row"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  whileHover={{ y: -4 }}
                >
                  <button className="library-open-button" onClick={() => setSelection({ item, memory })} aria-label={`Open ${item.title}`}>
                    {/* Header */}
                    <div className="flex justify-between items-center w-full mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        <Icon size={14} />
                        <span>{item.tag}</span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{item.title}</h3>
                    
                    {/* Preview description */}
                    <p className="text-xs text-slate-500 line-clamp-2 mt-2">{item.description}</p>
                    
                    {/* AI Summary Block */}
                    {memory?.summary && (
                      <div className="mt-3 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/10 rounded-md">
                        <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-1">AI Summary</span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 italic leading-relaxed">{memory.summary}</p>
                      </div>
                    )}

                    <div className="flex justify-between items-center w-full mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formattedDate}
                      </span>
                      <span>{memory?.file_size ? formatFileSize(memory.file_size) : "Cloud sync"}</span>
                    </div>
                  </button>

                  {/* Actions overlay */}
                  <div className="library-row-actions">
                    {memory && (
                      <button
                        className={`library-row-action ${memory.is_favorite ? "starred" : ""}`}
                        title={memory.is_favorite ? "Remove favorite" : "Favorite"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onToggleFavorite(memory.id, !memory.is_favorite);
                        }}
                      >
                        <Star size={14} fill={memory.is_favorite ? "currentColor" : "none"} />
                      </button>
                    )}
                    {item.processingStatus === "failed" && item.id ? (
                      <button
                        className="library-row-action"
                        title="Retry processing"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onRetry(item.id!);
                        }}
                      >
                        <RotateCw size={14} />
                      </button>
                    ) : item.storagePath && item.originalFilename ? (
                      <button
                        className="library-row-action"
                        title="Download file"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDownload(item.storagePath!, item.originalFilename!);
                        }}
                      >
                        <Download size={14} />
                      </button>
                    ) : null}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </main>

      {selection && (
        <MemoryDetail
          selection={selection.memory ? { ...selection, memory: memories.find((m) => m.id === selection.memory!.id) || selection.memory } : selection}
          collections={collections}
          onClose={() => setSelection(null)}
          onRetry={onRetry}
          onDownload={onDownload}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
          onToggleCollection={onToggleCollection}
        />
      )}
    </>
  );
}

function MemoryDetail({
  selection,
  collections,
  onClose,
  onRetry,
  onDownload,
  onDelete,
  onToggleFavorite,
  onToggleCollection,
}: {
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
    memory.content.trim() !== memory.extracted_text.trim()
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
          {memory?.summary && (
            <section style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-soft)", padding: "14px", borderRadius: "12px" }}>
              <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-[10px] mb-2">
                <Sparkles size={12} />
                <span>AI Summary</span>
              </div>
              <p>{memory.summary}</p>
            </section>
          )}
          <section><h3>{memory?.kind === "Note" ? "Note Content" : "Content Preview"}</h3><p className="memory-detail-content">{content}</p></section>
          {separateExtraction && <section><h3>Extracted Text</h3><p className="memory-detail-content">{memory!.extracted_text}</p></section>}
          {memory && (
            <section>
              <h3>Collections</h3>
              <div className="memory-collections">
                {collections.length ? collections.map((collection) => {
                  const included = collection.memory_ids.includes(memory.id);
                  return (
                    <button
                      key={collection.id}
                      className={included ? "selected" : ""}
                      disabled={organizingId === collection.id}
                      onClick={() => {
                        setOrganizingId(collection.id);
                        void onToggleCollection(collection.id, memory.id).finally(() => setOrganizingId(null));
                      }}
                    >
                      <FolderPlus size={14} />
                      {collection.name}
                      {included ? " · Added" : ""}
                    </button>
                  );
                }) : (
                  <p className="text-slate-400 text-xs mt-1">Create a collection first, then return here to organize this memory.</p>
                )}
              </div>
            </section>
          )}
        </div>
        <div className="modal-footer memory-detail-footer">
          <span>{memory ? "Stored securely in cloud" : "Library preview"}</span>
          <div>
            {memory?.processing_status === "failed" && <button className="cancel" onClick={() => void onRetry(memory.id)}><RotateCw size={14} /> Retry processing</button>}
            {memory?.storage_path && memory.original_filename && <button className="save" onClick={() => void onDownload(memory.storage_path!, memory.original_filename!)}><Download size={14} /> Download</button>}
            {memory && <button className="cancel" onClick={() => void onToggleFavorite(memory.id, !memory.is_favorite)}><Star size={14} fill={memory.is_favorite ? "currentColor" : "none"} /> {memory.is_favorite ? "Favorited" : "Favorite"}</button>}
            {memory && !confirmingDelete && <button className="danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={14} /> Delete</button>}
            {memory && confirmingDelete && (
              <>
                <button className="cancel" disabled={deleting} onClick={() => setConfirmingDelete(false)}>Keep memory</button>
                <button className="danger" disabled={deleting} onClick={() => void permanentlyDelete()}><Trash2 size={14} /> {deleting ? "Deleting…" : "Delete permanently"}</button>
              </>
            )}
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

export function CollectionsView({
  collections,
  memories,
  onCreate,
  onDelete,
  onOpenMemory,
  onRemoveMemory,
}: CollectionsViewProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const selected = collections.find((c) => c.id === selectedId) || null;
  
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

  const selectedMemories = selected
    ? selected.memory_ids.map((id) => memories.find((m) => m.id === id)).filter((m): m is MemoryRecord => Boolean(m))
    : [];

  return (
    <main className="page-content">
      <PageIntro
        eyebrow="Organized Spaces"
        title="Collections"
        description="Sleek knowledge folder hubs that gather your thoughts automatically."
        action={
          <button className="capture-button" onClick={() => setCreating(true)} style={{ width: "auto", padding: "0 18px" }}>
            <Plus size={16} /> New Collection
          </button>
        }
      />

      {creating && (
        <form className="collection-create" onSubmit={(e) => { e.preventDefault(); void createNewCollection(); }}>
          <input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" />
          <button className="capture-button" disabled={busy || !name.trim()} type="submit" style={{ width: "auto", padding: "0 16px" }}>{busy ? "Creating…" : "Create"}</button>
          <button type="button" disabled={busy} onClick={() => { setCreating(false); setName(""); setCollectionError(null); }} className="cancel" style={{ height: "40px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "0 14px" }}>Cancel</button>
          {collectionError && <span className="collection-error">{collectionError}</span>}
        </form>
      )}

      {selected ? (
        <section className="collection-detail">
          <div className="collection-detail-head">
            <button onClick={() => setSelectedId(null)} className="more-link">
              <ArrowLeft size={16} /> All collections
            </button>
            <div className="mt-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <span className="avatar w-12 h-12 text-base" style={{ backgroundColor: selected.color }}>
                  {selected.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <p className="text-xs text-slate-400 mt-1">{selectedMemories.length} {selectedMemories.length === 1 ? "memory" : "memories"}</p>
                </div>
              </div>
              <button
                className="collection-delete"
                onClick={() => {
                  if (!window.confirm(`Delete “${selected.name}”? Memories will be kept.`)) return;
                  setBusy(true);
                  void onDelete(selected.id)
                    .then(() => setSelectedId(null))
                    .catch((err) => setCollectionError(err instanceof Error ? err.message : "Could not delete collection."))
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
              >
                <Trash2 size={14} /> Delete Collection
              </button>
            </div>
          </div>
          
          {collectionError && <div className="collection-detail-error">{collectionError}</div>}
          
          <div className="collection-memory-list">
            {selectedMemories.length ? (
              selectedMemories.map((memory) => (
                <article key={memory.id} className="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <button onClick={() => onOpenMemory(memory)} className="flex items-center gap-3 text-left w-full">
                    <span className={`file-icon w-8 h-8 rounded-md ${memory.kind === "Link" ? "green" : memory.kind === "Voice" ? "orange" : "violet"}`}>
                      <FileText size={15} />
                    </span>
                    <span className="flex flex-col">
                      <strong className="text-sm font-semibold">{memory.title}</strong>
                      <small className="text-xs text-slate-400 line-clamp-1 mt-0.5">{memory.summary || memory.content || `${memory.kind} memory`}</small>
                    </span>
                  </button>
                  <button
                    title="Remove from collection"
                    aria-label={`Remove ${memory.title} from ${selected.name}`}
                    onClick={() => void onRemoveMemory(selected.id, memory.id)}
                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-slate-400"
                  >
                    <X size={15} />
                  </button>
                </article>
              ))
            ) : (
              <div className="collection-empty py-12 flex flex-col items-center justify-center text-center">
                <FolderPlus size={30} className="text-slate-300 mb-2" />
                <h3 className="text-sm font-semibold">This collection is empty</h3>
                <p className="text-xs text-slate-400 max-w-[260px] mt-1">Open any memory in your Library and add it to this collection.</p>
              </div>
            )}
          </div>
        </section>
      ) : collections.length ? (
        <div className="collections-grid mt-4">
          {collections.map((collection) => (
            <motion.button
              type="button"
              key={collection.id}
              className="collection-card"
              whileHover={{ y: -4 }}
              onClick={() => {
                setSelectedId(collection.id);
                setCollectionError(null);
              }}
            >
              <div className="collection-visual" style={{ background: `linear-gradient(145deg, ${collection.color}18, ${collection.color}08)` }}>
                <span style={{ backgroundColor: collection.color }}>
                  {collection.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="paper-stack one" />
                <div className="paper-stack two" />
              </div>
              <div className="collection-copy">
                <span>Private space</span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{collection.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{collection.memory_ids.length} {collection.memory_ids.length === 1 ? "memory" : "memories"} · Synced</p>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="empty-state mt-6">
          <div className="empty-illustration">
            <FolderPlus size={44} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Create your first collection</h3>
          <p className="text-sm text-slate-500 max-w-sm">Folder spaces dynamically group relevant notes, media, and articles under unified tags.</p>
          <button className="capture-button" onClick={() => setCreating(true)} style={{ width: "auto", padding: "0 24px", marginTop: "8px" }}>
            <Plus size={16} /> New Collection
          </button>
        </div>
      )}
    </main>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action: ReactNode }) {
  return (
    <section className="page-intro">
      <div>
        <span className="eyebrow"><span />{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}
