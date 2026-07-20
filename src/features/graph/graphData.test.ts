import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "../../lib/supabase";
import { buildKnowledgeGraph } from "./graphData";

function memory(id: string, title: string, tags: string[] = [], kind: MemoryRecord["kind"] = "Note"): MemoryRecord {
  return {
    id,
    title,
    tags,
    kind,
    content: "",
    created_at: `2026-07-${id.padStart(2, "0")}T00:00:00.000Z`,
    processing_status: "ready",
    storage_path: null,
    original_filename: null,
    mime_type: null,
    file_size: null,
    summary: null,
    extracted_text: null,
    extracted_at: null,
    is_favorite: false,
  };
}

describe("buildKnowledgeGraph", () => {
  it("connects real memories through their shared tags", () => {
    const graph = buildKnowledgeGraph([
      memory("1", "React patterns", ["React", "Frontend"]),
      memory("2", "React testing", ["react", "Testing"]),
    ]);

    expect(graph.memoryCount).toBe(2);
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "topic:react", connectionCount: 2 }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "topic:react", target: "memory:1" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "topic:react", target: "memory:2" }));
  });

  it("uses meaningful title words when AI tags are not ready", () => {
    const graph = buildKnowledgeGraph([memory("1", "Notes about offline architecture")]);

    expect(graph.nodes.some((node) => node.id === "topic:offline")).toBe(true);
    expect(graph.nodes.some((node) => node.id === "topic:about")).toBe(false);
  });

  it("keeps the graph bounded and deterministic", () => {
    const memories = Array.from({ length: 8 }, (_, index) => memory(String(index + 1), `Memory ${index}`, [`topic-${index}`]));
    const first = buildKnowledgeGraph(memories, 4, 2);
    const second = buildKnowledgeGraph(memories, 4, 2);

    expect(first.memoryCount).toBe(4);
    expect(first.topicCount).toBe(2);
    expect(first).toEqual(second);
  });
});
