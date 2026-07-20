import { describe, expect, it } from "vitest";
import type { ActionItemRecord, MemoryRecord } from "../../lib/supabase";
import { buildWorkspaceRecap, calculateStreak } from "./recaps";

function memory(id: string, createdAt: string, tags: string[] = []): MemoryRecord {
  return { id, title: id, content: "", kind: "Note", created_at: createdAt, processing_status: "ready", storage_path: null, original_filename: null, mime_type: null, file_size: null, summary: null, extracted_text: null, extracted_at: createdAt, is_favorite: false, tags, graph_analyzed_at: null };
}

function task(id: string, status: ActionItemRecord["status"], completedAt: string | null): ActionItemRecord {
  return { id, memory_id: "today", title: id, description: "", item_type: "task", status, due_at: null, confidence: 1, evidence: "", completed_at: completedAt, created_at: "2026-07-18T10:00:00Z", updated_at: completedAt || "2026-07-18T10:00:00Z" };
}

const now = new Date("2026-07-20T12:00:00");

describe("workspace recaps", () => {
  const memories = [memory("today", "2026-07-20T08:00:00", ["Neuron", "Startup"]), memory("yesterday", "2026-07-19T09:00:00", ["neuron"]), memory("old", "2026-06-01T09:00:00", ["Archive"])];

  it("summarizes only the requested period", () => {
    const recap = buildWorkspaceRecap(memories, [task("done", "completed", "2026-07-20T10:00:00"), task("open", "accepted", null)], "week", now);
    expect(recap.memories.map((item) => item.id)).toEqual(["today", "yesterday"]);
    expect(recap.completed).toHaveLength(1);
    expect(recap.openActions).toHaveLength(1);
    expect(recap.activeDays).toBe(2);
  });

  it("ranks normalized topics and groups daily work", () => {
    const recap = buildWorkspaceRecap(memories, [], "week", now);
    expect(recap.topTags[0]).toEqual({ label: "Neuron", count: 2 });
    expect(recap.days.map((day) => day.label)).toEqual(["Today", "Yesterday"]);
  });

  it("calculates the current consecutive capture streak", () => {
    expect(calculateStreak(memories, now)).toBe(2);
    expect(calculateStreak([memory("yesterday", "2026-07-19T09:00:00")], now)).toBe(0);
  });
});
