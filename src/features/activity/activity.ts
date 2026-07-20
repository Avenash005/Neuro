import type { MemoryRecord } from "../../lib/supabase";

export type ActivityRange = 7 | 30 | "all";

export type ActivityDay = {
  key: string;
  label: string;
  memories: MemoryRecord[];
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function filterActivityMemories(memories: MemoryRecord[], range: ActivityRange, now = new Date()) {
  if (range === "all") return [...memories].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const threshold = startOfLocalDay(now);
  threshold.setDate(threshold.getDate() - (range - 1));
  return memories
    .filter((memory) => new Date(memory.created_at) >= threshold)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

export function groupActivityByDay(memories: MemoryRecord[], range: ActivityRange, now = new Date()): ActivityDay[] {
  const today = localDateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate);
  const groups = new Map<string, MemoryRecord[]>();

  for (const memory of filterActivityMemories(memories, range, now)) {
    const key = localDateKey(new Date(memory.created_at));
    groups.set(key, [...(groups.get(key) || []), memory]);
  }

  return [...groups.entries()].map(([key, dayMemories]) => ({
    key,
    label: key === today ? "Today" : key === yesterday ? "Yesterday" : new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(`${key}T12:00:00`)),
    memories: dayMemories,
  }));
}

export function buildSevenDayActivity(memories: MemoryRecord[], now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = startOfLocalDay(now);
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date),
      count: memories.filter((memory) => localDateKey(new Date(memory.created_at)) === key).length,
      isToday: index === 6,
    };
  });
}
