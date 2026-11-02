# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Standardized open-source contributor infrastructure (Issue templates, PR template, Code of Conduct, Governance, Security policy).
- Dependabot configuration for npm and GitHub Actions ecosystem dependencies.
- Automated PR path-based labeling.

---

## [0.2.0] - 2026-11-02

### Added
- **Local-First Knowledge Subsystem (`local-neuro`):**
  - IndexedDB storage engine with 6 dedicated on-device stores.
  - Browser File System Access API integration (`showDirectoryPicker`) for local folder indexing.
  - Local text extraction, token chunking, and local Ollama vector embeddings.
  - Incremental hash-based synchronization engine with conflict resolution.
  - Hybrid AI layer supporting local Ollama streaming and cloud model routing.
  - New dedicated UI views: `LocalKnowledgeView` (Local Files), `PrivacyDashboard` (Privacy & Data), and `SyncStatusView` (Sync Status).
  - Database migration `20260722000100_local_file_sync.sql` with user-scoped Row-Level Security.
- **Universal Knowledge Retrieval & Connectors (`connectors`):**
  - Connector framework for GitHub, Google Drive, Notion, Slack, and Supabase memories.
  - Model Context Protocol (MCP) server supporting external AI tools (Claude, ChatGPT, custom agents).
  - Multi-source search and source routing engine.
  - New dedicated UI views: `UniversalSearchView`, `IntegrationsHub`, `AIConnectionsView`, and `AuditLogView`.
  - Database migration `20260722000200_universal_knowledge_retrieval.sql` with Row-Level Security.

### Changed
- Integrated 2.0 UI/UX overhaul across all views with unified dark/light themes, consolidated desktop header, and responsive side navigation.
- Updated project metadata to `neuro-ai` v0.2.0.

### Security
- Added comprehensive Security Policy (`SECURITY.md`) and Private Vulnerability Reporting procedures.
- Established strict credential handling guidelines and initiated credential revocation protocols for historical exposures.

