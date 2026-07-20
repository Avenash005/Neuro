import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "../../lib/supabase";
import { buildSevenDayActivity, filterActivityMemories, groupActivityByDay } from "./activity";

function memory(id: string, createdAt: string): MemoryRecord {
  return {
    id,
    title: id,
    content: "",
    kind: "Note",
    created_at: createdAt,
    processing_status: "ready",
    storage_path: null,
    original_filename: null,
    mime_type: null,
    file_size: null,
    summary: null,
    extracted_text: null,
    extracted_at: null,
  };
}

const now = new Date("2026-07-20T12:00:00");

describe("activity history", () => {
  const memories = [
    memory("today", "2026-07-20T09:00:00"),
    memory("yesterday", "2026-07-19T20:00:00"),
    memory("old", "2026-06-01T10:00:00"),
  ];

  it("filters by the requested past-day window", () => {
    expect(filterActivityMemories(memories, 7, now).map((item) => item.id)).toEqual(["today", "yesterday"]);
    expect(filterActivityMemories(memories, "all", now)).toHaveLength(3);
  });

  it("groups recent work with friendly date labels", () => {
    expect(groupActivityByDay(memories, 7, now).map((day) => day.label)).toEqual(["Today", "Yesterday"]);
  });

  it("builds seven complete chart buckets", () => {
    const chart = buildSevenDayActivity(memories, now);
    expect(chart).toHaveLength(7);
    expect(chart.at(-1)).toMatchObject({ count: 1, isToday: true });
  });
});
