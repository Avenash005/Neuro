import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Command,
  FileText,
  FolderKanban,
  Globe2,
  Grid2X2,
  Headphones,
  Home,
  Layers3,
  Link2,
  ListTodo,
  Menu,
  Mic,
  Network,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectSupabase,
  createMemory,
  isSupabaseConfigured,
  listMemories,
  type MemoryInput,
  type MemoryRecord,
} from "./lib/supabase";

type View = "Home" | "Library" | "Collections" | "Graph";
type BackendStatus = "connecting" | "connected" | "local" | "error";

type Item = {
  title: string;
  description: string;
  meta: string;
  tag: string;
  icon: typeof FileText;
  color: string;
};

const recentItems: Item[] = [
  {
    title: "Scaling React without losing your mind",
    description: "Rendering patterns, profiling notes, and practical rules for large component trees.",
    meta: "Article · 14 min read",
    tag: "React",
    icon: Globe2,
    color: "violet",
  },
  {
    title: "Q3 product thinking",
    description: "Voice memo from the walk home — activation, retention loops, and a simpler onboarding idea.",
    meta: "Voice note · 08:42",
    tag: "Neuron",
    icon: Headphones,
    color: "orange",
  },
  {
    title: "The Mom Test — highlights",
    description: "How to talk to customers and learn if your business is a good idea when everyone is lying.",
    meta: "PDF · 24 highlights",
    tag: "Research",
    icon: FileText,
    color: "blue",
  },
];

const searchResults = [
  {
    title: "Scaling React without losing your mind",
    detail: "You saved this 3 days before Buildspace Demo Day. It covers memoization and virtualization.",
    match: "96% match",
    icon: Globe2,
  },
  {
    title: "Frontend performance checklist",
    detail: "A code note from Project Atlas with related React profiling steps.",
    match: "89% match",
    icon: Code2,
  },
  {
    title: "Demo Day preparation notes",
    detail: "Mentions the optimization article and your plan to test the dashboard render path.",
    match: "84% match",
    icon: FileText,
  },
];

const collections = [
  { name: "Neuron", count: 42, color: "#6657d9", initials: "NE" },
  { name: "Web development", count: 128, color: "#168c75", initials: "WD" },
  { name: "Startup library", count: 76, color: "#de793d", initials: "SL" },
  { name: "Design references", count: 51, color: "#b45079", initials: "DR" },
];

function Logo() {
  return (
    <div className="brand-mark" aria-label="Neuron">
      <span /><span /><span /><span />
    </div>
  );
}

function Sidebar({ activeView, setActiveView, openCapture }: { activeView: View; setActiveView: (view: View) => void; openCapture: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const nav = [
    { label: "Home" as View, icon: Home },
    { label: "Library" as View, icon: Layers3 },
    { label: "Collections" as View, icon: FolderKanban },
    { label: "Graph" as View, icon: Network },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-head">
        <div className="brand-lockup"><Logo />{!collapsed && <span>neuron</span>}</div>
        <button className="icon-button sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><PanelLeftClose size={18} /></button>
      </div>
      <button className="capture-button" onClick={openCapture}><Plus size={18} />{!collapsed && <span>Quick capture</span>}</button>
      <nav className="side-nav" aria-label="Primary navigation">
        {nav.map(({ label, icon: Icon }) => (
          <button key={label} className={activeView === label ? "active" : ""} onClick={() => setActiveView(label)} title={label}>
            <Icon size={19} strokeWidth={1.8} />{!collapsed && <span>{label === "Graph" ? "Knowledge graph" : label}</span>}
          </button>
        ))}
      </nav>
      {!collapsed && (
        <div className="sidebar-section">
          <div className="section-label"><span>Favorites</span><Plus size={14} /></div>
          <button><span className="nav-dot violet" />Neuron</button>
          <button><span className="nav-dot green" />Web development</button>
          <button><span className="nav-dot orange" />Startup library</button>
        </div>
      )}
      <div className="sidebar-bottom">
        <button title="Settings"><Settings size={19} />{!collapsed && <span>Settings</span>}</button>
        <button className="profile-button" title="Profile"><span className="avatar">AV</span>{!collapsed && <span className="profile-copy"><strong>Avenash</strong><small>Personal space</small></span>}</button>
      </div>
    </aside>
  );
}

function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <form className="search-box" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
      <div className="search-icon"><Sparkles size={20} /></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask your second brain anything..." aria-label="Semantic search" />
      <button type="submit" aria-label="Search"><ArrowRight size={19} /></button>
      <span className="shortcut"><Command size={12} /> K</span>
    </form>
  );
}

function Header({ onSearch, openAssistant, openMobileNav, backendStatus }: { onSearch: (query: string) => void; openAssistant: () => void; openMobileNav: () => void; backendStatus: BackendStatus }) {
  const statusLabel = backendStatus === "connected" ? "Supabase synced" : backendStatus === "connecting" ? "Connecting" : backendStatus === "error" ? "Setup needed" : "Local mode";
  return (
    <header className="topbar">
      <button className="mobile-menu icon-button" onClick={openMobileNav} aria-label="Open menu"><Menu size={20} /></button>
      <div className="mobile-brand"><Logo /><span>neuron</span></div>
      <div className="header-search"><SearchBox onSearch={onSearch} /></div>
      <div className="top-actions">
        <span className={`sync-status ${backendStatus}`}><i />{statusLabel}</span>
        <button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><span /></button>
        <button className="ask-ai" onClick={openAssistant}><Sparkles size={16} />Ask Neuron</button>
      </div>
    </header>
  );
}

function Dashboard({ onSearch, openCapture, openAssistant }: { onSearch: (query: string) => void; openCapture: () => void; openAssistant: () => void }) {
  const [checkedTasks, setCheckedTasks] = useState<number[]>([1]);
  const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  const toggleTask = (index: number) => setCheckedTasks((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);

  return (
    <main className="main-content">
      <motion.section className="welcome" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="eyebrow"><span />{today}</div>
        <h1>Good morning, Avenash.</h1>
        <p>Your mind has been busy. Here’s what’s worth remembering.</p>
        <div className="hero-search"><SearchBox onSearch={onSearch} /></div>
        <div className="prompt-chips">
          <button onClick={() => onSearch("What did I learn this week?")}>What did I learn this week?</button>
          <button onClick={() => onSearch("Find my React notes")}>Find my React notes</button>
          <button onClick={openAssistant}>Plan my focus for today</button>
        </div>
      </motion.section>

      <section className="dashboard-grid">
        <motion.article className="card daily-brief" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }}>
          <div className="card-heading">
            <div><span className="card-kicker"><Sparkles size={14} /> Daily brief</span><h2>Your ideas are starting to connect</h2></div>
            <button className="more-link" onClick={openAssistant}>Explore <ArrowRight size={15} /></button>
          </div>
          <p>You saved <strong>8 new items</strong> this week. Your notes on React performance share a strong thread with Project Neuron’s offline architecture.</p>
          <div className="connection-row">
            <div className="connection-item"><span className="mini-icon purple"><Code2 size={17} /></span><span><strong>React patterns</strong><small>12 connected items</small></span></div>
            <div className="connector"><span /><Zap size={14} /><span /></div>
            <div className="connection-item"><span className="mini-icon green"><Brain size={17} /></span><span><strong>Project Neuron</strong><small>18 connected items</small></span></div>
          </div>
          <div className="insight"><span className="insight-icon"><Sparkles size={15} /></span><p><strong>A useful connection:</strong> The local-first sync approach you bookmarked could simplify Neuron’s offline mode.</p></div>
        </motion.article>

        <motion.article className="card focus-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12 }}>
          <div className="card-heading"><div><span className="card-kicker neutral"><ListTodo size={14} /> Today</span><h2>Three things to move forward</h2></div><span className="task-count">1 / 3</span></div>
          <div className="tasks">
            {["Review Neuron onboarding flow", "Send research summary to Maya", "Outline offline sync architecture"].map((task, index) => (
              <button key={task} className={`task ${checkedTasks.includes(index) ? "done" : ""}`} onClick={() => toggleTask(index)}>
                <span className="check">{checkedTasks.includes(index) && <Check size={13} />}</span><span>{task}</span>{index === 0 && <small>Neuron</small>}
              </button>
            ))}
          </div>
          <button className="text-button">View all tasks <ArrowRight size={14} /></button>
        </motion.article>
      </section>

      <section className="section-block">
        <div className="section-header"><div><h2>Pick up where you left off</h2><p>Your most recent thoughts and discoveries</p></div><button className="text-button">View library <ArrowRight size={15} /></button></div>
        <div className="recent-grid">
          {recentItems.map((item, index) => <RecentCard key={item.title} item={item} index={index} />)}
        </div>
      </section>

      <section className="lower-grid">
        <article className="card activity-card">
          <div className="card-heading"><div><span className="card-kicker neutral"><Clock3 size={14} /> Memory stream</span><h2>Today in your brain</h2></div><button className="icon-button"><ChevronDown size={17} /></button></div>
          <div className="timeline">
            <TimelineItem time="09:42" icon={Link2} title="Saved Linear's product principles" detail="Added to Design references" />
            <TimelineItem time="08:15" icon={Mic} title="Recorded a voice thought" detail="AI extracted 3 ideas and 2 tasks" />
            <TimelineItem time="Yesterday" icon={BookOpen} title="Read 4 pages of The Mom Test" detail="24 highlights in total" />
          </div>
        </article>
        <article className="card streak-card">
          <div className="streak-top"><div className="streak-icon"><Zap size={20} /></div><span>Learning streak</span><strong>12 days</strong><p>You’ve added something meaningful every day.</p></div>
          <div className="week-dots">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <div key={`${day}-${index}`}><span className={index < 5 ? "filled" : index === 5 ? "today" : ""}>{index < 5 && <Check size={11} />}</span><small>{day}</small></div>)}</div>
          <button onClick={openCapture}>Keep it going <Plus size={15} /></button>
        </article>
      </section>

      <button className="floating-capture" onClick={openCapture}><Plus size={20} /><span>Capture</span></button>
    </main>
  );
}

function RecentCard({ item, index }: { item: Item; index: number }) {
  const Icon = item.icon;
  const [favorite, setFavorite] = useState(index === 2);
  return (
    <motion.article className="recent-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 + index * .05 }} whileHover={{ y: -4 }}>
      <div className="recent-top"><span className={`file-icon ${item.color}`}><Icon size={19} /></span><button className={favorite ? "starred" : ""} onClick={() => setFavorite(!favorite)} aria-label="Favorite"><Star size={17} fill={favorite ? "currentColor" : "none"} /></button></div>
      <span className="item-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p><div className="recent-meta"><span>{item.meta}</span><span>2d ago</span></div>
    </motion.article>
  );
}

function TimelineItem({ time, icon: Icon, title, detail }: { time: string; icon: typeof Link2; title: string; detail: string }) {
  return <div className="timeline-item"><span className="time">{time}</span><span className="timeline-icon"><Icon size={15} /></span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}

function LibraryView({ onSearch, openCapture, memories }: { onSearch: (query: string) => void; openCapture: () => void; memories: MemoryRecord[] }) {
  const syncedItems: Item[] = memories.map((memory) => ({
    title: memory.title,
    description: memory.content || `${memory.kind} captured in Neuron`,
    meta: `${memory.kind} · ${memory.processing_status === "ready" ? "AI processed" : "Processing"}`,
    tag: "Synced",
    icon: memory.kind === "Voice" ? Mic : memory.kind === "Link" ? Link2 : memory.kind === "Upload" ? UploadCloud : FileText,
    color: memory.kind === "Voice" ? "orange" : memory.kind === "Link" ? "green" : "violet",
  }));
  const allItems = [...syncedItems, ...recentItems, { title: "Local-first software", description: "Principles for resilient apps that work without a network connection.", meta: "Article · 9 min", tag: "Architecture", icon: Globe2, color: "green" }, { title: "Vector search experiments", description: "Benchmarks and learnings from hybrid semantic retrieval.", meta: "Code note · 6 blocks", tag: "AI", icon: Code2, color: "violet" }];
  return <main className="page-content"><PageIntro eyebrow="Your memory" title="Library" description="Everything you’ve saved, understood and connected." action={<button className="primary-action" onClick={openCapture}><Plus size={17} /> Add memory</button>} /><div className="library-toolbar"><div className="compact-search"><Search size={17} /><input placeholder="Search your library" onKeyDown={(e) => { if (e.key === "Enter") onSearch(e.currentTarget.value); }} /></div><button><Grid2X2 size={16} /> All types <ChevronDown size={14} /></button><button>Recently added <ChevronDown size={14} /></button></div><div className="library-list">{allItems.map((item, index) => { const Icon = item.icon; return <article key={item.title} className="library-row"><span className={`file-icon ${item.color}`}><Icon size={19} /></span><div><span>{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p></div><small>{index + 1}d ago</small><button><Star size={16} /></button></article>; })}</div></main>;
}

function CollectionsView() {
  return <main className="page-content"><PageIntro eyebrow="Organized by AI" title="Collections" description="Living spaces that grow and reorganize with your knowledge." action={<button className="primary-action"><Plus size={17} /> New collection</button>} /><div className="collections-grid">{collections.map((collection, index) => <motion.article key={collection.name} className="collection-card" whileHover={{ y: -4 }}><div className="collection-visual" style={{ background: `linear-gradient(145deg, ${collection.color}18, ${collection.color}08)` }}><span style={{ backgroundColor: collection.color }}>{collection.initials}</span><div className="paper-stack one" /><div className="paper-stack two" /></div><div className="collection-copy"><span>{index < 2 ? "Favorite" : "Smart collection"}</span><h3>{collection.name}</h3><p>{collection.count} memories · Updated today</p></div></motion.article>)}</div></main>;
}

function GraphView() {
  return <main className="page-content graph-page"><PageIntro eyebrow="42 connections this week" title="Knowledge graph" description="See how your ideas, projects and sources shape each other." action={<button className="primary-action"><Sparkles size={17} /> Find connections</button>} /><div className="graph-canvas"><div className="graph-tip"><Sparkles size={15} /><span>Neuron found 3 new links in your recent notes</span><X size={14} /></div><svg viewBox="0 0 900 520" role="img" aria-label="Interactive knowledge graph"><g className="graph-lines"><line x1="450" y1="255" x2="230" y2="160"/><line x1="450" y1="255" x2="686" y2="140"/><line x1="450" y1="255" x2="690" y2="360"/><line x1="450" y1="255" x2="220" y2="365"/><line x1="230" y1="160" x2="120" y2="270"/><line x1="230" y1="160" x2="330" y2="70"/><line x1="686" y1="140" x2="790" y2="250"/><line x1="690" y1="360" x2="545" y2="442"/><line x1="220" y1="365" x2="95" y2="425"/></g><GraphNode x={450} y={255} r={64} label="Neuron" sub="Project" color="#6657d9" main/><GraphNode x={230} y={160} r={45} label="React" sub="Topic" color="#4c9db6"/><GraphNode x={686} y={140} r={48} label="AI memory" sub="Topic" color="#b45d8b"/><GraphNode x={690} y={360} r={43} label="Offline first" sub="Idea" color="#168c75"/><GraphNode x={220} y={365} r={46} label="Product" sub="Collection" color="#de793d"/><GraphNode x={120} y={270} r={32} label="Redux" sub="Tech" color="#806cd9"/><GraphNode x={330} y={70} r={31} label="Atlas" sub="Project" color="#4d7db4"/><GraphNode x={790} y={250} r={31} label="Qdrant" sub="Tech" color="#a65b79"/><GraphNode x={545} y={442} r={33} label="Sync" sub="Idea" color="#4a9b79"/><GraphNode x={95} y={425} r={29} label="Maya" sub="Person" color="#bd7550"/></svg><div className="graph-legend"><span><i className="project" />Projects</span><span><i className="topic" />Topics</span><span><i className="source" />Sources</span><span><i className="people" />People</span></div></div></main>;
}

function GraphNode({ x, y, r, label, sub, color, main = false }: { x: number; y: number; r: number; label: string; sub: string; color: string; main?: boolean }) {
  return <g className={`graph-node ${main ? "main" : ""}`}><circle cx={x} cy={y} r={r + 8} fill={`${color}12`} /><circle cx={x} cy={y} r={r} fill={color} /><text x={x} y={y - 3} textAnchor="middle" fill="white" className="node-label">{label}</text><text x={x} y={y + 17} textAnchor="middle" fill="white" opacity=".72" className="node-sub">{sub}</text></g>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action: React.ReactNode }) {
  return <section className="page-intro"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</section>;
}

function CaptureModal({ onClose, onSave }: { onClose: () => void; onSave: (memory: MemoryInput) => Promise<void> }) {
  const [mode, setMode] = useState("Note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const modes = [{ label: "Note", icon: FileText }, { label: "Upload", icon: UploadCloud }, { label: "Link", icon: Link2 }, { label: "Voice", icon: Mic }];
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || `${mode} memory`, content: body.trim(), kind: mode as MemoryInput["kind"] });
    } finally {
      setSaving(false);
    }
  };
  return <motion.div className="modal-card capture-modal" initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 8 }} role="dialog" aria-modal="true"><div className="modal-header"><div><span className="card-kicker"><Plus size={14} /> Add to your brain</span><h2>Capture a memory</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="capture-tabs">{modes.map(({ label, icon: Icon }) => <button key={label} className={mode === label ? "active" : ""} onClick={() => setMode(label)}><Icon size={17} />{label}</button>)}</div>{mode === "Note" ? <div className="note-form"><input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this thought a title..." /><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Start typing. Neuron will organize, tag and connect it for you..." /><div className="ai-processing"><Sparkles size={15} /><span>Auto-summary, tags and connections are on</span></div></div> : <div className="drop-zone"><span className="drop-icon">{mode === "Upload" ? <UploadCloud /> : mode === "Voice" ? <Mic /> : <Link2 />}</span><h3>{mode === "Upload" ? "Drop anything here" : mode === "Voice" ? "Record a thought" : "Paste a link to remember"}</h3><p>{mode === "Upload" ? "PDFs, images, audio, video, docs and more" : "Neuron will process and connect it automatically"}</p><button>{mode === "Voice" ? "Start recording" : mode === "Link" ? "Paste from clipboard" : "Choose files"}</button></div>}<div className="modal-footer"><span><Command size={12} /> Enter to save</span><div><button className="cancel" onClick={onClose} disabled={saving}>Cancel</button><button className="save" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save memory"} <ArrowRight size={15} /></button></div></div></motion.div>;
}

function SearchModal({ query, onClose }: { query: string; onClose: () => void }) {
  const [value, setValue] = useState(query);
  return <motion.div className="modal-card search-modal" initial={{ opacity: 0, scale: .97, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} role="dialog" aria-modal="true"><div className="modal-search"><Sparkles size={20} /><input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ask your second brain..." /><button onClick={onClose}><span>ESC</span><X size={18} /></button></div>{value ? <div className="search-response"><div className="answer-summary"><span><Brain size={18} /></span><p>I found <strong>3 memories</strong> that match your intent, including context around when and why you saved them.</p></div><span className="results-label">Best matches</span>{searchResults.map(({ title, detail, match, icon: Icon }) => <button className="result-row" key={title}><span className="result-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><em>{match}</em></button>)}</div> : <div className="empty-search"><Brain size={34} /><h3>Search by meaning, not just words</h3><p>Try “What was that article I saved before demo day?”</p></div>}<div className="search-footer"><span><Sparkles size={13} /> Semantic search across 1,248 memories</span><span>↑↓ navigate · ↵ open</span></div></motion.div>;
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  return <motion.aside className="assistant-panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }}><div className="assistant-head"><div><span className="assistant-logo"><Brain size={19} /></span><span><strong>Neuron</strong><small>Your personal thinking partner</small></span></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="assistant-body"><div className="assistant-intro"><span><Sparkles size={18} /></span><h2>What are we thinking about?</h2><p>I can search, connect, summarize and build on everything you’ve saved.</p></div><div className="suggestions">{["Summarize what I learned this week", "Connect my notes about offline apps", "Turn recent notes into a project plan"].map((text) => <button key={text} onClick={() => setMessage(text)}>{text}<ArrowRight size={14} /></button>)}</div>{sent && <div className="chat-bubble"><p>{message}</p><span>Thinking across your memories…</span></div>}</div><form className="assistant-input" onSubmit={(e) => { e.preventDefault(); if (message) setSent(true); }}><textarea value={message} onChange={(e) => { setMessage(e.target.value); setSent(false); }} placeholder="Ask Neuron..." /><div><button type="button"><Mic size={17} /></button><button className="send" type="submit"><ArrowRight size={17} /></button></div></form></motion.aside>;
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("Home");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(isSupabaseConfigured ? "connecting" : "local");
  const [syncedMemories, setSyncedMemories] = useState<MemoryRecord[]>([]);

  const content = useMemo(() => {
    if (activeView === "Library") return <LibraryView onSearch={(query) => setSearchQuery(query)} openCapture={() => setCaptureOpen(true)} memories={syncedMemories} />;
    if (activeView === "Collections") return <CollectionsView />;
    if (activeView === "Graph") return <GraphView />;
    return <Dashboard onSearch={(query) => setSearchQuery(query || "What did I save about React before demo day?")} openCapture={() => setCaptureOpen(true)} openAssistant={() => setAssistantOpen(true)} />;
  }, [activeView, syncedMemories]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const initialize = async () => {
      try {
        await connectSupabase();
        const memories = await listMemories();
        if (active) {
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchQuery(""); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setCaptureOpen(true); }
      if (event.key === "Escape") { setSearchQuery(null); setCaptureOpen(false); setAssistantOpen(false); setMobileNav(false); }
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

  return <div className="app-shell">
    <div className={mobileNav ? "mobile-sidebar open" : "mobile-sidebar"}><div className="mobile-sidebar-backdrop" onClick={() => setMobileNav(false)} /><Sidebar activeView={activeView} setActiveView={(view) => { setActiveView(view); setMobileNav(false); }} openCapture={() => { setCaptureOpen(true); setMobileNav(false); }} /></div>
    <div className="desktop-sidebar"><Sidebar activeView={activeView} setActiveView={setActiveView} openCapture={() => setCaptureOpen(true)} /></div>
    <div className="workspace"><Header onSearch={(query) => setSearchQuery(query || "What did I save about React before demo day?")} openAssistant={() => setAssistantOpen(true)} openMobileNav={() => setMobileNav(true)} backendStatus={backendStatus} />{content}</div>
    <AnimatePresence>{(captureOpen || searchQuery !== null) && <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) { setCaptureOpen(false); setSearchQuery(null); } }}>{captureOpen ? <CaptureModal onClose={() => setCaptureOpen(false)} onSave={saveMemory} /> : <SearchModal query={searchQuery ?? ""} onClose={() => setSearchQuery(null)} />}</motion.div>}</AnimatePresence>
    <AnimatePresence>{assistantOpen && <><motion.div className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAssistantOpen(false)} /><AssistantPanel onClose={() => setAssistantOpen(false)} /></>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><span><Check size={15} /></span>{toast}</motion.div>}</AnimatePresence>
  </div>;
}
