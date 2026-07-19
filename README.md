# Neuron — Your AI Second Brain

Neuron is a personal knowledge workspace for capturing notes, links, files, and voice thoughts, then organizing them into a searchable memory system. This repository currently contains the Phase 1 MVP and the foundation for Phase 2 production development.

## Current status

- Responsive dashboard, library, collections, and knowledge graph UI
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
- Semantic-search and AI-assistant interface prototypes
- Strict TypeScript and production builds

The production roadmap is in [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).
Phase 2A dashboard setup is in [docs/PHASE_2A_SETUP.md](docs/PHASE_2A_SETUP.md).
Phase 2B capture setup is in [docs/PHASE_2B_SETUP.md](docs/PHASE_2B_SETUP.md).
Phase 2B worker deployment is in [docs/PHASE_2B_WORKER.md](docs/PHASE_2B_WORKER.md).

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Stable Phase 1 MVP baseline |
| `phase-2-production` | Integration branch for production architecture and completed Phase 2 features |
| `feature/universal-capture` | Phase 2B private uploads, ingestion jobs, and processing status |

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
│   └── views/              # Library, collections, and graph screens
├── lib/
│   └── supabase.ts         # Supabase client and memory data access
├── types/                  # Shared application types
├── App.tsx                 # App orchestration and global state
├── index.css               # Current global design system and layout styles
└── main.tsx                # React entry point

supabase/
├── migrations/             # Versioned, replayable database changes
└── schema.sql              # Current database schema reference

docs/
├── PHASE_2A_SETUP.md       # Required Supabase dashboard configuration
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
- Change Library, Collections, or Graph: `src/features/views/FeatureViews.tsx`
- Change Supabase queries: `src/lib/supabase.ts`
- Change upload validation: `src/lib/uploads.ts`
- Change database schema or security policies: `supabase/schema.sql`
- Change ingestion/AI processing: `supabase/functions/process-memory/index.ts`
- Change temporary demo content: `src/data/mockData.ts`
- Change colors and layout: `src/index.css`

## Security rules

- Use a publishable key in the browser; never expose the service-role key.
- Enable RLS on every table exposed through the Supabase Data API.
- Scope every user-owned row by `auth.uid()`.
- Process untrusted files and AI jobs on the server, not in the browser.
- Validate file type, file size, URLs, and model output before storage or rendering.
