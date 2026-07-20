import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, Brain, Check, ChevronRight, CircleHelp, Eye, GraduationCap, LoaderCircle, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MemoryRecord, StudyCardRecord } from "../../lib/supabase";
import { buildQuizOptions, filterStudyCards } from "./study";

type StudyViewProps = {
  cards: StudyCardRecord[];
  memories: MemoryRecord[];
  onOpenMemory: (memory: MemoryRecord) => void;
  onAnalyzeMemories: (memoryIds: string[], onProgress?: (completed: number, total: number) => void) => Promise<number>;
};

export function StudyView({ cards, memories, onOpenMemory, onAnalyzeMemories }: StudyViewProps) {
  const [mode, setMode] = useState<"cards" | "quiz">("cards");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState<{ completed: number; total: number } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const filtered = useMemo(() => filterStudyCards(cards, source, query), [cards, source, query]);
  const sources = memories.filter((memory) => cards.some((card) => card.memory_id === memory.id));
  const eligibleMemories = memories.filter((memory) => memory.processing_status === "ready" && !memory.study_analyzed_at);
  const runAnalysis = async () => {
    setAnalysisError(null);
    try {
      await onAnalyzeMemories(eligibleMemories.slice(0, 3).map((memory) => memory.id), (completed, total) => setAnalysisProgress({ completed, total }));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Study analysis failed");
    } finally {
      setAnalysisProgress(null);
    }
  };

  return (
    <main className="page-content study-page">
      <section className="page-intro study-intro">
        <div><span>Learn from your brain</span><h1>Study</h1><p>Review source-backed flashcards or test yourself with quick quizzes.</p></div>
        <div className="study-total"><GraduationCap size={18} /><strong>{cards.length}</strong><span>cards</span></div>
      </section>

      <section className="study-controls">
        <div className="study-mode" aria-label="Study mode"><button className={mode === "cards" ? "active" : ""} onClick={() => setMode("cards")}><BookOpen size={15} /> Flashcards</button><button className={mode === "quiz" ? "active" : ""} onClick={() => setMode("quiz")}><CircleHelp size={15} /> Quiz</button></div>
        <label className="study-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards..." /></label>
        <label className="study-source"><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All memories</option>{sources.map((memory) => <option key={memory.id} value={memory.id}>{memory.title}</option>)}</select></label>
      </section>

      {eligibleMemories.length > 0 && cards.length > 0 && <section className="study-backfill"><div><Sparkles size={16} /><span><strong>Create cards from existing memories</strong><small>{eligibleMemories.length} eligible. Analyze up to 3 at a time so you control provider usage.</small></span></div><button disabled={Boolean(analysisProgress)} onClick={() => void runAnalysis()}>{analysisProgress ? <LoaderCircle size={14} /> : <Sparkles size={14} />}{analysisProgress ? `${analysisProgress.completed}/${analysisProgress.total}` : `Analyze ${Math.min(3, eligibleMemories.length)}`}</button></section>}
      {analysisError && <div className="graph-analysis-error">{analysisError}</div>}

      {!filtered.length ? <StudyEmpty hasCards={cards.length > 0} canAnalyze={eligibleMemories.length > 0} analyzing={Boolean(analysisProgress)} onAnalyze={() => void runAnalysis()} /> : mode === "cards"
        ? <Flashcards cards={filtered} memories={memories} onOpenMemory={onOpenMemory} />
        : <Quiz key={filtered.map((card) => card.id).join(":")} cards={filtered.filter((card) => buildQuizOptions(card).length >= 2)} memories={memories} onOpenMemory={onOpenMemory} />}
    </main>
  );
}

function Flashcards({ cards, memories, onOpenMemory }: { cards: StudyCardRecord[]; memories: MemoryRecord[]; onOpenMemory: (memory: MemoryRecord) => void }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  return <section className="study-card-grid">{cards.map((card, index) => {
    const isRevealed = revealed.has(card.id);
    const memory = memories.find((item) => item.id === card.memory_id);
    return <motion.article className={`study-card ${isRevealed ? "revealed" : ""}`} key={card.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * .035, .25) }}>
      <div className="study-card-top"><span><Sparkles size={13} /> Question</span><small>{Math.round(card.confidence * 100)}% source confidence</small></div>
      <h2>{card.question}</h2>
      <AnimatePresence mode="wait">{isRevealed ? <motion.div className="study-answer" key="answer" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}><span>Answer</span><p>{card.answer}</p>{card.evidence && <small>“{card.evidence}”</small>}</motion.div> : <motion.button className="study-reveal" key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setRevealed((current) => new Set(current).add(card.id))}><Eye size={15} /> Reveal answer</motion.button>}</AnimatePresence>
      <div className="study-card-footer">{isRevealed && <button onClick={() => setRevealed((current) => { const next = new Set(current); next.delete(card.id); return next; })}><RotateCcw size={13} /> Hide</button>}{memory && <button onClick={() => onOpenMemory(memory)}>Source: {memory.title} <ArrowRight size={13} /></button>}</div>
    </motion.article>;
  })}</section>;
}

function Quiz({ cards, memories, onOpenMemory }: { cards: StudyCardRecord[]; memories: MemoryRecord[]; onOpenMemory: (memory: MemoryRecord) => void }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  if (!cards.length) return <StudyEmpty hasCards onAnalyze={() => undefined} quizUnavailable />;
  const card = cards[index];
  const options = buildQuizOptions(card);
  const memory = memories.find((item) => item.id === card.memory_id);
  const choose = (option: string) => { if (selected) return; setSelected(option); if (option === card.answer) setScore((current) => current + 1); };
  const next = () => { if (index === cards.length - 1) setFinished(true); else { setIndex((current) => current + 1); setSelected(null); } };
  const restart = () => { setIndex(0); setSelected(null); setScore(0); setFinished(false); };

  if (finished) return <section className="quiz-finished card"><span className="quiz-result-icon"><GraduationCap size={26} /></span><span>Session complete</span><h2>{score} / {cards.length}</h2><p>{score === cards.length ? "Perfect recall. You knew every answer." : "Good work. Revisit the missed cards and try again."}</p><div><button className="primary-action" onClick={restart}><RotateCcw size={15} /> Try again</button><button onClick={() => { setFinished(false); setIndex(0); setSelected(null); }}>Review cards</button></div></section>;

  return <section className="quiz-shell card">
    <div className="quiz-progress"><span>Question {index + 1} of {cards.length}</span><strong>{score} correct</strong><i><span style={{ width: `${((index + (selected ? 1 : 0)) / cards.length) * 100}%` }} /></i></div>
    <div className="quiz-question"><span><Brain size={16} /> Test your recall</span><h2>{card.question}</h2></div>
    <div className="quiz-options">{options.map((option, optionIndex) => { const correct = selected && option === card.answer; const wrong = selected === option && option !== card.answer; return <button key={option} className={correct ? "correct" : wrong ? "wrong" : ""} onClick={() => choose(option)} disabled={Boolean(selected)}><span>{String.fromCharCode(65 + optionIndex)}</span><strong>{option}</strong>{correct && <Check size={17} />}{wrong && <X size={17} />}</button>; })}</div>
    {selected && <div className={`quiz-feedback ${selected === card.answer ? "correct" : "wrong"}`}><strong>{selected === card.answer ? "Correct" : "Not quite"}</strong><p>{card.answer}</p>{card.evidence && <small>Source evidence: “{card.evidence}”</small>}</div>}
    <div className="quiz-footer">{memory && <button onClick={() => onOpenMemory(memory)}>Open {memory.title} <ArrowRight size={13} /></button>}<button className="primary-action" disabled={!selected} onClick={next}>{index === cards.length - 1 ? "Finish" : "Next"} <ChevronRight size={15} /></button></div>
  </section>;
}

function StudyEmpty({ hasCards, canAnalyze = false, analyzing = false, onAnalyze, quizUnavailable = false }: { hasCards: boolean; canAnalyze?: boolean; analyzing?: boolean; onAnalyze: () => void; quizUnavailable?: boolean }) {
  return <section className="study-empty"><span><GraduationCap size={32} /></span><h2>{quizUnavailable ? "Quiz options are not ready" : hasCards ? "No cards match this filter" : "Build your first study deck"}</h2><p>{quizUnavailable ? "These cards can be reviewed as flashcards, but need incorrect answer options before they can become a quiz." : hasCards ? "Try another source or clear the search." : canAnalyze ? "New memories generate cards automatically. Analyze existing memories to create source-backed questions without guessing." : "Capture a new memory with useful learning material and Neuron will create source-backed cards while it processes."}</p>{!hasCards && canAnalyze && <button className="primary-action" disabled={analyzing} onClick={onAnalyze}>{analyzing ? <LoaderCircle size={15} /> : <Sparkles size={15} />} {analyzing ? "Analyzing" : "Analyze memories"}</button>}</section>;
}
