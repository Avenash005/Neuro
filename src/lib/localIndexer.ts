/**
 * Neuron AI — Local File Indexing Pipeline
 *
 * Pipeline:
 *   Local file → Text Extraction → Chunking → Embedding → Local Index
 *
 * Text is extracted safely; no code is ever executed.
 * Embedding is done via Ollama (local) or deferred to cloud depending on settings.
 */

import { upsertLocalFile, listLocalFiles } from "./localDb";
import { readFileContent } from "./localFileSystem";
import type { LocalFileEntry } from "../types/local";

// ─── Text Extraction ──────────────────────────────────────────────────────

/**
 * Extract plain text from a file entry.
 * Returns the text content or null if extraction fails or is unsupported.
 *
 * Security: content is treated as text data only. No eval, no innerHTML.
 */
export async function extractText(
  entry: LocalFileEntry,
  folderId: string
): Promise<string | null> {
  const raw = await readFileContent(folderId, entry.filePath);
  if (raw === null) return null;

  switch (entry.fileType) {
    case "md":
    case "txt":
    case "csv":
    case "tsv":
    case "json":
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "env":
    case "sh":
    case "bash":
    case "sql":
    case "xml":
      return raw;

    case "html":
    case "htm": {
      // Strip tags safely — never execute scripts
      // Use a DOMParser in a sandboxed way
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "text/html");
      // Remove script and style elements
      doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
      return doc.body?.innerText ?? doc.body?.textContent ?? raw;
    }

    case "js":
    case "ts":
    case "tsx":
    case "jsx":
    case "py":
    case "rb":
    case "java":
    case "go":
    case "rs":
      // Return source as-is (it's data, not executed)
      return raw;

    case "pdf":
      // PDF binary — we cannot parse in the browser without a library.
      // Return a placeholder. The user can configure cloud AI to process PDFs.
      return `[PDF file: ${entry.fileName}. Cloud AI processing required for full text extraction.]`;

    case "docx":
    case "doc":
    case "rtf":
      // Binary formats — same as PDF
      return `[Document file: ${entry.fileName}. Cloud AI processing required for full text extraction.]`;

    default:
      return raw;
  }
}

// ─── Chunking ─────────────────────────────────────────────────────────────

const CHUNK_SIZE = 512;          // tokens ≈ characters / 4
const CHUNK_OVERLAP = 64;        // overlap in chars

export interface TextChunk {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

/**
 * Split text into overlapping chunks suitable for embedding.
 */
export function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  const chunkChars = CHUNK_SIZE * 4;
  const overlapChars = CHUNK_OVERLAP * 4;

  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkChars, text.length);
    chunks.push({
      index,
      text: text.slice(start, end),
      charStart: start,
      charEnd: end,
    });
    start += chunkChars - overlapChars;
    index++;
    if (start >= text.length) break;
  }

  return chunks;
}

// ─── Embedding via Ollama ─────────────────────────────────────────────────

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  provider: "local_ollama" | "cloud";
}

/**
 * Get a local embedding via Ollama REST API.
 * Returns null if Ollama is not reachable.
 */
export async function getLocalEmbedding(
  text: string,
  ollamaBaseUrl: string,
  model: string
): Promise<EmbeddingResult | null> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) return null;

    const data = await response.json() as { embedding: number[] };
    return {
      embedding: data.embedding,
      model,
      provider: "local_ollama",
    };
  } catch {
    return null;
  }
}

// ─── Full Indexing Pipeline ───────────────────────────────────────────────

export type IndexingProgress = {
  processed: number;
  total: number;
  currentFile: string;
};

export type IndexingOptions = {
  folderId: string;
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaEmbeddingModel: string;
  onProgress?: (progress: IndexingProgress) => void;
};

/**
 * Index all pending files in a folder.
 * Extracts text, chunks it, and optionally embeds using Ollama.
 * Stores results back into the local index.
 */
export async function indexPendingFiles(options: IndexingOptions): Promise<number> {
  const {
    folderId,
    ollamaEnabled,
    ollamaBaseUrl,
    ollamaEmbeddingModel,
    onProgress,
  } = options;

  const pending = (await listLocalFiles(folderId)).filter(
    (f) => f.indexStatus === "pending"
  );

  let processed = 0;

  for (const entry of pending) {
    onProgress?.({ processed, total: pending.length, currentFile: entry.fileName });

    try {
      // Extract text
      const text = await extractText(entry, folderId);

      if (!text) {
        await upsertLocalFile({ ...entry, indexStatus: "skipped", indexedAt: new Date().toISOString() });
        processed++;
        continue;
      }

      // Simple summary: first 300 chars of extracted text
      const summary = text.slice(0, 300).replace(/\s+/g, " ").trim();

      // Basic keyword tags from filename + content
      const tags = extractKeywordTags(entry.fileName, text);

      let updatedEntry: LocalFileEntry = {
        ...entry,
        extractedText: text,
        summary,
        tags,
        indexStatus: "processing",
      };

      await upsertLocalFile(updatedEntry);

      // Optionally embed via Ollama
      let embeddingId: string | null = null;

      if (ollamaEnabled) {
        const chunks = chunkText(text);
        // For now store a reference id; full vector store to be extended
        // Embed the first chunk as a representative embedding
        if (chunks.length > 0) {
          const result = await getLocalEmbedding(chunks[0].text, ollamaBaseUrl, ollamaEmbeddingModel);
          if (result) {
            // Store embedding in localStorage for lightweight persistence
            // (production would use a vector store like Chroma or FAISS)
            const embKey = `neuron_emb_${entry.id}`;
            localStorage.setItem(embKey, JSON.stringify(result.embedding));
            embeddingId = embKey;
          }
        }
      }

      updatedEntry = {
        ...updatedEntry,
        embeddingId,
        indexStatus: "ready",
        indexedAt: new Date().toISOString(),
      };

      await upsertLocalFile(updatedEntry);
      processed++;
    } catch {
      await upsertLocalFile({ ...entry, indexStatus: "error", indexedAt: new Date().toISOString() });
      processed++;
    }
  }

  return processed;
}

// ─── Keyword Tag Extraction ───────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "this", "that", "these",
  "those", "it", "its", "i", "you", "he", "she", "we", "they",
]);

function extractKeywordTags(fileName: string, content: string): string[] {
  // Include filename stem as a tag
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  const words = (stem + " " + content)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

// ─── Local Search ─────────────────────────────────────────────────────────

export interface LocalSearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  folderId: string;
  storageMode: import("../types/local").StorageMode;
  snippet: string;
  score: number;
  fileType: string;
  modifiedAt: string;
}

/**
 * Full-text keyword search across the local index.
 * Returns up to `limit` results sorted by relevance.
 */
export async function searchLocalFiles(
  query: string,
  folderId?: string,
  limit = 10
): Promise<LocalSearchResult[]> {
  const files = await listLocalFiles(folderId);
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (terms.length === 0) return [];

  const scored: (LocalSearchResult & { _score: number })[] = [];

  for (const file of files) {
    if (file.indexStatus !== "ready") continue;
    const haystack = (
      (file.fileName + " " + file.extractedText + " " + file.tags.join(" ")).toLowerCase()
    );

    let score = 0;
    for (const term of terms) {
      let pos = 0;
      while ((pos = haystack.indexOf(term, pos)) !== -1) {
        score++;
        pos++;
      }
    }

    if (score === 0) continue;

    // Build snippet around first match
    const firstTerm = terms[0];
    const matchPos = (file.extractedText ?? "").toLowerCase().indexOf(firstTerm);
    const snippetStart = Math.max(0, matchPos - 80);
    const snippetEnd = Math.min((file.extractedText ?? "").length, matchPos + 160);
    const snippet =
      matchPos >= 0
        ? "…" + (file.extractedText ?? "").slice(snippetStart, snippetEnd).replace(/\s+/g, " ") + "…"
        : (file.summary ?? "");

    scored.push({
      fileId: file.id,
      fileName: file.fileName,
      filePath: file.filePath,
      folderId: file.folderId,
      storageMode: file.storageMode,
      snippet,
      score,
      fileType: file.fileType,
      modifiedAt: file.modifiedAt,
      _score: score,
    });
  }

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score: _s, ...rest }) => rest);
}
