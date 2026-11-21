/**
 * VIOLET Local Authentication: Session Management
 * Manages server-side sessions in PostgreSQL, cryptographically random session tokens,
 * SHA-256 token hashing, HTTP-only SameSite cookies, and session lifecycle.
 */

import crypto from 'node:crypto';
import type http from 'node:http';
import { query, queryOne } from '../database/client';

export interface LocalUser {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalSession {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  createdAt: string;
  lastAccessedAt: string;
}

export interface SessionValidationResult {
  valid: boolean;
  user?: LocalUser;
  session?: LocalSession;
  error?: string;
}

export const SESSION_COOKIE_NAME = 'violet_session';
const DEFAULT_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory hot cache for validated sessions to allow fast synchronous guard checks
const sessionHotCache = new Map<string, { userId: string; email: string; expiresAt: number }>();

export function getCachedSession(token: string): { userId: string; email: string; expiresAt: number } | null {
  if (!token) return null;
  const cached = sessionHotCache.get(token);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    sessionHotCache.delete(token);
    return null;
  }
  return cached;
}

export function cacheSession(token: string, userId: string, email: string, expiresAt: Date): void {
  sessionHotCache.set(token, {
    userId,
    email,
    expiresAt: expiresAt.getTime(),
  });
}

export function clearCachedSession(token: string): void {
  sessionHotCache.delete(token);
}

export function clearUserCachedSessions(userId: string): void {
  for (const [token, data] of sessionHotCache.entries()) {
    if (data.userId === userId) {
      sessionHotCache.delete(token);
    }
  }
}

/**
 * Computes SHA-256 hash of a session token for secure database lookup.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a cryptographically random, server-managed session for a user.
 */
export async function createSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ token: string; expiresAt: Date; session: LocalSession }> {
  // Generate 32 bytes of cryptographic randomness (64 hex characters)
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const durationMs = parseInt(process.env.VIOLET_SESSION_DURATION_MS || '', 10) || DEFAULT_SESSION_DURATION_MS;
  const expiresAt = new Date(Date.now() + durationMs);

  const row = await queryOne<{
    id: string;
    user_id: string;
    user_agent: string | null;
    ip_address: string | null;
    expires_at: string;
    created_at: string;
    last_accessed_at: string;
  }>(
    `INSERT INTO public.local_sessions (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, user_agent, ip_address, expires_at, created_at, last_accessed_at;`,
    [userId, tokenHash, userAgent || null, ipAddress || null, expiresAt.toISOString()]
  );

  if (!row) {
    throw new Error('Failed to create server session.');
  }

  cacheSession(token, userId, '', expiresAt);

  return {
    token,
    expiresAt,
    session: {
      id: row.id,
      userId: row.user_id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
    },
  };
}

/**
 * Validates a session token against PostgreSQL, checking expiry and user validity.
 */
export async function validateSession(token: string): Promise<SessionValidationResult> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Session token is missing.' };
  }

  const tokenHash = hashToken(token);

  const row = await queryOne<{
    session_id: string;
    user_id: string;
    user_agent: string | null;
    ip_address: string | null;
    expires_at: string;
    session_created_at: string;
    last_accessed_at: string;
    email: string;
    role: string;
    display_name: string | null;
    user_created_at: string;
    user_updated_at: string;
  }>(
    `SELECT
       s.id as session_id,
       s.user_id,
       s.user_agent,
       s.ip_address,
       s.expires_at,
       s.created_at as session_created_at,
       s.last_accessed_at,
       u.email,
       u.role,
       u.display_name,
       u.created_at as user_created_at,
       u.updated_at as user_updated_at
     FROM public.local_sessions s
     JOIN public.local_users u ON u.id = s.user_id
     WHERE s.token_hash = $1;`,
    [tokenHash]
  );

  if (!row) {
    return { valid: false, error: 'Invalid or revoked session.' };
  }

  const expiresAt = new Date(row.expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    // Session expired; clean it up asynchronously
    query(`DELETE FROM public.local_sessions WHERE id = $1;`, [row.session_id]).catch(() => {});
    return { valid: false, error: 'Session has expired. Please log in again.' };
  }

  // Update last_accessed_at
  query(`UPDATE public.local_sessions SET last_accessed_at = now() WHERE id = $1;`, [row.session_id]).catch(() => {});

  // Update hot cache
  cacheSession(token, row.user_id, row.email, expiresAt);

  return {
    valid: true,
    user: {
      id: row.user_id,
      email: row.email,
      role: row.role,
      display_name: row.display_name,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    },
    session: {
      id: row.session_id,
      userId: row.user_id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      expiresAt: row.expires_at,
      createdAt: row.session_created_at,
      lastAccessedAt: row.last_accessed_at,
    },
  };
}

/**
 * Revokes a session by token hash.
 */
export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  clearCachedSession(token);
  const tokenHash = hashToken(token);
  await query(`DELETE FROM public.local_sessions WHERE token_hash = $1;`, [tokenHash]);
}

/**
 * Revokes all sessions for a specific user (e.g. after password change/reset).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  clearUserCachedSessions(userId);
  await query(`DELETE FROM public.local_sessions WHERE user_id = $1;`, [userId]);
}

/**
 * Extracts a session token from HTTP headers (either Cookie or Authorization header).
 */
export function extractSessionTokenFromRequest(req: http.IncomingMessage): string | null {
  // 1. Check Cookie header
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
        const val = cookie.slice(SESSION_COOKIE_NAME.length + 1).trim();
        if (val) return decodeURIComponent(val);
      }
    }
  }

  // 2. Check Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  return null;
}

/**
 * Formats an HTTP-only, SameSite=Lax cookie header string.
 * Applies Secure flag automatically when running over HTTPS.
 */
export function buildSessionCookie(token: string, expiresAt: Date, isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (isHttps) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Formats a cookie header string to immediately clear the session cookie.
 */
export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
