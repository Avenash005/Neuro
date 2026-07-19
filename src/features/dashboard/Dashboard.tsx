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
import { useState } from "react";
import { SearchBox } from "../../components/layout/AppLayout";
import { recentItems } from "../../data/mockData";
import type { LibraryItem } from "../../types/app";

type DashboardProps = {
  onSearch: (query: string) => void;
  openCapture: () => void;
  openAssistant: () => void;
};

export function Dashboard({ onSearch, openCapture, openAssistant }: DashboardProps) {
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
            <TimelineItem time="09:42" icon={Link2} title="Saved Linear’s product principles" detail="Added to Design references" />
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

function RecentCard({ item, index }: { item: LibraryItem; index: number }) {
  const Icon = item.icon;
  const [favorite, setFavorite] = useState(index === 2);
  return (
    <motion.article className="recent-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 + index * .05 }} whileHover={{ y: -4 }}>
      <div className="recent-top"><span className={`file-icon ${item.color}`}><Icon size={19} /></span><button className={favorite ? "starred" : ""} onClick={() => setFavorite(!favorite)} aria-label="Favorite"><Star size={17} fill={favorite ? "currentColor" : "none"} /></button></div>
      <span className="item-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p><div className="recent-meta"><span>{item.meta}</span><span>2d ago</span></div>
    </motion.article>
  );
}

function TimelineItem({ time, icon: Icon, title, detail }: { time: string; icon: LucideIcon; title: string; detail: string }) {
  return <div className="timeline-item"><span className="time">{time}</span><span className="timeline-icon"><Icon size={15} /></span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
