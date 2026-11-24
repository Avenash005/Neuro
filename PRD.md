# VIOLET — Product Requirements Document (PRD)

**Document Title:** VIOLET: Sovereign Personal AI Operating System  
**Document Version:** 1.0.0  
**Status:** APPROVED & ACTIVE  
**Target Release:** Phase 1 / Phase 2 Production  
**Author:** Principal Software Architect & Product Systems Engineer  
**Date:** 2026-11-24  

---

## 1. Executive Summary & Product Vision

### 1.1 Product Vision
**VIOLET** is a sovereign, private, and deeply integrated personal AI operating system. It bridges the divide between physical workstation capabilities (Windows 11 desktop automation, local filesystem access, screen reasoning, loopback LLM inference) and cloud conveniences (24/7 universal integration ingestion, multi-device synchronization, frontier multi-model reasoning).

Unlike cloud-only assistants that compromise user privacy or local-only scripts that lack cross-device availability, VIOLET adopts a **Hybrid Split-Plane Model**:
- **Sovereignty First:** Private user data, local code repositories, and raw workstation inputs remain completely within the physical machine under strict `LOCAL_ONLY` policies.
- **Proactive Intelligence:** Continuous contextual awareness synthesizes user activities across WhatsApp, Gmail, GitHub, notes, and local workspace interactions into a queryable knowledge graph.
- **Autonomous Execution:** Multi-agent collaboration executes complex engineering, research, and desktop tasks safely in isolated Git worktrees and sandboxed environments.
- **Zero-Trust Security:** End-to-end device authorization, hardware-level emergency kill switches, versioned envelope encryption, and outbound-only reverse relays prevent unauthorized remote execution.

---

## 2. Target Personas & Core User Journeys

### 2.1 Target Personas
1. **The Software Architect / Senior Engineer:**
   - Requires an autonomous assistant that investigates bug reports from GitHub or WhatsApp, provisions isolated Git worktrees, edits code, runs test suites, and drafts pull requests without touching production checkouts.
2. **The Executive / High-Volume Operator:**
   - Ingests communications from WhatsApp Business, Gmail, and Google Drive; automatically identifies action items, commitments, and deadlines; builds a unified daily agenda without sending raw communication bodies to third-party clouds.
3. **The Privacy-Conscious Researcher:**
   - Stores proprietary notes, papers, and personal reflections with strict zero-egress guarantees (`LOCAL_ONLY` Ollama models), querying memories via semantic search and structured knowledge graphs.

### 2.2 Core User Journeys
- **Journey 1: Sovereign Webhook Ingestion to Actionable Task**
  - An urgent client message arrives via WhatsApp Cloud API.
  - VIOLET's Cloud Control Plane cryptographically validates the webhook signature over raw bytes in $<50\text{ ms}$, commits it to a durable queue, and acknowledges Meta.
  - The message is processed into personal context; VIOLET extracts an actionable deadline and creates an action item linked to the knowledge graph.
- **Journey 2: Multi-Model Autonomous Bug Remediation**
  - An issue is filed on GitHub.
  - VIOLET's multi-agent orchestrator spins up an isolated worktree (`.violet/worktrees/agent-issue-42`).
  - An Architect agent analyzes the AST; a Developer agent edits the code; a Reviewer agent executes tests in the worktree.
  - If tests pass, a patch is staged and presented to the human owner for 1-click approval.
- **Journey 3: Outbound Remote Workstation Control**
  - While away from their desk, the owner requests a status snapshot from a mobile PWA client.
  - The request routes through the Cloud Relay Hub. The primary Windows workstation pulls the command over an outbound-only WebSocket tunnel.
  - The local Windows agent captures the screen or lists active processes, encrypts the response, and sends it back. Zero open ports are required on the host network.

---

## 3. Product Principles & Architecture Constraints

1. **Local-First, Cloud-Augmented:** The local workstation is fully autonomous. If internet connectivity drops, local AI, desktop automation, notes, and Git worktrees function with zero degradation.
2. **No Silent Overwrites (Strict Non-LWW):** Credentials, permissions, and concurrent human edits must never be resolved via naive Last-Write-Wins (LWW). Vector clocks and cryptographic epochs govern state transitions.
3. **Zero Workstation Inbound Exposure:** The local Windows agent binds exclusively to `127.0.0.1`. Tools like ngrok or public port forwarding are strictly prohibited. Remote interaction occurs solely via outbound-initiated tunnels.
4. **Fail-Closed Cryptography:** If encryption keys are absent or invalid, the system halts immediately rather than falling back to static or insecure defaults.
5. **Human-in-the-Loop Safeguards:** High-risk desktop operations (process termination, file deletion, outbound message transmission) require explicit interactive human consent.

---

## 4. Functional Requirements

### 4.1 System Foundation & Infrastructure

| ID | Requirement | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-SYS-01** | **Standalone Production API** | Node.js API server operates independently of Vite development middleware, providing graceful shutdown (`SIGTERM`/`SIGINT`), connection draining, and readiness/liveness probes (`/health/ready`, `/health/live`). | P0 |
| **FR-SYS-02** | **Dual-Database Resilience** | Local PostgreSQL 18 (`violet_db`) acts as local master; Cloud Supabase acts as cloud master; explicit synchronization protocols reconcile shared states. | P0 |
| **FR-SYS-03** | **Owner Bootstrap Registry** | Single-owner bootstrap enforces that registration is permanently sealed after the first verified owner registers. Unqualified wipes in tests are prohibited. | P0 |
| **FR-SYS-04** | **Hardware Kill Switch** | The Windows agent supports global hotkeys (`Ctrl+Alt+Shift+Escape`) and API signals to immediately terminate active mouse/keyboard automation. | P0 |

### 4.2 Data Storage Policies & Privacy

| ID | Requirement | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-DAT-01** | **Tri-Policy Storage Tiers** | Support three explicit storage policies: `LOCAL_ONLY`, `EXPLICITLY_SYNCHRONIZED`, and `CLOUD_ONLY`. | P0 |
| **FR-DAT-02** | **Content-Addressable Sync** | Sync operations compare SHA-256 hashes of normalized payloads before transferring data across network boundaries. | P0 |
| **FR-DAT-03** | **Vector Clock Conflict Detection** | Concurrent edits across offline devices generate interactive conflict resolution modals instead of silent data loss. | P0 |
| **FR-DAT-04** | **Deletion Tombstones** | Deletions generate cryptographic tombstones with a 90-day retention window to prevent deleted items from resurrecting. | P0 |
| **FR-DAT-05** | **IndexedDB Presentation Role** | Browser IndexedDB is strictly an optimistic UI cache; PostgreSQL is the sole authoritative master. | P1 |

### 4.3 Identity, Devices & Remote Access

| ID | Requirement | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-IDN-01** | **One-Owner Multi-Device Model** | Exactly one owner controls the system while pairing multiple authorized devices (desktops, laptops, mobile clients). | P0 |
| **FR-IDN-02** | **Cryptographic Device Pairing** | New devices must perform an interactive challenge-response enrollment ceremony using Ed25519 signatures and visual PIN confirmation. | P0 |
| **FR-IDN-03** | **Short-Lived Access Tokens** | Devices authenticate using 15-minute JWTs and rotating 30-day refresh tokens. | P0 |
| **FR-IDN-04** | **Instant Device Revocation** | Revoking a device immediately invalidates all active tokens, dropping connections within milliseconds. | P0 |
| **FR-IDN-05** | **Outbound Reverse Relay** | Remote access executes via an outbound-initiated WSS tunnel with cryptographically signed, scoped task grants. | P0 |

### 4.4 Universal Integrations & Webhook Ingestion

| ID | Requirement | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-INT-01** | **Universal Connector Contract** | All providers implement standard interfaces (`UniversalConnector`) for connect, authenticate, refresh, healthCheck, capabilities, permissions, and resources. | P0 |
| **FR-INT-02** | **WhatsApp Business Cloud API** | Support Meta Graph API v21.0 for incoming webhooks, conversational ingestion, text dispatch, and template messaging. | P0 |
| **FR-INT-03** | **GitHub Integration** | Read repositories, issues, branches, and submit automated pull requests from isolated worktrees. | P0 |
| **FR-INT-04** | **Google Suite (Gmail / Drive)** | Read and summarize priority emails, parse calendar invites, index drive documents. | P1 |
| **FR-INT-05** | **Raw-Byte Webhook Verification** | Webhook verification must compute HMAC-SHA256 signatures over exact raw request bytes before JSON parsing. | P0 |
| **FR-INT-06** | **Nested WhatsApp Deduplication** | WhatsApp webhook deduplication must extract the nested message ID (`entry[0].changes[0].value.messages[0].id`), never the WABA account ID. | P0 |
| **FR-INT-07** | **Durable Ingestion Queue** | Webhooks receive a sub-50ms HTTP 200 ACK and are placed into an ordered queue for asynchronous worker processing. | P0 |
| **FR-INT-08** | **Zero Secrets in Frontend** | Credentials and webhook secrets are stored in encrypted columns and redacted from client JSON responses. | P0 |

### 4.5 AI Multi-Model Routing & Autonomous Multi-Agent Lab

| ID | Requirement | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-AI-01** | **Privacy-Gated Model Router** | Requests with `LOCAL_ONLY` policy strictly route to local models (Ollama). Cloud routing is blocked. | P0 |
| **FR-AI-02** | **Multi-Model Provider Adapters** | Support Ollama, OpenRouter, Google Gemini, Anthropic Claude, and OpenAI with standardized response formatting. | P0 |
| **FR-AI-03** | **Hardware Resource Leases** | Local model execution queries GPU/VRAM availability, preventing system lockups during heavy inference. | P1 |
| **FR-AI-04** | **Multi-Agent Orchestration** | Coordinate multi-step tasks across Architect, Developer, and Reviewer agents with DAG dependency resolution. | P0 |
| **FR-AI-05** | **Git Worktree Isolation** | Agent code edits execute inside isolated Git worktrees under `.violet/worktrees/{agent_id}`. Base branches remain untouched. | P0 |
| **FR-AI-06** | **Automated Review Cycles** | The Reviewer agent runs automated unit tests in the worktree. Max 3 self-correction iterations before prompting human. | P0 |

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Security & Cryptography
- **NFR-SEC-01 (Versioned Envelope Encryption):** All provider credentials and sensitive tokens must be encrypted using `v2:<key_id>:<iv>:<tag>:<ciphertext>` with AES-256-GCM derived via HKDF-SHA256.
- **NFR-SEC-02 (Fail-Closed Operation):** System must refuse to boot if `VIOLET_ENCRYPTION_KEY` is missing, short, or invalid. Static fallback keys are forbidden.
- **NFR-SEC-03 (Timing-Safe Comparison):** All signature and token comparisons must use `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **NFR-SEC-04 (Immutable Audit Trail):** Privileged actions, authentication attempts, device pairing, and webhook ingestion write append-only records to PostgreSQL and `violet-audit.jsonl`.

### 5.2 Performance & Responsiveness
- **NFR-PER-01 (Webhook Latency):** Inbound webhooks must return `HTTP 200 OK` in under **50 ms**.
- **NFR-PER-02 (Local UI Responsiveness):** User interactions in the web app render optimistically in under **16 ms** (60 FPS) backed by IndexedDB.
- **NFR-PER-03 (Model Routing Latency):** Intelligent routing decisions evaluate and select candidate providers within **10 ms**.

### 5.3 Reliability & Availability
- **NFR-REL-01 (Graceful Shutdown):** The Node.js server drains active requests over a 10-second window, flushes buffers, and closes PostgreSQL pools safely upon `SIGTERM`.
- **NFR-REL-02 (Durable Event Processing):** Webhook events retry up to 3 times with exponential backoff (10s, 60s, 300s) before transitioning to a dead-letter state.
- **NFR-REL-03 (PostgreSQL Reconnection):** Database client pools reconnect automatically with randomized jitter upon transient connection loss.

---

## 6. Success Metrics & Key Performance Indicators (KPIs)

1. **Security Integrity:** Zero plain secrets logged; 0 unauthenticated webhook injections; 0 path traversal leaks.
2. **Quality & Test Coverage:** 100% test pass rate across the comprehensive test suite (maintaining $>400$ passing tests).
3. **Synchronization Accuracy:** Zero data resurrection incidents; 100% of concurrent conflicts detected and surfaced to the user.
4. **Agent Reliability:** $>90\%$ of code fixes in isolated Git worktrees produce passing builds prior to human review.
