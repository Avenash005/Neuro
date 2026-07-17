import { createClient } from "@supabase/supabase-js";

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
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

async function ensureUser() {
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
  await ensureUser();
  return true;
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
  return {
    ...data,
    kind: `${data.kind.charAt(0).toUpperCase()}${data.kind.slice(1)}` as MemoryKind,
  } satisfies MemoryRecord;
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
  return data.map((memory) => ({
    ...memory,
    kind: `${memory.kind.charAt(0).toUpperCase()}${memory.kind.slice(1)}` as MemoryKind,
  }));
}
