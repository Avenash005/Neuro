# VIOLET — Low-Level Design (LLD)

**Document Title:** VIOLET: Sovereign Personal AI Operating System — Low-Level Design  
**Document Version:** 1.0.0  
**Status:** APPROVED ENGINEERING SPECIFICATION  
**Target Release:** Production Hybrid Platform  
**Author:** Principal Software Architect, Staff Backend Engineer, Security Engineer  
**Date:** 2026-11-24  

---

## 1. Module-by-Module Code Structure & Classes

### 1.1 Server Core & Production Runtime
- **Files:** [src/server/violetApiServer.ts](file:///d:/violet/Neuro/src/server/violetApiServer.ts), `src/server/main.ts`
- **Classes & Functions:**
  - `handleVioletApiRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean`: Primary HTTP request dispatcher and route matcher.
  - `startVioletApiServer(options?: ServerOptions): Promise<http.Server>`: Starts the HTTP/HTTPS server on `127.0.0.1:8766`.
  - `setupGracefulShutdown(server: http.Server, pool: pg.Pool): void`: Attaches `SIGTERM`/`SIGINT` listeners, drains connections over a 10s window, and closes the database connection pool.
  - `handleLivenessProbe(req, res)`: Returns `HTTP 200 { status: "alive", uptime: process.uptime() }`.
  - `handleReadinessProbe(req, res)`: Executes `SELECT 1;` against PostgreSQL and verifies owner bootstrap state before returning `HTTP 200` or `HTTP 503`.

### 1.2 Authentication & Session Subsystem
- **Files:** [src/server/auth/authService.ts](file:///d:/violet/Neuro/src/server/auth/authService.ts), [src/server/auth/sessionManager.ts](file:///d:/violet/Neuro/src/server/auth/sessionManager.ts), [src/server/auth/password.ts](file:///d:/violet/Neuro/src/server/auth/password.ts), [src/server/ownerBootstrapManager.ts](file:///d:/violet/Neuro/src/server/ownerBootstrapManager.ts)
- **Classes & Functions:**
  - `AuthService`:
    - `registerOwner(params: RegisterOwnerParams): Promise<AuthResult>`: Atomic transaction registering the single owner in `public.local_users`, `auth.users`, `public.profiles`, and sealing `public.violet_owner_bootstrap`.
    - `login(params: LoginParams): Promise<AuthResult>`: Verifies credentials against Argon2id hash with automated self-healing from `auth.users` if `local_users` was desynchronized.
    - `changePassword(...)`: Verifies current password before hashing and updating.
    - `changeEmail(...)`: Updates owner email across `local_users`, `auth.users`, and `violet_owner_bootstrap`.
  - `SessionManager`:
    - `createSession(userId: string, userAgent?: string, ipAddress?: string): Promise<{ token: string; expiresAt: Date }>`: Generates a 64-character cryptographic token, hashes it via SHA-256, and stores it in `public.local_sessions`.
    - `validateSession(token: string): Promise<{ valid: boolean; user?: LocalUser }>`: Lookups session by token hash; verifies `expires_at > now()`.
    - `revokeSession(token: string): Promise<void>`: Deletes session from database.
  - `PasswordManager`:
    - `hashPassword(plainText: string): Promise<string>`: Argon2id with 64MB memory, 3 iterations, 4 parallelism.
    - `verifyPassword(plainText: string, hash: string): Promise<boolean>`: Validates against stored Argon2id hash.
  - `OwnerBootstrapManager`:
    - `getStatus(): OwnerBootstrapStatus`: Checks bootstrap state and configured owner email.
    - `completeBootstrap(params)`: Persists state to `.violet/owner_bootstrap.json` (or `.violet/test_owner_bootstrap.json` in Vitest).

### 1.3 Universal Integration Control Plane
- **Files:** [src/server/integrations/integrationService.ts](file:///d:/violet/Neuro/src/server/integrations/integrationService.ts), [src/server/integrations/webhookService.ts](file:///d:/violet/Neuro/src/server/integrations/webhookService.ts), [src/server/integrations/providerCatalog.ts](file:///d:/violet/Neuro/src/server/integrations/providerCatalog.ts), [src/server/integrations/types.ts](file:///d:/violet/Neuro/src/server/integrations/types.ts)
- **Classes & Functions:**
  - `IntegrationService`:
    - `connectProvider(userId, providerId, credentials, displayName, scopes, metadata, permissions)`: Authenticates live provider, encrypts tokens via Versioned Envelope Encryption, scrubs metadata, and commits to `integration_connections`.
    - `getConnectionWithToken(userId, providerId)`: Retrieves and decrypts token in backend memory only.
    - `getConnector(userId, providerId): Promise<UniversalConnector>`: Instantiates the operational connector.
    - `listConnections(userId)`: Returns all connections with tokens and secrets redacted.
  - `WebhookService`:
    - `handleMetaChallenge(mode, token, challenge, expectedToken): string | null`: Validates Meta WhatsApp webhook setup challenge.
    - `verifySignature(rawBuffer: Buffer, signatureHeader: string, secret: string): boolean`: Constant-time HMAC-SHA256 signature verification over exact raw request bytes.
    - `ingestEvent(params)`: Atomic idempotency check in `webhook_events`, signature validation, fast-path ACK, and dispatch to personal context.
    - `processWhatsAppPayload(userId, body)`: Parses nested message ID, sender, and text; triggers `extractObservations()` for actionable context creation.

### 1.4 Universal Connector Implementations
- **Files:** `src/server/integrations/connectors/`
  - `WhatsAppBusinessConnector`:
    - Meta Graph API v21.0 integration (`https://graph.facebook.com/v21.0`).
    - `sendTextMessage(recipient, text)`: Dispatches outbound text.
    - `sendTemplateMessage(recipient, template)`: Dispatches pre-approved Meta templates.
    - `extractObservations(messageText, sender)`: Regex and heuristic extractor identifying tasks ("please...", "can you...") and deadlines ("by Friday", "due on...").
  - `GitHubUniversalConnector`:
    - GitHub REST API v3 / Octokit interface.
    - `listRepositories()`, `listIssues()`, `createIssue()`.
    - `syncRepositoryToKnowledge()`: Recursively indexes markdown/code into `knowledge_items`.
  - `GmailUniversalConnector`:
    - Google Workspace Gmail v1 API.
    - `listMessages()`, `getMessage()`, `sendEmail()`.
  - `GoogleDriveUniversalConnector`:
    - Google Drive v3 API.
    - `listFiles()`, `downloadFile()` for OCR/embedding.

### 1.5 Multi-Model Intelligence Gateway
- **Files:** [src/lib/violet/ai/modelGateway.ts](file:///d:/violet/Neuro/src/lib/violet/ai/modelGateway.ts), [src/lib/violet/ai/intelligentRouter.ts](file:///d:/violet/Neuro/src/lib/violet/ai/intelligentRouter.ts), [src/lib/violet/ai/hardwareResourceManager.ts](file:///d:/violet/Neuro/src/lib/violet/ai/hardwareResourceManager.ts), [src/lib/violet/ai/circuitBreaker.ts](file:///d:/violet/Neuro/src/lib/violet/ai/circuitBreaker.ts)
- **Classes & Functions:**
  - `ModelGateway`:
    - `chat(request: ChatRequest): Promise<NormalizedChatResponse>`: Core execution pipeline: routes request, enforces `LOCAL_ONLY` privacy gating, handles retries/fallbacks, and normalizes output.
  - `IntelligentModelRouter`:
    - `route(request, preferences): Promise<RoutingDecision>`: Scores models based on capability requirements, latency, context size, and privacy rules.
  - `HardwareResourceManager`:
    - `acquireLease(modelId: string)`: Manages local GPU/VRAM leases for Ollama to prevent concurrent model thrashing.

### 1.6 Multi-Agent Autonomous Engineering Lab
- **Files:** [src/lib/violet/multiAgent/agentOrchestrator.ts](file:///d:/violet/Neuro/src/lib/violet/multiAgent/agentOrchestrator.ts), [src/lib/violet/multiAgent/subtaskScheduler.ts](file:///d:/violet/Neuro/src/lib/violet/multiAgent/subtaskScheduler.ts), [src/lib/violet/multiAgent/issueResolutionEngine.ts](file:///d:/violet/Neuro/src/lib/violet/multiAgent/issueResolutionEngine.ts), [src/lib/violet/git/worktreeManager.ts](file:///d:/violet/Neuro/src/lib/violet/git/worktreeManager.ts)
- **Classes & Functions:**
  - `AgentOrchestrator`:
    - Manages task execution states (`pending`, `planning`, `in_progress`, `review`, `completed`, `failed`).
    - Dispatches SSE event streams to the presentation layer.
  - `SubtaskScheduler`:
    - Computes Directed Acyclic Graph (DAG) dependencies for decomposed tasks.
  - `GitWorktreeManager`:
    - `createWorktree(agentId, branchName)`: Runs `git worktree add -b <branch> .violet/worktrees/<agentId>`.
    - `removeWorktree(agentId)`: Safely deletes the worktree and cleans up the temporary directory.
    - `runCommandInWorktree(agentId, command, args)`: Executes commands (e.g. `npm test`) isolated within the worktree.

### 1.7 Windows Local Automation Agent (Python FastAPI)
- **Files:** `apps/violet-local-agent/violet_agent/`
  - `main.py`: FastAPI app initialization, routes for `/v1/capabilities`, `/v1/desktop/*`, `/v1/screen/*`, `/v1/ui/*`, `/v1/process/*`, `/v1/device/*`.
  - `security.py`: `verify_bearer()` checking `VIOLET_API_TOKEN` and pairing session tokens; `resolve_approved_path()` enforcing path traversal security against `VIOLET_ALLOWED_ROOTS`.
  - `services/screen_capture.py`: Windows GDI/DirectX desktop capture returning PNG/JPEG buffers.
  - `services/window_manager.py`: Win32 window handles (`FindWindow`, `SetForegroundWindow`, `ShowWindow`).
  - `services/ui_automation.py`: COM UI Automation library querying control types, names, and bounding boxes.
  - `services/input_controller.py`: `pyautogui` / `SendInput` mouse movements and keyboard events.
  - `services/device_pairing.py`: Nonce generation, Ed25519/HMAC signature verification, issuing `vsession_` tokens.
  - `services/emergency_stop.py`: Keyboard hook for `Ctrl+Alt+Shift+Escape` killing input automation.

---

## 2. Complete Database Schemas (DDL & Indexes)

```sql
-- 1. Local Users Table
CREATE TABLE IF NOT EXISTS public.local_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'user')),
  display_name text,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_users_email ON public.local_users(lower(btrim(email)));

-- 2. Local Sessions Table
CREATE TABLE IF NOT EXISTS public.local_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.local_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_sessions_token_hash ON public.local_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_local_sessions_user_id ON public.local_sessions(user_id);

-- 3. Singleton Owner Bootstrap Table
CREATE TABLE IF NOT EXISTS public.violet_owner_bootstrap (
  id text PRIMARY KEY DEFAULT 'singleton',
  is_bootstrapped boolean NOT NULL DEFAULT false,
  owner_email text,
  owner_id uuid,
  bootstrapped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT violet_owner_bootstrap_singleton CHECK (id = 'singleton')
);

-- 4. Paired Devices Table
CREATE TABLE IF NOT EXISTS public.paired_devices (
  device_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  device_name text NOT NULL,
  device_type text NOT NULL CHECK (device_type IN ('desktop', 'laptop', 'mobile', 'cloud_worker')),
  public_key text NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  capabilities text[] NOT NULL DEFAULT '{}',
  last_ip text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paired_devices_status ON public.paired_devices(status);

-- 5. Integration Connections Table (Vaulted Credentials)
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_id text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'error', 'expired', 'syncing')),
  display_name text NOT NULL,
  access_token_enc text,
  refresh_token_enc text,
  webhook_secret_enc text,
  vault_epoch integer NOT NULL DEFAULT 1,
  scopes text[] NOT NULL DEFAULT '{}',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_sync_at timestamptz,
  last_sync_stats jsonb,
  sync_cursor text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_provider UNIQUE(user_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_connections_user_provider ON public.integration_connections(user_id, provider_id);

-- 6. Durable Webhook Events Table
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'dead_letter')),
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_webhook_provider_event UNIQUE(provider_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON public.webhook_events(created_at);

-- 7. Personal Context Items Table
CREATE TABLE IF NOT EXISTS public.personal_context_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('goal', 'project', 'topic', 'preference', 'relationship', 'reflection', 'issue')),
  title text NOT NULL,
  content text NOT NULL,
  confidence double precision NOT NULL DEFAULT 0.8,
  source_evidence text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deprecated')),
  vector_clock jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_context_user_category ON public.personal_context_items(user_id, category);

-- 8. Sync Tombstones Table
CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  entity_id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  deleted_by_device uuid NOT NULL REFERENCES public.paired_devices(device_id),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  final_vector_clock jsonb NOT NULL,
  tombstone_signature text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_expires ON public.sync_tombstones(expires_at);

-- 9. Immutable Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  actor text NOT NULL,
  summary text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON public.audit_logs(user_id, timestamp DESC);
```

---

## 3. Cryptographic Implementation Details

### 3.1 Versioned Envelope Encryption v2
- **Algorithm:** AES-256-GCM (Authenticated Encryption with Associated Data).
- **Key Derivation:** HKDF-SHA256
  - Input Key Material (IKM): `VIOLET_ENCRYPTION_KEY`
  - Salt: `"VIOLET_CREDENTIAL_VAULT_V2"`
  - Info: `"aes-256-gcm-envelope"`
  - Output: 32-byte symmetric master key.
- **Envelope String Format:**
  `v2:<key_id>:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
- **Decryption Protocol:**
  1. Split string by `:` into 5 segments.
  2. Verify version is `"v2"`.
  3. Load key corresponding to `key_id`.
  4. Create decipher with IV and attach auth tag.
  5. Decrypt ciphertext and verify tag. If corrupted, throw `IntegrityError`.

### 3.2 Raw-Byte HMAC-SHA256 Signature Validation
```typescript
import crypto from "crypto";

export function verifyRawHmacSha256(
  rawBuffer: Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  if (!secret || !signatureHeader) return false;
  const cleanHeader = signatureHeader.replace(/^sha256=/, "");

  const computedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBuffer)
    .digest("hex");

  const computedBuf = Buffer.from(computedHex, "hex");
  const headerBuf = Buffer.from(cleanHeader, "hex");

  if (computedBuf.length !== headerBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(computedBuf, headerBuf);
}
```

### 3.3 Vector Clock Comparison Algorithm
```typescript
export type Clock = Record<string, number>;

export function compareVectorClocks(a: Clock, b: Clock): "DOMINATES" | "DOMINATED" | "EQUAL" | "CONFLICT" {
  let aGreater = false;
  let bGreater = false;
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const k of allKeys) {
    const valA = a[k] || 0;
    const valB = b[k] || 0;
    if (valA > valB) aGreater = true;
    if (valB > valA) bGreater = true;
  }

  if (aGreater && !bGreater) return "DOMINATES";
  if (bGreater && !aGreater) return "DOMINATED";
  if (!aGreater && !bGreater) return "EQUAL";
  return "CONFLICT";
}
```

---

## 4. API Endpoint Contracts & JSON Schemas

### 4.1 Authentication Endpoints (`/api/v1/auth/*`)
- **`POST /api/v1/auth/login`**
  - Request: `{ "email": "user@domain.com", "password": "SecurePassword123!" }`
  - Response (HTTP 200):
    ```json
    {
      "success": true,
      "user": { "id": "uuid", "email": "user@domain.com", "role": "owner" },
      "session": { "access_token": "token_string", "expires_at": "ISO_TIMESTAMP" }
    }
    ```
  - Headers: Sets `Set-Cookie: violet_session=token_string; HttpOnly; SameSite=Lax; Path=/`.

- **`GET /api/v1/auth/bootstrap-status`**
  - Response (HTTP 200):
    ```json
    {
      "isBootstrapped": true,
      "hasConfiguredOwner": true,
      "ownerEmail": "user@domain.com",
      "ownerId": "uuid_prefix...",
      "bootstrappedAt": "ISO_TIMESTAMP"
    }
    ```

### 4.2 Webhook Ingress Endpoints (`/api/v1/integrations/webhooks/:provider`)
- **`GET /api/v1/integrations/webhooks/whatsapp` (Meta Challenge)**
  - Query Params: `?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>`
  - Response (HTTP 200): Raw challenge string in `text/plain`.
- **`POST /api/v1/integrations/webhooks/whatsapp` (Payload Ingestion)**
  - Headers: `X-Hub-Signature-256: sha256=<hex_signature>`
  - Request Body: Raw WhatsApp Cloud API payload.
  - Response (HTTP 200): `{ "success": true, "result": { "eventId": "wamid.HBgL...", "status": "processed" } }`

### 4.3 Windows Local Agent Endpoints (`http://127.0.0.1:8765/v1/*`)
- **`GET /v1/desktop/info`**
  - Headers: `Authorization: Bearer <VIOLET_API_TOKEN>`
  - Response (HTTP 200):
    ```json
    {
      "monitors": [{ "id": 0, "width": 1920, "height": 1080, "is_primary": true }],
      "foreground_window": { "title": "Visual Studio Code", "pid": 12048 },
      "dpi_scaling": 1.0
    }
    ```
- **`POST /v1/ui/click`**
  - Request: `{ "x": 450, "y": 320, "button": "left", "double": false }`
  - Response (HTTP 200): `{ "success": true, "duration_ms": 42 }`

---

## 5. Error Handling, Exception Classes & Failure Modes

```typescript
export class VioletError extends Error {
  constructor(message: string, public statusCode: number = 500, public code: string = "INTERNAL_ERROR") {
    super(message);
    this.name = this.constructor.name;
  }
}

export class IntegrationError extends VioletError {
  constructor(message: string, public providerId: string, statusCode: number = 400) {
    super(message, statusCode, "INTEGRATION_ERROR");
  }
}

export class TokenExpiredError extends IntegrationError {
  constructor(providerId: string) {
    super(`Access token for '${providerId}' has expired. Re-authentication required.`, providerId, 401);
    this.code = "TOKEN_EXPIRED";
  }
}

export class WebhookVerificationError extends IntegrationError {
  constructor(providerId: string, details: string) {
    super(`Webhook verification failed for '${providerId}': ${details}`, providerId, 403);
    this.code = "WEBHOOK_VERIFICATION_FAILED";
  }
}
```

### Failure Modes & Resiliency Policies:
1. **Database Disconnection:** The pool retries connections with randomized exponential backoff (100ms–2000ms).
2. **Provider Rate Limiting (HTTP 429):** The connector parses `Retry-After` headers and emits a backoff event before pausing outbound requests.
3. **Emergency Stop Activation:** When the global emergency hotkey is triggered, all pending mouse/keyboard actions are immediately discarded, and active worker loops are halted.
