import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Header, Sidebar } from "./components/layout/AppLayout";
import { AssistantPanel, CaptureModal, SearchModal } from "./components/overlays/AppOverlays";
import { AuthModal } from "./features/auth/AuthModal";
import { Dashboard } from "./features/dashboard/Dashboard";
import { CollectionsView, GraphView, LibraryView } from "./features/views/FeatureViews";
import {
  connectSupabase,
  createMemory,
  isSupabaseConfigured,
  listMemories,
  onAuthChange,
  type MemoryInput,
  type MemoryRecord,
} from "./lib/supabase";
import type { BackendStatus, View } from "./types/app";

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

  const search = (query: string) => setSearchQuery(query || DEFAULT_SEARCH);
  const openCapture = () => setCaptureOpen(true);

  const content = useMemo(() => {
    if (activeView === "Library") return <LibraryView onSearch={search} openCapture={openCapture} memories={syncedMemories} />;
    if (activeView === "Collections") return <CollectionsView />;
    if (activeView === "Graph") return <GraphView />;
    return <Dashboard onSearch={search} openCapture={openCapture} openAssistant={() => setAssistantOpen(true)} />;
  }, [activeView, syncedMemories]);

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

  const saveMemory = async (memory: MemoryInput) => {
    if (!isSupabaseConfigured) {
      showToast("Add your Supabase key to .env.local to save memories");
      return;
    }
    try {
      const savedMemory = await createMemory(memory);
      setSyncedMemories((current) => [savedMemory, ...current]);
      setCaptureOpen(false);
      setBackendStatus("connected");
      showToast(`“${memory.title}” is synced to Supabase`);
    } catch (error) {
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
            {captureOpen ? <CaptureModal onClose={() => setCaptureOpen(false)} onSave={saveMemory} /> : <SearchModal query={searchQuery ?? ""} onClose={() => setSearchQuery(null)} />}
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
