import { motion } from "framer-motion";
import { ArrowRight, BellRing, Check, CheckCircle2, Clock3, ListTodo, Sparkles, X } from "lucide-react";
import { useMemo } from "react";
import type { ActionItemRecord, ActionItemStatus, MemoryRecord } from "../../lib/supabase";

type TasksViewProps = {
  items: ActionItemRecord[];
  memories: MemoryRecord[];
  onChangeStatus: (id: string, status: Exclude<ActionItemStatus, "suggested">) => Promise<void>;
  onOpenMemory: (memory: MemoryRecord) => void;
};

export function TasksView({ items, memories, onChangeStatus, onOpenMemory }: TasksViewProps) {
  const groups = useMemo(() => ({
    suggested: items.filter((item) => item.status === "suggested"),
    accepted: items.filter((item) => item.status === "accepted"),
    completed: items.filter((item) => item.status === "completed"),
  }), [items]);

  const sourceFor = (item: ActionItemRecord) => memories.find((memory) => memory.id === item.memory_id);

  return (
    <main className="page-content tasks-page">
      <section className="page-intro tasks-intro">
        <div><span>Your next moves</span><h1>Tasks</h1><p>Neuron finds possible actions in your memories. You decide what becomes real.</p></div>
        <div className="tasks-summary"><strong>{groups.accepted.length}</strong><span>to do</span></div>
      </section>

      <section className="task-review card">
        <div className="card-heading"><div><span className="card-kicker"><Sparkles size={14} /> Review</span><h2>Suggestions from your memories</h2></div><span className="task-count">{groups.suggested.length}</span></div>
        <p className="task-review-note">AI suggestions stay here until you accept or dismiss them.</p>
        {groups.suggested.length ? <div className="task-list">{groups.suggested.map((item) => (
          <ActionRow key={item.id} item={item} source={sourceFor(item)} onOpenMemory={onOpenMemory} actions={<>
            <button className="task-action accept" onClick={() => void onChangeStatus(item.id, "accepted")}><Check size={14} /> Accept</button>
            <button className="task-action" onClick={() => void onChangeStatus(item.id, "dismissed")}><X size={14} /> Dismiss</button>
          </>} />
        ))}</div> : <Empty icon={Sparkles} text="No suggestions waiting for review." />}
      </section>

      <section className="tasks-columns">
        <article className="card task-column">
          <div className="card-heading"><div><span className="card-kicker neutral"><ListTodo size={14} /> To do</span><h2>Accepted actions</h2></div><span className="task-count">{groups.accepted.length}</span></div>
          {groups.accepted.length ? <div className="task-list">{groups.accepted.map((item) => (
            <ActionRow key={item.id} item={item} source={sourceFor(item)} onOpenMemory={onOpenMemory} actions={<button className="task-action accept" onClick={() => void onChangeStatus(item.id, "completed")}><CheckCircle2 size={14} /> Complete</button>} />
          ))}</div> : <Empty icon={ListTodo} text="Accept a suggestion to add it here." />}
        </article>

        <article className="card task-column">
          <div className="card-heading"><div><span className="card-kicker neutral"><CheckCircle2 size={14} /> Done</span><h2>Completed</h2></div><span className="task-count">{groups.completed.length}</span></div>
          {groups.completed.length ? <div className="task-list">{groups.completed.map((item) => (
            <ActionRow key={item.id} item={item} source={sourceFor(item)} onOpenMemory={onOpenMemory} completed actions={<button className="task-action" onClick={() => void onChangeStatus(item.id, "accepted")}><Clock3 size={14} /> Reopen</button>} />
          ))}</div> : <Empty icon={CheckCircle2} text="Completed actions will appear here." />}
        </article>
      </section>
    </main>
  );
}

function ActionRow({ item, source, actions, completed = false, onOpenMemory }: { item: ActionItemRecord; source?: MemoryRecord; actions: React.ReactNode; completed?: boolean; onOpenMemory: (memory: MemoryRecord) => void }) {
  return <motion.article className={`action-item ${completed ? "completed" : ""}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    <span className={`action-item-icon ${item.item_type}`} >{item.item_type === "reminder" ? <BellRing size={16} /> : <ListTodo size={16} />}</span>
    <div className="action-item-copy"><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}<div className="action-item-meta">{item.due_at && <time><Clock3 size={12} /> {formatDue(item.due_at)}</time>}{source && <button onClick={() => onOpenMemory(source)}>From {source.title} <ArrowRight size={12} /></button>}</div>{item.evidence && <small>“{item.evidence}”</small>}</div>
    <div className="action-item-actions">{actions}</div>
  </motion.article>;
}

function Empty({ icon: Icon, text }: { icon: typeof Sparkles; text: string }) {
  return <div className="task-empty"><Icon size={24} /><span>{text}</span></div>;
}

function formatDue(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
