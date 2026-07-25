import { motion } from "framer-motion";
import { ArrowRight, Check, CircleHelp, Clock3, Copy, FileText, LoaderCircle, MessageCircle, Search, ShieldCheck, Sparkles, Video, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addSidekickNote, deleteSidekickNote, listSidekickNotes, listSidekickSessions, runLiveAssist, saveSidekickSession, type CollectionRecord, type LiveAssistBriefing, type LiveAssistItem, type LiveAssistMode, type MemoryRecord, type SidekickNoteRecord, type SidekickSessionRecord } from "../../lib/supabase";
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

const MAX_SELECTED_MEMORIES = 8;

export function SidekickView({ memories, collections, onOpenMemory }: SidekickViewProps) {
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
        if (!currentSessionId) {
          applySession(latest);
        }
      }
    }).catch((error) => {
      if (!active) return;
      setSessionError(error instanceof Error ? error.message : "Could not load saved Sidekick sessions.");
    }).finally(() => {
      if (active) setSessionsLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return () => {
      active = false;
    };
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

  const changeMode = (nextMode: LiveAssistMode) => {
    setMode(nextMode);
    setSessionError(null);
  };

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

  return <main className="page-content sidekick-page">
    <section className="page-intro sidekick-intro">
      <div>
        <span>Context when it matters</span>
        <h1>Neuron Sidekick</h1>
        <p>Prepare for a conversation or meeting, save the brief, and keep your own follow-up notes beside the same private source memories.</p>
      </div>
      <div className="sidekick-private">
        <ShieldCheck size={18} />
        <span><strong>Private by selection</strong><small>No recording or automatic sending</small></span>
      </div>
    </section>

    <section className="sidekick-mode" aria-label="Live Assist mode">
      <button className={mode === "conversation" ? "active" : ""} onClick={() => changeMode("conversation")}>
        <MessageCircle size={18} />
        <span><strong>Conversation</strong><small>Recall context before replying to someone</small></span>
      </button>
      <button className={mode === "meeting" ? "active" : ""} onClick={() => changeMode("meeting")}>
        <Video size={18} />
        <span><strong>Meeting</strong><small>Prepare updates, commitments, and questions</small></span>
      </button>
    </section>

    <section className="sidekick-top-grid">
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
          {loadingBriefing ? <LoaderCircle size={16} /> : <Sparkles size={16} />}
          {loadingBriefing ? "Preparing grounded brief..." : "Prepare with Sidekick"}
        </button>
        <p className="sidekick-consent"><ShieldCheck size={13} />Only the selected memories and text above are sent for this request. Sidekick cannot see your external chat or hear your meeting.</p>
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
            </button>) : <div className="sidekick-empty-panel">No saved Sidekick sessions yet. Generate one and it will be stored here.</div>}
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
            <label>
              <span>Link to a memory</span>
              <select value={noteMemoryId} onChange={(event) => setNoteMemoryId(event.target.value)}>
                <option value="">No linked memory</option>
                {memories.map((memory) => <option key={memory.id} value={memory.id}>{memory.title}</option>)}
              </select>
            </label>
            <button onClick={() => void saveNote()} disabled={noteSaving || !activeSession}>{noteSaving ? <LoaderCircle size={14} /> : <FileText size={14} />} Save note</button>
          </div>

          {noteMemory && <div className="sidekick-note-link">
            <span>Linked source</span>
            <button onClick={() => onOpenMemory(noteMemory)}>{noteMemory.title}<ArrowRight size={12} /></button>
          </div>}

          <div className="sidekick-note-list">
            {notes.length > 0 ? notes.map((note) => {
              const linked = note.memory_id ? memoryById.get(note.memory_id) ?? null : null;
              return <article key={note.id} className="sidekick-note-item">
                <div>
                  <p>{note.body}</p>
                  <small>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.created_at))}{linked ? ` · linked to ${linked.title}` : ""}</small>
                </div>
                <div className="sidekick-note-item-actions">
                  {linked && <button onClick={() => onOpenMemory(linked)}><ArrowRight size={12} /> Open</button>}
                  <button onClick={() => void removeNote(note.id)}><X size={12} /> Delete</button>
                </div>
              </article>;
            }) : <div className="sidekick-empty-panel">{activeSession ? "No notes yet for this session. Add one above to keep a running meeting record." : "Choose a saved session before adding notes."}</div>}
          </div>
        </article>

        {briefing ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <article className="card sidekick-brief">
            <div className="sidekick-result-head">
              <span><Sparkles size={14} /> Grounded briefing</span>
              <button onClick={() => void copyText("all", formatLiveAssistBriefing(briefing))}>{copied === "all" ? <Check size={14} /> : <Copy size={14} />}{copied === "all" ? "Copied" : "Copy all"}</button>
            </div>
            <p>{briefing.brief}</p>
            <CitationButtons numbers={briefing.briefCitations} onOpen={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
          </article>
          <AssistSection icon={MessageCircle} title="Talking points" items={briefing.talkingPoints} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
          <AssistSection icon={CircleHelp} title="Questions to ask" items={briefing.questions} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
          <article className="card sidekick-citations">
            <span><FileText size={14} /> Sources used</span>
            {briefing.citations.map((citation) => {
              const memory = memoryById.get(citation.memoryId);
              return <button key={citation.number} disabled={!memory} onClick={() => memory && onOpenMemory(memory)}>
                <small>[{citation.number}]</small>
                <strong>{citation.title}</strong>
                <ArrowRight size={13} />
              </button>;
            })}
          </article>
        </motion.div> : <div className="sidekick-placeholder">
          <span><Clock3 size={31} /></span>
          <h2>Your context brief will appear here</h2>
          <p>Select only the memories relevant to this conversation or meeting. Sidekick will surface supported facts, past commitments, and useful questions with source links.</p>
          <div><ShieldCheck size={14} /> You remain in control of what you use and share.</div>
        </div>}
      </section>
    </section>
  </main>;
}

function CitationButtons({ numbers, onOpen }: { numbers: number[]; onOpen: (number: number) => void }) {
  return <div className="sidekick-inline-citations">{numbers.map((number) => <button key={number} onClick={() => onOpen(number)}>[{number}]</button>)}</div>;
}

function AssistSection({ icon: Icon, title, items, copied, onCopy, onOpenCitation }: { icon: typeof MessageCircle; title: string; items: LiveAssistItem[]; copied: string | null; onCopy: (key: string, text: string) => Promise<void>; onOpenCitation: (number: number) => void }) {
  if (!items.length) return null;
  return <article className="card sidekick-section">
    <div className="card-heading">
      <div>
        <span className="card-kicker neutral"><Icon size={14} /> {title}</span>
      </div>
    </div>
    <div>
      {items.map((item, index) => {
        const key = `${title}-${index}`;
        return <div className="sidekick-suggestion" key={key}>
          <p>{item.text}</p>
          <CitationButtons numbers={item.citations} onOpen={onOpenCitation} />
          <button aria-label={`Copy ${title} item`} onClick={() => void onCopy(key, item.text)}>{copied === key ? <Check size={13} /> : <Copy size={13} />}</button>
        </div>;
      })}
    </div>
  </article>;
}
