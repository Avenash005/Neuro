import { blockedHostname, htmlToText, localExtraction, validatedExternalUrl } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("blocks common private and local URL destinations", () => {
  for (const host of ["localhost", "127.0.0.1", "10.2.3.4", "172.16.1.1", "192.168.0.9", "service.local", "::1"]) {
    assert(blockedHostname(host), `${host} should be blocked`);
  }
  assert(!blockedHostname("example.com"), "public host should not be blocked");
});

Deno.test("validates external HTTP URLs and redirects", () => {
  assert(validatedExternalUrl("/article", "https://example.com/root").href === "https://example.com/article", "relative redirect should resolve");
  let rejected = false;
  try { validatedExternalUrl("http://127.0.0.1/private"); } catch { rejected = true; }
  assert(rejected, "private URL should be rejected");
});

Deno.test("removes executable markup while preserving readable text", () => {
  const text = htmlToText("<style>hidden{}</style><h1>Neuron &amp; Memory</h1><script>alert(1)</script><p>Useful text</p>");
  assert(text === "Neuron & Memory Useful text", `unexpected HTML extraction: ${text}`);
});

Deno.test("provides a deterministic local extraction fallback", () => {
  const result = localExtraction("  A useful idea.\n\nWith context.  ");
  assert(result.extracted_text === "A useful idea.\n\nWith context.", "source text should be preserved");
  assert(result.summary === "A useful idea. With context.", "summary should normalize whitespace");
  assert(result.provider === "local", "fallback provider should be local");
});
