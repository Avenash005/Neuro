# Real-memory knowledge graph

Neuron's Knowledge Graph is generated from the signed-in user's private Supabase memories. The previous static demo graph has been removed.

## Graph rules

- Each visible memory becomes a memory node.
- AI-generated memory tags become normalized topic nodes.
- Memories sharing a tag connect through the same topic.
- Memories without processed tags use meaningful title words as a temporary fallback.
- The center node represents the current private workspace.
- The view is deliberately bounded to the 18 newest matching memories and 10 strongest topics so it remains readable and responsive.

The pure graph builder lives in `src/features/graph/graphData.ts`. It is deterministic and unit tested independently from React.

## Interaction

- Filter by note, upload, link, or voice.
- Search across titles, summaries, content, and tags.
- Zoom in, zoom out, and reset the view.
- Select a node to highlight only its direct connections.
- Select a topic to see and open its connected memories.
- Select a memory to review its summary and tags, then open its complete Library detail.

## Privacy

The graph adds no public table and sends no new data to a third party. It uses the same owner-scoped `memories` query protected by Row Level Security. Only data already returned to the active Neuron session is visualized.

## Next graph phase

A later server-side entity pipeline can add typed people, organizations, technologies, dates, URLs, and explicit relationships. That phase should preserve source-memory references so every derived edge remains explainable.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

Manual smoke test:

1. Open **Graph** after signing in.
2. Confirm saved memory titles and AI tags appear instead of demo nodes.
3. Select a topic and open one connected memory.
4. Try search, type filters, and zoom controls.
5. Confirm the empty state appears when no memories match a filter.
