import { createClient, type Provider, type User } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export type MemoryKind = "Note" | "Upload" | "Link" | "Voice";

export type MemoryInput = {
  title: string;
  content: string;
  kind: MemoryKind;
};

export type MemoryRecord = MemoryInput & {
  id: string;
  created_at: string;
  processing_status: "pending" | "processing" | "ready" | "failed";
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
    })
    .select("id, title, content, kind, processing_status, created_at")
    .single();

  if (error) throw error;
  return normalizeMemory(data);
}

export async function listMemories(): Promise<MemoryRecord[]> {
  if (!supabase) return [];
  await ensureUser();
  const { data, error } = await supabase
    .from("memories")
    .select("id, title, content, kind, processing_status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data.map(normalizeMemory);
}

type MemoryRow = Pick<Database["public"]["Tables"]["memories"]["Row"], "id" | "title" | "content" | "kind" | "processing_status" | "created_at">;

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
  };
}
