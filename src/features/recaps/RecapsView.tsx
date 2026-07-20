import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Flame, Layers3, ListTodo, Plus, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { ActionItemRecord, MemoryRecord } from "../../lib/supabase";
import { buildWorkspaceRecap, type RecapRange } from "./recaps";

type RecapsViewProps = {
  memories: MemoryRecord[];
  actionItems: ActionItemRecord[];
  onOpenMemory: (memory: MemoryRecord) => void;
  openCapture: () => void;
  openTasks: () => void;
};

export function RecapsView({ memories, actionItems, onOpenMemory, openCapture, openTasks }: RecapsViewProps) {
  const [range, setRange] = useState<RecapRange>("week");
  const recap = useMemo(() => buildWorkspaceRecap(memories, actionItems, range), [memories, actionItems, range]);

  return (
    <main className="page-content recaps-page">
      <section className="page-intro recaps-intro">
        <div><span>Your reflection</span><h1>Recaps</h1><p>See what you captured, finished, and returned to over time.</p></div>
        <button className="primary-action" onClick={openCapture}><Plus size={17} /> Capture today</button>
      </section>

      <div className="activity-range" aria-label="Recap date range">
        {([{ label: "Today", value: "today" }, { label: "7 days", value: "week" }, { label: "30 days", value: "month" }] as const).map((option) => <button key={option.value} className={range === option.value ? "active" : ""} onClick={() => setRange(option.value)}>{option.label}</button>)}
      </div>

      <section className="recap-hero card">
        <div className="recap-hero-icon"><Sparkles size={20} /></div>
        <div><span>{range === "today" ? "Today’s recap" : range === "week" ? "Weekly recap" : "Monthly recap"}</span><h2>{recap.activeDays ? "Your ideas are moving forward" : "A quiet period in your second brain"}</h2><p>{recap.narrative}</p></div>
        {recap.highlight && <button onClick={() => onOpenMemory(recap.highlight!)}>Open highlight <ArrowRight size={14} /></button>}
      </section>

      <section className="recap-stats">
        <RecapStat icon={BookOpen} label="Captured" value={recap.memories.length} detail={`${recap.readyCount} AI ready`} color="violet" />
        <RecapStat icon={CheckCircle2} label="Completed" value={recap.completed.length} detail={`${recap.openActions.length} still in progress`} color="green" />
        <RecapStat icon={CalendarDays} label="Active days" value={recap.activeDays} detail={`${recap.streak} day current streak`} color="orange" />
      </section>

      <section className="recap-grid">
        <article className="card recap-topics">
          <div className="card-heading"><div><span className="card-kicker neutral"><Tag size={14} /> Themes</span><h2>What held your attention</h2></div></div>
          {recap.topTags.length ? <div className="recap-topic-list">{recap.topTags.map((topic, index) => <div key={topic.label}><span style={{ width: `${Math.max(18, (topic.count / recap.topTags[0].count) * 100)}%` }} /><strong>{topic.label}</strong><small>{topic.count}</small><em>#{index + 1}</em></div>)}</div> : <RecapEmpty icon={Tag} text="Processed memory tags will reveal your recurring themes." />}
        </article>
        <article className="card recap-mix">
          <div className="card-heading"><div><span className="card-kicker neutral"><Layers3 size={14} /> Mix</span><h2>How you captured</h2></div></div>
          {recap.kindCounts.length ? recap.kindCounts.map((item) => <div className="recap-kind-row" key={item.kind}><span>{item.kind}</span><strong>{item.count}</strong></div>) : <RecapEmpty icon={Layers3} text="No captures in this period." />}
          {recap.openActions.length > 0 && <button className="recap-task-link" onClick={openTasks}><ListTodo size={14} /> Continue {recap.openActions.length} open {recap.openActions.length === 1 ? "task" : "tasks"}<ArrowRight size={14} /></button>}
        </article>
      </section>

      <section className="recap-history">
        <div className="section-header"><div><h2>Day by day</h2><p>Memories captured and actions completed.</p></div></div>
        {recap.days.length ? recap.days.map((day) => <section className="recap-day" key={day.key}>
          <div className="recap-day-heading"><h3>{day.label}</h3><span>{day.memories.length} captured · {day.completed.length} completed</span></div>
          <div className="recap-day-list">
            {day.memories.map((memory) => <motion.button whileHover={{ x: 3 }} key={memory.id} onClick={() => onOpenMemory(memory)}><span className="recap-event-icon memory"><BookOpen size={15} /></span><span><strong>{memory.title}</strong><small>{memory.summary || memory.content || `${memory.kind} memory`}</small></span><span>Captured</span><ArrowRight size={15} /></motion.button>)}
            {day.completed.map((item) => <div className="recap-completed" key={item.id}><span className="recap-event-icon completed"><CheckCircle2 size={15} /></span><span><strong>{item.title}</strong><small>Completed action</small></span><span>Done</span><CheckCircle2 size={15} /></div>)}
          </div>
        </section>) : <div className="activity-empty"><Flame size={34} /><h3>No activity in this period</h3><p>Capture a thought or complete a task to begin your recap.</p><button className="primary-action" onClick={openCapture}><Plus size={16} /> Capture memory</button></div>}
      </section>
    </main>
  );
}

function RecapStat({ icon: Icon, label, value, detail, color }: { icon: LucideIcon; label: string; value: number; detail: string; color: string }) {
  return <article className="card recap-stat"><span className={`activity-stat-icon ${color}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function RecapEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <div className="recap-empty"><Icon size={22} /><span>{text}</span></div>;
}
