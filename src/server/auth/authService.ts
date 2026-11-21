/**
 * VIOLET Local Authentication Service
 * Implements local account registration, Argon2id credential verification,
 * single-owner restrictions, owner bootstrap synchronization, and password lifecycle.
 */

import crypto from 'node:crypto';
import { query, queryOne, withTransaction } from '../database/client';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password';
import { createSession, revokeSession, revokeAllUserSessions, LocalUser, hashToken } from './sessionManager';
import { globalOwnerBootstrapManager } from '../ownerBootstrapManager';

export interface RegisterOwnerParams {
  email: string;
  password: string;
  displayName?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginParams {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: LocalUser;
  token: string;
  expiresAt: Date;
}

export class AuthService {
  /**
   * Registers the single VIOLET owner account in local PostgreSQL.
   * Strictly enforces single-owner bootstrap and rejects unauthorized accounts.
   */
  public async registerOwner(params: RegisterOwnerParams): Promise<AuthResult> {
    const email = params.email.trim().toLowerCase();
    const password = params.password;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }

    // 1. Password strength enforcement
    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.error || 'Password does not meet security requirements.');
    }

    // 2. Check bootstrap status: prevent duplicate registration
    const bootstrapRow = await queryOne<{ is_bootstrapped: boolean; owner_email: string | null }>(
      `SELECT is_bootstrapped, owner_email FROM public.violet_owner_bootstrap WHERE id = 'singleton';`
    );

    const userCount = await queryOne<{ count: string }>(
      `SELECT count(*) as count FROM public.local_users;`
    );

    if (
      (bootstrapRow && bootstrapRow.is_bootstrapped) ||
      (userCount && parseInt(userCount.count, 10) > 0)
    ) {
      throw new Error('Registration is permanently closed. This VIOLET instance has already been provisioned.');
    }

    // 3. Strict owner email verification if configured in environment
    const configuredOwnerEmail = (
      process.env.VIOLET_OWNER_EMAIL ||
      process.env.VITE_VIOLET_OWNER_EMAIL ||
      ''
    ).trim().toLowerCase();

    if (configuredOwnerEmail && email !== configuredOwnerEmail) {
      throw new Error(
        `Access restricted: Only the configured owner email ('${configuredOwnerEmail}') is permitted to register.`
      );
    }

    // 4. Hash password with Argon2id
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const displayName = params.displayName || email.split('@')[0];

    console.log(`[AuthService] Registering owner account: email=${email}, userId=${userId}`);

    // 5. Store user and update bootstrap in an atomic transaction
    await withTransaction(async (client) => {
      // Clean up any stale unlinked orphan in auth.users for this email
      await client.query(
        `DELETE FROM auth.users WHERE lower(btrim(email)) = $1 AND id NOT IN (SELECT id FROM public.local_users);`,
        [email]
      );

      // Create user in local_users
      await client.query(
        `INSERT INTO public.local_users (id, email, role, display_name, password_hash, created_at, updated_at)
         VALUES ($1, $2, 'owner', $3, $4, now(), now());`,
        [userId, email, displayName, passwordHash]
      );

      // Create matching row in auth.users for schema foreign-key compatibility
      await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, last_sign_in_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now(), now(), now())
         ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();`,
        [userId, email, passwordHash, JSON.stringify({ full_name: displayName, display_name: displayName })]
      );

      // Ensure public.profiles is populated with the owner's display name
      await client.query(
        `INSERT INTO public.profiles (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now();`,
        [userId, displayName]
      );

      // Seal the owner bootstrap record
      await client.query(
        `INSERT INTO public.violet_owner_bootstrap (id, is_bootstrapped, owner_email, owner_id, bootstrapped_at, updated_at)
         VALUES ('singleton', true, $1, $2, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET is_bootstrapped = true,
             owner_email = EXCLUDED.owner_email,
             owner_id = EXCLUDED.owner_id,
             bootstrapped_at = coalesce(public.violet_owner_bootstrap.bootstrapped_at, now()),
             updated_at = now();`,
        [email, userId]
      );
    });

    console.log(`[AuthService] Owner registered and committed to PostgreSQL: userId=${userId}`);

    // Sync in-memory bootstrap manager
    try {
      globalOwnerBootstrapManager.completeBootstrap({ email, ownerId: userId });
    } catch {
      // Bootstrap manager may already be synchronized
    }

    // 6. Create session
    const sessionResult = await createSession(userId, params.userAgent, params.ipAddress);

    return {
      user: {
        id: userId,
        email,
        role: 'owner',
        display_name: displayName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      token: sessionResult.token,
      expiresAt: sessionResult.expiresAt,
    };
  }

  /**
   * Authenticates the user against local PostgreSQL using Argon2id.
   */
  public async login(params: LoginParams): Promise<AuthResult> {
    const email = params.email.trim().toLowerCase();
    const password = params.password;

    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    // 1. Fetch user by email
    const row = await queryOne<{
      id: string;
      email: string;
      role: string;
      display_name: string | null;
      password_hash: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, email, role, display_name, password_hash, created_at, updated_at
       FROM public.local_users
       WHERE lower(btrim(email)) = $1;`,
      [email]
    );

    if (!row || !row.password_hash) {
      console.warn(`[AuthService] Login failed: email not found in local_users (${email})`);
      throw new Error('Invalid email or password.');
    }

    // 2. Verify password with Argon2id
    const isMatch = await verifyPassword(password, row.password_hash);
    if (!isMatch) {
      console.warn(`[AuthService] Login failed: password mismatch for ${email}`);
      throw new Error('Invalid email or password.');
    }

    console.log(`[AuthService] Credentials verified with Argon2id for ${email} (userId=${row.id})`);

    // 3. Verify single-owner restriction if configured
    const configuredOwnerEmail = (
      process.env.VIOLET_OWNER_EMAIL ||
      process.env.VITE_VIOLET_OWNER_EMAIL ||
      ''
    ).trim().toLowerCase();

    if (configuredOwnerEmail && row.email.toLowerCase() !== configuredOwnerEmail) {
      throw new Error(`Access restricted: User '${row.email}' is not the configured VIOLET owner.`);
    }

    // 4. Update last_sign_in_at asynchronously
    query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1;`, [row.id]).catch(() => {});

    // 5. Create server session
    const sessionResult = await createSession(row.id, params.userAgent, params.ipAddress);

    return {
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        display_name: row.display_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      token: sessionResult.token,
      expiresAt: sessionResult.expiresAt,
    };
  }

  /**
   * Terminates an active session.
   */
  public async logout(token: string): Promise<void> {
    await revokeSession(token);
  }

  /**
   * Verifies current password and updates to a new Argon2id password.
   */
  public async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const { userId, currentPassword, newPassword } = params;

    const user = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM public.local_users WHERE id = $1;`,
      [userId]
    );

    if (!user || !user.password_hash) {
      throw new Error('User not found.');
    }

    const isMatch = await verifyPassword(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error('Current password is incorrect. Please verify your password and try again.');
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      throw new Error(validation.error || 'New password does not meet security requirements.');
    }

    if (currentPassword === newPassword) {
      throw new Error('New password must be different from current password.');
    }

    const newHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE public.local_users SET password_hash = $1, updated_at = now() WHERE id = $2;`,
        [newHash, userId]
      );
      await client.query(
        `UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2;`,
        [newHash, userId]
      );
    });
  }

  /**
   * Verifies current password and updates email address.
   */
  public async changeEmail(params: {
    userId: string;
    currentPassword: string;
    newEmail: string;
  }): Promise<{ newEmail: string }> {
    const { userId, currentPassword, newEmail } = params;
    const cleanEmail = newEmail.trim().toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    const user = await queryOne<{ email: string; password_hash: string }>(
      `SELECT email, password_hash FROM public.local_users WHERE id = $1;`,
      [userId]
    );

    if (!user || !user.password_hash) {
      throw new Error('User not found.');
    }

    const isMatch = await verifyPassword(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error('Current password is incorrect. Please verify your password and try again.');
    }

    if (user.email.toLowerCase() === cleanEmail) {
      throw new Error('New email address must be different from current email address.');
    }

    // Check collision
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM public.local_users WHERE lower(btrim(email)) = $1 AND id <> $2;`,
      [cleanEmail, userId]
    );

    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE public.local_users SET email = $1, updated_at = now() WHERE id = $2;`,
        [cleanEmail, userId]
      );
      await client.query(
        `UPDATE auth.users SET email = $1, updated_at = now() WHERE id = $2;`,
        [cleanEmail, userId]
      );
      await client.query(
        `UPDATE public.violet_owner_bootstrap SET owner_email = $1, updated_at = now() WHERE id = 'singleton';`,
        [cleanEmail]
      );
    });

    try {
      globalOwnerBootstrapManager.syncOwnerEmail({ newEmail: cleanEmail, callerSub: userId });
    } catch {
      // Handled
    }

    return { newEmail: cleanEmail };
  }

  /**
   * Generates a password reset token for local owner recovery.
   */
  public async requestPasswordReset(email: string): Promise<{ resetToken: string; expiresAt: Date }> {
    const cleanEmail = email.trim().toLowerCase();
    const user = await queryOne<{ id: string }>(
      `SELECT id FROM public.local_users WHERE lower(btrim(email)) = $1;`,
      [cleanEmail]
    );

    if (!user) {
      // Do not leak user existence, return dummy token
      return {
        resetToken: crypto.randomBytes(24).toString('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await query(
      `INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [user.id, tokenHash, expiresAt.toISOString()]
    );

    return { resetToken, expiresAt };
  }

  /**
   * Resets password using a valid reset token.
   */
  public async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const row = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM public.password_reset_tokens
       WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL;`,
      [tokenHash]
    );

    if (!row) {
      throw new Error('Invalid or expired password reset token.');
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      throw new Error(validation.error || 'Password does not meet security requirements.');
    }

    const newHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE public.local_users SET password_hash = $1, updated_at = now() WHERE id = $2;`,
        [newHash, row.user_id]
      );
      await client.query(
        `UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2;`,
        [newHash, row.user_id]
      );
      await client.query(
        `UPDATE public.password_reset_tokens SET used_at = now() WHERE id = $1;`,
        [row.id]
      );
    });

    // Invalidate all active sessions
    await revokeAllUserSessions(row.user_id);
  }
}

export const globalAuthService = new AuthService();
