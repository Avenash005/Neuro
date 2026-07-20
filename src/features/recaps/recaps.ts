import type { ActionItemRecord, MemoryRecord } from "../../lib/supabase";

export type RecapRange = "today" | "week" | "month";

export type RecapDay = {
  key: string;
  label: string;
  memories: MemoryRecord[];
  completed: ActionItemRecord[];
};

export type WorkspaceRecap = {
  memories: MemoryRecord[];
  completed: ActionItemRecord[];
  openActions: ActionItemRecord[];
  activeDays: number;
  readyCount: number;
  streak: number;
  topTags: Array<{ label: string; count: number }>;
  kindCounts: Array<{ kind: MemoryRecord["kind"]; count: number }>;
  highlight: MemoryRecord | null;
  days: RecapDay[];
  narrative: string;
};

const RANGE_DAYS: Record<RecapRange, number> = { today: 1, week: 7, month: 30 };

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodStart(range: RecapRange, now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (RANGE_DAYS[range] - 1));
  return start;
}

export function buildWorkspaceRecap(memories: MemoryRecord[], actionItems: ActionItemRecord[], range: RecapRange, now = new Date()): WorkspaceRecap {
  const start = periodStart(range, now);
  const periodMemories = memories.filter((memory) => new Date(memory.created_at) >= start).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const completed = actionItems.filter((item) => item.status === "completed" && item.completed_at && new Date(item.completed_at) >= start).sort((left, right) => Date.parse(right.completed_at || "") - Date.parse(left.completed_at || ""));
  const openActions = actionItems.filter((item) => item.status === "accepted");
  const activeKeys = new Set([
    ...periodMemories.map((memory) => localDateKey(new Date(memory.created_at))),
    ...completed.map((item) => localDateKey(new Date(item.completed_at || item.updated_at))),
  ]);

  const tagCounts = new Map<string, { label: string; count: number }>();
  for (const tag of periodMemories.flatMap((memory) => memory.tags)) {
    const label = tag.trim();
    const key = label.toLowerCase();
    if (!key) continue;
    const current = tagCounts.get(key);
    tagCounts.set(key, { label: current?.label || label, count: (current?.count || 0) + 1 });
  }
  const topTags = [...tagCounts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)).slice(0, 5);
  const kinds: MemoryRecord["kind"][] = ["Note", "Upload", "Link", "Voice"];
  const kindCounts = kinds.map((kind) => ({ kind, count: periodMemories.filter((memory) => memory.kind === kind).length })).filter((item) => item.count > 0);
  const highlight = periodMemories.find((memory) => memory.is_favorite) || periodMemories.find((memory) => memory.processing_status === "ready") || periodMemories[0] || null;
  const days = [...activeKeys].sort((left, right) => right.localeCompare(left)).map((key) => ({
    key,
    label: friendlyDayLabel(key, now),
    memories: periodMemories.filter((memory) => localDateKey(new Date(memory.created_at)) === key),
    completed: completed.filter((item) => localDateKey(new Date(item.completed_at || item.updated_at)) === key),
  }));
  const streak = calculateStreak(memories, now);
  const topic = topTags[0]?.label;
  const narrative = periodMemories.length
    ? `You captured ${periodMemories.length} ${periodMemories.length === 1 ? "memory" : "memories"}. Your workspace was active across ${activeKeys.size} ${activeKeys.size === 1 ? "day" : "days"}${topic ? `, with ${topic} appearing most often` : ""}. You completed ${completed.length} ${completed.length === 1 ? "action" : "actions"} and have ${openActions.length} still in progress.`
    : `No memories were captured in this period. You completed ${completed.length} ${completed.length === 1 ? "action" : "actions"} and have ${openActions.length} still in progress.`;

  return {
    memories: periodMemories,
    completed,
    openActions,
    activeDays: activeKeys.size,
    readyCount: periodMemories.filter((memory) => memory.processing_status === "ready").length,
    streak,
    topTags,
    kindCounts,
    highlight,
    days,
    narrative,
  };
}

export function calculateStreak(memories: MemoryRecord[], now = new Date()) {
  const keys = new Set(memories.map((memory) => localDateKey(new Date(memory.created_at))));
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (keys.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function friendlyDayLabel(key: string, now: Date) {
  const today = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === today) return "Today";
  if (key === localDateKey(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00`));
}
