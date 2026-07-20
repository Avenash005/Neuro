import { createClient, type Provider, type User } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { createFileFingerprint, createLinkFingerprint } from "./deduplication";
import { runMemoryDeletion } from "./memoryDeletion";
import { uploadToSignedUrlWithProgress, type SignedUploadOptions } from "./signedUpload";
import { sanitizeFilename, validateUpload } from "./uploads";

export type MemoryKind = "Note" | "Upload" | "Link" | "Voice";

export type MemoryInput = {
  title: string;
  content: string;
  kind: MemoryKind;
  sourceUrl?: string;
};

export type MemoryRecord = MemoryInput & {
  id: string;
  created_at: string;
  processing_status: "pending" | "processing" | "ready" | "failed";
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  summary: string | null;
  extracted_text: string | null;
  extracted_at: string | null;
  is_favorite: boolean;
  tags: string[];
  graph_analyzed_at: string | null;
};

export type CollectionRecord = {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  memory_ids: string[];
};

export type ActionItemStatus = "suggested" | "accepted" | "completed" | "dismissed";

export type ActionItemRecord = {
  id: string;
  memory_id: string;
  title: string;
  description: string;
  item_type: "task" | "reminder";
  status: ActionItemStatus;
  due_at: string | null;
  confidence: number;
  evidence: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EntityType = "person" | "organization" | "technology" | "date" | "url" | "place" | "concept";

export type KnowledgeEntityRecord = {
  id: string;
  display_name: string;
  entity_type: EntityType;
};

export type MemoryEntityRecord = {
  memory_id: string;
  entity_id: string;
  confidence: number;
  evidence: string;
};

export type EntityRelationshipRecord = {
  id: string;
  memory_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  confidence: number;
  evidence: string;
};

export type KnowledgeEntityData = {
  entities: KnowledgeEntityRecord[];
  memoryEntities: MemoryEntityRecord[];
  relationships: EntityRelationshipRecord[];
};

export const EMPTY_KNOWLEDGE_ENTITY_DATA: KnowledgeEntityData = { entities: [], memoryEntities: [], relationships: [] };

export type MemorySearchResult = MemoryRecord & {
  score: number;
  match: "hybrid" | "meaning" | "keyword";
};

export type AssistantCitation = {
  number: number;
  memory: MemoryRecord;
};

export type AssistantAnswer = {
  answer: string;
  citations: AssistantCitation[];
  model: string | null;
};

export class DuplicateMemoryError extends Error {
  readonly existingMemoryId?: string;

  constructor(message: string, existingMemoryId?: string) {
    super(message);
    this.name = "DuplicateMemoryError";
    this.existingMemoryId = existingMemoryId;
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

async function ensureUser(): Promise<User> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Supabase did not return a user.");
  return data.user;
}

export async function connectSupabase() {
  if (!supabase) return false;
  return ensureUser();
}

export function onAuthChange(callback: (user: User | null) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

export async function linkAnonymousEmail(email: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: window.location.origin },
  );
  if (error) throw error;
  return data.user;
}

export async function signInExistingWithEmail(email: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const signOutResult = await supabase.auth.signOut({ scope: "local" });
  if (signOutResult.error) throw signOutResult.error;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function continueWithOAuth(provider: Extract<Provider, "google" | "github">, isAnonymous: boolean) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const credentials = { provider, options: { redirectTo: window.location.origin } } as const;
  const { data, error } = isAnonymous
    ? await supabase.auth.linkIdentity(credentials)
    : await supabase.auth.signInWithOAuth(credentials);
  if (error) throw error;
  return data;
}

export async function signOutToGuest() {
  if (!supabase) return null;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return ensureUser();
}

async function rejectExistingFingerprint(fingerprint: string, sourceLabel: "file" | "link") {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("memories")
    .select("id, title")
    .eq("content_fingerprint", fingerprint)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    throw new DuplicateMemoryError(
      `This ${sourceLabel} is already saved as “${data.title}”.`,
      data.id,
    );
  }
}

function duplicateRaceError(sourceLabel: "file" | "link") {
  return new DuplicateMemoryError(`This ${sourceLabel} is already saved in your Library.`);
}

export async function createMemory(input: MemoryInput) {
  if (!supabase) throw new Error("Add your Supabase publishable key to .env.local first.");
  const user = await ensureUser();
  let sourceUrl = input.sourceUrl ?? null;
  let contentFingerprint: string | null = null;
  if (input.kind === "Link") {
    if (!sourceUrl) throw new Error("Enter a link before saving.");
    const linkIdentity = await createLinkFingerprint(sourceUrl);
    sourceUrl = linkIdentity.canonicalUrl;
    contentFingerprint = linkIdentity.fingerprint;
    await rejectExistingFingerprint(contentFingerprint, "link");
  }
  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      title: input.title,
      content: input.content,
      kind: input.kind.toLowerCase(),
      processing_status: "pending",
      source_url: sourceUrl,
      content_fingerprint: contentFingerprint,
    })
    .select("id, title, content, kind, source_url, processing_status, created_at, storage_path, original_filename, mime_type, file_size, summary, extracted_text, extracted_at, is_favorite, tags, graph_analyzed_at")
    .single();

  if (error?.code === "23505" && contentFingerprint) throw duplicateRaceError("link");
  if (error) throw error;
  return normalizeMemory(data);
}

export async function listMemories(): Promise<MemoryRecord[]> {
  if (!supabase) return [];
  await ensureUser();
  const { data, error } = await supabase
    .from("memories")
    .select("id, title, content, kind, source_url, processing_status, created_at, storage_path, original_filename, mime_type, file_size, summary, extracted_text, extracted_at, is_favorite, tags, graph_analyzed_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data.map(normalizeMemory);
}

export async function listCollections(): Promise<CollectionRecord[]> {
  if (!supabase) return [];
  await ensureUser();
  const [{ data: collectionRows, error: collectionError }, { data: membershipRows, error: membershipError }] = await Promise.all([
    supabase.from("collections").select("id, name, description, color, created_at, updated_at").order("updated_at", { ascending: false }),
    supabase.from("collection_memories").select("collection_id, memory_id"),
  ]);
  if (collectionError) throw collectionError;
  if (membershipError) throw membershipError;
  return collectionRows.map((collection) => ({
    ...collection,
    memory_ids: membershipRows.filter((membership) => membership.collection_id === collection.id).map((membership) => membership.memory_id),
  }));
}

export async function listKnowledgeEntityData(): Promise<KnowledgeEntityData> {
  if (!supabase) return EMPTY_KNOWLEDGE_ENTITY_DATA;
  await ensureUser();
  const [entityResult, memoryEntityResult, relationshipResult] = await Promise.all([
    supabase.from("entities").select("id, display_name, entity_type"),
    supabase.from("memory_entities").select("memory_id, entity_id, confidence, evidence"),
    supabase.from("entity_relationships").select("id, memory_id, source_entity_id, target_entity_id, relationship_type, confidence, evidence"),
  ]);
  if (entityResult.error) throw entityResult.error;
  if (memoryEntityResult.error) throw memoryEntityResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  return {
    entities: entityResult.data as KnowledgeEntityRecord[],
    memoryEntities: memoryEntityResult.data,
    relationships: relationshipResult.data,
  };
}

export async function listActionItems(): Promise<ActionItemRecord[]> {
  if (!supabase) return [];
  await ensureUser();
  const { data, error } = await supabase
    .from("action_items")
    .select("id, memory_id, title, description, item_type, status, due_at, confidence, evidence, completed_at, created_at, updated_at")
    .neq("status", "dismissed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as ActionItemRecord[];
}

export async function updateActionItemStatus(actionItemId: string, status: Exclude<ActionItemStatus, "suggested">) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  const { data, error } = await supabase.rpc("update_action_item_status", {
    target_action_item_id: actionItemId,
    next_status: status,
  });
  if (error) throw error;
  return data as ActionItemRecord;
}

export async function createCollection(name: string, description = "", color = "#6657d9"): Promise<CollectionRecord> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const user = await ensureUser();
  const { data, error } = await supabase.from("collections").insert({
    user_id: user.id,
    name: name.trim(),
    description: description.trim(),
    color,
  }).select("id, name, description, color, created_at, updated_at").single();
  if (error?.code === "23505") throw new Error("You already have a collection with this name.");
  if (error) throw error;
  return { ...data, memory_ids: [] };
}

export async function deleteCollection(collectionId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  const { error } = await supabase.from("collections").delete().eq("id", collectionId);
  if (error) throw error;
}

export async function addMemoryToCollection(collectionId: string, memoryId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const user = await ensureUser();
  const { error } = await supabase.from("collection_memories").upsert({
    collection_id: collectionId,
    memory_id: memoryId,
    user_id: user.id,
  }, { onConflict: "collection_id,memory_id" });
  if (error) throw error;
}

export async function removeMemoryFromCollection(collectionId: string, memoryId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  const { error } = await supabase.from("collection_memories").delete().eq("collection_id", collectionId).eq("memory_id", memoryId);
  if (error) throw error;
}

export async function setMemoryFavorite(memoryId: string, isFavorite: boolean) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  const { error } = await supabase.from("memories").update({ is_favorite: isFavorite }).eq("id", memoryId);
  if (error) throw error;
}

type SearchResponseRow = {
  id: string;
  title: string;
  content: string;
  kind: string;
  source_url: string | null;
  summary: string | null;
  extracted_text: string | null;
  processing_status: string;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  extracted_at: string | null;
  created_at: string;
  search_score: number;
  keyword_rank: number | null;
  semantic_rank: number | null;
};

export async function searchMemories(query: string, limit = 12): Promise<MemorySearchResult[]> {
  if (!supabase) return [];
  await ensureUser();
  const { data, error } = await supabase.functions.invoke("search-memories", {
    body: { query, limit },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  const rows = Array.isArray(data?.results) ? data.results as SearchResponseRow[] : [];
  return rows.map((row) => ({
    ...normalizeMemory({
      ...row,
      source_url: row.source_url,
    }),
    sourceUrl: row.source_url ?? undefined,
    score: Number(row.search_score) || 0,
    match: row.keyword_rank && row.semantic_rank ? "hybrid" : row.semantic_rank ? "meaning" : "keyword",
  }));
}

export async function askNeuron(question: string): Promise<AssistantAnswer> {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  const { data, error } = await supabase.functions.invoke("ask-neuron", {
    body: { question },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  const citationRows = Array.isArray(data?.citations) ? data.citations as Array<{ number?: unknown; memory?: SearchResponseRow }> : [];
  const citations = citationRows
    .filter((citation): citation is { number: number; memory: SearchResponseRow } => Number.isInteger(citation.number) && Boolean(citation.memory?.id && citation.memory.title))
    .map((citation) => ({ number: citation.number, memory: normalizeMemory(citation.memory) }));
  return {
    answer: typeof data?.answer === "string" ? data.answer : "Neuron returned an empty answer.",
    citations,
    model: typeof data?.model === "string" ? data.model : null,
  };
}

export async function createFileMemory(file: File, title: string, uploadOptions: SignedUploadOptions = {}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  validateUpload(file);
  const user = await ensureUser();
  uploadOptions.onProgress?.(2);
  const contentFingerprint = await createFileFingerprint(file);
  if (uploadOptions.signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
  uploadOptions.onProgress?.(8);
  await rejectExistingFingerprint(contentFingerprint, "file");
  const path = `${user.id}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const bucket = "memory-files";
  let uploadStarted = false;

  try {
    const { data: signedUpload, error: signingError } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false });
    if (signingError) throw new Error(signingError.message);
    if (uploadOptions.signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");

    uploadStarted = true;
    await uploadToSignedUrlWithProgress(signedUpload.signedUrl, file, {
      cacheControl: "3600",
      signal: uploadOptions.signal,
      onProgress: (percentage) => uploadOptions.onProgress?.(10 + Math.round(percentage * 0.8)),
    });
    if (uploadOptions.signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
    uploadOptions.onProgress?.(94);

    const { data, error } = await supabase
      .from("memories")
      .insert({
        user_id: user.id,
        title,
        content: "",
        kind: "upload",
        processing_status: "pending",
        storage_bucket: bucket,
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        content_fingerprint: contentFingerprint,
      })
      .select("id, title, content, kind, source_url, processing_status, created_at, storage_path, original_filename, mime_type, file_size, summary, extracted_text, extracted_at, is_favorite, tags, graph_analyzed_at")
      .single();

    if (error?.code === "23505") throw duplicateRaceError("file");
    if (error) throw error;
    uploadOptions.onProgress?.(100);
    return normalizeMemory(data);
  } catch (error) {
    if (uploadStarted) await supabase.storage.from(bucket).remove([path]);
    throw error;
  }
}

export async function retryMemoryProcessing(memoryId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("request_processing_retry", { target_memory_id: memoryId });
  if (error) throw error;
}

export async function requestMemoryReanalysis(memoryIds: string[]) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  const uniqueIds = [...new Set(memoryIds)].slice(0, 3);
  if (!uniqueIds.length) return [];
  const { data, error } = await supabase.rpc("request_memory_reanalysis", { target_memory_ids: uniqueIds });
  if (error) throw error;
  return data;
}

export async function processMemoryNow(memoryId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("process-memory", { body: { memoryId } });
  if (error) throw error;
  const result = data?.results?.[0] as { status?: string; error?: string } | undefined;
  if (result?.status === "failed") throw new Error(result.error || "AI processing failed.");
  return result;
}

export async function processMemoryBacklog(batchSize = 5) {
  if (!supabase) return { processed: 0, results: [] };
  await ensureUser();
  const { data, error } = await supabase.functions.invoke("process-memory", {
    body: { backfill: true, batchSize },
  });
  if (error) throw error;
  return data as { processed: number; results: Array<{ status?: string; error?: string }> };
}

export async function downloadMemoryFile(path: string, filename: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.storage.from("memory-files").download(path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deleteMemory(memoryId: string, storagePath: string | null) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUser();
  await runMemoryDeletion({
    removeFile: async (path) => {
      const { error } = await supabase.storage.from("memory-files").remove([path]);
      if (error) throw new Error(error.message);
    },
    deleteRow: async (id) => {
      const { error } = await supabase.from("memories").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  }, memoryId, storagePath);
}

type MemoryRow = Pick<Database["public"]["Tables"]["memories"]["Row"], "id" | "title" | "content" | "kind" | "processing_status" | "created_at" | "storage_path" | "original_filename" | "mime_type" | "file_size" | "summary" | "extracted_text" | "extracted_at"> & {
  source_url?: string | null;
  is_favorite?: boolean;
  tags?: string[];
  graph_analyzed_at?: string | null;
};

export function normalizeMemory(memory: MemoryRow): MemoryRecord {
  const normalizedKind = `${memory.kind.charAt(0).toUpperCase()}${memory.kind.slice(1)}`;
  const allowedKinds: MemoryKind[] = ["Note", "Upload", "Link", "Voice"];
  const kind = allowedKinds.includes(normalizedKind as MemoryKind) ? normalizedKind as MemoryKind : "Note";
  const allowedStatuses: MemoryRecord["processing_status"][] = ["pending", "processing", "ready", "failed"];
  const processingStatus = allowedStatuses.includes(memory.processing_status as MemoryRecord["processing_status"])
    ? memory.processing_status as MemoryRecord["processing_status"]
    : "pending";
  return {
    id: memory.id,
    title: memory.title,
    content: memory.content,
    kind,
    sourceUrl: memory.source_url ?? undefined,
    processing_status: processingStatus,
    created_at: memory.created_at,
    storage_path: memory.storage_path,
    original_filename: memory.original_filename,
    mime_type: memory.mime_type,
    file_size: memory.file_size,
    summary: memory.summary,
    extracted_text: memory.extracted_text,
    extracted_at: memory.extracted_at,
    is_favorite: memory.is_favorite ?? false,
    tags: memory.tags ?? [],
    graph_analyzed_at: memory.graph_analyzed_at ?? null,
  };
}
