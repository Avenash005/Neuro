import { handleRequest, normalizeSearchRequest } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("normalizes and limits semantic search requests", () => {
  const input = normalizeSearchRequest({ query: "  offline    apps ", limit: 999, kind: "UPLOAD" });
  assert(input.query === "offline apps", "query whitespace should be normalized");
  assert(input.limit === 30, "result limit should be capped");
  assert(input.kind === "upload", "valid kind should be normalized");
});

Deno.test("rejects empty search requests", () => {
  let rejected = false;
  try {
    normalizeSearchRequest({ query: " " });
  } catch {
    rejected = true;
  }
  assert(rejected, "empty query should be rejected");
});

Deno.test("allows Supabase browser preflight", async () => {
  const response = await handleRequest(new Request("https://example.com/search-memories", { method: "OPTIONS" }));
  assert(response.status === 200, "preflight should succeed");
  assert((response.headers.get("Access-Control-Allow-Headers") || "").includes("x-client-info"), "client header should be allowed");
});
