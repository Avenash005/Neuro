import { embeddingText, parseNvidiaEmbedding, vectorLiteral } from "./nvidia-embeddings.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("parses a valid NVIDIA embedding", () => {
  const embedding = parseNvidiaEmbedding({ data: [{ embedding: [0.25, -0.5] }] }, 2);
  assert(embedding[1] === -0.5, "embedding values should be preserved");
  assert(vectorLiteral(embedding) === "[0.25,-0.5]", "vector literal should be PostgreSQL compatible");
});

Deno.test("rejects embeddings with the wrong dimensions", () => {
  let rejected = false;
  try {
    parseNvidiaEmbedding({ data: [{ embedding: [0.25] }] }, 2);
  } catch {
    rejected = true;
  }
  assert(rejected, "wrong-sized embeddings should be rejected");
});

Deno.test("builds compact searchable passage text", () => {
  assert(embeddingText([" Neuron ", null, "semantic   memory"]) === "Neuron\n\nsemantic memory", "text should be compacted");
});
