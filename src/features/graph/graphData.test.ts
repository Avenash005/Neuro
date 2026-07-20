import { describe, expect, it } from "vitest";
import type { KnowledgeEntityData, MemoryRecord } from "../../lib/supabase";
import { buildKnowledgeGraph, graphBackfillCandidates } from "./graphData";

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
    graph_analyzed_at: null,
  };
}

describe("buildKnowledgeGraph", () => {
  it("connects real memories through their shared tags", () => {
    const graph = buildKnowledgeGraph([
      memory("1", "React patterns", ["React", "Frontend"]),
      memory("2", "React testing", ["react", "Testing"]),
    ]);

    expect(graph.memoryCount).toBe(2);
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "topic:react", connectionCount: 3 }));
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
    const first = buildKnowledgeGraph(memories, { maxMemories: 4, maxEntities: 2 });
    const second = buildKnowledgeGraph(memories, { maxMemories: 4, maxEntities: 2 });

    expect(first.memoryCount).toBe(4);
    expect(first.entityCount).toBe(2);
    expect(first).toEqual(second);
  });

  it("prefers typed entities and preserves relationship provenance", () => {
    const entityData: KnowledgeEntityData = {
      entities: [
        { id: "person-1", display_name: "Avenash", entity_type: "person" },
        { id: "tech-1", display_name: "React", entity_type: "technology" },
      ],
      memoryEntities: [
        { memory_id: "1", entity_id: "person-1", confidence: .98, evidence: "Avenash built" },
        { memory_id: "1", entity_id: "tech-1", confidence: .95, evidence: "with React" },
      ],
      relationships: [{ id: "relation-1", memory_id: "1", source_entity_id: "person-1", target_entity_id: "tech-1", relationship_type: "uses", confidence: .91, evidence: "built with React" }],
    };
    const graph = buildKnowledgeGraph([memory("1", "Neuron architecture")], { entityData });

    expect(graph.source).toBe("entities");
    expect(graph.nodes).toContainEqual(expect.objectContaining({ label: "Avenash", entityType: "person" }));
    expect(graph.relationshipCount).toBe(1);
    expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "relationship", label: "uses", memoryId: "1", evidence: "built with React" }));
  });
});

describe("graphBackfillCandidates", () => {
  it("selects at most three oldest ready memories that have not been analyzed", () => {
    const candidates = [memory("5", "Newest"), memory("1", "Oldest"), memory("2", "Analyzed"), memory("3", "Processing"), memory("4", "Ready")];
    candidates[2].graph_analyzed_at = "2026-07-20T00:00:00.000Z";
    candidates[3].processing_status = "processing";

    expect(graphBackfillCandidates(candidates).map((item) => item.id)).toEqual(["1", "4", "5"]);
  });
});
