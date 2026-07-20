# Neuron — Your AI Second Brain

Neuron is a personal knowledge workspace for capturing notes, links, files, and voice thoughts, then organizing them into a searchable memory system. This repository currently contains the Phase 1 MVP and the foundation for Phase 2 production development.

## Current status

- Responsive dashboard, library, collections, and real-memory knowledge graph UI
- Note, link, upload, and voice capture flows
- Supabase anonymous authentication
- Permanent email account upgrades and returning-user magic-link sign-in
- Google/GitHub identity-linking UI
- Supabase-backed memory creation and listing
- Private file uploads and owner-only downloads (PDF, image, Office, text, and audio up to 10 MB)
- Durable URL capture with visible processing state and retry controls
- Server-side extraction worker for URLs, images/OCR, PDFs, Office files, text, and audio
- AI summaries and tags stored separately from original source files
- Owner-only Row Level Security policies
- Versioned SQL migrations and typed database access
- Error boundary, unit tests, and GitHub Actions CI
- Live private hybrid search across exact terms and semantic meaning
- Private Activity page with 7-day, 30-day, and all-time work history
- Functional navigation, Library filters, and owner-scoped favorites and collections that sync across devices
- Grounded Ask Neuron answers with validated, clickable private-memory citations
- Strict TypeScript and production builds

The production roadmap is in [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).
Phase 2A dashboard setup is in [docs/PHASE_2A_SETUP.md](docs/PHASE_2A_SETUP.md).
Phase 2B capture setup is in [docs/PHASE_2B_SETUP.md](docs/PHASE_2B_SETUP.md).
Phase 2B worker deployment is in [docs/PHASE_2B_WORKER.md](docs/PHASE_2B_WORKER.md).
Phase 2C hybrid search is in [docs/PHASE_2C_SEARCH.md](docs/PHASE_2C_SEARCH.md).
Activity history and interaction behavior is in [docs/ACTIVITY_HISTORY.md](docs/ACTIVITY_HISTORY.md).
Grounded assistant architecture is in [docs/GROUNDED_ASSISTANT.md](docs/GROUNDED_ASSISTANT.md).
Persistent favorites and collections are documented in [docs/PERSISTENT_ORGANIZATION.md](docs/PERSISTENT_ORGANIZATION.md).
Knowledge graph behavior is documented in [docs/KNOWLEDGE_GRAPH.md](docs/KNOWLEDGE_GRAPH.md).

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Stable Phase 1 MVP baseline |
| `phase-2-production` | Integration branch for production architecture and completed Phase 2 features |
| `feature/universal-capture` | Completed Phase 2B private capture milestone |
| `feature/semantic-search` | Completed Phase 2C full-text, vector, and hybrid retrieval milestone |
| `feature/activity-history` | Activity timeline and complete UI interaction pass |
| `feature/grounded-assistant` | Private retrieval-augmented answers with verified citations |
| `feature/persistent-organization` | Owner-scoped favorites, collections, and memory membership |
| `feature/knowledge-graph` | Interactive graph generated from private memories and AI tags |

For future work, create focused branches from `phase-2-production`, such as `feature/file-upload`, `feature/semantic-search`, or `fix/mobile-capture`.

## Project structure

```text
src/
├── components/
│   ├── layout/             # Sidebar, header, logo, global search
│   └── overlays/           # Capture, search, and AI assistant panels
├── data/                   # Temporary mock content for unfinished APIs
├── features/
│   ├── dashboard/          # Home dashboard and activity widgets
│   ├── activity/           # Real past-work history, charts, and date grouping
│   └── views/              # Library, collections, and graph screens
├── lib/
│   └── supabase.ts         # Supabase client and memory data access
├── types/                  # Shared application types
├── App.tsx                 # App orchestration and global state
├── index.css               # Current global design system and layout styles
└── main.tsx                # React entry point

supabase/
├── migrations/             # Versioned, replayable database changes
├── functions/              # Secure processing and search Edge Functions
└── schema.sql              # Current database schema reference

docs/
├── ACTIVITY_HISTORY.md     # Past-work page and interaction map
├── GROUNDED_ASSISTANT.md   # Private AI answers and citation validation
├── PHASE_2A_SETUP.md       # Required Supabase dashboard configuration
├── PHASE_2B_WORKER.md      # NVIDIA processing worker deployment
├── PHASE_2C_SEARCH.md      # Hybrid-search architecture and deployment
└── PRODUCTION_PLAN.md      # Architecture mind map and delivery roadmap
```

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

### Environment variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Keep real credentials in `.env.local`. Never place a service-role key in frontend code or commit it to Git.

## Supabase setup

1. Copy `.env.example` to `.env.local` and add the browser-safe publishable key.
2. For a new project, run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor. For an existing project, run only the new files in `supabase/migrations/`, in filename order.
3. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins** for the MVP.
4. Restart the development server.
5. Confirm the header displays **Supabase synced**.

After applying the capture migration, deploy the processing worker using [docs/PHASE_2B_WORKER.md](docs/PHASE_2B_WORKER.md). Until its migration, secrets, and Edge Function are deployed, new files remain safely queued.

Library rows open a complete memory detail view. Signed-in owners can retry processing, download private source files, or permanently delete a memory and its associated private file.

Favorites and collections are stored in Supabase. Open any Library memory to add or remove it from a collection; deleting a collection keeps its memories.

New files and links are protected against duplicate saves with owner-scoped fingerprints. Files are matched by content, while links are canonicalized before comparison.

Private file capture uses short-lived Supabase signed upload URLs with real progress and cancellation. Failed post-upload database writes trigger source-object cleanup.

## Quality checks

```bash
npx tsc --noEmit
npm run build
```

Or run the complete local/CI gate:

```bash
npm run check
npm run check:worker
```

These commands run frontend type-checking, unit tests, the production build, and Deno validation for the Edge Function. They must pass before merging a branch.

## Editing guide

- Change global navigation or header: `src/components/layout/AppLayout.tsx`
- Change capture/search/assistant dialogs: `src/components/overlays/AppOverlays.tsx`
- Change dashboard widgets: `src/features/dashboard/Dashboard.tsx`
- Change past-work history: `src/features/activity/ActivityView.tsx`
- Change Library or Collections: `src/features/views/FeatureViews.tsx`
- Change the knowledge graph UI: `src/features/graph/KnowledgeGraphView.tsx`
- Change graph-building rules: `src/features/graph/graphData.ts`
- Change Supabase queries: `src/lib/supabase.ts`
- Change upload validation: `src/lib/uploads.ts`
- Change database schema or security policies: `supabase/schema.sql`
- Change ingestion/AI processing: `supabase/functions/process-memory/index.ts`
- Change private hybrid search: `supabase/functions/search-memories/index.ts`
- Change grounded AI answers: `supabase/functions/ask-neuron/index.ts`
- Change temporary demo content: `src/data/mockData.ts`
- Change colors and layout: `src/index.css`

## Security rules

- Use a publishable key in the browser; never expose the service-role key.
- Enable RLS on every table exposed through the Supabase Data API.
- Scope every user-owned row by `auth.uid()`.
- Process untrusted files and AI jobs on the server, not in the browser.
- Validate file type, file size, URLs, and model output before storage or rendering.
