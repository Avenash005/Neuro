# VIOLET — Personal AI Operating System

VIOLET evolves Neuro from a knowledge workspace into a permissioned personal AI operating system. Neuro's existing memory, retrieval, knowledge graph, local-first file indexing, model routing, connectors, MCP and audit features remain foundational services. VIOLET adds task planning, tool execution, the Windows local agent, browser automation, human handoff, workflow scheduling and multi-agent coordination.

## Product principles

1. **One orchestrator, many capabilities.** A single planner decomposes user requests and delegates to typed skills/tools.
2. **Local-first where possible.** The Windows agent owns PC capabilities; the cloud backend coordinates but does not receive unrestricted shell access.
3. **Human control at boundaries.** Sending messages, spending money, deleting data, publishing code, uploading private files and submitting consequential forms require scoped approval.
4. **Visible automation.** Browser control uses an observable browser profile. Users can pause, take over, resume or stop.
5. **Provider independence.** Model adapters support cloud and local models without coupling tools to a specific LLM.
6. **Auditable execution.** Every task, tool call, approval, failure and result is recorded with redacted arguments.
7. **Untrusted content stays untrusted.** Web pages, emails, messages and repository files cannot grant permissions or override system policy.
8. **Graceful human handoff.** CAPTCHA, OTP, MFA, anti-bot checks and ambiguous consent challenges are completed by the user, not bypassed.

## Capability domains

- Computer: screen snapshots, window discovery, accessible UI automation, input, approved file roots and allowlisted commands.
- Browser: visible browser sessions, navigation, page inspection, form filling, downloads, uploads and human handoff.
- Developer: repository search, code context, diff generation, tests, branch/commit/PR operations.
- Communication: provider-specific inbox retrieval and draft/send operations according to each platform's API and account restrictions.
- Shopping: catalog discovery, location-aware stock and price comparison, cart preparation, order placement only after confirmation.
- Knowledge: Neuro memory, semantic retrieval, graph entities and user-approved durable preferences.
- Productivity: tasks, reminders, calendar, daily plans, meeting preparation and recaps.
- Research: web research, source comparison and reports.
- Finance: manual/authorized transaction imports, budgets, subscription tracking and price/expense analysis; no autonomous transfers.
- Voice: speech input/output and interruptible spoken control.
- Workflow: user-authored skills, schedules, triggers, retries and bounded recovery.
- Ecosystem: desktop, web, mobile and messaging companion clients; multi-device pairing and skill marketplace.

## Target architecture

```text
Desktop / Web / Mobile / Voice / Telegram
                 |
         API + Identity Layer
                 |
     Task Orchestrator / Planner
                 |
       Policy + Approval Gateway
          /       |       \
      Memory   Tool Registry  Scheduler
        |          |
  Neuro memory   Agent adapters
  RAG + Graph    /      |       \
               Local   Browser  Cloud APIs
               Agent   Agent    Connectors
                 |
          Windows 11 device
```

### Control plane and execution plane

- **Control plane:** identity, task state, planning, permissions, scheduling, provider selection, observability and audit.
- **Execution plane:** isolated skills, browser worker, Windows local agent, connector workers and sandboxed developer tasks.
- The orchestrator never constructs arbitrary shell commands from model text. It selects registered tools with JSON schemas and policy metadata.
- Local agent pairing uses per-device credentials, TLS, short-lived task grants and revocation. Do not port-forward a local FastAPI server or expose it directly to the public internet.
- Local agent should run as a user-session process for screen/UI access, not as an elevated Windows service. Elevation is a separate explicit user action.

## Task lifecycle

```text
requested -> classified -> planned -> awaiting_approval
          -> queued -> running -> awaiting_human
          -> validating -> completed
                         -> failed / cancelled
```

Each task has a stable ID, owner, source, plan, risk category, deadline, cancellation token, execution budget, tool-call records and final evidence. Tools return structured outcomes and evidence, not free-form claims of success.

## Approval model

- **Read-only:** allowed within explicitly connected sources and approved local roots.
- **Low-risk reversible:** may run automatically when the user has enabled the skill.
- **External side effect:** approval required (send, publish, submit, upload, buy, install, commit/push, invite).
- **Destructive or financial:** explicit just-in-time approval with a human-readable preview; high-risk actions may remain manual-only.
- Approval is bound to one task, one operation, exact arguments, expiry and one-time use. Editing arguments invalidates approval.

## Browser and human handoff

Use a visible Playwright-managed browser profile with an explicit user-data directory and provider login sessions. Store secrets with the OS credential manager, not in source, localStorage or logs. When a CAPTCHA, OTP, MFA, anti-bot challenge, permission prompt or ambiguous consent appears:
1. Pause the workflow.
2. Capture a minimal redacted page state and explain the requested human action.
3. Focus/show the browser window and notify the user.
4. Wait for an explicit resume signal.
5. Re-check page origin, state and requested action before continuing.
Never solve, outsource, conceal or bypass CAPTCHA or access-control challenges.

## Integration strategy

Use official APIs/OAuth where available. Use browser automation only when permitted by the provider's terms and policies. Capabilities vary by account type and platform. WhatsApp personal messaging and Instagram messaging are not unrestricted general-purpose inbox APIs; the integration layer must expose only supported account capabilities. For shopping, use official partner APIs or approved integrations; do not reverse-engineer private app endpoints or evade anti-bot controls.

## Core interfaces (initial contract)

- `TaskRequest`: natural-language goal, optional constraints, source client.
- `TaskPlan`: ordered steps; each step declares tool, typed arguments, risk, expected evidence and compensation strategy.
- `ToolManifest`: name, version, JSON input schema, output schema, required scopes, risk class, supported platforms, timeout and idempotency.
- `ToolResult`: status, structured data, evidence references, redacted summary and recoverability.
- `ApprovalRequest`: exact operation, consequence, arguments preview, expiry and approval token.
- `HumanHandoff`: reason, visible client, instructions, resume condition and timeout.
- `DevicePairing`: device identity, public key, scopes, last-seen and revocation state.

## Data domains to add (owner-scoped)

- agent_tasks, agent_task_steps, agent_tool_runs
- agent_tool_manifests, agent_approvals, agent_handoffs
- agent_devices, agent_device_sessions
- agent_workflows, agent_workflow_runs, agent_schedules
- agent_skill_packages, agent_skill_versions
- agent_provider_connections (secret references only; secrets live in vault)
- agent_notifications, agent_usage_events

Every user-owned table requires RLS and indexes on user_id/status/created_at as appropriate. Never store raw API tokens in task records or audit events.

## Delivery roadmap

### Phase A — Architecture and control plane
- Typed task, tool, approval and handoff contracts.
- Task history and audit integration.
- Risk policy and execution budgets.
- UI surface for task plan, status and approvals.

### Phase B — Windows local agent
- Secure device pairing and reconnect.
- Local health and capability discovery.
- Approved-root files, screen snapshots and allowlisted commands.
- Windows UI Automation and visible input-control toggle.
- Emergency stop and per-action audit.

### Phase C — Browser agent
- Visible Playwright browser, isolated profile and session lifecycle.
- Navigation, accessibility tree, screenshots, downloads/uploads.
- Human handoff for CAPTCHA/OTP/MFA and unexpected prompts.
- Pause/resume/takeover and browser origin allowlist.

### Phase D — Skills and integrations
- GitHub developer skill.
- Research and web skill.
- Messaging adapters where official APIs allow.
- Shopping price comparison and approval-gated checkout.
- File/document skills and calendar/email integrations.

### Phase E — Productivity and autonomy
- Workflow builder, schedules and event triggers.
- Multi-agent delegation with shared task context.
- Bounded retries, idempotency and safe compensation.
- Proactive monitoring with opt-in scopes.

### Phase F — Product ecosystem
- Tauri desktop app, mobile companion, voice interface.
- Multi-device support, encrypted sync and skill marketplace.
- Finance dashboard, meeting intelligence and offline mode.

## Non-goals and safety boundaries

- No stealth monitoring, hidden keystroke logging or covert screen recording.
- No unrestricted remote shell, persistent admin privileges or public unauthenticated local endpoints.
- No bypassing CAPTCHA, MFA, paywalls, rate limits or platform restrictions.
- No sending, ordering, financial transaction, publishing, destructive deletion or external upload without the required approval.
- No self-modifying production code or permission policy without review.

## Definition of done

A capability is complete only when it has typed contracts, tests, least-privilege scopes, clear approval rules, audit events, user-facing status, cancellation and failure recovery. A mock UI or a connected icon is not proof of a working integration.
