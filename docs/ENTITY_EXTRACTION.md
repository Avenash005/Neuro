# Entity extraction and relationship provenance

Neuron's processing worker now derives structured knowledge from newly processed memories while keeping every result tied to its source.

## Extracted types

- People
- Organizations
- Technologies
- Dates
- URLs
- Places
- Concepts

The model may also return explicit entity-to-entity relationships such as `uses`, `works_at`, `created`, or `scheduled_for`. Relationship labels are normalized, but they are not accepted unless both endpoints are valid extracted entities.

## Safety and validation

- The prompt requires entities and relationships to be explicitly supported by the source.
- Each item carries a confidence value from 0 to 1 and a short evidence phrase.
- Entity types use a strict allowlist.
- Duplicate keys and duplicate normalized entities are removed before storage.
- Relationships with missing endpoints, self-links, or empty labels are discarded.
- Payload sizes are capped at 20 entities and 30 relationships per memory.
- The database replacement function only accepts a currently running processing job and derives its user and memory IDs server-side.

## Data model

- `entities` deduplicates typed names within one account.
- `memory_entities` links an entity to the source memory with confidence and evidence.
- `entity_relationships` stores a directed relationship, source memory, confidence, and evidence.
- Foreign-key cascades remove derived data when its source memory is deleted.
- Orphaned entities are cleaned after a memory's graph is replaced.
- Authenticated clients receive read-only owner-scoped access through Row Level Security. Only the service-role processing RPC writes derived graph data.

The schema is defined in `supabase/migrations/20260720000500_memory_entities.sql`. The worker writes through `replace_memory_graph` before completing its processing job, so a failed graph write is retried instead of silently losing provenance.

## Rollout behavior

Newly processed memories receive typed entities automatically. Existing processed memories continue to appear through the graph's tag fallback and are not automatically reprocessed, avoiding surprise provider usage. Reprocessing can be added later as an explicit user-controlled backfill action.

## Deployment verification

```bash
npm run check:worker
npx supabase db lint --linked --level warning
npx supabase functions deploy process-memory --project-ref YOUR_PROJECT_REF
```

The live function must return HTTP 401 for an unsigned POST request.
