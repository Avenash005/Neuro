import { blockedHostname, handleRequest, htmlToText, localExtraction, officeXmlToText, parseNvidiaResult, validatedExternalUrl } from "./index.ts";

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

Deno.test("parses NVIDIA JSON returned inside a markdown fence", () => {
  const result = parseNvidiaResult({
    choices: [{
      message: {
        content: '```json\n{"extracted_text":"Meeting at 3 PM","summary":"A meeting is scheduled.","tags":["meeting",7,"calendar"]}\n```',
      },
    }],
  });
  assert(result.extracted_text === "Meeting at 3 PM", "extracted text should be parsed");
  assert(result.summary === "A meeting is scheduled.", "summary should be parsed");
  assert(result.tags.join(",") === "meeting,calendar", "non-string tags should be removed");
});

Deno.test("extracts readable paragraphs and table cells from Office XML", () => {
  const text = officeXmlToText('<w:document><w:p><w:r><w:t>Avenash &amp; Neuron</w:t></w:r></w:p><w:tr><w:tc><w:p><w:t>Skills</w:t></w:p></w:tc><w:tc><w:p><w:t>React</w:t></w:p></w:tc></w:tr></w:document>');
  assert(text.includes("Avenash & Neuron"), "entities should be decoded");
  assert(text.includes("Skills"), "table labels should be extracted");
  assert(text.includes("React"), "table values should be extracted");
});

Deno.test("allows the Supabase client header during browser preflight", async () => {
  const response = await handleRequest(new Request("https://example.com/process-memory", { method: "OPTIONS" }));
  const allowedHeaders = response.headers.get("Access-Control-Allow-Headers") || "";
  assert(response.status === 200, "preflight should succeed");
  assert(allowedHeaders.includes("x-client-info"), "Supabase client header should be allowed");
});
