import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  Mic,
  Plus,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { MemoryRecord } from "../../lib/supabase";
import { buildSevenDayActivity, filterActivityMemories, groupActivityByDay, type ActivityRange } from "./activity";

type ActivityViewProps = {
  memories: MemoryRecord[];
  onOpenMemory: (memory: MemoryRecord) => void;
  openCapture: () => void;
};

export function ActivityView({ memories, onOpenMemory, openCapture }: ActivityViewProps) {
  const [range, setRange] = useState<ActivityRange>(7);
  const filtered = useMemo(() => filterActivityMemories(memories, range), [memories, range]);
  const days = useMemo(() => groupActivityByDay(memories, range), [memories, range]);
  const week = useMemo(() => buildSevenDayActivity(memories), [memories]);
  const maximum = Math.max(1, ...week.map((day) => day.count));
  const processed = filtered.filter((memory) => memory.processing_status === "ready").length;
  const activeDays = new Set(filtered.map((memory) => new Date(memory.created_at).toDateString())).size;
  const uploads = filtered.filter((memory) => memory.kind === "Upload").length;

  return (
    <main className="page-content activity-page">
      <section className="page-intro activity-intro">
        <div><span>Your progress</span><h1>Activity</h1><p>A clear record of what you captured, explored, and processed over time.</p></div>
        <button className="primary-action" onClick={openCapture}><Plus size={17} /> Add today’s work</button>
      </section>

      <div className="activity-range" aria-label="Activity date range">
        {([{ label: "7 days", value: 7 }, { label: "30 days", value: 30 }, { label: "All time", value: "all" }] as const).map((option) => (
          <button key={option.label} className={range === option.value ? "active" : ""} onClick={() => setRange(option.value)}>{option.label}</button>
        ))}
      </div>

      <section className="activity-stats" aria-label="Work summary">
        <ActivityStat icon={CalendarDays} label="Memories added" value={filtered.length} detail={`${activeDays} active ${activeDays === 1 ? "day" : "days"}`} color="violet" />
        <ActivityStat icon={CheckCircle2} label="AI processed" value={processed} detail={filtered.length ? `${Math.round((processed / filtered.length) * 100)}% ready` : "Nothing queued"} color="green" />
        <ActivityStat icon={UploadCloud} label="Files uploaded" value={uploads} detail={`${filtered.length - uploads} notes, links or voice`} color="orange" />
      </section>

      <section className="activity-layout">
        <article className="card activity-chart-card">
          <div className="card-heading"><div><span className="card-kicker neutral"><Sparkles size={14} /> Rhythm</span><h2>Your last seven days</h2></div><strong>{week.reduce((total, day) => total + day.count, 0)} captured</strong></div>
          <div className="activity-bars" aria-label="Memories captured during the last seven days">
            {week.map((day) => <div key={day.key} className={day.isToday ? "today" : ""}><span className="bar-count">{day.count || ""}</span><span className="bar-track"><i style={{ height: `${Math.max(day.count ? 14 : 3, (day.count / maximum) * 100)}%` }} /></span><small>{day.label}</small></div>)}
          </div>
        </article>

        <article className="card activity-breakdown">
          <div className="card-heading"><div><span className="card-kicker neutral"><Clock3 size={14} /> Snapshot</span><h2>Work by type</h2></div></div>
          {(["Note", "Upload", "Link", "Voice"] as const).map((kind) => {
            const count = filtered.filter((memory) => memory.kind === kind).length;
            const Icon = activityIcon(kind);
            return <div className="breakdown-row" key={kind}><span className={`activity-kind ${kind.toLowerCase()}`}><Icon size={16} /></span><span>{kind}</span><strong>{count}</strong></div>;
          })}
        </article>
      </section>

      <section className="activity-history">
        <div className="section-header"><div><h2>Past work</h2><p>Open any entry to revisit the complete memory.</p></div></div>
        {days.length ? days.map((day) => (
          <section className="activity-day" key={day.key}>
            <div className="activity-day-heading"><h3>{day.label}</h3><span>{day.memories.length} {day.memories.length === 1 ? "item" : "items"}</span></div>
            <div className="activity-day-list">
              {day.memories.map((memory) => {
                const Icon = activityIcon(memory.kind);
                return <motion.button whileHover={{ x: 3 }} key={memory.id} onClick={() => onOpenMemory(memory)}>
                  <span className={`activity-kind ${memory.kind.toLowerCase()}`}><Icon size={17} /></span>
                  <span><strong>{memory.title}</strong><small>{memory.summary || memory.content || memory.extracted_text || `${memory.kind} saved to Neuron`}</small></span>
                  <span className={`activity-status ${memory.processing_status}`}>{memory.processing_status === "ready" ? "AI ready" : memory.processing_status}</span>
                  <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(memory.created_at))}</time>
                  <ArrowRight size={16} />
                </motion.button>;
              })}
            </div>
          </section>
        )) : <div className="activity-empty"><CalendarDays size={34} /><h3>No work in this range</h3><p>Capture a memory to begin building your history.</p><button className="primary-action" onClick={openCapture}><Plus size={16} /> Capture memory</button></div>}
      </section>
    </main>
  );
}

function ActivityStat({ icon: Icon, label, value, detail, color }: { icon: typeof CalendarDays; label: string; value: number; detail: string; color: string }) {
  return <article className="card activity-stat"><span className={`activity-stat-icon ${color}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function activityIcon(kind: MemoryRecord["kind"]) {
  if (kind === "Upload") return UploadCloud;
  if (kind === "Link") return Link2;
  if (kind === "Voice") return Mic;
  return FileText;
}
