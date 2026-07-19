import { createClient, type Provider, type User } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { runMemoryDeletion } from "./memoryDeletion";
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
};

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

export async function createMemory(input: MemoryInput) {
  if (!supabase) throw new Error("Add your Supabase publishable key to .env.local first.");
  const user = await ensureUser();
  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      title: input.title,
      content: input.content,
      kind: input.kind.toLowerCase(),
      processing_status: "pending",
      source_url: input.sourceUrl ?? null,
    })
    .select("id, title, content, kind, processing_status, created_at, storage_path, original_filename, mime_type, file_size, summary, extracted_text, extracted_at")
    .single();

  if (error) throw error;
  return normalizeMemory(data);
}

export async function listMemories(): Promise<MemoryRecord[]> {
  if (!supabase) return [];
  await ensureUser();
  const { data, error } = await supabase
    .from("memories")
    .select("id, title, content, kind, processing_status, created_at, storage_path, original_filename, mime_type, file_size, summary, extracted_text, extracted_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data.map(normalizeMemory);
}

export async function createFileMemory(file: File, title: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  validateUpload(file);
  const user = await ensureUser();
  const path = `${user.id}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const bucket = "memory-files";

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

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
    })
    .select("id, title, content, kind, processing_status, created_at, storage_path, original_filename, mime_type, file_size, summary, extracted_text, extracted_at")
    .single();

  if (error) {
    await supabase.storage.from(bucket).remove([path]);
    throw error;
  }
  return normalizeMemory(data);
}

export async function retryMemoryProcessing(memoryId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("request_processing_retry", { target_memory_id: memoryId });
  if (error) throw error;
}

export async function processMemoryNow(memoryId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("process-memory", { body: { memoryId } });
  if (error) throw error;
  const result = data?.results?.[0] as { status?: string; error?: string } | undefined;
  if (result?.status === "failed") throw new Error(result.error || "AI processing failed.");
  return result;
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

type MemoryRow = Pick<Database["public"]["Tables"]["memories"]["Row"], "id" | "title" | "content" | "kind" | "processing_status" | "created_at" | "storage_path" | "original_filename" | "mime_type" | "file_size" | "summary" | "extracted_text" | "extracted_at">;

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
    processing_status: processingStatus,
    created_at: memory.created_at,
    storage_path: memory.storage_path,
    original_filename: memory.original_filename,
    mime_type: memory.mime_type,
    file_size: memory.file_size,
    summary: memory.summary,
    extracted_text: memory.extracted_text,
    extracted_at: memory.extracted_at,
  };
}
