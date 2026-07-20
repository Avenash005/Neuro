import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Header, Sidebar } from "./components/layout/AppLayout";
import { AssistantPanel, CaptureModal, SearchModal } from "./components/overlays/AppOverlays";
import { AuthModal } from "./features/auth/AuthModal";
import { ActivityView } from "./features/activity/ActivityView";
import { Dashboard } from "./features/dashboard/Dashboard";
import { KnowledgeGraphView } from "./features/graph/KnowledgeGraphView";
import { TasksView } from "./features/tasks/TasksView";
import { RecapsView } from "./features/recaps/RecapsView";
import { StudyView } from "./features/study/StudyView";
import { CollectionsView, LibraryView } from "./features/views/FeatureViews";
import {
  addMemoryToCollection,
  connectSupabase,
  createCollection,
  createFileMemory,
  createMemory,
  deleteMemory,
  deleteCollection,
  downloadMemoryFile,
  isSupabaseConfigured,
  listKnowledgeEntityData,
  listActionItems,
  listStudyCards,
  listMemories,
  listCollections,
  onAuthChange,
  processMemoryBacklog,
  processMemoryNow,
  retryMemoryProcessing,
  removeMemoryFromCollection,
  requestMemoryReanalysis,
  requestStudyReanalysis,
  updateActionItemStatus,
  setMemoryFavorite,
  DuplicateMemoryError,
  type MemoryInput,
  type MemoryRecord,
  type CollectionRecord,
  EMPTY_KNOWLEDGE_ENTITY_DATA,
  type KnowledgeEntityData,
  type ActionItemRecord,
  type ActionItemStatus,
  type StudyCardRecord,
} from "./lib/supabase";
import type { BackendStatus, View } from "./types/app";
import type { SignedUploadOptions } from "./lib/signedUpload";

const DEFAULT_SEARCH = "What did I save about React before demo day?";

export default function App() {
  const [activeView, setActiveView] = useState<View>("Home");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(isSupabaseConfigured ? "connecting" : "local");
  const [syncedMemories, setSyncedMemories] = useState<MemoryRecord[]>([]);
  const [syncedCollections, setSyncedCollections] = useState<CollectionRecord[]>([]);
  const [knowledgeEntities, setKnowledgeEntities] = useState<KnowledgeEntityData>(EMPTY_KNOWLEDGE_ENTITY_DATA);
  const [actionItems, setActionItems] = useState<ActionItemRecord[]>([]);
  const [studyCards, setStudyCards] = useState<StudyCardRecord[]>([]);
  const [openMemoryId, setOpenMemoryId] = useState<string | null>(null);
  const autoProcessingIds = useRef(new Set<string>());
  const activeUserId = useRef<string | null>(null);

  const search = (query: string) => setSearchQuery(query || DEFAULT_SEARCH);
  const openCapture = () => setCaptureOpen(true);

  const content = useMemo(() => {
    if (activeView === "Library") return <LibraryView onSearch={search} openCapture={openCapture} memories={syncedMemories} collections={syncedCollections} onRetry={retryProcessing} onDownload={downloadFile} onDelete={removeMemory} onToggleFavorite={toggleFavorite} onToggleCollection={toggleCollectionMembership} openMemoryId={openMemoryId} onOpenedMemory={() => setOpenMemoryId(null)} />;
    if (activeView === "Activity") return <ActivityView memories={syncedMemories} onOpenMemory={openSearchResult} openCapture={openCapture} />;
    if (activeView === "Collections") return <CollectionsView collections={syncedCollections} memories={syncedMemories} onCreate={createWorkspaceCollection} onDelete={removeWorkspaceCollection} onOpenMemory={openSearchResult} onRemoveMemory={removeCollectionMembership} />;
    if (activeView === "Graph") return <KnowledgeGraphView memories={syncedMemories} entityData={knowledgeEntities} onOpenMemory={openSearchResult} onReanalyze={reanalyzeMemories} openAssistant={() => setAssistantOpen(true)} />;
    if (activeView === "Tasks") return <TasksView items={actionItems} memories={syncedMemories} onChangeStatus={changeActionItemStatus} onOpenMemory={openSearchResult} />;
    if (activeView === "Recaps") return <RecapsView memories={syncedMemories} actionItems={actionItems} onOpenMemory={openSearchResult} openCapture={openCapture} openTasks={() => setActiveView("Tasks")} />;
    if (activeView === "Study") return <StudyView cards={studyCards} memories={syncedMemories} onOpenMemory={openSearchResult} onAnalyzeMemories={analyzeStudyMemories} />;
    return <Dashboard onSearch={search} openCapture={openCapture} openAssistant={() => setAssistantOpen(true)} openActivity={() => setActiveView("Activity")} openLibrary={() => setActiveView("Library")} openTasks={() => setActiveView("Tasks")} openRecaps={() => setActiveView("Recaps")} memories={syncedMemories} actionItems={actionItems} onOpenMemory={openSearchResult} onToggleFavorite={toggleFavorite} onCompleteTask={(id) => changeActionItemStatus(id, "completed")} />;
  }, [activeView, syncedMemories, syncedCollections, knowledgeEntities, actionItems, studyCards, openMemoryId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const initialize = async () => {
      try {
        const user = await connectSupabase();
        const [memories, collections, entities, tasks, cards] = await Promise.all([listMemories(), listCollections(), listKnowledgeEntityData(), listActionItems(), listStudyCards()]);
        if (active) {
          activeUserId.current = user ? user.id : null;
          setAuthUser(user || null);
          setSyncedMemories(memories);
          setSyncedCollections(collections);
          setKnowledgeEntities(entities);
          setActionItems(tasks);
          setStudyCards(cards);
          setBackendStatus("connected");
          void processMemoryBacklog().then(async (backlog) => {
            if (!active || backlog.processed === 0) return;
            const [updatedMemories, updatedEntities, updatedTasks, updatedCards] = await Promise.all([listMemories(), listKnowledgeEntityData(), listActionItems(), listStudyCards()]);
            setSyncedMemories(updatedMemories);
            setKnowledgeEntities(updatedEntities);
            setActionItems(updatedTasks);
            setStudyCards(updatedCards);
          }).catch((backlogError) => console.error("Background processing is unavailable", backlogError));
        }
      } catch (error) {
        console.error("Supabase connection failed", error);
        if (active) setBackendStatus("error");
      }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => onAuthChange((user) => {
    setAuthUser(user);
    if (!user) {
      activeUserId.current = null;
      setSyncedMemories([]);
      setSyncedCollections([]);
      setKnowledgeEntities(EMPTY_KNOWLEDGE_ENTITY_DATA);
      setActionItems([]);
      setStudyCards([]);
      return;
    }
    setBackendStatus("connected");
    if (activeUserId.current === user.id) return;
    activeUserId.current = user.id;
    setSyncedMemories([]);
    setSyncedCollections([]);
    setKnowledgeEntities(EMPTY_KNOWLEDGE_ENTITY_DATA);
    setActionItems([]);
    setStudyCards([]);
    void Promise.all([listMemories(), listCollections(), listKnowledgeEntityData(), listActionItems(), listStudyCards()]).then(([memories, collections, entities, tasks, cards]) => {
      if (activeUserId.current !== user.id) return;
      setSyncedMemories(memories);
      setSyncedCollections(collections);
      setKnowledgeEntities(entities);
      setActionItems(tasks);
      setStudyCards(cards);
    }).catch((error) => console.error("Could not load the signed-in workspace", error));
  }), []);

  useEffect(() => {
    if (!authUser || backendStatus !== "connected") return;
    const pending = syncedMemories
      .filter((memory) => memory.processing_status === "pending" && !autoProcessingIds.current.has(memory.id))
      .slice(0, 3);
    for (const memory of pending) {
      autoProcessingIds.current.add(memory.id);
      void processSavedMemory(memory.id);
    }
  }, [authUser, backendStatus, syncedMemories]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchQuery(""); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setCaptureOpen(true); }
      if (event.key === "Escape") { setSearchQuery(null); setCaptureOpen(false); setAssistantOpen(false); setAuthOpen(false); setMobileNav(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  };

  async function retryProcessing(memoryId: string) {
    try {
      await retryMemoryProcessing(memoryId);
      setSyncedMemories((current) => current.map((memory) => memory.id === memoryId ? { ...memory, processing_status: "pending" } : memory));
      showToast("Processing queued again");
      await processSavedMemory(memoryId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not retry processing");
    }
  }

  async function processSavedMemory(memoryId: string) {
    setSyncedMemories((current) => current.map((memory) => memory.id === memoryId ? { ...memory, processing_status: "processing" } : memory));
    try {
      const result = await processMemoryNow(memoryId);
      const [memories, entities, tasks, cards] = await Promise.all([listMemories(), listKnowledgeEntityData(), listActionItems(), listStudyCards()]);
      setSyncedMemories(memories);
      setKnowledgeEntities(entities);
      setActionItems(tasks);
      setStudyCards(cards);
      if (result?.status === "completed") showToast("AI processing complete");
      else if (result?.status === "retry_queued") showToast("Processing will retry automatically");
    } catch (error) {
      const memories = await listMemories().catch(() => null);
      if (memories) setSyncedMemories(memories);
      showToast(error instanceof Error ? error.message : "AI processing is unavailable");
    }
  }

  async function downloadFile(path: string, filename: string) {
    try {
      await downloadMemoryFile(path, filename);
      showToast(`Downloading “${filename}”`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not download this file");
    }
  }

  async function removeMemory(memory: MemoryRecord) {
    try {
      await deleteMemory(memory.id, memory.storage_path);
      setSyncedMemories((current) => current.filter((item) => item.id !== memory.id));
      setSyncedCollections((current) => current.map((collection) => ({ ...collection, memory_ids: collection.memory_ids.filter((id) => id !== memory.id) })));
      setActionItems((current) => current.filter((item) => item.memory_id !== memory.id));
      setStudyCards((current) => current.filter((card) => card.memory_id !== memory.id));
      showToast(`“${memory.title}” was permanently deleted`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete this memory");
      throw error;
    }
  }

  async function toggleFavorite(memoryId: string, isFavorite: boolean) {
    const previous = syncedMemories.find((memory) => memory.id === memoryId)?.is_favorite ?? false;
    setSyncedMemories((current) => current.map((memory) => memory.id === memoryId ? { ...memory, is_favorite: isFavorite } : memory));
    try {
      await setMemoryFavorite(memoryId, isFavorite);
      showToast(isFavorite ? "Added to favorites" : "Removed from favorites");
    } catch (error) {
      setSyncedMemories((current) => current.map((memory) => memory.id === memoryId ? { ...memory, is_favorite: previous } : memory));
      showToast(error instanceof Error ? error.message : "Could not update favorite");
    }
  }

  async function createWorkspaceCollection(name: string) {
    const collection = await createCollection(name);
    setSyncedCollections((current) => [collection, ...current]);
    showToast(`Created “${collection.name}”`);
    return collection;
  }

  async function removeWorkspaceCollection(collectionId: string) {
    await deleteCollection(collectionId);
    setSyncedCollections((current) => current.filter((collection) => collection.id !== collectionId));
    showToast("Collection deleted; memories were kept");
  }

  async function toggleCollectionMembership(collectionId: string, memoryId: string) {
    const collection = syncedCollections.find((item) => item.id === collectionId);
    if (!collection) return;
    const removing = collection.memory_ids.includes(memoryId);
    try {
      if (removing) await removeMemoryFromCollection(collectionId, memoryId);
      else await addMemoryToCollection(collectionId, memoryId);
      setSyncedCollections((current) => current.map((item) => item.id === collectionId ? {
        ...item,
        memory_ids: removing ? item.memory_ids.filter((id) => id !== memoryId) : [...item.memory_ids, memoryId],
      } : item));
      showToast(removing ? `Removed from “${collection.name}”` : `Added to “${collection.name}”`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update collection");
    }
  }

  async function removeCollectionMembership(collectionId: string, memoryId: string) {
    try {
      await removeMemoryFromCollection(collectionId, memoryId);
      setSyncedCollections((current) => current.map((item) => item.id === collectionId ? { ...item, memory_ids: item.memory_ids.filter((id) => id !== memoryId) } : item));
      showToast("Removed from collection");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not remove this memory");
    }
  }

  async function reanalyzeMemories(memoryIds: string[], onProgress?: (completed: number, total: number) => void) {
    const queuedIds = await requestMemoryReanalysis(memoryIds);
    if (!queuedIds.length) throw new Error("These memories are already analyzed or currently processing.");
    setSyncedMemories((current) => current.map((memory) => queuedIds.includes(memory.id) ? { ...memory, processing_status: "pending" } : memory));
    let completed = 0;
    let processed = 0;
    let firstError: unknown = null;
    onProgress?.(0, queuedIds.length);
    for (const memoryId of queuedIds) {
      try {
        const result = await processMemoryNow(memoryId);
        if (result?.status === "completed") completed += 1;
      } catch (error) {
        firstError ??= error;
      }
      processed += 1;
      onProgress?.(processed, queuedIds.length);
    }
    const [memories, entities, tasks, cards] = await Promise.all([listMemories(), listKnowledgeEntityData(), listActionItems(), listStudyCards()]);
    setSyncedMemories(memories);
    setKnowledgeEntities(entities);
    setActionItems(tasks);
    setStudyCards(cards);
    if (completed) showToast(`Graph analysis complete for ${completed} ${completed === 1 ? "memory" : "memories"}`);
    if (!completed && firstError) throw firstError;
    return completed;
  }

  async function analyzeStudyMemories(memoryIds: string[], onProgress?: (completed: number, total: number) => void) {
    const queuedIds = await requestStudyReanalysis(memoryIds);
    if (!queuedIds.length) throw new Error("These memories are already analyzed or currently processing.");
    setSyncedMemories((current) => current.map((memory) => queuedIds.includes(memory.id) ? { ...memory, processing_status: "pending" } : memory));
    let completed = 0;
    let processed = 0;
    let firstError: unknown = null;
    onProgress?.(0, queuedIds.length);
    for (const memoryId of queuedIds) {
      try {
        const result = await processMemoryNow(memoryId);
        if (result?.status === "completed") completed += 1;
      } catch (error) {
        firstError ??= error;
      }
      processed += 1;
      onProgress?.(processed, queuedIds.length);
    }
    const [memories, entities, tasks, cards] = await Promise.all([listMemories(), listKnowledgeEntityData(), listActionItems(), listStudyCards()]);
    setSyncedMemories(memories);
    setKnowledgeEntities(entities);
    setActionItems(tasks);
    setStudyCards(cards);
    if (completed) showToast(`Study analysis complete for ${completed} ${completed === 1 ? "memory" : "memories"}`);
    if (!completed && firstError) throw firstError;
    return completed;
  }

  async function changeActionItemStatus(id: string, status: Exclude<ActionItemStatus, "suggested">) {
    const previous = actionItems;
    if (status === "dismissed") setActionItems((current) => current.filter((item) => item.id !== id));
    else setActionItems((current) => current.map((item) => item.id === id ? { ...item, status, completed_at: status === "completed" ? new Date().toISOString() : null } : item));
    try {
      await updateActionItemStatus(id, status);
      showToast(status === "accepted" ? "Added to your tasks" : status === "completed" ? "Task completed" : "Suggestion dismissed");
    } catch (error) {
      setActionItems(previous);
      showToast(error instanceof Error ? error.message : "Could not update this task");
    }
  }

  function openSearchResult(memory: MemoryRecord) {
    setSyncedMemories((current) => current.some((item) => item.id === memory.id) ? current : [memory, ...current]);
    setSearchQuery(null);
    setOpenMemoryId(memory.id);
    setActiveView("Library");
  }

  const saveMemory = async (memory: MemoryInput, file?: File, uploadOptions?: SignedUploadOptions) => {
    if (!isSupabaseConfigured) {
      showToast("Add your Supabase key to .env.local to save memories");
      return;
    }
    try {
      const savedMemory = file ? await createFileMemory(file, memory.title, uploadOptions) : await createMemory(memory);
      setSyncedMemories((current) => [savedMemory, ...current]);
      setCaptureOpen(false);
      setBackendStatus("connected");
      showToast(file ? `“${memory.title}” uploaded privately and queued` : `“${memory.title}” is synced to Supabase`);
      void processSavedMemory(savedMemory.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof DuplicateMemoryError) {
        showToast(error.message);
        throw error;
      }
      setBackendStatus("error");
      const message = error instanceof Error ? error.message : "Unknown Supabase error";
      showToast(`Could not save: ${message}`);
      throw error;
    }
  };

  const profileName = authUser?.is_anonymous ? "Guest workspace" : authUser?.email?.split("@")[0] || "Neuron user";
  const profileSubtitle = authUser?.is_anonymous ? "Make this account permanent" : "Synced account";

  return (
    <div className="app-shell">
      <div className={mobileNav ? "mobile-sidebar open" : "mobile-sidebar"}>
        <div className="mobile-sidebar-backdrop" onClick={() => setMobileNav(false)} />
        <Sidebar activeView={activeView} setActiveView={(view) => { setActiveView(view); setMobileNav(false); }} openCapture={() => { setCaptureOpen(true); setMobileNav(false); }} profileName={profileName} profileSubtitle={profileSubtitle} onProfileClick={() => { setAuthOpen(true); setMobileNav(false); }} onSearch={(query) => { search(query); setMobileNav(false); }} onSettingsClick={() => { setAuthOpen(true); setMobileNav(false); }} />
      </div>
      <div className="desktop-sidebar"><Sidebar activeView={activeView} setActiveView={setActiveView} openCapture={openCapture} profileName={profileName} profileSubtitle={profileSubtitle} onProfileClick={() => setAuthOpen(true)} onSearch={search} onSettingsClick={() => setAuthOpen(true)} /></div>
      <div className="workspace"><Header onSearch={search} openAssistant={() => setAssistantOpen(true)} openMobileNav={() => setMobileNav(true)} backendStatus={backendStatus} openActivity={() => setActiveView("Activity")} />{content}</div>

      <AnimatePresence>
        {authOpen && <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><AuthModal user={authUser} onClose={() => setAuthOpen(false)} /></motion.div>}
      </AnimatePresence>

      <AnimatePresence>
        {(captureOpen || searchQuery !== null) && (
          <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) { setCaptureOpen(false); setSearchQuery(null); } }}>
            {captureOpen ? <CaptureModal onClose={() => setCaptureOpen(false)} onSave={saveMemory} /> : <SearchModal query={searchQuery ?? ""} onClose={() => setSearchQuery(null)} onOpenMemory={openSearchResult} />}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {assistantOpen && <><motion.div className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAssistantOpen(false)} /><AssistantPanel onClose={() => setAssistantOpen(false)} onOpenMemory={(memory) => { setAssistantOpen(false); openSearchResult(memory); }} /></>}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><span><Check size={15} /></span>{toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
