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
  assert(result.action_items.length === 0, "local extraction must not invent action items");
  assert(result.study_cards.length === 0, "local extraction must not invent study cards");
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

Deno.test("validates typed entities and source-linked relationships", () => {
  const result = parseNvidiaResult({
    choices: [{
      message: {
        content: JSON.stringify({
          extracted_text: "Avenash built Neuron with React.",
          summary: "Avenash used React for Neuron.",
          tags: ["product"],
          entities: [
            { key: "avenash", name: "Avenash", type: "person", confidence: 0.98, evidence: "Avenash built Neuron" },
            { key: "react", name: "React", type: "technology", confidence: 1.4, evidence: "with React" },
            { key: "invalid", name: "Guess", type: "animal", confidence: 0.2, evidence: "" },
          ],
          relationships: [
            { source: "avenash", target: "react", type: "uses", confidence: 0.9, evidence: "built Neuron with React" },
            { source: "avenash", target: "missing", type: "knows", confidence: 0.8, evidence: "unsupported" },
          ],
        }),
      },
    }],
  });
  assert(result.entities.length === 2, "unsupported entity types should be removed");
  assert(result.entities[1].confidence === 1, "entity confidence should be clamped");
  assert(result.relationships.length === 1, "relationships must reference validated entity keys");
  assert(result.relationships[0].type === "uses", "relationship type should be normalized");
});

Deno.test("validates and deduplicates explicit action items", () => {
  const result = parseNvidiaResult({ choices: [{ message: { content: JSON.stringify({
    extracted_text: "Send Maya the research summary tomorrow at 3 PM.",
    summary: "A research follow-up is due.",
    tags: ["follow-up"],
    entities: [],
    relationships: [],
    action_items: [
      { title: "Send Maya the research summary", description: "Follow up after the research review.", type: "task", due_at: "2026-07-21T15:00:00+05:30", confidence: 1.4, evidence: "Send Maya the research summary tomorrow at 3 PM" },
      { title: " send maya the research summary ", description: "duplicate", type: "task", due_at: null, confidence: 0.6, evidence: "duplicate" },
      { title: "Invalid type", description: "", type: "idea", due_at: null, confidence: 0.5, evidence: "" },
    ],
  }) } }] });
  assert(result.action_items.length === 1, "duplicate and unsupported action items should be removed");
  assert(result.action_items[0].confidence === 1, "action confidence should be clamped");
  assert(result.action_items[0].due_at === "2026-07-21T09:30:00.000Z", "explicit due dates should be normalized");
});

Deno.test("validates source-backed study cards and quiz options", () => {
  const result = parseNvidiaResult({ choices: [{ message: { content: JSON.stringify({
    extracted_text: "React uses a virtual DOM to efficiently update browser interfaces.",
    summary: "React rendering notes.",
    tags: ["react"], entities: [], relationships: [], action_items: [],
    study_cards: [
      { question: "What does React use to efficiently update interfaces?", answer: "A virtual DOM", distractors: ["A physical DOM", "A virtual DOM", "A SQL view", "A compiler", "An extra option"], confidence: 1.4, evidence: "uses a virtual DOM" },
      { question: " what does react use to efficiently update interfaces? ", answer: "Duplicate", distractors: [], confidence: 0.5, evidence: "" },
      { question: "", answer: "Invalid", distractors: [], confidence: 0.5, evidence: "" },
    ],
  }) } }] });
  assert(result.study_cards.length === 1, "duplicate and empty study cards should be removed");
  assert(result.study_cards[0].distractors.length === 3, "distractors should exclude the answer and be capped");
  assert(result.study_cards[0].confidence === 1, "study-card confidence should be clamped");
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
