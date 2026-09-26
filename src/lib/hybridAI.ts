/**
 * Neuron AI — Hybrid AI Layer
 *
 * Provides a unified interface for both local (Ollama) and cloud AI.
 * The user always knows which provider is being used.
 *
 * Local AI (Ollama):
 *  - Runs entirely on the user's device
 *  - Sensitive documents can be processed without leaving the machine
 *  - Requires Ollama to be installed and running
 *
 * Cloud AI:
 *  - More powerful reasoning, larger context windows
 *  - Data leaves the device — the user is always informed
 *  - Used only when explicitly enabled
 */

import type { AIProcessingInfo, AIProvider } from "../types/local";
import { searchLocalFiles, type LocalSearchResult } from "./localIndexer";
import type { MemoryRecord } from "./supabase";

// ─── Ollama Chat ───────────────────────────────────────────────────────────

export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OllamaStreamChunk {
  model: string;
  message?: { role: string; content: string };
  done: boolean;
}

/**
 * Check if Ollama is reachable at the given base URL.
 */
export async function checkOllamaHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available Ollama models.
 */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Stream a chat response from Ollama.
 * Yields text chunks as they arrive.
 */
export async function* streamOllamaChat(
  baseUrl: string,
  model: string,
  messages: OllamaMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const chunk = JSON.parse(line) as OllamaStreamChunk;
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
          if (chunk.done) return;
        } catch {
          // malformed JSON line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Hybrid AI Query ──────────────────────────────────────────────────────

export interface HybridQueryOptions {
  query: string;
  localResults?: LocalSearchResult[];
  cloudResults?: MemoryRecord[];
  provider: AIProvider;
  ollamaBaseUrl?: string;
  ollamaChatModel?: string;
  signal?: AbortSignal;
}

export interface HybridQueryResult {
  answer: string;
  provider: AIProvider;
  processingInfo: AIProcessingInfo;
  sources: QuerySource[];
}

export interface QuerySource {
  id: string;
  title: string;
  snippet: string;
  source: "local" | "cloud";
  filePath?: string;
  fileType?: string;
}

/**
 * Build a context-enriched prompt from search results.
 */
function buildContextPrompt(
  query: string,
  localResults: LocalSearchResult[],
  cloudResults: MemoryRecord[]
): string {
  const localContext = localResults
    .slice(0, 5)
    .map(
      (r, i) =>
        `[Local Source ${i + 1}: ${r.fileName}]\n${r.snippet}`
    )
    .join("\n\n");

  const cloudContext = cloudResults
    .slice(0, 5)
    .map(
      (r, i) =>
        `[Cloud Source ${i + 1}: ${r.title}]\n${r.extracted_text?.slice(0, 400) ?? r.summary ?? r.content}`
    )
    .join("\n\n");

  const combined = [localContext, cloudContext].filter(Boolean).join("\n\n---\n\n");

  return `You are Neuron AI, a personal knowledge assistant.
Use the following sources from the user's personal knowledge base to answer their question.
Always cite which source the information came from.

SOURCES:
${combined || "No specific sources found."}

USER QUESTION: ${query}

Answer based on the sources above. Be specific and cite sources. If no relevant sources were found, say so clearly.`;
}

/**
 * Run a hybrid AI query using either local Ollama or cloud AI.
 * Returns a streaming async generator if possible.
 */
export async function* streamHybridAnswer(
  options: HybridQueryOptions
): AsyncGenerator<string, HybridQueryResult, unknown> {
  const {
    query,
    localResults = [],
    cloudResults = [],
    provider,
    ollamaBaseUrl = "http://localhost:11434",
    ollamaChatModel = "llama3",
    signal,
  } = options;

  const contextPrompt = buildContextPrompt(query, localResults, cloudResults);

  const sources: QuerySource[] = [
    ...localResults.slice(0, 5).map((r) => ({
      id: r.fileId,
      title: r.fileName,
      snippet: r.snippet,
      source: "local" as const,
      filePath: r.filePath,
      fileType: r.fileType,
    })),
    ...cloudResults.slice(0, 5).map((r) => ({
      id: r.id,
      title: r.title,
      snippet: r.extracted_text?.slice(0, 200) ?? r.summary ?? r.content,
      source: "cloud" as const,
    })),
  ];

  if (provider === "local_ollama") {
    const messages: OllamaMessage[] = [
      { role: "system", content: "You are Neuron AI, a private personal knowledge assistant running entirely on this device." },
      { role: "user", content: contextPrompt },
    ];

    let fullAnswer = "";

    try {
      for await (const chunk of streamOllamaChat(ollamaBaseUrl, ollamaChatModel, messages, signal)) {
        fullAnswer += chunk;
        yield chunk;
      }
    } catch (err) {
      const errMsg = `\n\n⚠️ Local AI error: ${err instanceof Error ? err.message : String(err)}`;
      yield errMsg;
      fullAnswer += errMsg;
    }

    return {
      answer: fullAnswer,
      provider: "local_ollama",
      processingInfo: { provider: "local_ollama", modelName: ollamaChatModel, isLocal: true },
      sources,
    };
  }

  // Cloud AI — will be handled by the existing Supabase edge function
  // This fallback is a stub that signals to the caller to use cloud
  yield "[CLOUD_AI_REQUIRED]";

  return {
    answer: "[CLOUD_AI_REQUIRED]",
    provider: "cloud",
    processingInfo: { provider: "cloud", modelName: "cloud", isLocal: false },
    sources,
  };
}

// ─── Provider Info Display ────────────────────────────────────────────────

export function getAIProviderLabel(provider: AIProvider): {
  label: string;
  description: string;
  indicator: "green" | "blue";
} {
  if (provider === "local_ollama") {
    return {
      label: "🟢 Local AI",
      description: "Processing on this device. Your data does not leave your computer.",
      indicator: "green",
    };
  }
  return {
    label: "☁ Cloud AI",
    description: "This query will be processed by your configured cloud AI provider.",
    indicator: "blue",
  };
}

// ─── Hybrid Context Builder ───────────────────────────────────────────────

export interface HybridSearchContext {
  query: string;
  localResults: LocalSearchResult[];
  cloudResults: MemoryRecord[];
  totalLocalFiles: number;
  totalCloudMemories: number;
}

/**
 * Gather search context from both local and cloud sources.
 */
export async function buildHybridContext(
  query: string,
  cloudResults: MemoryRecord[],
  folderId?: string
): Promise<HybridSearchContext> {
  const localResults = await searchLocalFiles(query, folderId, 10);

  return {
    query,
    localResults,
    cloudResults: cloudResults.slice(0, 10),
    totalLocalFiles: localResults.length,
    totalCloudMemories: cloudResults.length,
  };
}
