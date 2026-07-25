import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  FileText,
  LoaderCircle,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  X,
  Mic,
  Paperclip,
  ChevronRight,
  Sparkle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addSidekickNote,
  deleteSidekickNote,
  listSidekickNotes,
  listSidekickSessions,
  runLiveAssist,
  saveSidekickSession,
  askNeuron,
  type CollectionRecord,
  type LiveAssistBriefing,
  type LiveAssistItem,
  type LiveAssistMode,
  type MemoryRecord,
  type SidekickNoteRecord,
  type SidekickSessionRecord,
  type AssistantAnswer,
} from "../../lib/supabase";
import { buildSidekickSessionTitle, formatLiveAssistBriefing, toggleMemorySelection } from "./liveAssist";

type SidekickViewProps = {
  memories: MemoryRecord[];
  collections: CollectionRecord[];
  onOpenMemory: (memory: MemoryRecord) => void;
};

type SessionPayload = {
  mode: LiveAssistMode;
  contextLabel: string;
  goal: string;
  selectedMemoryIds: string[];
  briefing: LiveAssistBriefing | null;
};

type ChatMessage = {
  sender: "user" | "neuron";
  text: string;
  citations?: Array<{ number: number; memory: MemoryRecord }>;
};

const MAX_SELECTED_MEMORIES = 8;

export function SidekickView({ memories, collections, onOpenMemory }: SidekickViewProps) {
  // Navigation tabs: "chat" or "sidekick"
  const [activeTab, setActiveTab] = useState<"chat" | "sidekick">("chat");

  /* --------------------------------------------------
     A. BRAIN CHAT STATE & LOGIC
     -------------------------------------------------- */
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [askingChat, setAskingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, askingChat]);

  const sendChatMessage = async (textToSend: string) => {
    const query = textToSend.trim();
    if (!query || askingChat) return;

    setChatHistory((current) => [...current, { sender: "user", text: query }]);
    setChatInput("");
    setAskingChat(true);
    setChatError(null);

    try {
      const response: AssistantAnswer = await askNeuron(query);
      setChatHistory((current) => [
        ...current,
        {
          sender: "neuron",
          text: response.answer,
          citations: response.citations,
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Neuron Chat could not reply.");
    } finally {
      setAskingChat(false);
    }
  };

  const handlePromptClick = (prompt: string) => {
    sendChatMessage(prompt);
  };

  /* --------------------------------------------------
     B. SIDEKICK STATE & LOGIC (PRESERVED)
     -------------------------------------------------- */
  const [mode, setMode] = useState<LiveAssistMode>("conversation");
  const [contextLabel, setContextLabel] = useState("");
  const [goal, setGoal] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [briefing, setBriefing] = useState<LiveAssistBriefing | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SidekickSessionRecord[]>([]);
  const [notes, setNotes] = useState<SidekickNoteRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteMemoryId, setNoteMemoryId] = useState("");

  const visibleMemories = useMemo(() => {
    const query = memoryQuery.trim().toLowerCase();
    return memories.filter((memory) => !query || `${memory.title} ${memory.summary || ""} ${memory.tags.join(" ")}`.toLowerCase().includes(query));
  }, [memories, memoryQuery]);

  const memoryById = useMemo(() => new Map(memories.map((memory) => [memory.id, memory] as const)), [memories]);

  const activeSession = useMemo(() => sessions.find((session) => session.id === currentSessionId) ?? null, [sessions, currentSessionId]);

  useEffect(() => {
    let active = true;
    setSessionsLoading(true);
    void listSidekickSessions().then((rows) => {
      if (!active) return;
      setSessions(rows);
      if (rows.length > 0) {
        const latest = rows[0];
        setCurrentSessionId((current) => current ?? latest.id);
      }
    }).catch((error) => {
      if (!active) return;
      setSessionError(error instanceof Error ? error.message : "Could not load saved Sidekick sessions.");
    }).finally(() => {
      if (active) setSessionsLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!currentSessionId) {
      setNotes([]);
      return;
    }
    let active = true;
    setNotesLoading(true);
    void listSidekickNotes(currentSessionId).then((rows) => {
      if (active) setNotes(rows);
    }).catch((error) => {
      if (!active) return;
      setSessionError(error instanceof Error ? error.message : "Could not load saved notes.");
    }).finally(() => {
      if (active) setNotesLoading(false);
    });
    return () => { active = false; };
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId || !activeSession) return;
    setMode(activeSession.mode);
    setContextLabel(activeSession.context_label);
    setGoal(activeSession.goal);
    setSelectedIds(activeSession.selected_memory_ids.filter((id) => memoryById.has(id)).slice(0, MAX_SELECTED_MEMORIES));
    setBriefing(activeSession.briefing);
  }, [activeSession, currentSessionId, memoryById]);

  const selectedMemoryPreview = useMemo(() => selectedIds.map((id) => memoryById.get(id)).filter((memory): memory is MemoryRecord => Boolean(memory)), [memoryById, selectedIds]);
  const noteMemory = noteMemoryId ? memoryById.get(noteMemoryId) ?? null : null;

  const toggleCollection = (collection: CollectionRecord) => {
    const available = collection.memory_ids.filter((id) => memoryById.has(id));
    const allSelected = available.length > 0 && available.every((id) => selectedIds.includes(id));
    if (allSelected) setSelectedIds((current) => current.filter((id) => !available.includes(id)));
    else setSelectedIds((current) => [...new Set([...current, ...available])].slice(0, MAX_SELECTED_MEMORIES));
  };

  const applySession = (session: SidekickSessionRecord) => {
    setCurrentSessionId(session.id);
    setMode(session.mode);
    setContextLabel(session.context_label);
    setGoal(session.goal);
    setSelectedIds(session.selected_memory_ids.filter((id) => memoryById.has(id)).slice(0, MAX_SELECTED_MEMORIES));
    setBriefing(session.briefing);
    setNoteBody("");
    setNoteMemoryId("");
    setSessionError(null);
    setStatusMessage(`Loaded "${session.title}"`);
  };

  const syncSession = async (payload: SessionPayload, sessionId?: string | null) => {
    const saved = await saveSidekickSession({
      id: sessionId ?? undefined,
      mode: payload.mode,
      title: buildSidekickSessionTitle(payload.mode, payload.contextLabel, payload.goal),
      contextLabel: payload.contextLabel,
      goal: payload.goal,
      selectedMemoryIds: payload.selectedMemoryIds,
      briefing: payload.briefing,
      lastUsedAt: new Date().toISOString(),
    });
    setSessions((current) => [saved, ...current.filter((session) => session.id !== saved.id)].slice(0, 12));
    setCurrentSessionId(saved.id);
    setStatusMessage(`Saved "${saved.title}"`);
    return saved;
  };

  const generate = async () => {
    setSessionError(null);
    if (selectedIds.length === 0) {
      setSessionError("Select at least one private memory.");
      return;
    }
    if (goal.trim().length < 3) {
      setSessionError("Describe the conversation or meeting help you need.");
      return;
    }
    setLoadingBriefing(true);
    try {
      const nextBriefing = await runLiveAssist({ mode, goal, contextLabel, memoryIds: selectedIds });
      setBriefing(nextBriefing);
      await syncSession({ mode, contextLabel, goal, selectedMemoryIds: selectedIds, briefing: nextBriefing }, currentSessionId);
      setStatusMessage("Sidekick brief is ready and saved.");
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Neuron Sidekick could not prepare this briefing");
    } finally {
      setLoadingBriefing(false);
    }
  };

  const saveCurrentSession = async () => {
    setSessionError(null);
    if (selectedIds.length === 0) {
      setSessionError("Select at least one private memory before saving.");
      return;
    }
    if (goal.trim().length < 3) {
      setSessionError("Add a short goal before saving this session.");
      return;
    }
    setSavingSession(true);
    try {
      await syncSession({ mode, contextLabel, goal, selectedMemoryIds: selectedIds, briefing }, currentSessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Could not save this Sidekick session.");
    } finally {
      setSavingSession(false);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMode("conversation");
    setContextLabel("");
    setGoal("");
    setSelectedIds([]);
    setBriefing(null);
    setNotes([]);
    setNoteBody("");
    setNoteMemoryId("");
    setSessionError(null);
    setStatusMessage("Started a fresh Sidekick session.");
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setSessionError("Copy is unavailable in this browser. Select the text manually.");
    }
  };

  const citationMemory = (number: number) => {
    const citation = briefing?.citations.find((item) => item.number === number);
    return citation ? memoryById.get(citation.memoryId) : undefined;
  };

  const saveNote = async () => {
    if (!currentSessionId) {
      setSessionError("Save the current session before adding notes.");
      return;
    }
    if (noteBody.trim().length < 2) {
      setSessionError("Write a short note before saving.");
      return;
    }
    setNoteSaving(true);
    setSessionError(null);
    try {
      await addSidekickNote({ sessionId: currentSessionId, body: noteBody, memoryId: noteMemoryId || null });
      const [savedNotes, savedSession] = await Promise.all([
        listSidekickNotes(currentSessionId),
        syncSession({ mode, contextLabel, goal, selectedMemoryIds: selectedIds, briefing }, currentSessionId),
      ]);
      setNotes(savedNotes);
      setSessions((current) => [savedSession, ...current.filter((session) => session.id !== savedSession.id)].slice(0, 12));
      setNoteBody("");
      setNoteMemoryId("");
      setStatusMessage("Note saved to this session.");
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Could not save the note.");
    } finally {
      setNoteSaving(false);
    }
  };

  const removeNote = async (noteId: string) => {
    try {
      await deleteSidekickNote(noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
      setStatusMessage("Note removed.");
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Could not delete the note.");
    }
  };

  const openSession = (session: SidekickSessionRecord) => {
    applySession(session);
    void listSidekickNotes(session.id).then(setNotes).catch((error) => {
      setSessionError(error instanceof Error ? error.message : "Could not load saved notes.");
    });
  };

  /* --------------------------------------------------
     C. RENDERERS & HELPER COMPONENTS
     -------------------------------------------------- */
  // Simple regex-based markdown parser to handle format requirements
  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    let inCodeBlock = false;
    let codeContent: string[] = [];

    return lines.map((line, idx) => {
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const code = codeContent.join("\n");
          codeContent = [];
          return (
            <pre key={idx} className="p-4 my-2 font-mono text-xs rounded-lg overflow-x-auto bg-slate-900 text-slate-100 border border-slate-800 relative group">
              <button
                className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => navigator.clipboard.writeText(code)}
                title="Copy Code"
              >
                <Copy size={13} />
              </button>
              <code>{code}</code>
            </pre>
          );
        } else {
          inCodeBlock = true;
          return null;
        }
      }

      if (inCodeBlock) {
        codeContent.push(line);
        return null;
      }

      // Headers
      if (line.startsWith("### ")) {
        return <h4 key={idx} className="text-sm font-bold mt-3 mb-1 text-indigo-500">{line.slice(4)}</h4>;
      }
      if (line.startsWith("## ")) {
        return <h3 key={idx} className="text-base font-bold mt-4 mb-2 text-indigo-400">{line.slice(3)}</h3>;
      }

      // Bullet points
      if (line.trim().startsWith("* ") || line.trim().startsWith("- ")) {
        const item = line.trim().slice(2);
        return <li key={idx} className="ml-4 list-disc text-sm my-1 leading-relaxed">{parseInlineMarkdown(item)}</li>;
      }

      // Normal paragraph
      if (line.trim() === "") return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-sm my-1 leading-relaxed">{parseInlineMarkdown(line)}</p>;
    });
  };

  const parseInlineMarkdown = (text: string) => {
    // Regex matches bold (**text**) and code (`code`)
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index} className="font-semibold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index} className="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-200 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return (
    <main className="page-content sidekick-page">
      <section className="sidekick-intro">
        <div>
          <span className="eyebrow"><span />Neuron Assistant</span>
          <h1 className="text-3xl font-extrabold tracking-tight">AI Chat</h1>
          <p className="text-sm text-slate-500">Engage your knowledge base. Search, ask, and prepare context from your memories.</p>
        </div>
        <div className="sidekick-private">
          <ShieldCheck size={18} />
          <span>
            <strong>RLS Secured</strong>
            <small>Data never leaves your local workspace</small>
          </span>
        </div>
      </section>

      {/* Primary Tab Selector */}
      <section className="sidekick-mode" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button className={activeTab === "chat" ? "active" : ""} onClick={() => setActiveTab("chat")}>
          <MessageCircle size={18} />
          <span>
            <strong>Brain Chat</strong>
            <small>Direct Q&A across all private memories</small>
          </span>
        </button>
        <button className={activeTab === "sidekick" ? "active" : ""} onClick={() => setActiveTab("sidekick")}>
          <Video size={18} />
          <span>
            <strong>Session Sidekick</strong>
            <small>Grounded meeting & call preparation briefs</small>
          </span>
        </button>
      </section>

      <AnimatePresence mode="wait">
        {activeTab === "chat" ? (
          /* ==================================================
             TAB 1: BRAIN CHAT (MAIN CHAT AREA)
             ================================================== */
          <motion.div
            key="chat"
            className="sidekick-chat-layout"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <div className="chat-area">
              {chatHistory.length === 0 ? (
                /* Empty state with suggested prompts */
                <div className="empty-state">
                  <div className="empty-illustration">
                    <Sparkles size={40} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ask your second brain</h3>
                  <p className="text-sm text-slate-500 max-w-sm">Neuron will fetch related items and answer instantly from your private library.</p>
                  
                  <div className="suggestions mt-6 max-w-md w-full">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3 text-center">Suggested queries</span>
                    {["Summarize what I learned this week", "Find notes relating to React rendering optimizations", "What were the main highlights from my user feedback files?"].map((prompt) => (
                      <button key={prompt} className="w-full flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 rounded-lg text-left text-xs mb-2 transition-all" onClick={() => handlePromptClick(prompt)}>
                        <span>{prompt}</span>
                        <ChevronRight size={14} className="text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Chat Messages List */
                <div className="flex flex-col gap-4">
                  {chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={`chat-message-bubble ${msg.sender === "user" ? "user" : "neuron"}`}
                    >
                      {msg.sender === "neuron" ? (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold mb-2 uppercase tracking-wide">
                            <Sparkle size={12} />
                            <span>Grounded Answer</span>
                          </div>
                          <div className="prose prose-sm dark:prose-invert">
                            {renderMarkdown(msg.text)}
                          </div>

                          {/* Citations block */}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="chat-citations mt-4 border-t border-slate-200 dark:border-slate-800 pt-3">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Sources Used</span>
                              <div className="flex flex-wrap gap-2">
                                {msg.citations.map((cit) => (
                                  <button
                                    key={cit.number}
                                    className="flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 rounded-md text-xs transition-all"
                                    onClick={() => onOpenMemory(cit.memory)}
                                  >
                                    <span className="font-bold text-indigo-500">[{cit.number}]</span>
                                    <span className="max-w-[150px] truncate font-medium">{cit.memory.title}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Typing indicator */}
              {askingChat && (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs w-max text-indigo-500 animate-pulse">
                  <LoaderCircle size={15} className="animate-spin" />
                  <span>Neuron is reasoning over your memories...</span>
                </div>
              )}

              {chatError && (
                <div className="p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg text-xs w-max">
                  {chatError}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Floating input container */}
            <div className="chat-input-wrapper">
              <form
                className="chat-input-container"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage(chatInput);
                }}
              >
                <div className="chat-actions-left">
                  <button
                    type="button"
                    className="icon-button"
                    title="Attach File"
                    onClick={() => handlePromptClick("Help me index a new file")}
                  >
                    <Paperclip size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Record voice note"
                    onClick={() => handlePromptClick("Help me capture a voice memo")}
                  >
                    <Mic size={18} />
                  </button>
                </div>
                <textarea
                  value={chatInput}
                  disabled={askingChat}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage(chatInput);
                    }
                  }}
                  placeholder="Ask a question from your private notes, pdfs, and links..."
                />
                <button
                  type="submit"
                  disabled={askingChat || chatInput.trim().length === 0}
                  className="icon-button"
                  style={{
                    background: chatInput.trim().length > 0 ? "var(--brand)" : "transparent",
                    color: chatInput.trim().length > 0 ? "white" : "var(--text-muted)",
                    borderRadius: "50%",
                  }}
                >
                  <ArrowRight size={18} />
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          /* ==================================================
             TAB 2: SESSION SIDEKICK (PREPARE MEETING BRIEFS)
             ================================================== */
          <motion.div
            key="sidekick"
            className="sidekick-top-grid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <article className="card sidekick-builder">
              <div className="card-heading">
                <div>
                  <span className="card-kicker"><Sparkles size={14} /> Prepare</span>
                  <h2>{mode === "meeting" ? "Build your meeting brief" : "Get conversation context"}</h2>
                </div>
                <div className="sidekick-builder-actions">
                  <button onClick={startNewSession}><Clock3 size={13} /> New session</button>
                  <button onClick={() => void saveCurrentSession()} disabled={savingSession}>{savingSession ? <LoaderCircle size={13} /> : <FileText size={13} />} Save session</button>
                </div>
              </div>

              <label className="sidekick-field">
                <span>{mode === "meeting" ? "Meeting or project" : "Person or conversation"} <small>optional</small></span>
                <input value={contextLabel} onChange={(event) => setContextLabel(event.target.value)} maxLength={120} placeholder={mode === "meeting" ? "Example: Weekly product sync" : "Example: Maya — project follow-up"} />
              </label>

              <label className="sidekick-field">
                <span>What do you need help with?</span>
                <textarea value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={1000} placeholder={mode === "meeting" ? "Example: Help me explain what we completed, what is pending, and what I should ask next." : "Example: Remind me what we discussed, what I promised, and the important facts before I reply."} />
              </label>

              <div className="sidekick-source-head">
                <span>Private sources</span>
                <small>{selectedIds.length} / {MAX_SELECTED_MEMORIES} selected</small>
              </div>

              {collections.length > 0 && <div className="sidekick-collections">
                {collections.slice(0, 6).map((collection) => <button key={collection.id} className={collection.memory_ids.some((id) => selectedIds.includes(id)) ? "selected" : ""} onClick={() => toggleCollection(collection)}>
                  {collection.name}
                  <small>{collection.memory_ids.length}</small>
                </button>)}
              </div>}

              <label className="sidekick-memory-search">
                <Search size={14} />
                <input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} placeholder="Find a memory to include..." />
              </label>

              <div className="sidekick-memory-list">
                {visibleMemories.length ? visibleMemories.map((memory) => {
                  const selected = selectedIds.includes(memory.id);
                  const atLimit = selectedIds.length >= MAX_SELECTED_MEMORIES && !selected;
                  return <button key={memory.id} className={selected ? "selected" : ""} disabled={atLimit} onClick={() => setSelectedIds((current) => toggleMemorySelection(current, memory.id, MAX_SELECTED_MEMORIES))}>
                    <span className="sidekick-check">{selected && <Check size={12} />}</span>
                    <span>
                      <strong>{memory.title}</strong>
                      <small>{memory.kind} · {memory.processing_status === "ready" ? "AI ready" : memory.processing_status}</small>
                    </span>
                    {selected && <X size={13} />}
                  </button>;
                }) : <div className="sidekick-no-memory">No memories match this search.</div>}
              </div>

              {selectedMemoryPreview.length > 0 && <div className="sidekick-selected-preview">
                <span>Selected memory set</span>
                <div>
                  {selectedMemoryPreview.map((memory) => <button key={memory.id} onClick={() => onOpenMemory(memory)}>{memory.title}<ArrowRight size={12} /></button>)}
                </div>
              </div>}

              {sessionError && <div className="sidekick-error">{sessionError}</div>}
              {statusMessage && <div className="sidekick-status">{statusMessage}</div>}

              <button className="sidekick-generate" disabled={loadingBriefing} onClick={() => void generate()}>
                {loadingBriefing ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loadingBriefing ? "Preparing grounded brief..." : "Prepare with Sidekick"}
              </button>
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-500" />Only the selected memories are analyzed. Sidekick cannot see your camera or mic.</p>
            </article>

            <section className="sidekick-output">
              <article className="card sidekick-session-list">
                <div className="card-heading">
                  <div>
                    <span className="card-kicker neutral"><Clock3 size={14} /> Saved sessions</span>
                    <h2>Reopen earlier work</h2>
                  </div>
                  <small>{sessionsLoading ? "Loading..." : `${sessions.length} saved`}</small>
                </div>
                <div className="sidekick-session-stack">
                  {sessions.length > 0 ? sessions.map((session) => <button key={session.id} className={session.id === currentSessionId ? "active" : ""} onClick={() => openSession(session)}>
                    <span>
                      <strong>{session.title}</strong>
                      <small>{session.mode} · {session.context_label || "No context label"} · {session.goal || "No goal yet"}</small>
                    </span>
                    <ArrowRight size={13} />
                  </button>) : <div className="focus-empty">No saved Sidekick sessions yet.</div>}
                </div>
              </article>

              <article className="card sidekick-notes">
                <div className="card-heading">
                  <div>
                    <span className="card-kicker neutral"><FileText size={14} /> Notes</span>
                    <h2>{activeSession ? activeSession.title : "Select a session to keep notes"}</h2>
                  </div>
                  <small>{notesLoading ? "Loading..." : `${notes.length} note${notes.length === 1 ? "" : "s"}`}</small>
                </div>

                <label className="sidekick-note-field">
                  <span>New note</span>
                  <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Write the result of the call, meeting, or follow-up here..." />
                </label>

                <div className="sidekick-note-actions">
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">Link memory</span>
                    <select value={noteMemoryId} onChange={(event) => setNoteMemoryId(event.target.value)}>
                      <option value="">No linked memory</option>
                      {memories.map((memory) => <option key={memory.id} value={memory.id}>{memory.title}</option>)}
                    </select>
                  </label>
                  <button onClick={() => void saveNote()} disabled={noteSaving || !activeSession} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center gap-1">{noteSaving ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />} Save note</button>
                </div>

                {noteMemory && <div className="sidekick-note-link mt-2 flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-md text-xs">
                  <span>Linked source</span>
                  <button onClick={() => onOpenMemory(noteMemory)} className="text-indigo-600 hover:underline">{noteMemory.title}</button>
                </div>}

                <div className="sidekick-note-list">
                  {notes.length > 0 ? notes.map((note) => {
                    const linked = note.memory_id ? memoryById.get(note.memory_id) ?? null : null;
                    return <article key={note.id} className="sidekick-note-item bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg flex justify-between gap-3 text-xs">
                      <div>
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed">{note.body}</p>
                        <small className="text-slate-400 block mt-2">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.created_at))}{linked ? ` · linked to ${linked.title}` : ""}</small>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0 justify-center">
                        {linked && <button onClick={() => onOpenMemory(linked)} className="text-indigo-600 hover:underline">Open source</button>}
                        <button onClick={() => void removeNote(note.id)} className="text-red-500 hover:underline text-left">Delete</button>
                      </div>
                    </article>;
                  }) : <div className="focus-empty">{activeSession ? "No notes yet for this session." : "Choose a saved session before adding notes."}</div>}
                </div>
              </article>

              {briefing ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                <article className="card sidekick-brief p-5 border-l-4 border-indigo-600 bg-white">
                  <div className="sidekick-result-head mb-3">
                    <span className="flex items-center gap-1 font-semibold text-slate-800"><Sparkles size={14} className="text-indigo-600" /> Grounded Briefing</span>
                    <button onClick={() => void copyText("all", formatLiveAssistBriefing(briefing))} className="text-xs text-indigo-500 hover:underline">{copied === "all" ? "Copied" : "Copy Brief"}</button>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">{briefing.brief}</p>
                  <CitationButtons numbers={briefing.briefCitations} onOpen={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
                </article>
                <AssistSection icon={MessageCircle} title="Talking points" items={briefing.talkingPoints} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
                <CircleHelpSection icon={CircleHelp} title="Questions to ask" items={briefing.questions} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
                <article className="card sidekick-citations p-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Sources Used</span>
                  <div className="flex flex-col gap-1.5">
                    {briefing.citations.map((citation) => {
                      const memory = memoryById.get(citation.memoryId);
                      return <button key={citation.number} disabled={!memory} onClick={() => memory && onOpenMemory(memory)} className="flex justify-between items-center w-full p-2 hover:bg-slate-50 border border-slate-100 rounded text-xs text-left">
                        <span><small className="font-bold text-indigo-500">[{citation.number}]</small> {citation.title}</span>
                        <ChevronRight size={14} className="text-slate-400" />
                      </button>;
                    })}
                  </div>
                </article>
              </motion.div> : <div className="empty-state">
                <Clock3 size={32} className="text-slate-300" />
                <h3 className="text-sm font-semibold">Your brief is ready</h3>
                <p className="text-xs text-slate-400 max-w-[280px]">Select memories, add a goal, and prepare context for your upcoming meeting.</p>
              </div>}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function CitationButtons({ numbers, onOpen }: { numbers: number[]; onOpen: (number: number) => void }) {
  return <div className="flex flex-wrap gap-1 mt-2">{numbers.map((number) => <button key={number} onClick={() => onOpen(number)} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600">[{number}]</button>)}</div>;
}

function AssistSection({ icon: Icon, title, items, copied, onCopy, onOpenCitation }: { icon: typeof MessageCircle; title: string; items: LiveAssistItem[]; copied: string | null; onCopy: (key: string, text: string) => Promise<void>; onOpenCitation: (number: number) => void }) {
  if (!items.length) return null;
  return <article className="card sidekick-section p-4">
    <div className="card-heading mb-2">
      <span className="card-kicker neutral"><Icon size={14} /> {title}</span>
    </div>
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const key = `${title}-${index}`;
        return <div className="p-3 bg-slate-50 rounded-lg flex items-start justify-between gap-3 text-xs" key={key}>
          <div>
            <p className="text-slate-700 leading-relaxed">{item.text}</p>
            <CitationButtons numbers={item.citations} onOpen={onOpenCitation} />
          </div>
          <button className="shrink-0 text-slate-400 hover:text-indigo-600" aria-label={`Copy item`} onClick={() => void onCopy(key, item.text)}>{copied === key ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}</button>
        </div>;
      })}
    </div>
  </article>;
}

function CircleHelpSection({ icon: Icon, title, items, copied, onCopy, onOpenCitation }: { icon: typeof CircleHelp; title: string; items: LiveAssistItem[]; copied: string | null; onCopy: (key: string, text: string) => Promise<void>; onOpenCitation: (number: number) => void }) {
  if (!items.length) return null;
  return <article className="card sidekick-section p-4">
    <div className="card-heading mb-2">
      <span className="card-kicker neutral"><Icon size={14} /> {title}</span>
    </div>
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const key = `${title}-${index}`;
        return <div className="p-3 bg-slate-50 rounded-lg flex items-start justify-between gap-3 text-xs" key={key}>
          <div>
            <p className="text-slate-700 leading-relaxed">{item.text}</p>
            <CitationButtons numbers={item.citations} onOpen={onOpenCitation} />
          </div>
          <button className="shrink-0 text-slate-400 hover:text-indigo-600" aria-label={`Copy item`} onClick={() => void onCopy(key, item.text)}>{copied === key ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}</button>
        </div>;
      })}
    </div>
  </article>;
}
