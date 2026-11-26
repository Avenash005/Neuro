# VIOLET Implementation Backlog

This backlog is additive to the existing Neuro roadmap. Existing memory, search, local knowledge, graph, integrations and audit functionality should be reused.

## Foundation
- [ ] Establish task, step, tool, approval, handoff and device types.
- [ ] Add orchestrator service boundary and model adapter interface.
- [ ] Add registry for typed tools with scopes and risk classification.
- [ ] Add idempotency keys, timeouts, cancellation and bounded execution budgets.
- [ ] Add task timeline and approval UI.
- [ ] Add structured audit events with secret and content redaction.

## Windows local agent
- [ ] Python agent packaged for Windows user-session startup.
- [ ] Device pairing, per-device key, revocation and heartbeats.
- [ ] Local capability discovery and health endpoint.
- [ ] Configurable approved folder roots and file read/write operations.
- [ ] Screenshot capture only on task/user request.
- [ ] Windows UI Automation for accessible UI controls.
- [ ] Optional mouse/keyboard interaction with visible status and emergency stop.
- [ ] Command execution via named actions or exact allowlists; no arbitrary shell string.
- [ ] Local approval dialog for sensitive operations.

## Browser
- [ ] Visible Playwright browser profile.
- [ ] Browser session manager and origin policies.
- [ ] Navigation and accessibility-tree inspection.
- [ ] Form fill and file upload/download.
- [ ] CAPTCHA/OTP/MFA human handoff and pause/resume.
- [ ] Manual takeover and safe revalidation after resume.
- [ ] No challenge bypass or anti-bot evasion.

## Skills
- [ ] GitHub: inspect repos, prepare patches, test, branch, PR; approval for push/merge.
- [ ] Research: search, read sources, summarize and cite.
- [ ] Communication: official provider APIs, drafts first, approval to send.
- [ ] Shopping: authorized catalogs, full landed-cost comparison, approval to checkout.
- [ ] Documents: create, read, transform and organize supported files.
- [ ] Calendar/email: OAuth scopes, read, draft and approval-gated send/create.
- [ ] Finance: expense imports and reports; no autonomous transfers.

## Platform
- [ ] Multi-agent delegation and shared task state.
- [ ] Workflow builder and versioned skills.
- [ ] Scheduler and opt-in event monitoring.
- [ ] Desktop UI with pause/resume/stop and system tray.
- [ ] Mobile/web companion and secure device relay.
- [ ] Voice input/output and interrupt.
- [ ] Offline tasks and sync conflict handling.
- [ ] Skill marketplace with signed packages and sandboxing.

## Acceptance test scenarios
1. Ask VIOLET to summarize an approved local project folder; it reads only allowlisted roots and cites file paths.
2. Ask it to execute a disallowed command; policy rejects it before process creation.
3. Ask it to draft a message; no message is sent until approved.
4. Start a browser workflow that reaches a CAPTCHA; browser pauses and user solves it, then workflow revalidates and resumes.
5. Ask it to compare grocery products; it reports total price, delivery, stock and source freshness, and waits for checkout approval.
6. Ask it to modify a GitHub repository; it creates a branch and prepares a PR, with publication actions approved.
7. Revoke a paired Windows device; subsequent task grants fail.
8. Cancel a running task; cancellation propagates to the executing worker.
9. Inject malicious instructions in a webpage; they cannot alter tool scopes or override approval policy.
