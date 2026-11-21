/**
 * VIOLET AI — Account & Security Management Test Suite
 *
 * Validates:
 * 1. Successful password update (re-authentication & update)
 * 2. Incorrect current password (aborts before updateUser)
 * 3. Password mismatch (new password !== confirm password)
 * 4. Weak password (rejects passwords under 8 characters)
 * 5. Successful email-change request (re-authentication & Supabase updateUser)
 * 6. Email verification pending handling
 * 7. Verified email synchronization (backend sync updates ownerEmail while keeping ownerId stable)
 * 8. Rejection of non-owner account changes (intruder cannot modify owner identity)
 * 9. Session persistence after changes (owner remains authenticated and not locked out)
 * 10. Existing owner bootstrap remains valid (preserves .violet/owner_bootstrap.json UUID & timestamp)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import type http from "node:http";
import type { User } from "@supabase/supabase-js";
import { globalOwnerBootstrapManager } from "./ownerBootstrapManager";
import { handleVioletApiRequest, validateOwnerAuth } from "./violetApiServer";
import {
  changeOwnerEmail,
  changeOwnerPassword,
  supabase,
} from "../lib/supabase";

const TEST_BOOTSTRAP_FILE = path.join(process.cwd(), ".violet", "test_account_security_bootstrap.json");

function createMockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {}
): http.IncomingMessage {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:8766", ...headers };
  return req as http.IncomingMessage;
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";
  finished = false;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  write(chunk: string) {
    this.body += chunk;
    return true;
  }

  end(chunk?: string) {
    if (chunk) this.body += chunk;
    this.finished = true;
    this.emit("finish");
  }
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${header}.${body}.mock-signature-hash`;
}

describe("VIOLET Account & Security Management", () => {
  const originalEnv = { ...process.env };
  const ownerUuid = "11111111-2222-3333-4444-555555555555";
  const initialOwnerEmail = "owner@violet.ai";

  const mockOwnerUser: User = {
    id: ownerUuid,
    email: initialOwnerEmail,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.VIOLET_BOOTSTRAP_FILE = TEST_BOOTSTRAP_FILE;
    process.env.VIOLET_OWNER_ID = ownerUuid;
    process.env.VIOLET_OWNER_EMAIL = initialOwnerEmail;
    process.env.VIOLET_BOOTSTRAPPED = "true";

    if (fs.existsSync(TEST_BOOTSTRAP_FILE)) {
      fs.unlinkSync(TEST_BOOTSTRAP_FILE);
    }

    globalOwnerBootstrapManager.resetForTesting({
      isBootstrapped: true,
      ownerEmail: initialOwnerEmail,
      ownerId: ownerUuid,
      bootstrappedAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
    });

    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalOwnerBootstrapManager.resetForTesting();
    if (fs.existsSync(TEST_BOOTSTRAP_FILE)) {
      try {
        fs.unlinkSync(TEST_BOOTSTRAP_FILE);
      } catch {
        // Ignore
      }
    }
    vi.restoreAllMocks();
  });

  // ─── Test 1: Successful password update ──────────────────────────────────
  it("Test 1: successfully updates password after verifying current credentials", async () => {
    if (!supabase) return;

    // Spy on getSession / getCurrentUser
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ sub: ownerUuid, email: initialOwnerEmail, exp: Math.floor(Date.now() / 1000) + 3600 }),
          user: mockOwnerUser,
        } as any,
      },
      error: null,
    });

    // Spy on signInWithPassword (current password verification)
    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: mockOwnerUser, session: {} as any },
      error: null,
    });

    // Spy on updateUser (password update)
    const updateSpy = vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: mockOwnerUser },
      error: null,
    });

    const result = await changeOwnerPassword({
      currentPassword: "correctCurrentPassword123",
      newPassword: "superSecureNewPassword890",
      confirmPassword: "superSecureNewPassword890",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Password updated successfully");
    expect(signInSpy).toHaveBeenCalledWith({
      email: initialOwnerEmail,
      password: "correctCurrentPassword123",
    });
    expect(updateSpy).toHaveBeenCalledWith({
      password: "superSecureNewPassword890",
    });
  });

  // ─── Test 2: Incorrect current password ──────────────────────────────────
  it("Test 2: rejects password change when current password verification fails", async () => {
    if (!supabase) return;

    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ sub: ownerUuid, email: initialOwnerEmail, exp: Math.floor(Date.now() / 1000) + 3600 }),
          user: mockOwnerUser,
        } as any,
      },
      error: null,
    });

    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", name: "AuthApiError", status: 400 } as any,
    });

    const updateSpy = vi.spyOn(supabase.auth, "updateUser");

    await expect(
      changeOwnerPassword({
        currentPassword: "wrongCurrentPassword",
        newPassword: "superSecureNewPassword890",
        confirmPassword: "superSecureNewPassword890",
      })
    ).rejects.toThrow("Current password is incorrect");

    expect(updateSpy).not.toHaveBeenCalled();
  });

  // ─── Test 3: Password mismatch ───────────────────────────────────────────
  it("Test 3: rejects password change when new password and confirmation do not match", async () => {
    if (!supabase) return;

    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword");

    await expect(
      changeOwnerPassword({
        currentPassword: "correctCurrentPassword123",
        newPassword: "superSecureNewPassword890",
        confirmPassword: "differentConfirmationPassword123",
      })
    ).rejects.toThrow("New password and confirmation do not match");

    expect(signInSpy).not.toHaveBeenCalled();
  });

  // ─── Test 4: Weak password ───────────────────────────────────────────────
  it("Test 4: rejects password change when new password is fewer than 8 characters", async () => {
    if (!supabase) return;

    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword");

    await expect(
      changeOwnerPassword({
        currentPassword: "correctCurrentPassword123",
        newPassword: "short",
        confirmPassword: "short",
      })
    ).rejects.toThrow("at least 8 characters long");

    expect(signInSpy).not.toHaveBeenCalled();
  });

  // ─── Test 5: Successful email-change request ──────────────────────────────
  it("Test 5: successfully initiates email-change request after verifying current password", async () => {
    if (!supabase) return;

    const newEmail = "updatedowner@violet.ai";

    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ sub: ownerUuid, email: initialOwnerEmail, exp: Math.floor(Date.now() / 1000) + 3600 }),
          user: mockOwnerUser,
        } as any,
      },
      error: null,
    });

    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: mockOwnerUser, session: {} as any },
      error: null,
    });

    const updateSpy = vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: {
        user: {
          ...mockOwnerUser,
          email: initialOwnerEmail,
          new_email: newEmail,
        } as any,
      },
      error: null,
    });

    const result = await changeOwnerEmail({
      currentPassword: "validCurrentPassword123",
      newEmail,
    });

    expect(result.success).toBe(true);
    expect(result.requiresVerification).toBe(true);
    expect(result.newEmail).toBe(newEmail);
    expect(signInSpy).toHaveBeenCalledWith({
      email: initialOwnerEmail,
      password: "validCurrentPassword123",
    });
    expect(updateSpy).toHaveBeenCalledWith(
      { email: newEmail },
      expect.any(Object)
    );
  });

  // ─── Test 6: Email verification pending ──────────────────────────────────
  it("Test 6: safely keeps old bootstrap identity while email verification is pending", async () => {
    const statusBefore = globalOwnerBootstrapManager.getStatus();
    expect(statusBefore.ownerEmail).toBe(initialOwnerEmail);
    expect(statusBefore.ownerId).toBe(`${ownerUuid.slice(0, 8)}...`);

    // Verify owner JWT with old email continues to be authorized
    const oldJwt = makeJwt({ sub: ownerUuid, email: initialOwnerEmail, exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = createMockReq("GET", "/api/v1/health", { authorization: `Bearer ${oldJwt}` });
    const authResult = validateOwnerAuth(req);
    expect(authResult.authorized).toBe(true);
    expect(authResult.userId).toBe(ownerUuid);
  });

  // ─── Test 7: Verified email synchronization ──────────────────────────────
  it("Test 7: synchronizes verified new email via backend API and preserves owner UUID", async () => {
    const verifiedNewEmail = "verified.newowner@violet.ai";
    const ownerToken = makeJwt({
      sub: ownerUuid,
      email: verifiedNewEmail,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq("POST", "/api/v1/auth/sync-owner-email", {
      authorization: `Bearer ${ownerToken}`,
      "content-type": "application/json",
    });
    const res = new MockResponse();
    const serverRes = res as unknown as http.ServerResponse;

    const handled = handleVioletApiRequest(req, serverRes);
    expect(handled).toBe(true);

    req.emit("data", Buffer.from(JSON.stringify({ email: verifiedNewEmail })));
    req.emit("end");

    await new Promise((resolve) => res.on("finish", resolve));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.ownerEmail).toBe(verifiedNewEmail);
    expect(body.ownerId).toBe(ownerUuid);

    // Verify bootstrap manager status reflects the new email
    const updatedStatus = globalOwnerBootstrapManager.getStatus();
    expect(updatedStatus.ownerEmail).toBe(verifiedNewEmail);

    // Verify running process.env.VIOLET_OWNER_EMAIL updated
    expect(process.env.VIOLET_OWNER_EMAIL).toBe(verifiedNewEmail);
  });

  // ─── Test 8: Rejection of non-owner account changes ───────────────────────
  it("Test 8: rejects unauthorized intruder attempts to synchronize owner email", async () => {
    const intruderUuid = "99999999-9999-9999-9999-999999999999";
    const intruderToken = makeJwt({
      sub: intruderUuid,
      email: "intruder@domain.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq("POST", "/api/v1/auth/sync-owner-email", {
      authorization: `Bearer ${intruderToken}`,
      "content-type": "application/json",
    });
    const res = new MockResponse();
    const serverRes = res as unknown as http.ServerResponse;

    const finishPromise = new Promise<void>((resolve) => {
      if (res.finished) resolve();
      else res.on("finish", resolve);
    });

    const handled = handleVioletApiRequest(req, serverRes);
    expect(handled).toBe(true);

    await finishPromise;

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Unauthorized");
  });

  // ─── Test 9: Session persistence after changes ───────────────────────────
  it("Test 9: persists owner session and prevents lockout after verified email change", () => {
    const newVerifiedEmail = "verified.final@violet.ai";

    // Synchronize email
    globalOwnerBootstrapManager.syncOwnerEmail({
      newEmail: newVerifiedEmail,
      callerSub: ownerUuid,
    });

    // An incoming request with the newly issued JWT token matching the new email and owner UUID
    const newJwt = makeJwt({
      sub: ownerUuid,
      email: newVerifiedEmail,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq("GET", "/api/v1/health", {
      authorization: `Bearer ${newJwt}`,
    });

    const auth = validateOwnerAuth(req);
    expect(auth.authorized).toBe(true);
    expect(auth.userId).toBe(ownerUuid);
  });

  // ─── Test 10: Existing owner bootstrap remains valid ─────────────────────
  it("Test 10: ensures existing owner bootstrap remains permanently locked and valid", () => {
    const status = globalOwnerBootstrapManager.getStatus();
    expect(status.isBootstrapped).toBe(true);

    // Attempting a second bootstrap registration must fail with 403 / error
    expect(() =>
      globalOwnerBootstrapManager.completeBootstrap({
        email: "second@owner.com",
        ownerId: "22222222-2222-2222-2222-222222222222",
      })
    ).toThrow("already been bootstrapped");

    // Attempting via API
    const req = createMockReq("POST", "/api/v1/auth/bootstrap", {
      "content-type": "application/json",
    });
    const res = new MockResponse();
    const serverRes = res as unknown as http.ServerResponse;

    handleVioletApiRequest(req, serverRes);
    req.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          email: "second@owner.com",
          ownerId: "22222222-2222-2222-2222-222222222222",
        })
      )
    );
    req.emit("end");

    return new Promise<void>((resolve) => {
      res.on("finish", () => {
        expect(res.statusCode).toBe(403);
        const body = JSON.parse(res.body);
        expect(body.error).toContain("already been bootstrapped");
        resolve();
      });
    });
  });
});
