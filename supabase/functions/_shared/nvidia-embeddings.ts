export const NVIDIA_EMBEDDING_MODEL = Deno.env.get("NVIDIA_EMBEDDING_MODEL") ||
  "nvidia/llama-nemotron-embed-1b-v2";
export const EMBEDDING_DIMENSIONS = 1024;

type EmbeddingPayload = {
  data?: Array<{ embedding?: unknown }>;
};

export function parseNvidiaEmbedding(payload: EmbeddingPayload, dimensions = EMBEDDING_DIMENSIONS) {
  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== dimensions || !embedding.every(Number.isFinite)) {
    throw new Error(`NVIDIA returned an invalid ${dimensions}-dimension embedding.`);
  }
  return embedding as number[];
}

export function embeddingText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 32_000);
}

export async function createNvidiaEmbedding(text: string, inputType: "query" | "passage") {
  const apiKey = Deno.env.get("NVIDIA_API_KEY");
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");
  const baseUrl = (Deno.env.get("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const input = text.replace(/\s+/g, " ").trim().slice(0, 32_000);
  if (!input) throw new Error("There is no readable text to embed.");

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: NVIDIA_EMBEDDING_MODEL,
      input: [input],
      input_type: inputType,
      encoding_format: "float",
      dimensions: EMBEDDING_DIMENSIONS,
      truncate: "END",
    }),
  });

  const payload = await response.json().catch(() => ({})) as EmbeddingPayload & { detail?: string; message?: string };
  if (!response.ok) {
    const detail = payload.detail || payload.message || "Embedding request failed.";
    throw new Error(`NVIDIA embedding error ${response.status}: ${detail.slice(0, 500)}`);
  }
  return parseNvidiaEmbedding(payload);
}

export function vectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
