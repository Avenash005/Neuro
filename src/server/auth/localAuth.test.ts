/**
 * VIOLET Local PostgreSQL Authentication Test Suite
 * Validates local registration, Argon2id hashing, credential verification,
 * server-managed sessions, HTTP-only cookies, single-owner bootstrap, and password management.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { query, queryOne } from '../database/client';
import { checkDatabaseHealth, closeDatabasePool } from '../database/pool';
import { runMigrations } from '../database/migrate';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password';
import {
  validateSession,
  hashToken,
  buildSessionCookie,
  buildClearSessionCookie,
  extractSessionTokenFromRequest,
} from './sessionManager';
import { AuthService } from './authService';
import { handleVioletApiRequest } from '../violetApiServer';
import { globalOwnerBootstrapManager } from '../ownerBootstrapManager';

function createMockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: string
): http.IncomingMessage {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1:8766', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(body));
    }
    req.emit('end');
  });

  return req as http.IncomingMessage;
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = '';
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
    this.emit('finish');
  }

  waitForFinish(): Promise<void> {
    if (this.finished) return Promise.resolve();
    return new Promise((resolve) => this.once('finish', resolve));
  }

  json(): any {
    return this.body ? JSON.parse(this.body) : {};
  }
}

describe('VIOLET Phase 4B: Local PostgreSQL Authentication', () => {
  let authService: AuthService;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    // Ensure migrations are run
    const result = await runMigrations();
    expect(result.success).toBe(true);

    const health = await checkDatabaseHealth();
    expect(health.connected).toBe(true);

    authService = new AuthService();
  });

  afterAll(async () => {
    // Clean up test data and unseal bootstrap so subsequent test suites start in default state
    try {
      await query(`DELETE FROM public.local_sessions;`);
      await query(`DELETE FROM public.password_reset_tokens;`);
      await query(`DELETE FROM public.local_users;`);
      await query(`DELETE FROM auth.users WHERE email LIKE '%@example.com' OR email LIKE '%@violet.local';`);
      await query(`UPDATE public.violet_owner_bootstrap SET is_bootstrapped = false, owner_email = null, owner_id = null WHERE id = 'singleton';`);
    } catch {
      // Ignore
    }

    process.env = { ...originalEnv };
    globalOwnerBootstrapManager.resetForTesting();
    await closeDatabasePool();
  });

  beforeEach(async () => {
    // Clean test users, sessions, and bootstrap
    await query(`DELETE FROM public.local_sessions;`);
    await query(`DELETE FROM public.password_reset_tokens;`);
    await query(`DELETE FROM public.local_users;`);
    await query(`DELETE FROM auth.users WHERE email LIKE '%@example.com' OR email LIKE '%@violet.local';`);
    await query(`UPDATE public.violet_owner_bootstrap SET is_bootstrapped = false, owner_email = null, owner_id = null WHERE id = 'singleton';`);

    delete process.env.VIOLET_OWNER_ID;
    delete process.env.VIOLET_OWNER_EMAIL;
    delete process.env.VITE_VIOLET_OWNER_EMAIL;
    delete process.env.VIOLET_BOOTSTRAPPED;
    globalOwnerBootstrapManager.resetForTesting();
  });

  describe('1. Password Hashing (Argon2id)', () => {
    it('validates password complexity (rejects under 8 chars)', () => {
      expect(validatePasswordStrength('').valid).toBe(false);
      expect(validatePasswordStrength('short').valid).toBe(false);
      expect(validatePasswordStrength('1234567').valid).toBe(false);
      expect(validatePasswordStrength('validpassword123').valid).toBe(true);
    });

    it('hashes passwords using Argon2id ($argon2id$ format)', async () => {
      const plain = 'StrongMasterKey2026!';
      const hash = await hashPassword(plain);

      expect(hash).toContain('$argon2id$');
      expect(await verifyPassword(plain, hash)).toBe(true);
      expect(await verifyPassword('WrongPassword', hash)).toBe(false);
    });
  });

  describe('2. Local Account Registration', () => {
    it('registers the owner account in local PostgreSQL', async () => {
      const email = 'owner@violet.local';
      const password = 'SuperSecretOwnerKey2026!';

      const result = await authService.registerOwner({ email, password, displayName: 'Violet Architect' });

      expect(result.user.id).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.role).toBe('owner');
      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64); // 32-byte hex
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify stored in local_users
      const userRow = await queryOne<{ id: string; email: string; password_hash: string }>(
        `SELECT id, email, password_hash FROM public.local_users WHERE email = $1;`,
        [email]
      );
      expect(userRow).not.toBeNull();
      expect(userRow?.password_hash).toContain('$argon2id$');
      expect(userRow?.password_hash).not.toBe(password); // Never plaintext

      // Verify matching auth.users row exists
      const authRow = await queryOne<{ id: string; email: string }>(
        `SELECT id, email FROM auth.users WHERE id = $1;`,
        [result.user.id]
      );
      expect(authRow).not.toBeNull();
      expect(authRow?.email).toBe(email);

      // Verify profile row created automatically by trigger
      const profileRow = await queryOne<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM public.profiles WHERE id = $1;`,
        [result.user.id]
      );
      expect(profileRow).not.toBeNull();
      expect(profileRow?.display_name).toBe('Violet Architect');

      // Verify bootstrap registry is sealed
      const bootstrap = await queryOne<{ is_bootstrapped: boolean; owner_email: string }>(
        `SELECT is_bootstrapped, owner_email FROM public.violet_owner_bootstrap WHERE id = 'singleton';`
      );
      expect(bootstrap?.is_bootstrapped).toBe(true);
      expect(bootstrap?.owner_email).toBe(email);
    });

    it('rejects a second registration once bootstrapped (single-owner restriction)', async () => {
      await authService.registerOwner({
        email: 'first_owner@violet.local',
        password: 'FirstPassword123!',
      });

      await expect(
        authService.registerOwner({
          email: 'second_intruder@violet.local',
          password: 'SecondPassword123!',
        })
      ).rejects.toThrow('Registration is permanently closed');
    });

    it('enforces configured VIOLET_OWNER_EMAIL if set in environment', async () => {
      process.env.VIOLET_OWNER_EMAIL = 'designated_owner@violet.local';

      await expect(
        authService.registerOwner({
          email: 'unauthorized@violet.local',
          password: 'ValidPassword123!',
        })
      ).rejects.toThrow('Access restricted');

      const valid = await authService.registerOwner({
        email: 'designated_owner@violet.local',
        password: 'ValidPassword123!',
      });
      expect(valid.user.email).toBe('designated_owner@violet.local');
    });
  });

  describe('3. Local Login & Credentials Verification', () => {
    beforeEach(async () => {
      await authService.registerOwner({
        email: 'owner@violet.local',
        password: 'CorrectPassword2026!',
      });
    });

    it('successfully logs in with valid credentials and creates server session', async () => {
      const result = await authService.login({
        email: 'owner@violet.local',
        password: 'CorrectPassword2026!',
        userAgent: 'Mozilla/5.0 Test',
      });

      expect(result.user.email).toBe('owner@violet.local');
      expect(result.token).toBeDefined();

      // Verify session stored in local_sessions
      const sessionRow = await queryOne<{ user_id: string; token_hash: string }>(
        `SELECT user_id, token_hash FROM public.local_sessions WHERE token_hash = $1;`,
        [hashToken(result.token)]
      );
      expect(sessionRow).not.toBeNull();
      expect(sessionRow?.user_id).toBe(result.user.id);
    });

    it('rejects invalid password with 401 message', async () => {
      await expect(
        authService.login({
          email: 'owner@violet.local',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects non-existent email', async () => {
      await expect(
        authService.login({
          email: 'nonexistent@violet.local',
          password: 'CorrectPassword2026!',
        })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('4. Session Management & Expiry', () => {
    it('validates active session token from PostgreSQL', async () => {
      const reg = await authService.registerOwner({
        email: 'owner@violet.local',
        password: 'ValidPassword123!',
      });

      const validation = await validateSession(reg.token);
      expect(validation.valid).toBe(true);
      expect(validation.user?.id).toBe(reg.user.id);
      expect(validation.user?.email).toBe('owner@violet.local');
    });

    it('rejects and cleans up expired sessions', async () => {
      const reg = await authService.registerOwner({
        email: 'owner@violet.local',
        password: 'ValidPassword123!',
      });

      // Force session expiry in database
      await query(
        `UPDATE public.local_sessions SET expires_at = now() - interval '1 hour' WHERE token_hash = $1;`,
        [hashToken(reg.token)]
      );

      const validation = await validateSession(reg.token);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('expired');
    });

    it('revokes session on logout', async () => {
      const reg = await authService.registerOwner({
        email: 'owner@violet.local',
        password: 'ValidPassword123!',
      });

      await authService.logout(reg.token);

      const validation = await validateSession(reg.token);
      expect(validation.valid).toBe(false);
    });
  });

  describe('5. HTTP Cookies & Session Headers', () => {
    it('builds secure HTTP-only SameSite cookie', () => {
      const expiresAt = new Date('2026-12-01T00:00:00Z');
      const cookie = buildSessionCookie('test-token-123', expiresAt, false);
      expect(cookie).toContain('violet_session=test-token-123');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Secure');

      const secureCookie = buildSessionCookie('test-token-123', expiresAt, true);
      expect(secureCookie).toContain('Secure');
    });

    it('builds clear session cookie for logout', () => {
      const clearCookie = buildClearSessionCookie();
      expect(clearCookie).toContain('violet_session=;');
      expect(clearCookie).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('extracts token from Cookie or Authorization Bearer header', () => {
      const reqWithCookie = {
        headers: { cookie: 'other=1; violet_session=extracted-token-abc; foo=bar' },
      } as any;
      expect(extractSessionTokenFromRequest(reqWithCookie)).toBe('extracted-token-abc');

      const reqWithAuth = {
        headers: { authorization: 'Bearer bearer-token-xyz' },
      } as any;
      expect(extractSessionTokenFromRequest(reqWithAuth)).toBe('bearer-token-xyz');
    });
  });

  describe('6. Password & Email Changes', () => {
    beforeEach(async () => {
      await authService.registerOwner({
        email: 'owner@violet.local',
        password: 'OldPassword123!',
      });
    });

    it('changes password when current password is verified', async () => {
      const user = await queryOne<{ id: string }>(`SELECT id FROM public.local_users WHERE email = 'owner@violet.local';`);

      await authService.changePassword({
        userId: user!.id,
        currentPassword: 'OldPassword123!',
        newPassword: 'BrandNewSecurePassword2026!',
      });

      // Verify old password no longer works
      await expect(
        authService.login({ email: 'owner@violet.local', password: 'OldPassword123!' })
      ).rejects.toThrow('Invalid email or password');

      // Verify new password works
      const loginRes = await authService.login({ email: 'owner@violet.local', password: 'BrandNewSecurePassword2026!' });
      expect(loginRes.user.email).toBe('owner@violet.local');
    });

    it('changes email and updates bootstrap record when current password is verified', async () => {
      const user = await queryOne<{ id: string }>(`SELECT id FROM public.local_users WHERE email = 'owner@violet.local';`);

      const res = await authService.changeEmail({
        userId: user!.id,
        currentPassword: 'OldPassword123!',
        newEmail: 'new_owner@violet.local',
      });
      expect(res.newEmail).toBe('new_owner@violet.local');

      // Verify updated in bootstrap
      const bootstrap = await queryOne<{ owner_email: string }>(
        `SELECT owner_email FROM public.violet_owner_bootstrap WHERE id = 'singleton';`
      );
      expect(bootstrap?.owner_email).toBe('new_owner@violet.local');
    });
  });

  describe('7. API Route Endpoints via handleVioletApiRequest', () => {
    it('handles POST /api/v1/auth/register over HTTP and returns 201 with Set-Cookie', async () => {
      const req = createMockReq(
        'POST',
        '/api/v1/auth/register',
        { 'content-type': 'application/json' },
        JSON.stringify({ email: 'api_owner@violet.local', password: 'ApiPassword123!' })
      );
      const res = new MockResponse();

      const handled = handleVioletApiRequest(req, res as any);
      expect(handled).toBe(true);

      await res.waitForFinish();

      expect(res.statusCode).toBe(201);
      expect(res.headers['set-cookie']).toContain('violet_session=');
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.user.email).toBe('api_owner@violet.local');
      expect(body.session.access_token).toBeDefined();
    });

    it('handles POST /api/v1/auth/login and GET /api/v1/auth/session', async () => {
      await authService.registerOwner({
        email: 'api_owner@violet.local',
        password: 'ApiPassword123!',
      });

      // 1. Login
      const loginReq = createMockReq(
        'POST',
        '/api/v1/auth/login',
        { 'content-type': 'application/json' },
        JSON.stringify({ email: 'api_owner@violet.local', password: 'ApiPassword123!' })
      );
      const loginRes = new MockResponse();
      handleVioletApiRequest(loginReq, loginRes as any);
      await loginRes.waitForFinish();

      expect(loginRes.statusCode).toBe(200);
      const loginBody = loginRes.json();
      const token = loginBody.session.access_token;
      expect(token).toBeDefined();

      // 2. Session check with cookie
      const sessionReq = createMockReq('GET', '/api/v1/auth/session', {
        cookie: `violet_session=${token}`,
      });
      const sessionRes = new MockResponse();
      handleVioletApiRequest(sessionReq, sessionRes as any);
      await sessionRes.waitForFinish();

      expect(sessionRes.statusCode).toBe(200);
      const sessionBody = sessionRes.json();
      expect(sessionBody.authenticated).toBe(true);
      expect(sessionBody.user.email).toBe('api_owner@violet.local');

      // 3. Logout
      const logoutReq = createMockReq('POST', '/api/v1/auth/logout', {
        cookie: `violet_session=${token}`,
      });
      const logoutRes = new MockResponse();
      handleVioletApiRequest(logoutReq, logoutRes as any);
      await logoutRes.waitForFinish();

      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970');
    });
  });
});
