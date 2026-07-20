import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Header, Sidebar } from "./components/layout/AppLayout";
import { AssistantPanel, CaptureModal, SearchModal } from "./components/overlays/AppOverlays";
import { AuthModal } from "./features/auth/AuthModal";
import { Dashboard } from "./features/dashboard/Dashboard";
import { CollectionsView, GraphView, LibraryView } from "./features/views/FeatureViews";
import {
  connectSupabase,
  createFileMemory,
  createMemory,
  deleteMemory,
  downloadMemoryFile,
  isSupabaseConfigured,
  listMemories,
  onAuthChange,
  processMemoryBacklog,
  processMemoryNow,
  retryMemoryProcessing,
  DuplicateMemoryError,
  type MemoryInput,
  type MemoryRecord,
  type MemorySearchResult,
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
  const [openMemoryId, setOpenMemoryId] = useState<string | null>(null);
  const autoProcessingIds = useRef(new Set<string>());

  const search = (query: string) => setSearchQuery(query || DEFAULT_SEARCH);
  const openCapture = () => setCaptureOpen(true);

  const content = useMemo(() => {
    if (activeView === "Library") return <LibraryView onSearch={search} openCapture={openCapture} memories={syncedMemories} onRetry={retryProcessing} onDownload={downloadFile} onDelete={removeMemory} openMemoryId={openMemoryId} onOpenedMemory={() => setOpenMemoryId(null)} />;
    if (activeView === "Collections") return <CollectionsView />;
    if (activeView === "Graph") return <GraphView />;
    return <Dashboard onSearch={search} openCapture={openCapture} openAssistant={() => setAssistantOpen(true)} />;
  }, [activeView, syncedMemories, openMemoryId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const initialize = async () => {
      try {
        const user = await connectSupabase();
        const memories = await listMemories();
        if (active) {
          setAuthUser(user || null);
          setSyncedMemories(memories);
          setBackendStatus("connected");
          void processMemoryBacklog().then(async (backlog) => {
            if (!active || backlog.processed === 0) return;
            setSyncedMemories(await listMemories());
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
    if (user) setBackendStatus("connected");
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
      const memories = await listMemories();
      setSyncedMemories(memories);
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
      showToast(`“${memory.title}” was permanently deleted`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete this memory");
      throw error;
    }
  }

  function openSearchResult(memory: MemorySearchResult) {
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
        <Sidebar activeView={activeView} setActiveView={(view) => { setActiveView(view); setMobileNav(false); }} openCapture={() => { setCaptureOpen(true); setMobileNav(false); }} profileName={profileName} profileSubtitle={profileSubtitle} onProfileClick={() => { setAuthOpen(true); setMobileNav(false); }} />
      </div>
      <div className="desktop-sidebar"><Sidebar activeView={activeView} setActiveView={setActiveView} openCapture={openCapture} profileName={profileName} profileSubtitle={profileSubtitle} onProfileClick={() => setAuthOpen(true)} /></div>
      <div className="workspace"><Header onSearch={search} openAssistant={() => setAssistantOpen(true)} openMobileNav={() => setMobileNav(true)} backendStatus={backendStatus} />{content}</div>

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
        {assistantOpen && <><motion.div className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAssistantOpen(false)} /><AssistantPanel onClose={() => setAssistantOpen(false)} /></>}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><span><Check size={15} /></span>{toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
