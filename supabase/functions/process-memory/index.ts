import { createClient } from "@supabase/supabase-js";

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
};

type ExtractionResult = {
  extracted_text: string;
  summary: string;
  tags: string[];
  model: string;
  provider: "openai" | "local";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_WEB_BYTES = 1_500_000;
const MAX_MODEL_TEXT = 120_000;
const EXTRACTION_MODEL = Deno.env.get("OPENAI_EXTRACTION_MODEL") || "gpt-5.6-luna";
const TRANSCRIPTION_MODEL = Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || "gpt-4o-mini-transcribe";

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
    model: "local-text-extractor",
    provider: "local",
  };
}

function parseModelResult(payload: Record<string, unknown>): Omit<ExtractionResult, "model" | "provider"> {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const outputText = output
    .flatMap((item) => typeof item === "object" && item && Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [])
    .find((item) => typeof item === "object" && item && (item as { type?: string }).type === "output_text") as { text?: string } | undefined;
  if (!outputText?.text) throw new Error("OpenAI returned no extraction text.");
  const parsed = JSON.parse(outputText.text) as Partial<ExtractionResult>;
  if (typeof parsed.extracted_text !== "string" || typeof parsed.summary !== "string" || !Array.isArray(parsed.tags)) {
    throw new Error("OpenAI returned an invalid extraction result.");
  }
  return {
    extracted_text: parsed.extracted_text.slice(0, 500_000),
    summary: parsed.summary.slice(0, 800),
    tags: parsed.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.slice(0, 60)).slice(0, 8),
  };
}

async function callResponses(content: Record<string, unknown>[], userId: string): Promise<ExtractionResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new TerminalProcessingError("OPENAI_API_KEY is not configured for the processing function.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 5000,
      safety_identifier: await safetyIdentifier(userId),
      instructions: "Extract a faithful personal-memory record. Preserve important names, dates, links, headings, and actionable details. Do not invent missing content.",
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
            },
            required: ["extracted_text", "summary", "tags"],
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

  return { ...parseModelResult(await response.json()), model: EXTRACTION_MODEL, provider: "openai" };
}

async function enrichText(text: string, userId: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new TerminalProcessingError("No readable text was found in this source.");
  if (!Deno.env.get("OPENAI_API_KEY")) return localExtraction(trimmed);
  const enriched = await callResponses([
    { type: "input_text", text: `Extract and organize this saved memory:\n\n${trimmed.slice(0, MAX_MODEL_TEXT)}` },
  ], userId);
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

async function processDocument(blob: Blob, memory: Memory) {
  const mimeType = memory.mime_type || blob.type || "application/octet-stream";
  const filename = memory.original_filename || "memory-file";
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
  return callResponses(content, memory.user_id);
}

async function transcribeAudio(blob: Blob, memory: Memory) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new TerminalProcessingError("OPENAI_API_KEY is not configured for audio transcription.");
  const form = new FormData();
  form.append("file", blob, memory.original_filename || "memory-audio.webm");
  form.append("model", TRANSCRIPTION_MODEL);
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
    .select("id,user_id,title,content,kind,source_url,storage_bucket,storage_path,original_filename,mime_type")
    .eq("id", job.memory_id)
    .single();
  const memory = memoryRow as Memory | null;
  if (memoryError || !memory) throw new TerminalProcessingError(memoryError?.message || "Memory not found.");

  await admin.from("memories").update({ processing_status: "processing" }).eq("id", memory.id);

  let result: ExtractionResult;
  if (job.job_type === "fetch_url") {
    if (!memory.source_url) throw new TerminalProcessingError("The memory URL is missing.");
    result = await enrichText(await fetchLinkedText(memory.source_url), memory.user_id);
  } else if (job.job_type === "transcribe") {
    result = await transcribeAudio(await loadStoredFile(admin, memory), memory);
  } else if (memory.mime_type === "text/plain" || memory.mime_type === "text/markdown") {
    result = await enrichText(await (await loadStoredFile(admin, memory)).text(), memory.user_id);
  } else {
    result = await processDocument(await loadStoredFile(admin, memory), memory);
  }

  const { error: completeError } = await admin.rpc("complete_processing_job", {
    target_job_id: job.id,
    result_text: result.extracted_text,
    result_summary: result.summary,
    result_tags: result.tags,
    result_metadata: {
      processing_provider: result.provider,
      processing_model: result.model,
      processed_job_type: job.job_type,
    },
  });
  if (completeError) throw new Error(completeError.message);
  return { jobId: job.id, memoryId: job.memory_id, status: "completed", model: result.model };
}

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new TerminalProcessingError("SUPABASE_URL is unavailable.");
    // deno-lint-ignore no-explicit-any
    const admin: any = createClient(supabaseUrl, getSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json().catch(() => ({})) as { memoryId?: string; batchSize?: number };
    const configuredWorkerSecret = Deno.env.get("WORKER_SECRET") || "";
    const isWorker = await valuesMatch(request.headers.get("x-worker-secret") || "", configuredWorkerSecret);

    let userId: string | null = null;
    if (!isWorker) {
      const token = bearerToken(request);
      if (!token) return jsonResponse({ error: "Authentication required" }, 401);
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return jsonResponse({ error: "Invalid session" }, 401);
      userId = data.user.id;
      if (!body.memoryId) return jsonResponse({ error: "memoryId is required" }, 400);
    }

    await admin.rpc("recover_stale_processing_jobs");
    const { data: jobs, error: claimError } = await admin.rpc("claim_processing_jobs", {
      batch_limit: isWorker ? Math.min(Math.max(body.batchSize || 3, 1), 5) : 1,
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
