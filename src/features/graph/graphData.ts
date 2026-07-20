import type { MemoryRecord } from "../../lib/supabase";

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  type: "root" | "topic" | "memory";
  memoryId?: string;
  memoryKind?: MemoryRecord["kind"];
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
};

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  memoryCount: number;
  topicCount: number;
};

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "been", "before", "being", "from", "have", "into", "more", "notes", "that", "the", "their", "this", "with", "your",
]);

const KIND_COLORS: Record<MemoryRecord["kind"], string> = {
  Note: "#6657d9",
  Upload: "#4d7db4",
  Link: "#168c75",
  Voice: "#de793d",
};

function normalizeTopic(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9+#.-]+/g, " ").replace(/\s+/g, " ").slice(0, 40);
}

function titleTopics(title: string) {
  return title
    .split(/\s+/)
    .map(normalizeTopic)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .slice(0, 3);
}

function memoryTopics(memory: MemoryRecord) {
  const tags = memory.tags.map(normalizeTopic).filter(Boolean);
  return [...new Set(tags.length ? tags : titleTopics(memory.title))];
}

function pointOnEllipse(index: number, total: number, radiusX: number, radiusY: number, offset = -Math.PI / 2) {
  const angle = offset + (Math.PI * 2 * index) / Math.max(total, 1);
  return { x: 500 + Math.cos(angle) * radiusX, y: 310 + Math.sin(angle) * radiusY };
}

export function buildKnowledgeGraph(memories: MemoryRecord[], maxMemories = 18, maxTopics = 10): KnowledgeGraphData {
  const visibleMemories = [...memories]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, maxMemories);
  if (!visibleMemories.length) return { nodes: [], edges: [], memoryCount: 0, topicCount: 0 };

  const topicsByMemory = new Map<string, string[]>();
  const topicCounts = new Map<string, number>();
  for (const memory of visibleMemories) {
    const topics = memoryTopics(memory);
    topicsByMemory.set(memory.id, topics);
    for (const topic of topics) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  }

  const topics = [...topicCounts.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) => rightCount - leftCount || leftName.localeCompare(rightName))
    .slice(0, maxTopics)
    .map(([name, count]) => ({ name, count }));
  const includedTopics = new Set(topics.map((topic) => topic.name));
  const edges: KnowledgeGraphEdge[] = [];

  const root: KnowledgeGraphNode = {
    id: "root",
    label: "Your brain",
    type: "root",
    connectionCount: topics.length || visibleMemories.length,
    x: 500,
    y: 310,
    radius: 52,
    color: "#24222b",
  };

  const topicNodes = topics.map((topic, index): KnowledgeGraphNode => {
    const point = pointOnEllipse(index, topics.length, 175, 135);
    edges.push({ id: `root-topic:${topic.name}`, source: root.id, target: `topic:${topic.name}` });
    return {
      id: `topic:${topic.name}`,
      label: topic.name,
      type: "topic",
      connectionCount: topic.count,
      ...point,
      radius: Math.min(40, 27 + topic.count * 2),
      color: "#9b5d93",
    };
  });

  const memoryNodes = visibleMemories.map((memory, index): KnowledgeGraphNode => {
    const point = pointOnEllipse(index, visibleMemories.length, 390, 245, -Math.PI / 2 + 0.13);
    const linkedTopics = (topicsByMemory.get(memory.id) || []).filter((topic) => includedTopics.has(topic));
    if (linkedTopics.length) {
      for (const topic of linkedTopics) edges.push({ id: `topic-memory:${topic}:${memory.id}`, source: `topic:${topic}`, target: `memory:${memory.id}` });
    } else {
      edges.push({ id: `root-memory:${memory.id}`, source: root.id, target: `memory:${memory.id}` });
    }
    return {
      id: `memory:${memory.id}`,
      label: memory.title,
      type: "memory",
      memoryId: memory.id,
      memoryKind: memory.kind,
      connectionCount: Math.max(1, linkedTopics.length),
      ...point,
      radius: 27,
      color: KIND_COLORS[memory.kind],
    };
  });

  return {
    nodes: [root, ...topicNodes, ...memoryNodes],
    edges,
    memoryCount: memoryNodes.length,
    topicCount: topicNodes.length,
  };
}
