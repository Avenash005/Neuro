import { describe, expect, it } from "vitest";
import { normalizeMemory } from "./supabase";

const baseMemory = {
  id: "memory-1",
  title: "Test memory",
  content: "A useful idea",
  created_at: "2026-07-19T00:00:00.000Z",
  storage_path: null,
  original_filename: null,
  mime_type: null,
  file_size: null,
  summary: null,
  extracted_text: null,
  extracted_at: null,
};

describe("normalizeMemory", () => {
  it("maps database values into UI-safe values", () => {
    expect(normalizeMemory({ ...baseMemory, kind: "voice", processing_status: "ready" })).toEqual({
      ...baseMemory,
      kind: "Voice",
      processing_status: "ready",
    });
  });

  it("falls back safely for unknown database values", () => {
    expect(normalizeMemory({ ...baseMemory, kind: "future-format", processing_status: "unknown" })).toMatchObject({
      kind: "Note",
      processing_status: "pending",
    });
  });
});
