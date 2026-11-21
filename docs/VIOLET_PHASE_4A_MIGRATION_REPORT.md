# VIOLET Phase 4A: Core Database Migration & Local PostgreSQL Layer Report

## Executive Summary

Phase 4A marks the foundational milestone in converting VIOLET from a remote Supabase-dependent architecture into a local-only, single-owner AI operating system running on Windows 11.

All 39 application tables, 17 database triggers, 19 stored procedures/functions, 65 indexes, and foreign-key cascade hierarchies were analyzed, translated, migrated, and verified on a live local PostgreSQL 18.3 engine. The connection layer was built with native connection pooling, atomic transaction wrappers, and an idempotent sequential migration runner.

---

## 1. Existing Architecture Inventory

Prior to Phase 4A, VIOLET relied on:
- **Hosted Supabase PostgreSQL**: Database hosting with postgREST, GoTrue Auth, and Storage APIs.
- **Supabase Auth (`auth.users`)**: Foreign key references to Supabase internal user identities across 29 tables.
- **Supabase Storage (`storage.buckets`, `storage.objects`)**: File storage for attachments, audio recordings, and artifacts.
- **Edge Functions**: 4 Deno-based edge functions (`process-memory`, `search-memories`, `ask-neuron`, `live-assist`).
- **Local Desktop Agent (`apps/violet-local-agent`)**: Windows OS automation agent (FastAPI, Python 3.14) running locally with zero cloud dependencies.
- **Frontend (`src/`)**: React 18, Vite 7, TypeScript, Tailwind CSS, communicating via `@supabase/supabase-js`.

Target Local Architecture:
- **Database Engine**: Local PostgreSQL 18.3 running on `127.0.0.1:5432`.
- **Database**: `violet_db`.
- **Application Role**: `violet_app` with SCRAM-SHA-256 authentication.
- **Access Control**: Application-layer owner isolation via singleton bootstrap and session tokens.
- **Storage**: Local filesystem storage with database metadata compatibility.

---

## 2. Complete Table & Dependency Inventory (39 Tables)

### A. Neuron Intelligence Tables (17 Tables)
1. **`profiles`**: User profile identity, avatar URL, and display name. References `auth.users(id)` ON DELETE CASCADE.
2. **`memories`**: Core multimodal memory store (notes, links, uploads, audio) with full-text search vector and vector embedding column. References `auth.users(id)` ON DELETE CASCADE.
3. **`processing_jobs`**: Job queue for asynchronous background processing (extract, ocr, transcribe, embed, graph, study). References `auth.users(id)` and `memories(id)` ON DELETE CASCADE.
4. **`entities`**: Knowledge graph entities (persons, organizations, topics, concepts, projects). References `auth.users(id)` ON DELETE CASCADE.
5. **`memory_entities`**: Associative junction table between memories and entities with relevance weighting. References `memories(id)` and `entities(id)` ON DELETE CASCADE.
6. **`entity_relationships`**: Knowledge graph semantic edges with confidence scores. References `entities(id)` and `memories(id)` ON DELETE CASCADE.
7. **`action_items`**: Extracted tasks, reminders, and due dates linked to memories. References `auth.users(id)` and `memories(id)` ON DELETE CASCADE.
8. **`collections`**: Organization folders and categories for memories. References `auth.users(id)` ON DELETE CASCADE.
9. **`collection_memories`**: Junction mapping memories into collections. References `collections(id)` and `memories(id)` ON DELETE CASCADE.
10. **`study_cards`**: Spaced-repetition flashcards and QA items. References `auth.users(id)` and `memories(id)` ON DELETE CASCADE.
11. **`sidekick_sessions`**: Interactive sidekick contextual workspace sessions. References `auth.users(id)` ON DELETE CASCADE.
12. **`sidekick_notes`**: Session notes linked to memories. References `sidekick_sessions(id)` ON DELETE CASCADE and `memories(id)` ON DELETE SET NULL.
13. **`local_file_sync`**: Manifest of indexed local directory files, hashes, and sync state. References `auth.users(id)` ON DELETE CASCADE.
14. **`integration_connections`**: OAuth/connection state for external and local integration sources. References `auth.users(id)` ON DELETE CASCADE.
15. **`knowledge_items`**: Retrieved and indexed knowledge documents, pages, and messages. References `integration_connections(id)` ON DELETE CASCADE.
16. **`audit_log_entries`**: Audit records for security, AI access, and data export events. References `auth.users(id)` ON DELETE CASCADE.
17. **`ai_connections`**: AI provider configurations, custom API keys, and local model settings. References `auth.users(id)` ON DELETE CASCADE.

### B. VIOLET Multi-Agent & Control Plane Tables (22 Tables)
18. **`agent_tasks`**: Autonomous engineering tasks, plans, cycles, routing tiers, and git branches. References `auth.users(id)` ON DELETE CASCADE.
19. **`agent_task_steps`**: Discrete planned steps in an agent plan with verification criteria. References `agent_tasks(id)` ON DELETE CASCADE.
20. **`agent_approvals`**: Human-in-the-loop approvals for sensitive operations. References `agent_tasks(id)` and `agent_task_steps(id)` ON DELETE CASCADE.
21. **`agent_handoffs`**: Human handoffs when agent requires user intervention. References `agent_tasks(id)` ON DELETE CASCADE.
22. **`agent_devices`**: Paired local devices and security fingerprint scopes. References `auth.users(id)` ON DELETE CASCADE.
23. **`agent_workflows`**: Reusable DAG workflow definitions. References `auth.users(id)` ON DELETE CASCADE.
24. **`agent_workflow_runs`**: Executing instances of DAG workflows. References `agent_workflows(id)` and `agent_tasks(id)` ON DELETE CASCADE.
25. **`agent_task_events`**: Audit and telemetry event stream for tasks. References `agent_tasks(id)` ON DELETE CASCADE.
26. **`agent_runs`**: Role-based agent execution instances (architect, developer, reviewer, tester). References `agent_tasks(id)` ON DELETE CASCADE.
27. **`agent_events`**: Granular agent execution timeline events. References `agent_runs(id)` and `agent_tasks(id)` ON DELETE CASCADE.
28. **`agent_commits`**: Git commits created in isolated worktrees with file changes. References `agent_runs(id)` and `agent_tasks(id)` ON DELETE CASCADE.
29. **`agent_artifacts`**: Produced plans, diffs, test reports, and code artifacts. References `agent_runs(id)` and `agent_tasks(id)` ON DELETE CASCADE.
30. **`model_usage`**: Token consumption, latency, and provider cost accounting. References `agent_runs(id)` and `agent_tasks(id)` ON DELETE CASCADE.
31. **`agent_reviews`**: Independent code review verdicts (approved, changes_requested, rejected). References `agent_runs(id)` and `agent_tasks(id)` ON DELETE CASCADE.
32. **`agent_messages`**: Inter-agent structured communication bus (proposals, critiques, handoffs). References `agent_tasks(id)` and `agent_runs(id)` ON DELETE CASCADE.
33. **`agent_subtasks`**: Fine-grained subtask DAG with dependency-aware scheduling. References `agent_tasks(id)` and `agent_runs(id)` ON DELETE CASCADE.
34. **`engineering_findings`**: Codebase findings (security vulnerabilities, bugs, architecture alerts). References `agent_tasks(id)` and `agent_runs(id)` ON DELETE CASCADE.
35. **`architectural_decisions`**: Architecture Decision Records (ADRs) with context and rationale. References `agent_tasks(id)` ON DELETE CASCADE.
36. **`agent_tool_executions`**: Live operations tool telemetry and execution logs. References `agent_tasks(id)` and `agent_runs(id)` ON DELETE CASCADE.
37. **`agent_issues`**: Issues & Bug Center registry (TypeScript errors, crashes, review alerts). References `agent_tasks(id)` and `agent_runs(id)` ON DELETE CASCADE.
38. **`issue_fix_attempts`**: Automated issue resolution attempts in isolated worktrees. References `agent_issues(id)` ON DELETE CASCADE.
39. **`violet_owner_bootstrap`**: Singleton registry tracking private local owner identity and bootstrap status.

---

## 3. Supabase-to-Local Compatibility Report

| Supabase Feature | Local PostgreSQL Implementation | Compatibility Strategy |
| :--- | :--- | :--- |
| `auth.users` Table | Local `auth.users` table & `public.local_users` | Defined `auth` schema with `auth.users` table containing all standard Supabase columns. All foreign keys (`REFERENCES auth.users(id) ON DELETE CASCADE`) resolve without modification. |
| `auth.uid()` Function | Local PL/pgSQL Function | Reads `current_setting('request.jwt.claim.sub', true)::uuid`. Returns NULL when unset. |
| `auth.jwt()` Function | Local PL/pgSQL Function | Reads `current_setting('request.jwt.claims', true)::jsonb`. |
| `storage.buckets` / `storage.objects` | Local `storage` Schema | Defined `storage` schema with `buckets` and `objects` tables. Storage paths map to local directory `data/storage/`. |
| Row Level Security (RLS) | Application-Layer Enforcement | In single-owner local architecture, all queries run under `violet_app`. Owner access is validated via owner bootstrap tokens and API middleware. |
| Extensions (`pgcrypto`) | Installed `pgcrypto` Extension | Fully supported in PostgreSQL 18.3. |
| Extensions (`pgvector`) | Fallback Cosine Distance Operator `<=>` | Pure PL/pgSQL cosine distance operator registered in `extensions` schema for `float8[]`. If `vector` binary is compiled, conditional HNSW indexing is activated. |

---

## 4. Local Migration Structure

The migrations were modularized into 7 sequential, atomic SQL scripts in `src/server/database/migrations/`:

```
src/server/database/migrations/
├── 001_core_and_auth.sql              # Core extensions, auth schema, local_users, storage schema, vector fallback
├── 002_neuron_schema.sql              # 17 Neuron tables & 32 indexes
├── 003_neuron_functions.sql           # 19 PL/pgSQL stored procedures, search helpers, and 15 triggers
├── 004_violet_control_plane.sql       # 8 Control Plane tables (tasks, steps, approvals, handoffs, workflows)
├── 005_violet_multi_agent.sql         # 6 Multi-Agent tables (runs, events, commits, artifacts, usage, reviews)
├── 006_violet_intelligence_and_issues.sql # 7 Intelligence tables (messages, subtasks, findings, ADRs, issues)
└── 007_violet_owner_bootstrap.sql     # Singleton owner bootstrap registry & constraints
```

State tracking is maintained in `public.schema_migrations`:
```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 5. Identified Schema Translation Risks & Mitigations

1. **pgvector Availability on Windows 11**:
   - *Risk*: Standard Windows PostgreSQL 18 installer does not include `vector.dll`. Attempting `CREATE EXTENSION vector` throws a fatal module not found error.
   - *Mitigation*: Implemented an intelligent detection block. If `vector` is present, it is utilized; otherwise, `embedding` uses `float8[]` with a native `extensions.<=>` operator and `extensions.cosine_distance` function. All vector queries and `hybrid_search_memories` execute seamlessly.
2. **Foreign Key Cascade Integrity**:
   - *Risk*: Orphaned rows across 38 dependent tables when owner records are modified or cleaned up.
   - *Mitigation*: Every child table enforces explicit `ON DELETE CASCADE` (or `ON DELETE SET NULL` for non-critical associations like sidekick notes and knowledge item connections).
3. **Migration Idempotency**:
   - *Risk*: Double execution on application restart causing constraint or duplicate table errors.
   - *Mitigation*: Every migration statement uses `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, and `schema_migrations` transaction tracking.
4. **Credential Security**:
   - *Risk*: Exposing database passwords in logs, git, or command outputs.
   - *Mitigation*: Passwords are read strictly from `.env` (`VIOLET_DB_PASSWORD`) and connection pooling handles auth internally. `.env` is gitignored.

---

## 6. Implementation Deliverables

The local database subsystem was implemented across:
- **`src/server/database/config.ts`**: Environment-driven configuration loader.
- **`src/server/database/pool.ts`**: PostgreSQL connection pool lifecycle and health check API.
- **`src/server/database/client.ts`**: Parameterized query helper, single-row extractor, and transaction wrapper.
- **`src/server/database/migrate.ts`**: Transactional migration runner with ordering and state tracking.
- **`src/server/database/database.test.ts`**: Comprehensive automated test suite.

---

## 7. Verification Results

All automated verification gates passed:

1. **Phase 4A Database Layer Test Suite**:
   - `npx vitest run src/server/database/database.test.ts`
   - Result: **12 / 12 tests passed (100%)**
   - Verified: Connection pool health, migration runner, 39 tables created, foreign-key cascades, singleton constraints, hybrid search execution, trigger execution.
2. **Full Frontend & Multi-Agent Test Suite**:
   - `npm test`
   - Result: **47 / 47 test files passed, 296 / 296 tests passed (100%)**
3. **Local Desktop Agent Test Suite**:
   - `apps/violet-local-agent/.venv/Scripts/pytest.exe apps/violet-local-agent/tests`
   - Result: **36 / 36 pytest tests passed (100%)**
4. **TypeScript Typecheck**:
   - `npm run typecheck`
   - Result: **0 errors**
5. **Production Build**:
   - `npm run build`
   - Result: **Successfully built in 4.17s**
