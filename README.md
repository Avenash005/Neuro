# Neuron — Your AI Second Brain

Neuron is a personal knowledge workspace for capturing notes, links, files, and voice thoughts, then organizing them into a searchable memory system. This repository currently contains the Phase 1 MVP and the foundation for Phase 2 production development.

## Current status

- Responsive dashboard, library, collections, and knowledge graph UI
- Note, link, upload, and voice capture flows
- Supabase anonymous authentication
- Permanent email account upgrades and returning-user magic-link sign-in
- Google/GitHub identity-linking UI
- Supabase-backed memory creation and listing
- Owner-only Row Level Security policies
- Versioned SQL migrations and typed database access
- Error boundary, unit tests, and GitHub Actions CI
- Semantic-search and AI-assistant interface prototypes
- Strict TypeScript and production builds

The production roadmap is in [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).
Phase 2A dashboard setup is in [docs/PHASE_2A_SETUP.md](docs/PHASE_2A_SETUP.md).

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Stable Phase 1 MVP baseline |
| `phase-2-production` | Production architecture, real AI processing, storage, search, and authentication |

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
2. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor.
3. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins** for the MVP.
4. Restart the development server.
5. Confirm the header displays **Supabase synced**.

Phase 2 should replace anonymous-only access with permanent email/OAuth accounts while retaining anonymous onboarding and account linking.

## Quality checks

```bash
npx tsc --noEmit
npm run build
```

Or run the complete local/CI gate:

```bash
npm run check
```

The command runs type-checking, unit tests, and the production build. It must pass before merging a branch.

## Editing guide

- Change global navigation or header: `src/components/layout/AppLayout.tsx`
- Change capture/search/assistant dialogs: `src/components/overlays/AppOverlays.tsx`
- Change dashboard widgets: `src/features/dashboard/Dashboard.tsx`
- Change Library, Collections, or Graph: `src/features/views/FeatureViews.tsx`
- Change Supabase queries: `src/lib/supabase.ts`
- Change database schema or security policies: `supabase/schema.sql`
- Change temporary demo content: `src/data/mockData.ts`
- Change colors and layout: `src/index.css`

## Security rules

- Use a publishable key in the browser; never expose the service-role key.
- Enable RLS on every table exposed through the Supabase Data API.
- Scope every user-owned row by `auth.uid()`.
- Process untrusted files and AI jobs on the server, not in the browser.
- Validate file type, file size, URLs, and model output before storage or rendering.
