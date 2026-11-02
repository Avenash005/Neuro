/**
 * Neuron AI — Retrieval Engine
 *
 * Orchestrates parallel search across all connected source connectors.
 * After retrieval: normalizes, ranks, deduplicates, and builds AI context.
 *
 * Pipeline:
 *   Query → Source Router → Parallel Search → Rank → Deduplicate → Context
 */

import type {
  RetrievalQuery,
  RetrievalOutput,
  RankedResult,
  ContextChunk,
  KnowledgeItem,
  SourceConnector,
} from "../../types/connectors";
import { parseQuery } from "./sourceRouter";
import type { RouterContext } from "./sourceRouter";

// ─── Retrieval Engine ─────────────────────────────────────────────────────

export interface RetrievalOptions {
  query: string;
  connectors: Map<string, SourceConnector>;
  context: RouterContext;
  limit?: number;
  /** Force search only these provider IDs regardless of routing */
  forceProviderIds?: string[];
  includeFailedProviders?: boolean;
}

/**
 * Run a full retrieval pass across connected sources.
 */
export async function retrieve(options: RetrievalOptions): Promise<RetrievalOutput> {
  const startMs = Date.now();
  const {
    query,
    connectors,
    context,
    limit = 20,
    forceProviderIds,
  } = options;

  const parsedQuery = parseQuery(query, context);
  const providerIds = forceProviderIds ?? parsedQuery.route.providerIds;

  const searchedProviders: string[] = [];
  const failedProviders: { providerId: string; error: string }[] = [];
  const allItems: KnowledgeItem[] = [];

  // ── Parallel search across all routed providers ──────────────────────
  const searchJobs = providerIds
    .filter((pid) => connectors.has(pid))
    .map(async (pid) => {
      const connector = connectors.get(pid)!;
      if (!connector.isReady()) {
        failedProviders.push({ providerId: pid, error: "Connector not ready" });
        return;
      }
      try {
        const result = await connector.search({
          query: parsedQuery.normalized,
          limit,
        });
        allItems.push(...result.items);
        searchedProviders.push(pid);
      } catch (err) {
        failedProviders.push({
          providerId: pid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  await Promise.allSettled(searchJobs);

  // ── Rank ─────────────────────────────────────────────────────────────
  const ranked = rankResults(allItems, parsedQuery);

  // ── Deduplicate ───────────────────────────────────────────────────────
  const deduplicated = deduplicateResults(ranked);

  // ── Limit ─────────────────────────────────────────────────────────────
  const topResults = deduplicated.slice(0, limit);

  // ── Source breakdown ──────────────────────────────────────────────────
  const sourceBreakdown: Record<string, number> = {};
  for (const r of topResults) {
    const pid = r.item.sourceProvider;
    sourceBreakdown[pid] = (sourceBreakdown[pid] ?? 0) + 1;
  }

  // ── Context builder ───────────────────────────────────────────────────
  const contextChunks = buildContext(topResults, parsedQuery);

  return {
    query: parsedQuery,
    results: topResults,
    sourceBreakdown,
    searchedProviders,
    failedProviders,
    durationMs: Date.now() - startMs,
    contextChunks,
  };
}

// ─── Ranking ──────────────────────────────────────────────────────────────

const NOW_MS = Date.now();

function rankResults(items: KnowledgeItem[], query: RetrievalQuery): RankedResult[] {
  const terms = query.normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  return items.map((item) => {
    // 1. Keyword relevance
    const haystack = (item.title + " " + item.content + " " + item.snippet).toLowerCase();
    let keywordScore = 0;
    for (const term of terms) {
      let pos = 0;
      while ((pos = haystack.indexOf(term, pos)) !== -1) {
        // Title matches worth more
        const inTitle = item.title.toLowerCase().includes(term);
        keywordScore += inTitle ? 3 : 1;
        pos++;
      }
    }

    // 2. Recency
    const ageMs = NOW_MS - new Date(item.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - ageDays / 365); // decay over 1 year

    // 3. Source relevance (was this provider explicitly hinted?)
    const sourceRelevanceScore = query.route.providerIds.includes(item.sourceProvider)
      ? query.route.strategy === "explicit" ? 2 : 1
      : 0.5;

    const totalScore = keywordScore * 0.6 + recencyScore * 0.2 + sourceRelevanceScore * 0.2;

    return {
      item,
      totalScore,
      keywordScore,
      recencyScore,
      sourceRelevanceScore,
      isDuplicate: false,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

// ─── Deduplication ────────────────────────────────────────────────────────

/** Rough similarity: same content hash or title Jaccard similarity > 0.7 */
function areSimilar(a: KnowledgeItem, b: KnowledgeItem): boolean {
  if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) return true;
  // Jaccard similarity on title bigrams
  const bigrams = (s: string): Set<string> => {
    const tokens = s.toLowerCase().split(/\s+/);
    const bg = new Set<string>();
    for (let i = 0; i < tokens.length - 1; i++) bg.add(`${tokens[i]}_${tokens[i + 1]}`);
    return bg;
  };
  const ba = bigrams(a.title);
  const bb = bigrams(b.title);
  if (ba.size === 0 || bb.size === 0) return false;
  const intersection = [...ba].filter((x) => bb.has(x)).length;
  const union = new Set([...ba, ...bb]).size;
  return intersection / union > 0.7;
}

function deduplicateResults(ranked: RankedResult[]): RankedResult[] {
  const groups = new Map<string, RankedResult>();
  const result: RankedResult[] = [];
  let groupCounter = 0;

  for (const r of ranked) {
    let placed = false;
    for (const [groupId, representative] of groups) {
      if (areSimilar(r.item, representative.item)) {
        result.push({ ...r, isDuplicate: true, duplicateGroupId: groupId });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const groupId = `g${groupCounter++}`;
      groups.set(groupId, r);
      result.push({ ...r, isDuplicate: false, duplicateGroupId: groupId });
    }
  }

  return result;
}

// ─── Context Builder ──────────────────────────────────────────────────────

const MAX_CONTEXT_ITEMS = 8;
const MAX_CHUNK_CHARS = 600;

/**
 * Select the most relevant non-duplicate results and truncate them to
 * a manageable context size for the AI.
 */
function buildContext(results: RankedResult[], _query: RetrievalQuery): ContextChunk[] {
  return results
    .filter((r) => !r.isDuplicate)
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((r) => ({
      sourceId: r.item.sourceId,
      providerId: r.item.sourceProvider,
      title: r.item.title,
      content: r.item.content.slice(0, MAX_CHUNK_CHARS),
      url: r.item.url,
      score: r.totalScore,
    }));
}

// ─── Context → AI Prompt ──────────────────────────────────────────────────

/**
 * Format retrieval output into a prompt string for an AI model.
 */
export function buildAIPrompt(output: RetrievalOutput): string {
  const { query, contextChunks, searchedProviders, failedProviders } = output;

  const providerList = searchedProviders.map((p) => `✓ ${p}`).join("\n");
  const failedList = failedProviders.map((f) => `✗ ${f.providerId}: ${f.error}`).join("\n");

  const contextBlock = contextChunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.title} — ${c.providerId}]\n${c.content}`
    )
    .join("\n\n---\n\n");

  return `You are Neuron AI, a personal knowledge assistant.
You searched the following sources on the user's behalf:
${providerList}${failedList ? `\n\nThese sources were unavailable:\n${failedList}` : ""}

RETRIEVED KNOWLEDGE:
${contextBlock || "No relevant documents found."}

USER QUESTION: ${query.raw}

Answer based on the retrieved knowledge. Be specific. Always cite which source the information came from using the format: [Source N: Title — provider]. If you cannot answer from the retrieved knowledge, say so clearly.`;
}

// ─── Source Summary ───────────────────────────────────────────────────────

export interface SourceSummary {
  providerId: string;
  count: number;
  topTitle: string;
}

export function summarizeSources(output: RetrievalOutput): SourceSummary[] {
  return Object.entries(output.sourceBreakdown).map(([pid, count]) => {
    const topResult = output.results.find((r) => r.item.sourceProvider === pid);
    return {
      providerId: pid,
      count,
      topTitle: topResult?.item.title ?? "",
    };
  });
}
