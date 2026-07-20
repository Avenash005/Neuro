import { describe, expect, it } from "vitest";
import type { LiveAssistBriefing } from "../../lib/supabase";
import { formatLiveAssistBriefing, toggleMemorySelection } from "./liveAssist";

describe("Live Assist helpers", () => {
  it("toggles scoped memories without exceeding the limit", () => {
    expect(toggleMemorySelection(["a"], "a")).toEqual([]);
    expect(toggleMemorySelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleMemorySelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("formats a cited briefing for manual copying", () => {
    const briefing: LiveAssistBriefing = { brief: "Authentication is complete.", briefCitations: [1], talkingPoints: [{ text: "Share the release status.", citations: [1] }], commitments: [], questions: [], citations: [{ number: 1, memoryId: "m1", title: "Project update" }], model: null };
    const text = formatLiveAssistBriefing(briefing);
    expect(text).toContain("Authentication is complete. [1]");
    expect(text).toContain("[1] Project update");
  });
});
