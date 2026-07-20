import type { EntityType, KnowledgeEntityData, MemoryRecord } from "../../lib/supabase";

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  type: "root" | "entity" | "memory";
  memoryId?: string;
  memoryKind?: MemoryRecord["kind"];
  entityId?: string;
  entityType?: EntityType | "topic";
  connectionCount: number;
  x: number;
  y: number;
  radius: number;
  color: string;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "root" | "association" | "relationship";
  label?: string;
  memoryId?: string;
  evidence?: string;
  confidence?: number;
};

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  memoryCount: number;
  entityCount: number;
  relationshipCount: number;
  source: "entities" | "tags";
};

type BuildGraphOptions = {
  maxMemories?: number;
  maxEntities?: number;
  entityData?: KnowledgeEntityData;
};

const EMPTY_ENTITY_DATA: KnowledgeEntityData = { entities: [], memoryEntities: [], relationships: [] };
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "been", "before", "being", "from", "have", "into", "more", "notes", "that", "the", "their", "this", "with", "your",
]);
const KIND_COLORS: Record<MemoryRecord["kind"], string> = { Note: "#6657d9", Upload: "#4d7db4", Link: "#168c75", Voice: "#de793d" };
const ENTITY_COLORS: Record<EntityType | "topic", string> = {
  person: "#c66d45",
  organization: "#4f77b5",
  technology: "#168c75",
  date: "#9b6b3e",
  url: "#4c92a7",
  place: "#b45d8b",
  concept: "#8a66ba",
  topic: "#9b5d93",
};

function normalizeTopic(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9+#.-]+/g, " ").replace(/\s+/g, " ").slice(0, 40);
}

function memoryTopics(memory: MemoryRecord) {
  const tags = memory.tags.map(normalizeTopic).filter(Boolean);
  const titleWords = memory.title.split(/\s+/).map(normalizeTopic).filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  return [...new Set(tags.length ? tags : titleWords.slice(0, 3))];
}

function pointOnEllipse(index: number, total: number, radiusX: number, radiusY: number, offset = -Math.PI / 2) {
  const angle = offset + (Math.PI * 2 * index) / Math.max(total, 1);
  return { x: 500 + Math.cos(angle) * radiusX, y: 310 + Math.sin(angle) * radiusY };
}

export function buildKnowledgeGraph(memories: MemoryRecord[], options: BuildGraphOptions = {}): KnowledgeGraphData {
  const maxMemories = options.maxMemories ?? 18;
  const maxEntities = options.maxEntities ?? 12;
  const entityData = options.entityData ?? EMPTY_ENTITY_DATA;
  const visibleMemories = [...memories].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, maxMemories);
  if (!visibleMemories.length) return { nodes: [], edges: [], memoryCount: 0, entityCount: 0, relationshipCount: 0, source: "tags" };

  const visibleMemoryIds = new Set(visibleMemories.map((memory) => memory.id));
  const visibleAssociations = entityData.memoryEntities.filter((link) => visibleMemoryIds.has(link.memory_id));
  const hasTypedEntities = visibleAssociations.length > 0;
  const edges: KnowledgeGraphEdge[] = [];
  const entityNodes: KnowledgeGraphNode[] = [];

  if (hasTypedEntities) {
    const associationCounts = new Map<string, number>();
    for (const link of visibleAssociations) associationCounts.set(link.entity_id, (associationCounts.get(link.entity_id) || 0) + 1);
    const selectedEntities = entityData.entities
      .filter((entity) => associationCounts.has(entity.id))
      .sort((left, right) => (associationCounts.get(right.id) || 0) - (associationCounts.get(left.id) || 0) || left.display_name.localeCompare(right.display_name))
      .slice(0, maxEntities);
    const selectedEntityIds = new Set(selectedEntities.map((entity) => entity.id));
    selectedEntities.forEach((entity, index) => {
      const point = pointOnEllipse(index, selectedEntities.length, 178, 137);
      entityNodes.push({ id: `entity:${entity.id}`, label: entity.display_name, type: "entity", entityId: entity.id, entityType: entity.entity_type, connectionCount: 0, ...point, radius: Math.min(41, 27 + (associationCounts.get(entity.id) || 0) * 2), color: ENTITY_COLORS[entity.entity_type] });
      edges.push({ id: `root-entity:${entity.id}`, source: "root", target: `entity:${entity.id}`, kind: "root" });
    });
    for (const link of visibleAssociations) {
      if (!selectedEntityIds.has(link.entity_id)) continue;
      edges.push({ id: `entity-memory:${link.entity_id}:${link.memory_id}`, source: `entity:${link.entity_id}`, target: `memory:${link.memory_id}`, kind: "association", memoryId: link.memory_id, evidence: link.evidence, confidence: link.confidence });
    }
    for (const relationship of entityData.relationships) {
      if (!visibleMemoryIds.has(relationship.memory_id) || !selectedEntityIds.has(relationship.source_entity_id) || !selectedEntityIds.has(relationship.target_entity_id)) continue;
      edges.push({ id: `relationship:${relationship.id}`, source: `entity:${relationship.source_entity_id}`, target: `entity:${relationship.target_entity_id}`, kind: "relationship", label: relationship.relationship_type, memoryId: relationship.memory_id, evidence: relationship.evidence, confidence: relationship.confidence });
    }
  } else {
    const topicCounts = new Map<string, number>();
    const topicsByMemory = new Map<string, string[]>();
    for (const memory of visibleMemories) {
      const topics = memoryTopics(memory);
      topicsByMemory.set(memory.id, topics);
      for (const topic of topics) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    const topics = [...topicCounts.entries()].sort(([leftName, leftCount], [rightName, rightCount]) => rightCount - leftCount || leftName.localeCompare(rightName)).slice(0, maxEntities);
    const includedTopics = new Set(topics.map(([name]) => name));
    topics.forEach(([name, count], index) => {
      const point = pointOnEllipse(index, topics.length, 178, 137);
      entityNodes.push({ id: `topic:${name}`, label: name, type: "entity", entityType: "topic", connectionCount: 0, ...point, radius: Math.min(40, 27 + count * 2), color: ENTITY_COLORS.topic });
      edges.push({ id: `root-topic:${name}`, source: "root", target: `topic:${name}`, kind: "root" });
    });
    for (const memory of visibleMemories) {
      for (const topic of (topicsByMemory.get(memory.id) || []).filter((name) => includedTopics.has(name))) {
        edges.push({ id: `topic-memory:${topic}:${memory.id}`, source: `topic:${topic}`, target: `memory:${memory.id}`, kind: "association", memoryId: memory.id });
      }
    }
  }

  const linkedMemoryIds = new Set(edges.filter((edge) => edge.kind === "association").map((edge) => edge.memoryId));
  for (const memory of visibleMemories) {
    if (!linkedMemoryIds.has(memory.id)) edges.push({ id: `root-memory:${memory.id}`, source: "root", target: `memory:${memory.id}`, kind: "root", memoryId: memory.id });
  }
  const connectionCounts = new Map<string, number>();
  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
  }
  const root: KnowledgeGraphNode = { id: "root", label: "Your brain", type: "root", connectionCount: connectionCounts.get("root") || 0, x: 500, y: 310, radius: 52, color: "#24222b" };
  const memoryNodes = visibleMemories.map((memory, index): KnowledgeGraphNode => ({
    id: `memory:${memory.id}`,
    label: memory.title,
    type: "memory",
    memoryId: memory.id,
    memoryKind: memory.kind,
    connectionCount: connectionCounts.get(`memory:${memory.id}`) || 1,
    ...pointOnEllipse(index, visibleMemories.length, 390, 245, -Math.PI / 2 + 0.13),
    radius: 27,
    color: KIND_COLORS[memory.kind],
  }));
  const countedEntityNodes = entityNodes.map((node) => ({ ...node, connectionCount: connectionCounts.get(node.id) || 0 }));
  return {
    nodes: [root, ...countedEntityNodes, ...memoryNodes],
    edges,
    memoryCount: memoryNodes.length,
    entityCount: countedEntityNodes.length,
    relationshipCount: edges.filter((edge) => edge.kind === "relationship").length,
    source: hasTypedEntities ? "entities" : "tags",
  };
}
