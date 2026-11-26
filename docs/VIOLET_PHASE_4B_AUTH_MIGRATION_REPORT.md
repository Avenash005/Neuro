# VIOLET AI — Phase 4B: Local PostgreSQL Authentication Migration Report

**Date:** November 21, 2026  
**Environment:** Windows 11 Pro / Local PostgreSQL 18.3 (`violet_db` on `127.0.0.1:5432`)  
**Application Role:** `violet_app`  
**Architecture:** Standalone / Vite Middleware Local Authentication  
**Status:** Completed & Fully Verified  

---

## Executive Summary

Phase 4B successfully eliminates remote Supabase Auth as a runtime dependency for user registration, authentication, password management, and session state. VIOLET now authenticates exclusively against its local PostgreSQL 18 instance (`violet_db`) using industry-standard **Argon2id** password hashing, cryptographically random server-managed session tokens with SHA-256 storage hashing, and strict HTTP-only SameSite cookies.

All existing single-owner bootstrap constraints, account management workflows, and downstream foreign-key relations across the 39 application tables remain fully intact with 100% backward compatibility.

---

## 1. Architectural Highlights

### 1.1 Password Security (Argon2id)
- **Algorithm:** Argon2id via native `argon2` npm package.
- **Hash Parameters:**
  - Memory Cost: 65,536 KiB (64 MiB)
  - Iterations (Time Cost): 3
  - Parallelism: 4
  - Hash Length: 32 bytes
  - Type: `argon2id` (v=19)
- **Strength Validation:**
  - Enforces minimum 8 characters.
  - Scores complexity across uppercase, lowercase, numbers, and special symbols.
  - Rejects empty, whitespace-only, or trivial passwords.

### 1.2 Session Management & Storage
- **Token Generation:** 32 bytes of cryptographically secure random bytes via `node:crypto` (`randomBytes(32)`), formatted as 64-character hexadecimal strings.
- **Storage Security:** Plaintext session tokens are never stored in PostgreSQL. The database stores `token_hash = sha256(token)`.
- **Database Table:** `public.local_sessions`
  - Columns: `id`, `user_id`, `token_hash`, `user_agent`, `ip_address`, `expires_at`, `created_at`, `last_accessed_at`.
  - Indexes: Unique index on `token_hash`, indexes on `user_id` and `expires_at`.
- **Session Duration:** 30 days default (`VIOLET_SESSION_DURATION_MS`), with sliding activity updates on `last_accessed_at`.
- **Hot Cache:** Synchronous in-memory cache (`sessionHotCache`) for sub-millisecond route guard checks, automatically populated upon session creation/validation and invalidated on revocation.

### 1.3 Cookie & Header Authentication
- **Cookie Name:** `violet_session`
- **Cookie Flags:** `HttpOnly; SameSite=Lax; Path=/` (dynamically appends `Secure` when HTTPS or `x-forwarded-proto: https` is present).
- **Dual Support:** Backend accepts credentials via either `Cookie: violet_session=<token>` or `Authorization: Bearer <token>`.

### 1.4 Single-Owner Bootstrap Enforcement
- Local registration is permitted exactly **once** upon initial deployment.
- Enforces configured `VIOLET_OWNER_EMAIL` / `VITE_VIOLET_OWNER_EMAIL` match when configured in the environment.
- Atomic registration transaction inserts into `public.local_users`, `auth.users`, and seals `public.violet_owner_bootstrap` in a single transaction.
- Once bootstrapped, all subsequent registration attempts are permanently rejected with HTTP 403.

---

## 2. API Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public (First Run Only) | Registers owner, sets HTTP-only session cookie, seals bootstrap |
| `POST` | `/api/v1/auth/login` | Public | Verifies email & Argon2id hash, issues session cookie |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revokes session from PostgreSQL & hot cache, clears cookie |
| `GET` | `/api/v1/auth/session` | Authenticated / Public | Inspects current session validity without requiring client-stored secrets |
| `POST` | `/api/v1/auth/forgot-password` | Public | Generates single-use password reset token |
| `POST` | `/api/v1/auth/reset-password` | Public | Resets password with valid token and revokes all active sessions |
| `POST` | `/api/v1/auth/change-password` | Owner Only | Verifies current password, validates & hashes new password with Argon2id |
| `POST` | `/api/v1/auth/change-email` | Owner Only | Verifies current password, updates email in DB and bootstrap record |

---

## 3. Database Migration Applied

Migration `008_local_auth_sessions.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.local_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.local_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_sessions_user_id ON public.local_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_local_sessions_expires_at ON public.local_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.local_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens(user_id);
```

---

## 4. Verification & Test Coverage

- `src/server/auth/localAuth.test.ts`: **18/18 Passed**
  - Password complexity validation
  - Argon2id hash formatting & verification
  - Atomic local account registration & single-owner sealing
  - Single-owner restriction enforcement (rejecting 2nd registration)
  - Configured owner email enforcement
  - Credential verification & session creation
  - Invalid credential rejection (401)
  - Session validation & automatic expired session pruning
  - Explicit session revocation on logout
  - Secure HTTP-only SameSite cookie generation
  - Clear-cookie logout headers
  - Token extraction from both Cookie and Bearer headers
  - Password change with Argon2id re-hashing
  - Email synchronization with bootstrap records
  - HTTP REST endpoints (`register`, `login`, `session`, `logout`)
- `src/server/database/database.test.ts`: **12/12 Passed**
- `src/server/accountSecurity.test.ts`: **10/10 Passed**
- `src/lib/violet/multiAgent/tests/ownerAuth.test.ts`: **9/9 Passed**
- `src/lib/violet/multiAgent/tests/liveOperationsApi.test.ts`: **6/6 Passed**
- `src/lib/violet/ai/tests/violetApiServer.test.ts`: **5/5 Passed**
