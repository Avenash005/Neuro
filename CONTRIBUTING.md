# Contributing to Neuro AI

Welcome to the Neuro AI community! We are excited to collaborate with external developers, designers, and researchers to build a secure, privacy-first, extensible personal AI second brain.

This guide outlines our standards, workflow, and expectations for contributions.

---

## 1. Code of Conduct

All contributors and maintainers are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating in our project.

---

## 2. Ways to Contribute

You can contribute to Neuro AI in many ways:
- **Reporting Bugs:** Submitting clear, reproducible bug reports via [Issue Forms](https://github.com/Avenash005/Neuro/issues/new/choose).
- **Proposing Enhancements:** Suggesting new connectors, local search features, or UI improvements.
- **Improving Documentation:** Clarifying setup instructions, writing architectural guides, or fixing typos.
- **Submitting Code:** Implementing bug fixes, building new connectors, optimizing local IndexedDB indexing, or writing tests.

---

## 3. Getting Started & Development Setup

### Prerequisites
- **Node.js:** v22.x or later (`node -v`)
- **npm:** v10.x or later (`npm -v`)
- **Git:** v2.30 or later (`git --version`)
- *(Optional for Local AI)*: [Ollama](https://ollama.com/) running locally on port 11434 with models like `llama3.2` or `nomic-embed-text`.
- *(Optional for Cloud AI)*: Supabase account and project URL / publishable key.

### Fork and Clone
1. Fork the official repository: [https://github.com/Avenash005/Neuro](https://github.com/Avenash005/Neuro)
2. Clone your personal fork:
   ```bash
   git clone https://github.com/<your-username>/Neuro.git
   cd Neuro
   ```
3. Add the official upstream repository:
   ```bash
   git remote add upstream https://github.com/Avenash005/Neuro.git
   ```

### Dependency Installation
Install locked dependencies:
```bash
npm ci
```

### Environment Configuration
Copy the template configuration to create your local `.env.local`:
```bash
cp .env.example .env.local
```
Configure your `.env.local` with your browser-safe Supabase credentials or test placeholders. **Never commit `.env.local` or any private API keys to Git.**

### Starting the Local Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 4. Development Workflow

### Step 1: Claiming an Issue
Before writing code:
1. Search [Existing Issues](https://github.com/Avenash005/Neuro/issues) to find an accepted issue, or open a new issue describing your proposal.
2. Comment on the issue asking to work on it.
3. Once a maintainer confirms, you can begin work. This avoids duplicate effort.

### Step 2: Branch Naming Conventions
Always create a new branch from `main`:
```bash
git checkout main
git pull upstream main
git checkout -b <type>/<short-description>
```

Use standardized branch prefixes:
- `feature/<name>` — New feature or major enhancement (e.g. `feature/notion-sync-pagination`)
- `fix/<name>` — Bug fix (e.g. `fix/indexeddb-quota-error`)
- `docs/<name>` — Documentation addition or correction (e.g. `docs/ollama-setup-guide`)
- `test/<name>` — Adding or improving tests (e.g. `test/connector-retry-backoff`)
- `chore/<name>` — Maintenance, dependencies, or tooling (e.g. `chore/upgrade-vite`)

### Step 3: Coding Standards & Structure
- **TypeScript Strictness:** Do not use `any` unless strictly necessary and documented. Ensure all types are exported from `src/types/`.
- **Component Architecture:**
  - `src/features/` — Domain-specific views and features (e.g., `local/`, `privacy/`, `integrations/`, `search/`).
  - `src/components/` — Shared UI elements and layout containers.
  - `src/lib/` — Shared utilities, IndexedDB drivers, connectors, and Supabase client helpers.
- **Tailwind CSS:** Use existing design system tokens and variables defined in `src/index.css`.
- **Zero Secrets in Code:** Never embed API keys, secret hashes, or project credentials in source code.

### Step 4: Commit Conventions
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
<type>(<scope>): <short description in imperative mood>

[optional body explaining motivation]

[optional footer, e.g. Closes #42]
```
Examples:
- `feat(connectors): add pagination to Google Drive connector`
- `fix(sync): handle offline edge case during hash comparison`
- `docs(readme): add Ollama local model compatibility table`
- `test(local-indexer): add chunk boundary edge case unit tests`

---

## 5. Verification & Testing Requirements

Before pushing changes and opening a Pull Request, verify that all automated checks pass locally:

```bash
# 1. Type-check TypeScript
npm run typecheck

# 2. Run unit tests
npm run test

# 3. Verify production build
npm run build

# Or run the complete check suite in one command:
npm run check
```

Pull Requests with failing checks will not be merged.

---

## 6. Submitting a Pull Request

1. Push your branch to your personal fork:
   ```bash
   git push origin <type>/<short-description>
   ```
2. Navigate to [https://github.com/Avenash005/Neuro](https://github.com/Avenash005/Neuro) and click **Compare & pull request**.
3. Fill out the **Pull Request Template**:
   - Provide a concise summary of the changes.
   - Link the relevant issue (e.g., `Closes #123`).
   - Describe manual and automated testing performed.
   - Note any breaking changes or migration requirements.
4. Keep your PR focused on a single logical change. Split unrelated changes into separate PRs.

---

## 7. Code Review & Merge Process

1. **Automated CI:** GitHub Actions CI will automatically run linting, type-checking, unit tests, and production build.
2. **Review:** The maintainer (`@Avenash005`) will review your pull request.
3. **Addressing Feedback:** If changes are requested, push additional commits to your branch. GitHub will update the PR automatically.
4. **Merge:** Once approved and checks pass, the maintainer will merge your PR using **Squash and Merge**.

Thank you for contributing to Neuro AI!

