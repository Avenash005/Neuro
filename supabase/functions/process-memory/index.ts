// Supabase's remote function bundler requires an explicit npm: specifier.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
// Supabase's remote function bundler also requires an explicit npm specifier here.
// deno-lint-ignore no-import-prefix
import { unzipSync } from "npm:fflate@0.8.2";
import {
  createNvidiaEmbedding,
  embeddingText,
  NVIDIA_EMBEDDING_MODEL,
  vectorLiteral,
} from "../_shared/nvidia-embeddings.ts";

type ProcessingJob = {
  id: string;
  user_id: string;
  memory_id: string;
  job_type: "extract" | "ocr" | "transcribe" | "fetch_url" | "enrich" | "embed";
  attempts: number;
};

type Memory = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  kind: string;
  source_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  summary: string | null;
  extracted_text: string | null;
};

type ExtractionResult = {
  extracted_text: string;
  summary: string;
  tags: string[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  action_items: ExtractedActionItem[];
  study_cards: ExtractedStudyCard[];
  model: string;
  provider: "nvidia" | "openai" | "local";
};

type ExtractedActionItem = {
  title: string;
  description: string;
  type: "task" | "reminder";
  due_at: string | null;
  confidence: number;
  evidence: string;
};

type ExtractedStudyCard = {
  question: string;
  answer: string;
  distractors: string[];
  confidence: number;
  evidence: string;
};

type EntityType = "person" | "organization" | "technology" | "date" | "url" | "place" | "concept";

type ExtractedEntity = {
  key: string;
  name: string;
  type: EntityType;
  confidence: number;
  evidence: string;
};

type ExtractedRelationship = {
  source: string;
  target: string;
  type: string;
  confidence: number;
  evidence: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_WEB_BYTES = 1_500_000;
const MAX_MODEL_TEXT = 120_000;
const NVIDIA_BASE_URL = (Deno.env.get("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
const NVIDIA_TEXT_MODEL = Deno.env.get("NVIDIA_TEXT_MODEL") || "nvidia/nemotron-3-nano-30b-a3b";
const NVIDIA_VISION_MODEL = Deno.env.get("NVIDIA_VISION_MODEL") || "nvidia/nemotron-nano-12b-v2-vl";
const NVIDIA_TRANSCRIPTION_URL = Deno.env.get("NVIDIA_TRANSCRIPTION_URL") ||
  "https://1598d209-5e27-4d3c-8079-4751568b1081.invocation.api.nvcf.nvidia.com/v1/audio/transcriptions";
const OPENAI_EXTRACTION_MODEL = Deno.env.get("OPENAI_EXTRACTION_MODEL") || "gpt-5.6-luna";
const OPENAI_TRANSCRIPTION_MODEL = Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || "gpt-4o-mini-transcribe";
const NVIDIA_INLINE_IMAGE_BYTES = 180_000;
const OPEN_XML_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

class TerminalProcessingError extends Error {}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function getSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
  const secret = secretMap.default || Object.values(secretMap)[0];
  if (!secret) throw new TerminalProcessingError("Supabase secret key is unavailable in the function environment.");
  return secret;
}

function bearerToken(request: Request) {
  const value = request.headers.get("Authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function valuesMatch(left: string, right: string) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function safetyIdentifier(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`neuron:${userId}`));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function localExtraction(text: string): ExtractionResult {
  const normalized = text.replace(/\s+/g, " ").trim();
  return {
    extracted_text: text.trim(),
    summary: normalized.slice(0, 280),
    tags: [],
    entities: [],
    relationships: [],
    action_items: [],
    study_cards: [],
    model: "local-text-extractor",
    provider: "local",
  };
}

function validatedExtraction(parsed: Partial<ExtractionResult>): Omit<ExtractionResult, "model" | "provider"> {
  if (typeof parsed.extracted_text !== "string" || typeof parsed.summary !== "string" || !Array.isArray(parsed.tags)) {
    throw new Error("The AI provider returned an invalid extraction result.");
  }
  const allowedTypes = new Set<EntityType>(["person", "organization", "technology", "date", "url", "place", "concept"]);
  const entityKeys = new Set<string>();
  const entityIdentities = new Set<string>();
  const entities = (Array.isArray(parsed.entities) ? parsed.entities : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as Partial<ExtractedEntity>;
    const key = typeof value.key === "string" ? value.key.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) : "";
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 160) : "";
    const type = typeof value.type === "string" ? value.type.toLowerCase() as EntityType : "concept";
    const identity = `${type}:${name.toLowerCase().replace(/\s+/g, " ")}`;
    if (!key || !name || !allowedTypes.has(type) || entityKeys.has(key) || entityIdentities.has(identity)) return [];
    entityKeys.add(key);
    entityIdentities.add(identity);
    return [{
      key,
      name,
      type,
      confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
      evidence: typeof value.evidence === "string" ? value.evidence.trim().slice(0, 300) : "",
    }];
  }).slice(0, 20);
  const validKeys = new Set(entities.map((entity) => entity.key));
  const relationships = (Array.isArray(parsed.relationships) ? parsed.relationships : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as Partial<ExtractedRelationship>;
    const source = typeof value.source === "string" ? value.source.trim().slice(0, 80) : "";
    const target = typeof value.target === "string" ? value.target.trim().slice(0, 80) : "";
    const type = typeof value.type === "string" ? value.type.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80) : "";
    if (!validKeys.has(source) || !validKeys.has(target) || source === target || !type) return [];
    return [{
      source,
      target,
      type,
      confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
      evidence: typeof value.evidence === "string" ? value.evidence.trim().slice(0, 300) : "",
    }];
  }).slice(0, 30);
  const actionTitles = new Set<string>();
  const action_items = (Array.isArray(parsed.action_items) ? parsed.action_items : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as Partial<ExtractedActionItem>;
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 180) : "";
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ");
    const type: ExtractedActionItem["type"] | null = value.type === "reminder" ? "reminder" : value.type === "task" ? "task" : null;
    if (!title || !type || actionTitles.has(normalizedTitle)) return [];
    actionTitles.add(normalizedTitle);
    let due_at: string | null = null;
    if (typeof value.due_at === "string" && value.due_at.trim()) {
      const parsedDate = new Date(value.due_at);
      if (!Number.isNaN(parsedDate.getTime())) due_at = parsedDate.toISOString();
    }
    return [{
      title,
      description: typeof value.description === "string" ? value.description.trim().slice(0, 600) : "",
      type,
      due_at,
      confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
      evidence: typeof value.evidence === "string" ? value.evidence.trim().slice(0, 300) : "",
    }];
  }).slice(0, 12);
  const studyQuestions = new Set<string>();
  const study_cards = (Array.isArray(parsed.study_cards) ? parsed.study_cards : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as Partial<ExtractedStudyCard>;
    const question = typeof value.question === "string" ? value.question.trim().slice(0, 300) : "";
    const answer = typeof value.answer === "string" ? value.answer.trim().slice(0, 1200) : "";
    const normalizedQuestion = question.toLowerCase().replace(/\s+/g, " ");
    if (!question || !answer || studyQuestions.has(normalizedQuestion)) return [];
    studyQuestions.add(normalizedQuestion);
    const seenOptions = new Set([answer.toLowerCase().replace(/\s+/g, " ")]);
    const distractors = (Array.isArray(value.distractors) ? value.distractors : []).flatMap((option) => {
      if (typeof option !== "string") return [];
      const trimmed = option.trim().slice(0, 300);
      const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
      if (!trimmed || seenOptions.has(normalized)) return [];
      seenOptions.add(normalized);
      return [trimmed];
    }).slice(0, 3);
    return [{
      question,
      answer,
      distractors,
      confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
      evidence: typeof value.evidence === "string" ? value.evidence.trim().slice(0, 300) : "",
    }];
  }).slice(0, 6);
  return {
    extracted_text: parsed.extracted_text.slice(0, 500_000),
    summary: parsed.summary.slice(0, 800),
    tags: parsed.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.slice(0, 60)).slice(0, 8),
    entities,
    relationships,
    action_items,
    study_cards,
  };
}

function parseOpenAiResult(payload: Record<string, unknown>): Omit<ExtractionResult, "model" | "provider"> {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const outputText = output
    .flatMap((item) => typeof item === "object" && item && Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [])
    .find((item) => typeof item === "object" && item && (item as { type?: string }).type === "output_text") as { text?: string } | undefined;
  if (!outputText?.text) throw new Error("OpenAI returned no extraction text.");
  return validatedExtraction(JSON.parse(outputText.text) as Partial<ExtractionResult>);
}

export function parseNvidiaResult(payload: Record<string, unknown>): Omit<ExtractionResult, "model" | "provider"> {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as { message?: { content?: unknown } }).message
    : undefined;
  if (typeof message?.content !== "string" || !message.content.trim()) {
    throw new Error("NVIDIA returned no extraction text.");
  }

  const withoutFence = message.content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
  return validatedExtraction(JSON.parse(json) as Partial<ExtractionResult>);
}

async function callOpenAiResponses(content: Record<string, unknown>[], userId: string): Promise<ExtractionResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new TerminalProcessingError("OPENAI_API_KEY is not configured for the processing function.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_EXTRACTION_MODEL,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 5000,
      safety_identifier: await safetyIdentifier(userId),
      instructions: "Extract a faithful personal-memory record. Preserve important names, dates, links, headings, and actionable details. Extract action items only for explicit commitments, requests, tasks, or reminders in the source; never turn general ideas or facts into tasks. Set due_at only when the source explicitly provides a date or time. Create study cards only for useful, non-trivial knowledge explicitly supported by the source. Each card needs a direct answer and up to three plausible but incorrect distractors. Do not invent missing content.",
      input: [{ role: "user", content }],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "memory_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              extracted_text: { type: "string", description: "Faithful extracted or transcribed content." },
              summary: { type: "string", description: "A concise factual summary under 120 words." },
              tags: { type: "array", maxItems: 8, items: { type: "string" } },
              entities: {
                type: "array",
                maxItems: 20,
                description: "Only explicit entities supported by the source. Use stable short keys for relationship references.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    key: { type: "string" },
                    name: { type: "string" },
                    type: { type: "string", enum: ["person", "organization", "technology", "date", "url", "place", "concept"] },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    evidence: { type: "string", description: "A short exact supporting phrase from the source." },
                  },
                  required: ["key", "name", "type", "confidence", "evidence"],
                },
              },
              relationships: {
                type: "array",
                maxItems: 30,
                description: "Explicit relationships between entity keys, supported by the source.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    source: { type: "string" },
                    target: { type: "string" },
                    type: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    evidence: { type: "string", description: "A short exact supporting phrase from the source." },
                  },
                  required: ["source", "target", "type", "confidence", "evidence"],
                },
              },
              action_items: {
                type: "array",
                maxItems: 12,
                description: "Explicit source-backed commitments, requests, tasks, or reminders. General ideas and facts are not action items.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    type: { type: "string", enum: ["task", "reminder"] },
                    due_at: { type: ["string", "null"], description: "ISO-8601 date/time only when explicitly stated in the source." },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    evidence: { type: "string", description: "A short exact supporting phrase from the source." },
                  },
                  required: ["title", "description", "type", "due_at", "confidence", "evidence"],
                },
              },
              study_cards: {
                type: "array",
                maxItems: 6,
                description: "Useful source-backed flashcards. Return an empty array when the memory has no worthwhile study material.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" },
                    distractors: { type: "array", maxItems: 3, items: { type: "string" }, description: "Plausible incorrect answers supported by the same subject context." },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    evidence: { type: "string", description: "A short exact source phrase supporting the correct answer." },
                  },
                  required: ["question", "answer", "distractors", "confidence", "evidence"],
                },
              },
            },
            required: ["extracted_text", "summary", "tags", "entities", "relationships", "action_items", "study_cards"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    if ([400, 401, 403, 404].includes(response.status)) throw new TerminalProcessingError(`OpenAI Responses error ${response.status}: ${detail}`);
    throw new Error(`OpenAI Responses error ${response.status}: ${detail}`);
  }

  return { ...parseOpenAiResult(await response.json()), model: OPENAI_EXTRACTION_MODEL, provider: "openai" };
}

function nvidiaError(label: string, status: number, detail: string) {
  const message = `NVIDIA ${label} error ${status}: ${detail.slice(0, 800)}`;
  if ([400, 401, 402, 403, 404, 413, 422].includes(status)) return new TerminalProcessingError(message);
  return new Error(message);
}

async function resolveNvidiaResponse(response: Response, apiKey: string, label: string): Promise<Record<string, unknown>> {
  let current = response;
  for (let attempt = 0; attempt < 20 && current.status === 202; attempt += 1) {
    const pending = await current.json().catch(() => ({})) as Record<string, unknown>;
    const requestId = pending.requestId || pending.reqId || pending.id;
    if (typeof requestId !== "string" || !requestId) throw new Error(`NVIDIA ${label} was queued without a request id.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    current = await fetch(`https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
  }
  const text = await current.text();
  if (!current.ok || current.status === 202) {
    throw nvidiaError(label, current.status, text || "The request did not complete in time.");
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`NVIDIA ${label} returned invalid JSON.`);
  }
}

const NVIDIA_JSON_INSTRUCTIONS = `Return only valid JSON with exactly these keys:
{"extracted_text":"faithful extracted or transcribed content","summary":"concise factual summary under 120 words","tags":["up to 8 short tags"],"entities":[{"key":"stable_short_key","name":"exact entity name","type":"person|organization|technology|date|url|place|concept","confidence":0.0,"evidence":"short exact supporting phrase"}],"relationships":[{"source":"entity_key","target":"entity_key","type":"short relationship label","confidence":0.0,"evidence":"short exact supporting phrase"}],"action_items":[{"title":"clear action","description":"brief source-backed context","type":"task|reminder","due_at":null,"confidence":0.0,"evidence":"short exact supporting phrase"}],"study_cards":[{"question":"source-backed question","answer":"direct correct answer","distractors":["plausible incorrect answer"],"confidence":0.0,"evidence":"short exact supporting phrase"}]}
Extract only entities and relationships explicitly supported by the source. Relationship source and target must reference entity keys. Extract action items only for explicit commitments, requests, tasks, or reminders; never convert general ideas or facts into tasks. Use an ISO-8601 due_at only when the source explicitly states a date or time, otherwise null. Create up to 6 useful study cards only for non-trivial knowledge explicitly supported by the source, each with a direct answer and up to 3 plausible incorrect distractors. Preserve important names, dates, links, headings, and actionable details. Do not invent missing content.`;

async function callNvidiaChat(
  content: string | Record<string, unknown>[],
  model: string,
  assetId?: string,
): Promise<ExtractionResult> {
  const apiKey = Deno.env.get("NVIDIA_API_KEY");
  if (!apiKey) throw new TerminalProcessingError("NVIDIA_API_KEY is not configured for the processing function.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (assetId) headers["NVCF-INPUT-ASSET-REFERENCES"] = assetId;
  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `/no_think\n${NVIDIA_JSON_INSTRUCTIONS}` },
        { role: "user", content },
      ],
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 5000,
      stream: false,
    }),
  });
  const payload = await resolveNvidiaResponse(response, apiKey, "chat completion");
  return { ...parseNvidiaResult(payload), model, provider: "nvidia" };
}

async function enrichText(text: string, userId: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new TerminalProcessingError("No readable text was found in this source.");
  let enriched: ExtractionResult;
  if (Deno.env.get("NVIDIA_API_KEY")) {
    enriched = await callNvidiaChat(`Extract and organize this saved memory:\n\n${trimmed.slice(0, MAX_MODEL_TEXT)}`, NVIDIA_TEXT_MODEL);
  } else if (Deno.env.get("OPENAI_API_KEY")) {
    enriched = await callOpenAiResponses([
      { type: "input_text", text: `Extract and organize this saved memory:\n\n${trimmed.slice(0, MAX_MODEL_TEXT)}` },
    ], userId);
  } else {
    return localExtraction(trimmed);
  }
  return { ...enriched, extracted_text: trimmed.slice(0, 500_000) };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function officeXmlToText(xml: string) {
  return decodeXmlEntities(xml
    .replace(/<w:tab\b[^>]*\/?\s*>/gi, "\t")
    .replace(/<(?:w:br|a:br)\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/w:tc>/gi, "\t")
    .replace(/<\/(?:w:p|w:tr|a:p|a:tr)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function spreadsheetXmlToText(xml: string, sharedStrings: string[]) {
  const rows = xml.match(/<row\b[\s\S]*?<\/row>/gi) || [];
  return rows.map((row) => {
    const cells = row.match(/<c\b[\s\S]*?<\/c>/gi) || [];
    return cells.map((cell) => {
      if (/\bt=["']s["']/i.test(cell)) {
        const index = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1];
        return index === undefined ? "" : sharedStrings[Number(index)] || "";
      }
      const inline = cell.match(/<is\b[\s\S]*?<\/is>/i)?.[0];
      if (inline) return officeXmlToText(inline);
      return decodeXmlEntities(cell.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "");
    }).join("\t").replace(/\t+$/g, "");
  }).filter(Boolean).join("\n");
}

async function extractOpenXmlDocument(blob: Blob, mimeType: string) {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new TerminalProcessingError("This Office file is damaged, encrypted, or not a supported Open XML document.");
  }
  const decoder = new TextDecoder();
  const read = (name: string) => entries[name] ? decoder.decode(entries[name]) : "";
  const names = Object.keys(entries).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  let extracted = "";
  if (mimeType.includes("wordprocessingml")) {
    const parts = names.filter((name) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(name));
    extracted = parts.map((name) => officeXmlToText(read(name))).filter(Boolean).join("\n\n");
  } else if (mimeType.includes("presentationml")) {
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
    extracted = slides.map((name, index) => `Slide ${index + 1}\n${officeXmlToText(read(name))}`).join("\n\n");
  } else if (mimeType.includes("spreadsheetml")) {
    const sharedXml = read("xl/sharedStrings.xml");
    const sharedStrings = (sharedXml.match(/<si\b[\s\S]*?<\/si>/gi) || []).map(officeXmlToText);
    const sheets = names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
    extracted = sheets.map((name, index) => `Sheet ${index + 1}\n${spreadsheetXmlToText(read(name), sharedStrings)}`).join("\n\n");
  }

  if (!extracted.trim()) throw new TerminalProcessingError("No readable text was found in this Office document.");
  return extracted.slice(0, 500_000);
}

type NvidiaAsset = { assetId: string; imageUrl: string };

async function createNvidiaImageAsset(blob: Blob, mimeType: string): Promise<NvidiaAsset> {
  const apiKey = Deno.env.get("NVIDIA_API_KEY");
  if (!apiKey) throw new TerminalProcessingError("NVIDIA_API_KEY is not configured for image extraction.");
  if (blob.size <= NVIDIA_INLINE_IMAGE_BYTES) {
    return { assetId: "", imageUrl: `data:${mimeType};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}` };
  }

  const description = "Neuron private memory image";
  const createResponse = await fetch("https://api.nvcf.nvidia.com/v2/nvcf/assets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: mimeType, description }),
  });
  const createText = await createResponse.text();
  if (!createResponse.ok) throw nvidiaError("asset creation", createResponse.status, createText);
  const created = JSON.parse(createText) as { assetId?: string; uploadUrl?: string };
  if (!created.assetId || !created.uploadUrl) throw new Error("NVIDIA did not return an asset upload URL.");

  const uploadResponse = await fetch(created.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "x-amz-meta-nvcf-asset-description": description },
    body: blob,
  });
  if (!uploadResponse.ok) {
    await deleteNvidiaAsset(created.assetId, apiKey);
    throw new Error(`NVIDIA asset upload error ${uploadResponse.status}.`);
  }
  return { assetId: created.assetId, imageUrl: `data:${mimeType};asset_id,${created.assetId}` };
}

async function deleteNvidiaAsset(assetId: string, apiKey: string) {
  if (!assetId) return;
  await fetch(`https://api.nvcf.nvidia.com/v2/nvcf/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => undefined);
}

async function processDocument(blob: Blob, memory: Memory) {
  const mimeType = memory.mime_type || blob.type || "application/octet-stream";
  const filename = memory.original_filename || "memory-file";
  if (OPEN_XML_TYPES.has(mimeType.toLowerCase())) {
    return enrichText(await extractOpenXmlDocument(blob, mimeType), memory.user_id);
  }
  if (mimeType.startsWith("image/") && Deno.env.get("NVIDIA_API_KEY")) {
    if (!new Set(["image/png", "image/jpeg", "image/jpg"]).has(mimeType.toLowerCase())) {
      throw new TerminalProcessingError("NVIDIA image extraction currently accepts PNG and JPEG files. Convert this image and retry.");
    }
    const asset = await createNvidiaImageAsset(blob, mimeType);
    try {
      return await callNvidiaChat([
        { type: "text", text: "Read this image carefully. Perform OCR where text is present and describe essential visual information." },
        { type: "image_url", image_url: { url: asset.imageUrl } },
      ], NVIDIA_VISION_MODEL, asset.assetId || undefined);
    } finally {
      if (asset.assetId) await deleteNvidiaAsset(asset.assetId, Deno.env.get("NVIDIA_API_KEY") || "");
    }
  }

  if (Deno.env.get("NVIDIA_API_KEY") || !Deno.env.get("OPENAI_API_KEY")) {
    throw new TerminalProcessingError(
      "The NVIDIA hosted API cannot read this raw file format. Export it as PNG/JPEG, DOCX, PPTX, XLSX, or plain text and retry.",
    );
  }
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  const content = mimeType.startsWith("image/")
    ? [
        { type: "input_text", text: "Read this image carefully. Perform OCR where text is present and describe essential visual information." },
        { type: "input_image", image_url: dataUrl, detail: "original" },
      ]
    : [
        { type: "input_text", text: "Extract the useful content from this saved file and organize it as a personal memory." },
        { type: "input_file", filename, file_data: dataUrl, detail: "auto" },
      ];
  return callOpenAiResponses(content, memory.user_id);
}

async function transcribeAudio(blob: Blob, memory: Memory) {
  const nvidiaKey = Deno.env.get("NVIDIA_API_KEY");
  if (nvidiaKey) {
    const form = new FormData();
    form.append("file", blob, memory.original_filename || "memory-audio.wav");
    form.append("language", "en-US");
    form.append("word_time_offsets", "false");
    const response = await fetch(NVIDIA_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${nvidiaKey}` },
      body: form,
    });
    const payload = await resolveNvidiaResponse(response, nvidiaKey, "transcription") as { text?: unknown };
    if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("NVIDIA returned an empty transcript.");
    return enrichText(payload.text, memory.user_id);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new TerminalProcessingError("OPENAI_API_KEY is not configured for audio transcription.");
  const form = new FormData();
  form.append("file", blob, memory.original_filename || "memory-audio.webm");
  form.append("model", OPENAI_TRANSCRIPTION_MODEL);
  form.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    if ([400, 401, 403, 404].includes(response.status)) throw new TerminalProcessingError(`OpenAI transcription error ${response.status}: ${detail}`);
    throw new Error(`OpenAI transcription error ${response.status}: ${detail}`);
  }
  const payload = await response.json() as { text?: string };
  if (!payload.text) throw new Error("OpenAI returned an empty transcript.");
  return enrichText(payload.text, memory.user_id);
}

export function blockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "0.0.0.0", "::", "::1"].includes(host) || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb");
}

export function validatedExternalUrl(value: string, base?: string) {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || blockedHostname(url.hostname)) {
    throw new TerminalProcessingError("This URL is not allowed for server-side fetching.");
  }
  return url;
}

async function readLimitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_WEB_BYTES) {
      await reader.cancel();
      throw new TerminalProcessingError("The linked page is too large to process safely.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchLinkedText(sourceUrl: string) {
  let url = validatedExternalUrl(sourceUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "NeuronMemoryBot/1.0", Accept: "text/html,text/plain,application/xhtml+xml" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The linked page returned an invalid redirect.");
      url = validatedExternalUrl(location, url.href);
      continue;
    }
    if (!response.ok) throw new Error(`The linked page returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/") && !contentType.includes("application/xhtml+xml")) {
      throw new TerminalProcessingError("This URL does not point to a readable web page.");
    }
    return htmlToText(await readLimitedText(response));
  }
  throw new TerminalProcessingError("The linked page redirected too many times.");
}

// The worker uses a service-role client against migration-defined RPCs. Generated
// project types can replace this boundary after the remote schema is regenerated.
// deno-lint-ignore no-explicit-any
async function loadStoredFile(admin: any, memory: Memory) {
  if (!memory.storage_path) throw new TerminalProcessingError("The stored file path is missing.");
  const { data, error } = await admin.storage.from(memory.storage_bucket || "memory-files").download(memory.storage_path);
  if (error || !data) throw new Error(error?.message || "The stored file could not be downloaded.");
  return data;
}

// deno-lint-ignore no-explicit-any
async function processJob(admin: any, job: ProcessingJob) {
  const { data: memoryRow, error: memoryError } = await admin.from("memories")
    .select("id,user_id,title,content,kind,source_url,storage_bucket,storage_path,original_filename,mime_type,summary,extracted_text")
    .eq("id", job.memory_id)
    .single();
  const memory = memoryRow as Memory | null;
  if (memoryError || !memory) throw new TerminalProcessingError(memoryError?.message || "Memory not found.");

  if (job.job_type === "embed") {
    const passage = embeddingText([memory.title, memory.summary, memory.extracted_text || memory.content]);
    const embedding = await createNvidiaEmbedding(passage, "passage");
    const { error: embeddingError } = await admin.rpc("complete_embedding_job", {
      target_job_id: job.id,
      embedding_input: vectorLiteral(embedding),
      embedding_model_name: NVIDIA_EMBEDDING_MODEL,
    });
    if (embeddingError) throw new Error(embeddingError.message);
    return { jobId: job.id, memoryId: job.memory_id, status: "completed", model: NVIDIA_EMBEDDING_MODEL };
  }

  await admin.from("memories").update({ processing_status: "processing" }).eq("id", memory.id);

  let result: ExtractionResult;
  if (job.job_type === "enrich") {
    result = await enrichText(memory.content, memory.user_id);
  } else if (job.job_type === "fetch_url") {
    if (!memory.source_url) throw new TerminalProcessingError("The memory URL is missing.");
    result = await enrichText(await fetchLinkedText(memory.source_url), memory.user_id);
  } else if (job.job_type === "transcribe") {
    result = await transcribeAudio(await loadStoredFile(admin, memory), memory);
  } else if (memory.mime_type === "text/plain" || memory.mime_type === "text/markdown") {
    result = await enrichText(await (await loadStoredFile(admin, memory)).text(), memory.user_id);
  } else {
    result = await processDocument(await loadStoredFile(admin, memory), memory);
  }

  const { error: graphError } = await admin.rpc("replace_memory_graph", {
    target_job_id: job.id,
    result_entities: result.entities,
    result_relationships: result.relationships,
  });
  if (graphError) throw new Error(graphError.message);

  const { error: actionItemError } = await admin.rpc("replace_memory_action_items", {
    target_job_id: job.id,
    result_action_items: result.action_items,
  });
  if (actionItemError) throw new Error(actionItemError.message);

  const { error: studyCardError } = await admin.rpc("replace_memory_study_cards", {
    target_job_id: job.id,
    result_study_cards: result.study_cards,
  });
  if (studyCardError) throw new Error(studyCardError.message);

  const { error: completeError } = await admin.rpc("complete_processing_job", {
    target_job_id: job.id,
    result_text: result.extracted_text,
    result_summary: result.summary,
    result_tags: result.tags,
    result_metadata: {
      processing_provider: result.provider,
      processing_model: result.model,
      processed_job_type: job.job_type,
      extracted_entity_count: result.entities.length,
      extracted_relationship_count: result.relationships.length,
      extracted_action_item_count: result.action_items.length,
      extracted_study_card_count: result.study_cards.length,
    },
  });
  if (completeError) throw new Error(completeError.message);

  let embeddingStatus: "completed" | "queued" = "completed";
  try {
    const passage = embeddingText([memory.title, result.summary, result.extracted_text]);
    const embedding = await createNvidiaEmbedding(passage, "passage");
    const { error: embeddingError } = await admin.rpc("store_memory_embedding", {
      target_memory_id: memory.id,
      target_user_id: memory.user_id,
      embedding_input: vectorLiteral(embedding),
      embedding_model_name: NVIDIA_EMBEDDING_MODEL,
    });
    if (embeddingError) throw new Error(embeddingError.message);
  } catch (error) {
    embeddingStatus = "queued";
    console.error("Embedding deferred", error instanceof Error ? error.message : "Embedding failed");
    const { error: queueError } = await admin.from("processing_jobs").upsert({
      user_id: memory.user_id,
      memory_id: memory.id,
      job_type: "embed",
      status: "queued",
      attempts: 0,
      error_message: null,
      available_at: new Date().toISOString(),
      locked_at: null,
    }, { onConflict: "memory_id,job_type" });
    if (queueError) console.error("Could not queue embedding retry", queueError.message);
  }

  return { jobId: job.id, memoryId: job.memory_id, status: "completed", model: result.model, embeddingStatus };
}

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new TerminalProcessingError("SUPABASE_URL is unavailable.");
    // deno-lint-ignore no-explicit-any
    const admin: any = createClient(supabaseUrl, getSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json().catch(() => ({})) as { memoryId?: string; batchSize?: number; backfill?: boolean };
    const configuredWorkerSecret = Deno.env.get("WORKER_SECRET") || "";
    const isWorker = await valuesMatch(request.headers.get("x-worker-secret") || "", configuredWorkerSecret);

    let userId: string | null = null;
    if (!isWorker) {
      const token = bearerToken(request);
      if (!token) return jsonResponse({ error: "Authentication required" }, 401);
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return jsonResponse({ error: "Invalid session" }, 401);
      userId = data.user.id;
      if (!body.memoryId && !body.backfill) return jsonResponse({ error: "memoryId is required" }, 400);
    }

    await admin.rpc("recover_stale_processing_jobs");
    const { data: jobs, error: claimError } = await admin.rpc("claim_processing_jobs", {
      batch_limit: isWorker || body.backfill ? Math.min(Math.max(body.batchSize || 3, 1), 5) : 1,
      target_memory_id: body.memoryId || null,
      target_user_id: userId,
    });
    if (claimError) throw new Error(claimError.message);

    const results = [];
    for (const job of (jobs || []) as ProcessingJob[]) {
      try {
        results.push(await processJob(admin, job));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Processing failed";
        const terminal = error instanceof TerminalProcessingError;
        const { error: failError } = await admin.rpc("fail_processing_job", {
          target_job_id: job.id,
          failure_message: message,
          terminal,
        });
        if (failError) console.error("Could not record processing failure", failError.message);
        results.push({ jobId: job.id, memoryId: job.memory_id, status: terminal ? "failed" : "retry_queued", error: message });
      }
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    console.error("process-memory request failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Worker request failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
