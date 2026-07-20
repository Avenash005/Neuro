import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Link2,
  ListTodo,
  Mic,
  Plus,
  Sparkles,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SearchBox } from "../../components/layout/AppLayout";
import { recentItems } from "../../data/mockData";
import type { LibraryItem } from "../../types/app";
import type { ActionItemRecord, MemoryRecord } from "../../lib/supabase";
import { buildWorkspaceRecap } from "../recaps/recaps";

type DashboardProps = {
  onSearch: (query: string) => void;
  openCapture: () => void;
  openAssistant: () => void;
  openActivity: () => void;
  openLibrary: () => void;
  openTasks: () => void;
  openRecaps: () => void;
  memories: MemoryRecord[];
  actionItems: ActionItemRecord[];
  onOpenMemory: (memory: MemoryRecord) => void;
  onToggleFavorite: (memoryId: string, isFavorite: boolean) => Promise<void>;
  onCompleteTask: (taskId: string) => Promise<void>;
};

export function Dashboard({ onSearch, openCapture, openAssistant, openActivity, openLibrary, openTasks, openRecaps, memories, actionItems, onOpenMemory, onToggleFavorite, onCompleteTask }: DashboardProps) {
  const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const focusTasks = actionItems.filter((item) => item.status === "accepted").slice(0, 3);
  const suggestionCount = actionItems.filter((item) => item.status === "suggested").length;
  const weeklyRecap = useMemo(() => buildWorkspaceRecap(memories, actionItems, "week"), [memories, actionItems]);
  const leadingThemes = weeklyRecap.topTags.slice(0, 2);
  const activeDateKeys = new Set(memories.map((memory) => new Date(memory.created_at).toDateString()));
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { label: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date), active: activeDateKeys.has(date.toDateString()), today: index === 6 };
  });

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
            <div><span className="card-kicker"><Sparkles size={14} /> Weekly brief</span><h2>{weeklyRecap.memories.length ? "Your week, at a glance" : "Your recap is ready when you are"}</h2></div>
            <button className="more-link" onClick={openRecaps}>Explore <ArrowRight size={15} /></button>
          </div>
          <p>{weeklyRecap.narrative}</p>
          {leadingThemes.length > 0 && <div className="connection-row">
            <div className="connection-item"><span className="mini-icon purple"><Code2 size={17} /></span><span><strong>{leadingThemes[0].label}</strong><small>{leadingThemes[0].count} tagged {leadingThemes[0].count === 1 ? "memory" : "memories"}</small></span></div>
            <div className="connector"><span /><Zap size={14} /><span /></div>
            <div className="connection-item"><span className="mini-icon green"><Brain size={17} /></span><span><strong>{leadingThemes[1]?.label || `${weeklyRecap.activeDays} active ${weeklyRecap.activeDays === 1 ? "day" : "days"}`}</strong><small>{leadingThemes[1] ? `${leadingThemes[1].count} tagged ${leadingThemes[1].count === 1 ? "memory" : "memories"}` : `${weeklyRecap.completed.length} actions completed`}</small></span></div>
          </div>}
          <div className="insight"><span className="insight-icon"><Sparkles size={15} /></span><p><strong>{weeklyRecap.highlight ? "Worth revisiting:" : "Build your recap:"}</strong> {weeklyRecap.highlight ? (weeklyRecap.highlight.summary || weeklyRecap.highlight.title) : "Capture a thought, link, file, or voice note and Neuron will reflect your real activity here."}</p></div>
        </motion.article>

        <motion.article className="card focus-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12 }}>
          <div className="card-heading"><div><span className="card-kicker neutral"><ListTodo size={14} /> Today</span><h2>Your next moves</h2></div><span className="task-count">{focusTasks.length}</span></div>
          <div className="tasks">
            {focusTasks.map((task) => (
              <button key={task.id} className="task" onClick={() => void onCompleteTask(task.id)}>
                <span className="check"><Check size={13} /></span><span>{task.title}</span>{task.item_type === "reminder" && <small>Reminder</small>}
              </button>
            ))}
            {!focusTasks.length && <div className="focus-empty">No accepted tasks yet. Review AI suggestions to build today’s focus.</div>}
          </div>
          <button className="text-button" onClick={openTasks}>{suggestionCount ? `Review ${suggestionCount} ${suggestionCount === 1 ? "suggestion" : "suggestions"}` : "Open tasks"} <ArrowRight size={14} /></button>
        </motion.article>
      </section>

      <section className="section-block">
        <div className="section-header"><div><h2>Pick up where you left off</h2><p>Your most recent thoughts and discoveries</p></div><button className="text-button" onClick={openLibrary}>View library <ArrowRight size={15} /></button></div>
        <div className="recent-grid">
          {memories.length ? memories.slice(0, 3).map((memory, index) => <MemoryRecentCard key={memory.id} memory={memory} index={index} onOpen={() => onOpenMemory(memory)} onToggleFavorite={(favorite) => onToggleFavorite(memory.id, favorite)} />) : recentItems.map((item, index) => <RecentCard key={item.title} item={item} index={index} onOpen={() => onSearch(item.title)} />)}
        </div>
      </section>

      <section className="lower-grid">
        <article className="card activity-card">
          <div className="card-heading"><div><span className="card-kicker neutral"><Clock3 size={14} /> Memory stream</span><h2>Latest in your brain</h2></div><button className="icon-button" onClick={openActivity} aria-label="Open full activity"><ChevronDown size={17} /></button></div>
          <div className="timeline">
            {memories.length ? memories.slice(0, 3).map((memory) => <TimelineItem key={memory.id} time={new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(memory.created_at))} icon={memory.kind === "Link" ? Link2 : memory.kind === "Voice" ? Mic : BookOpen} title={memory.title} detail={memory.summary || `${memory.kind} · ${memory.processing_status}`} onClick={() => onOpenMemory(memory)} />) : <TimelineItem time="Today" icon={BookOpen} title="Your memory stream is ready" detail="Capture something to start your history" onClick={openCapture} />}
          </div>
        </article>
        <article className="card streak-card">
          <div className="streak-top"><div className="streak-icon"><Zap size={20} /></div><span>Learning streak</span><strong>{weeklyRecap.streak} {weeklyRecap.streak === 1 ? "day" : "days"}</strong><p>{weeklyRecap.streak ? "You’re building a consistent capture habit." : "Capture something today to begin a streak."}</p></div>
          <div className="week-dots">{weekDates.map((day, index) => <div key={`${day.label}-${index}`}><span className={day.active ? "filled" : day.today ? "today" : ""}>{day.active && <Check size={11} />}</span><small>{day.label}</small></div>)}</div>
          <button onClick={openCapture}>Keep it going <Plus size={15} /></button>
        </article>
      </section>

      <button className="floating-capture" onClick={openCapture}><Plus size={20} /><span>Capture</span></button>
    </main>
  );
}

function RecentCard({ item, index, onOpen, favoriteOverride, onToggleFavorite }: { item: LibraryItem; index: number; onOpen: () => void; favoriteOverride?: boolean; onToggleFavorite?: (favorite: boolean) => void }) {
  const Icon = item.icon;
  const [localFavorite, setLocalFavorite] = useState(index === 2);
  const favorite = favoriteOverride ?? localFavorite;
  return (
    <motion.article className="recent-card" role="button" tabIndex={0} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 + index * .05 }} whileHover={{ y: -4 }} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}>
      <div className="recent-top"><span className={`file-icon ${item.color}`}><Icon size={19} /></span><button className={favorite ? "starred" : ""} onClick={(event) => { event.stopPropagation(); if (onToggleFavorite) onToggleFavorite(!favorite); else setLocalFavorite(!favorite); }} aria-label="Favorite"><Star size={17} fill={favorite ? "currentColor" : "none"} /></button></div>
      <span className="item-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p><div className="recent-meta"><span>{item.meta}</span><span>2d ago</span></div>
    </motion.article>
  );
}

function MemoryRecentCard({ memory, index, onOpen, onToggleFavorite }: { memory: MemoryRecord; index: number; onOpen: () => void; onToggleFavorite: (favorite: boolean) => void }) {
  const item: LibraryItem = {
    title: memory.title,
    description: memory.summary || memory.content || memory.extracted_text || `${memory.kind} saved to Neuron`,
    meta: memory.processing_status === "ready" ? "AI processed" : memory.processing_status,
    tag: memory.kind,
    icon: memory.kind === "Link" ? Link2 : memory.kind === "Voice" ? Mic : BookOpen,
    color: memory.kind === "Link" ? "green" : memory.kind === "Voice" ? "orange" : "violet",
  };
  return <RecentCard item={item} index={index} onOpen={onOpen} favoriteOverride={memory.is_favorite} onToggleFavorite={onToggleFavorite} />;
}

function TimelineItem({ time, icon: Icon, title, detail, onClick }: { time: string; icon: LucideIcon; title: string; detail: string; onClick: () => void }) {
  return <button className="timeline-item" onClick={onClick}><span className="time">{time}</span><span className="timeline-icon"><Icon size={15} /></span><span><strong>{title}</strong><small>{detail}</small></span></button>;
}
