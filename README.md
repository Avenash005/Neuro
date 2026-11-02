# Neuro AI — The Extensible Personal AI Second Brain

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646cff.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E.svg)](https://supabase.com/)

Neuro AI is a privacy-first, hybrid personal knowledge workspace and AI second brain. It connects your notes, documents, local files, and external platforms (GitHub, Google Drive, Notion, Slack) into a searchable memory system with on-device indexing and grounded AI assistance.

---

## The Problem & Our Approach

Knowledge workers, researchers, and developers constantly juggle fragmented information across disparate silos: local directories, browser tabs, cloud drives, and workplace tools. Existing cloud note-taking and second-brain tools often sacrifice privacy, require uploading all private files to external servers, or lack grounded AI reasoning with transparent citations.

**Neuro AI solves this through a hybrid architecture:**
- **Local-First by Default:** Your local folders are indexed directly inside the browser using IndexedDB and the File System Access API. Data stays on your machine.
- **Local AI & Cloud AI Hybrid:** Run fully private local inference and embeddings using [Ollama](https://ollama.com/), or seamlessly connect cloud intelligence (NVIDIA Nemotron / OpenAI) when requested.
- **Universal Knowledge Connectors:** Connect external services (GitHub, Google Drive, Notion, Slack) through a unified retrieval pipeline.
- **Model Context Protocol (MCP):** Connect external AI agents (Claude, ChatGPT, IDE agents) to your personal memory via a standardized MCP server.

---

## Key Features

### 1. Private Capture & Ingestion
- **Multimodal Capture:** Notes, links, files, and voice recordings.
- **Private File Processing:** Uploads and extracts text from PDFs, Office docs, images (OCR), plain text, and audio.
- **Deduplication:** Hash-based content fingerprinting prevents redundant uploads and duplicate links.

### 2. Local-First Storage & Offline Privacy
- **Direct OS Folder Indexing:** Connect local folders using the native File System Access API with an extension allowlist and size safeguards.
- **On-Device Search:** IndexedDB storage with 6 dedicated stores for offline search and tag indexing.
- **Incremental Sync Engine:** Hash-based change detection synchronizes only changed files with explicit conflict resolution (`Keep Local` vs `Keep Cloud`).
- **Privacy Dashboard:** Transparent controls to toggle storage modes (`🔒 Local`, `⚡ Hybrid`, `☁ Cloud`) and disconnect sync without deleting cloud records.

### 3. Knowledge Graph & Grounded Intelligence
- **Interactive Knowledge Graph:** Dynamic visual graph generated from private memories, extracted entities, and shared tags.
- **Grounded AI Assistant:** Ask questions about your personal knowledge with verified, clickable citations back to exact source memories.
- **Sidekick Conversation Prep:** Prepare for meetings and discussions using grounded context extracted from selected memories.
- **Study Mode & Flashcards:** Automatically generate review flashcards and quizzes from your captured notes.
- **Daily & Weekly Recaps:** Automated recaps highlighting activity streaks, recurring themes, and completed action items.

### 4. Universal Connectors & MCP Agent Integration
- **Cross-Source Retrieval:** Query across local files, Supabase memories, and third-party platforms simultaneously.
- **Third-Party Connectors:** Modular connectors for GitHub (code/issues/PRs), Google Drive, Notion, and Slack.
- **MCP Server:** Secure Model Context Protocol endpoints allowing external AI assistants to safely query your second brain under strict user-controlled permissions.
- **Immutable Audit Logging:** Every search, sync, and AI access event is logged locally for security transparency.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 7, TypeScript 5, Tailwind CSS v4, Framer Motion, Lucide Icons, cmdk |
| **Local Storage & Indexing** | IndexedDB, Browser File System Access API, Web Crypto API (`crypto.subtle`) |
| **Local AI** | Ollama REST API (streaming chat & embeddings) |
| **Cloud Backend** | Supabase (PostgreSQL with `pgvector`, Row Level Security, Storage Buckets, Auth) |
| **Edge Functions** | Deno v2 runtime (multimodal processing worker, hybrid search, grounded assistant) |
| **Testing & CI** | Vitest, TypeScript compiler (`tsc`), GitHub Actions |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Neuro AI Frontend UI                            │
│                 (React 18 + Vite 7 + Tailwind CSS v4)                       │
├──────────────────────────────────────┬──────────────────────────────────────┤
│        Local-First Subsystem         │       Cloud Backend (Supabase)       │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • File System Access API             │ • PostgreSQL with pgvector           │
│ • IndexedDB (6 offline stores)       │ • Row Level Security (owner-only)    │
│ • Local Text Chunking & Indexing     │ • Private Storage Buckets            │
│ • Ollama Local AI & Embeddings       │ • Edge Functions (Deno Runtime)      │
│ • Hash-based Incremental Sync Engine │   - NVIDIA Nemotron AI Processing    │
│ • Privacy Dashboard & Storage Modes  │   - Grounded RAG Assistant           │
├──────────────────────────────────────┴──────────────────────────────────────┤
│               Universal Connectors & Model Context Protocol (MCP)           │
│    GitHub, Google Drive, Notion, Slack, In-Memory Audit Log, MCP Server     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- **Node.js:** v22.x or later (`node -v`)
- **npm:** v10.x or later (`npm -v`)
- *(Optional for Local AI)*: [Ollama](https://ollama.com/) running locally (`http://localhost:11434`)
- *(Optional for Cloud AI)*: A [Supabase](https://supabase.com/) project

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Avenash005/Neuro.git
   cd Neuro
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your configuration:
   ```env
   # Browser-safe Supabase configuration
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   VITE_AUTH_REDIRECT_URL=http://127.0.0.1:5173
   ```
   *(Note: Local-first features work even without Supabase configured!)*

4. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts the Vite development server with hot module replacement |
| `npm run typecheck` | Validates TypeScript types across the entire project (`tsc --noEmit`) |
| `npm run test` | Executes unit and integration test suite via Vitest |
| `npm run build` | Builds the optimized production bundle in `dist/` |
| `npm run check` | Runs full quality check suite (`typecheck && test && build`) |
| `npm run preview` | Locally previews the production build |

---

## Directory Structure

```text
Neuro/
├── .github/
│   ├── ISSUE_TEMPLATE/     # Structured GitHub issue forms
│   ├── workflows/          # GitHub Actions CI & PR Labeler workflows
│   ├── dependabot.yml      # Dependabot dependency update configuration
│   └── PULL_REQUEST_TEMPLATE.md # Contributor pull request checklist
├── docs/                   # Architectural guides and setup documentation
├── public/                 # Static assets and icons
├── src/
│   ├── components/         # Shared layout, header, sidebar, and modals
│   ├── features/           # Domain views:
│   │   ├── activity/       # Timeline of user memory activity
│   │   ├── dashboard/      # Home dashboard & widgets
│   │   ├── graph/          # Interactive knowledge graph
│   │   ├── integrations/   # Connectors hub, AI connections, audit log
│   │   ├── local/          # Local folder knowledge browser
│   │   ├── privacy/        # Privacy and storage mode dashboard
│   │   ├── recaps/         # Daily and weekly recap summaries
│   │   ├── search/         # Universal search interface
│   │   ├── settings/       # Account and identity management
│   │   ├── sidekick/       # Conversational AI assistant & meeting prep
│   │   ├── study/          # Flashcards & quizzes
│   │   ├── tasks/          # Source-linked action items
│   │   └── sync/           # Real-time synchronization & conflict resolver
│   ├── lib/                # Core engines, IndexedDB, connectors, Supabase
│   ├── types/              # TypeScript types (app, local, connectors)
│   ├── App.tsx             # Application routing and state orchestration
│   ├── index.css           # Design tokens, variables, and global styles
│   └── main.tsx            # React entry point
├── supabase/
│   ├── functions/          # Deno Edge Functions (process-memory, search, etc.)
│   └── migrations/         # Versioned PostgreSQL database migrations
├── .env.example            # Sanitized environment variable template
├── CHANGELOG.md            # Version release notes
├── CONTRIBUTING.md         # Developer contribution guidelines
├── CODE_OF_CONDUCT.md     # Community standard of conduct
├── GOVERNANCE.md           # Decision-making and maintainer policy
├── LICENSE                 # MIT License
├── package.json            # Dependencies and scripts
└── SECURITY.md             # Security policy and vulnerability disclosure
```

---

## Contributing

We welcome contributions from the community! To get started:
1. Review our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md).
2. Check out our [Open Issues](https://github.com/Avenash005/Neuro/issues) to find tasks or bug reports.
3. Fork the repository, create a descriptive feature branch (`feature/<name>`), make your changes, and submit a Pull Request.

---

## Security & Responsible Disclosure

If you discover a security vulnerability or exposed credential, please **do not** open a public issue. Review our [Security Policy](SECURITY.md) and submit a private report via [GitHub Private Vulnerability Advisory](https://github.com/Avenash005/Neuro/security/advisories/new).

---

## Roadmap

- [x] Phase 1: MVP Core Dashboard, notes, uploads, links, and collections.
- [x] Phase 2A: Authentication, RLS, and owner-scoped memory isolation.
- [x] Phase 2B: NVIDIA AI multimodal memory processing and summarization.
- [x] Phase 2C: Semantic vector search, hybrid search, and citation grounding.
- [x] 2.0 UI/UX: Design system polish, high-contrast modals, and unified navigation.
- [x] Local-First Architecture: On-device IndexedDB, File System Access API, and Ollama integration.
- [x] Universal Connectors & MCP: Cross-source search and external AI agent integration.
- [ ] Mobile PWA companion and background syncing.
- [ ] End-to-end client-side encryption for cloud-synced files.
- [ ] Additional native connectors (Obsidian, Logseq, Apple Notes).

---

## Maintainers

- **Lead Maintainer:** [@Avenash005](https://github.com/Avenash005)

---

## License

This project is licensed under the [MIT License](LICENSE).
