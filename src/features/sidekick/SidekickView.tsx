import { motion } from "framer-motion";
import { ArrowRight, Check, CircleHelp, Clock3, Copy, FileText, ListTodo, LoaderCircle, MessageCircle, Search, ShieldCheck, Sparkles, Video, X } from "lucide-react";
import { useMemo, useState } from "react";
import { runLiveAssist, type CollectionRecord, type LiveAssistBriefing, type LiveAssistItem, type LiveAssistMode, type MemoryRecord } from "../../lib/supabase";
import { formatLiveAssistBriefing, toggleMemorySelection } from "./liveAssist";

type SidekickViewProps = {
  memories: MemoryRecord[];
  collections: CollectionRecord[];
  onOpenMemory: (memory: MemoryRecord) => void;
};

export function SidekickView({ memories, collections, onOpenMemory }: SidekickViewProps) {
  const [mode, setMode] = useState<LiveAssistMode>("conversation");
  const [contextLabel, setContextLabel] = useState("");
  const [goal, setGoal] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [briefing, setBriefing] = useState<LiveAssistBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const visibleMemories = useMemo(() => {
    const query = memoryQuery.trim().toLowerCase();
    return memories.filter((memory) => !query || `${memory.title} ${memory.summary || ""} ${memory.tags.join(" ")}`.toLowerCase().includes(query));
  }, [memories, memoryQuery]);

  const changeMode = (nextMode: LiveAssistMode) => { setMode(nextMode); setBriefing(null); setError(null); };
  const toggleCollection = (collection: CollectionRecord) => {
    const available = collection.memory_ids.filter((id) => memories.some((memory) => memory.id === id));
    const allSelected = available.length > 0 && available.every((id) => selectedIds.includes(id));
    if (allSelected) setSelectedIds((current) => current.filter((id) => !available.includes(id)));
    else setSelectedIds((current) => [...new Set([...current, ...available])].slice(0, 8));
  };
  const generate = async () => {
    setError(null);
    if (selectedIds.length === 0) { setError("Select at least one private memory."); return; }
    if (goal.trim().length < 3) { setError("Describe the conversation or meeting help you need."); return; }
    setLoading(true);
    try {
      setBriefing(await runLiveAssist({ mode, goal, contextLabel, memoryIds: selectedIds }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Neuron Sidekick could not prepare this briefing");
    } finally {
      setLoading(false);
    }
  };
  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Copy is unavailable in this browser. Select the text manually.");
    }
  };
  const citationMemory = (number: number) => {
    const citation = briefing?.citations.find((item) => item.number === number);
    return citation ? memories.find((memory) => memory.id === citation.memoryId) : undefined;
  };

  return <main className="page-content sidekick-page">
    <section className="page-intro sidekick-intro"><div><span>Context when it matters</span><h1>Neuron Sidekick</h1><p>Prepare for a conversation or meeting using only the private memories you choose.</p></div><div className="sidekick-private"><ShieldCheck size={18} /><span><strong>Private by selection</strong><small>No recording or automatic sending</small></span></div></section>

    <section className="sidekick-mode" aria-label="Live Assist mode">
      <button className={mode === "conversation" ? "active" : ""} onClick={() => changeMode("conversation")}><MessageCircle size={18} /><span><strong>Conversation</strong><small>Recall context before replying to someone</small></span></button>
      <button className={mode === "meeting" ? "active" : ""} onClick={() => changeMode("meeting")}><Video size={18} /><span><strong>Meeting</strong><small>Prepare updates, commitments, and questions</small></span></button>
    </section>

    <section className="sidekick-layout">
      <article className="card sidekick-builder">
        <div className="card-heading"><div><span className="card-kicker"><Sparkles size={14} /> Prepare</span><h2>{mode === "meeting" ? "Build your meeting brief" : "Get conversation context"}</h2></div></div>
        <label className="sidekick-field"><span>{mode === "meeting" ? "Meeting or project" : "Person or conversation"} <small>optional</small></span><input value={contextLabel} onChange={(event) => setContextLabel(event.target.value)} maxLength={120} placeholder={mode === "meeting" ? "Example: Weekly product sync" : "Example: Maya — project follow-up"} /></label>
        <label className="sidekick-field"><span>What do you need help with?</span><textarea value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={1000} placeholder={mode === "meeting" ? "Example: Help me explain what we completed, what is pending, and what I should ask next." : "Example: Remind me what we discussed, what I promised, and the important facts before I reply."} /></label>

        <div className="sidekick-source-head"><span>Private sources</span><small>{selectedIds.length} / 8 selected</small></div>
        {collections.length > 0 && <div className="sidekick-collections">{collections.slice(0, 6).map((collection) => <button key={collection.id} className={collection.memory_ids.some((id) => selectedIds.includes(id)) ? "selected" : ""} onClick={() => toggleCollection(collection)}>{collection.name}<small>{collection.memory_ids.length}</small></button>)}</div>}
        <label className="sidekick-memory-search"><Search size={14} /><input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} placeholder="Find a memory to include..." /></label>
        <div className="sidekick-memory-list">{visibleMemories.length ? visibleMemories.map((memory) => {
          const selected = selectedIds.includes(memory.id);
          const atLimit = selectedIds.length >= 8 && !selected;
          return <button key={memory.id} className={selected ? "selected" : ""} disabled={atLimit} onClick={() => setSelectedIds((current) => toggleMemorySelection(current, memory.id))}><span className="sidekick-check">{selected && <Check size={12} />}</span><span><strong>{memory.title}</strong><small>{memory.kind} · {memory.processing_status === "ready" ? "AI ready" : memory.processing_status}</small></span>{selected && <X size={13} />}</button>;
        }) : <div className="sidekick-no-memory">No memories match this search.</div>}</div>
        {error && <div className="sidekick-error">{error}</div>}
        <button className="sidekick-generate" disabled={loading} onClick={() => void generate()}>{loading ? <LoaderCircle size={16} /> : <Sparkles size={16} />}{loading ? "Preparing grounded brief..." : "Prepare with Sidekick"}</button>
        <p className="sidekick-consent"><ShieldCheck size={13} />Only the selected memories and text above are sent for this request. Sidekick cannot see your external chat or hear your meeting.</p>
      </article>

      <section className="sidekick-output">
        {briefing ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <article className="card sidekick-brief"><div className="sidekick-result-head"><span><Sparkles size={14} /> Grounded briefing</span><button onClick={() => void copyText("all", formatLiveAssistBriefing(briefing))}>{copied === "all" ? <Check size={14} /> : <Copy size={14} />}{copied === "all" ? "Copied" : "Copy all"}</button></div><p>{briefing.brief}</p><CitationButtons numbers={briefing.briefCitations} onOpen={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} /></article>
          <AssistSection icon={MessageCircle} title="Talking points" items={briefing.talkingPoints} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
          <AssistSection icon={ListTodo} title="Commitments and follow-ups" items={briefing.commitments} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
          <AssistSection icon={CircleHelp} title="Questions to ask" items={briefing.questions} copied={copied} onCopy={copyText} onOpenCitation={(number) => { const memory = citationMemory(number); if (memory) onOpenMemory(memory); }} />
          <article className="card sidekick-citations"><span><FileText size={14} /> Sources used</span>{briefing.citations.map((citation) => { const memory = memories.find((item) => item.id === citation.memoryId); return <button key={citation.number} disabled={!memory} onClick={() => memory && onOpenMemory(memory)}><small>[{citation.number}]</small><strong>{citation.title}</strong><ArrowRight size={13} /></button>; })}</article>
        </motion.div> : <div className="sidekick-placeholder"><span><Clock3 size={31} /></span><h2>Your context brief will appear here</h2><p>Select only the memories relevant to this conversation or meeting. Sidekick will surface supported facts, past commitments, and useful questions with source links.</p><div><ShieldCheck size={14} /> You remain in control of what you use and share.</div></div>}
      </section>
    </section>
  </main>;
}

function CitationButtons({ numbers, onOpen }: { numbers: number[]; onOpen: (number: number) => void }) {
  return <div className="sidekick-inline-citations">{numbers.map((number) => <button key={number} onClick={() => onOpen(number)}>[{number}]</button>)}</div>;
}

function AssistSection({ icon: Icon, title, items, copied, onCopy, onOpenCitation }: { icon: typeof MessageCircle; title: string; items: LiveAssistItem[]; copied: string | null; onCopy: (key: string, text: string) => Promise<void>; onOpenCitation: (number: number) => void }) {
  if (!items.length) return null;
  return <article className="card sidekick-section"><div className="card-heading"><div><span className="card-kicker neutral"><Icon size={14} /> {title}</span></div></div><div>{items.map((item, index) => { const key = `${title}-${index}`; return <div className="sidekick-suggestion" key={key}><p>{item.text}</p><CitationButtons numbers={item.citations} onOpen={onOpenCitation} /><button aria-label={`Copy ${title} item`} onClick={() => void onCopy(key, item.text)}>{copied === key ? <Check size={13} /> : <Copy size={13} />}</button></div>; })}</div></article>;
}
