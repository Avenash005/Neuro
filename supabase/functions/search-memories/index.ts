// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  createNvidiaEmbedding,
  vectorLiteral,
} from "../_shared/nvidia-embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class SearchRequestError extends Error {}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function getSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
  const secret = secretMap.default || Object.values(secretMap)[0];
  if (!secret) throw new Error("Supabase secret key is unavailable in the function environment.");
  return secret;
}

function bearerToken(request: Request) {
  const value = request.headers.get("Authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export function normalizeSearchRequest(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const query = typeof input.query === "string" ? input.query.replace(/\s+/g, " ").trim() : "";
  if (query.length < 2) throw new SearchRequestError("Enter at least two characters to search.");
  if (query.length > 500) throw new SearchRequestError("Search queries can contain at most 500 characters.");
  const requestedLimit = typeof input.limit === "number" && Number.isFinite(input.limit) ? Math.floor(input.limit) : 12;
  const limit = Math.max(1, Math.min(requestedLimit, 30));
  const allowedKinds = new Set(["note", "upload", "link", "voice"]);
  const rawKind = typeof input.kind === "string" ? input.kind.toLowerCase() : null;
  const kind = rawKind && allowedKinds.has(rawKind) ? rawKind : null;
  return { query, limit, kind };
}

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const token = bearerToken(request);
    if (!token) return jsonResponse({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL is unavailable.");

    const body = normalizeSearchRequest(await request.json().catch(() => ({})));
    // deno-lint-ignore no-explicit-any
    const admin: any = createClient(supabaseUrl, getSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: "Invalid session" }, 401);

    let queryEmbedding: string | null = null;
    let mode: "hybrid" | "keyword" = "hybrid";
    try {
      queryEmbedding = vectorLiteral(await createNvidiaEmbedding(body.query, "query"));
    } catch (error) {
      mode = "keyword";
      console.error("Semantic search unavailable; using private keyword search", error instanceof Error ? error.message : "Embedding failed");
    }

    const { data, error } = await admin.rpc("hybrid_search_memories", {
      target_user_id: authData.user.id,
      query_text: body.query,
      query_embedding_text: queryEmbedding,
      match_count: body.limit,
      kind_filter: body.kind,
    });
    if (error) throw new Error(error.message);
    return jsonResponse({ results: data || [], mode });
  } catch (error) {
    if (error instanceof SearchRequestError) return jsonResponse({ error: error.message }, 400);
    console.error("search-memories request failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Search failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
