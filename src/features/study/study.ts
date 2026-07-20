import type { StudyCardRecord } from "../../lib/supabase";

function optionHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildQuizOptions(card: StudyCardRecord) {
  const seen = new Set<string>();
  return [card.answer, ...card.distractors]
    .filter((option) => {
      const normalized = option.trim().toLowerCase().replace(/\s+/g, " ");
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .sort((left, right) => optionHash(`${card.id}:${left}`) - optionHash(`${card.id}:${right}`));
}

export function filterStudyCards(cards: StudyCardRecord[], memoryId: string, query: string) {
  const normalized = query.trim().toLowerCase();
  return cards.filter((card) => {
    if (memoryId !== "all" && card.memory_id !== memoryId) return false;
    return !normalized || `${card.question} ${card.answer}`.toLowerCase().includes(normalized);
  });
}
