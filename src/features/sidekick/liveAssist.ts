import type { LiveAssistBriefing } from "../../lib/supabase";

export function toggleMemorySelection(current: string[], memoryId: string, maximum = 8) {
  if (current.includes(memoryId)) return current.filter((id) => id !== memoryId);
  return current.length >= maximum ? current : [...current, memoryId];
}

export function formatLiveAssistBriefing(briefing: LiveAssistBriefing) {
  const citationLabel = (citations: number[]) => citations.map((number) => `[${number}]`).join(" ");
  const section = (title: string, items: LiveAssistBriefing["talkingPoints"]) => items.length
    ? `\n${title}\n${items.map((item) => `- ${item.text} ${citationLabel(item.citations)}`).join("\n")}`
    : "";
  const sources = briefing.citations.length ? `\nSources\n${briefing.citations.map((citation) => `[${citation.number}] ${citation.title}`).join("\n")}` : "";
  return `Neuron Sidekick briefing\n\n${briefing.brief} ${citationLabel(briefing.briefCitations)}${section("Talking points", briefing.talkingPoints)}${section("Commitments", briefing.commitments)}${section("Questions to ask", briefing.questions)}${sources}`.trim();
}
