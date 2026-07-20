import { describe, expect, it } from "vitest";
import type { StudyCardRecord } from "../../lib/supabase";
import { buildQuizOptions, filterStudyCards } from "./study";

const card: StudyCardRecord = { id: "card-1", memory_id: "memory-1", question: "What is Neuron?", answer: "A second brain", distractors: ["A calendar", "A second brain", "A spreadsheet"], confidence: 1, evidence: "Neuron is a second brain", created_at: "2026-07-20T00:00:00Z", updated_at: "2026-07-20T00:00:00Z" };

describe("study mode", () => {
  it("builds stable, unique quiz options containing the correct answer", () => {
    const first = buildQuizOptions(card);
    expect(first).toEqual(buildQuizOptions(card));
    expect(first).toContain(card.answer);
    expect(new Set(first).size).toBe(first.length);
  });

  it("filters cards by source and question text", () => {
    const second = { ...card, id: "card-2", memory_id: "memory-2", question: "How does React render?", answer: "With a virtual DOM" };
    expect(filterStudyCards([card, second], "memory-2", "react")).toEqual([second]);
    expect(filterStudyCards([card, second], "all", "second brain")).toEqual([card]);
  });
});
