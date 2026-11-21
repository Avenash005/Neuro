/**
 * VIOLET Local Authentication Client
 * Direct frontend client for local PostgreSQL authentication, session management,
 * and owner account security without depending on remote Supabase Auth.
 */

export interface LocalAuthUser {
  id: string;
  email: string;
  role?: string;
  display_name?: string | null;
  created_at?: string;
  updated_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  aud?: string;
}

export interface LocalAuthSession {
  access_token: string;
  token_type?: string;
  expires_at?: number;
  user: LocalAuthUser;
}

export type AuthChangeListener = (user: LocalAuthUser | null, session: LocalAuthSession | null) => void;

class LocalAuthClient {
  private currentSession: LocalAuthSession | null = null;
  private listeners = new Set<AuthChangeListener>();
  private readonly storageKey = 'violet_local_session_token';

  constructor() {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem(this.storageKey);
      if (savedToken) {
        this.currentSession = {
          access_token: savedToken,
          token_type: 'bearer',
          user: { id: '', email: '' },
        };
      }
    }
  }

  private notifyListeners(): void {
    const user = this.currentSession?.user ?? null;
    const session = this.currentSession;
    for (const listener of this.listeners) {
      try {
        listener(user, session);
      } catch (err) {
        console.error('[LocalAuthClient] Listener error:', err);
      }
    }
  }

  public getStoredToken(): string | null {
    if (this.currentSession?.access_token) {
      return this.currentSession.access_token;
    }
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.storageKey);
    }
    return null;
  }

  public setSession(session: LocalAuthSession | null): void {
    this.currentSession = session;
    if (typeof window !== 'undefined') {
      if (session?.access_token) {
        localStorage.setItem(this.storageKey, session.access_token);
      } else {
        localStorage.removeItem(this.storageKey);
      }
    }
    this.notifyListeners();
  }

  public onAuthStateChange(listener: AuthChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async getSession(): Promise<LocalAuthSession | null> {
    try {
      const token = this.getStoredToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/v1/auth/session', {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!res.ok) return null;
      const data = await res.json();

      if (data.authenticated && data.session && data.user) {
        const session: LocalAuthSession = {
          access_token: data.session.access_token || token || '',
          token_type: 'bearer',
          expires_at: data.session.expires_at,
          user: {
            id: data.user.id,
            email: data.user.email,
            role: data.user.role,
            display_name: data.user.display_name,
            created_at: data.user.created_at,
            updated_at: data.user.updated_at,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
          },
        };
        this.currentSession = session;
        if (typeof window !== 'undefined' && session.access_token) {
          localStorage.setItem(this.storageKey, session.access_token);
        }
        return session;
      } else {
        this.setSession(null);
        return null;
      }
    } catch {
      return null;
    }
  }

  public async getCurrentUser(): Promise<LocalAuthUser | null> {
    const session = await this.getSession();
    return session?.user ?? null;
  }

  public async signIn(email: string, password: string): Promise<{ user: LocalAuthUser; session: LocalAuthSession }> {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Authentication failed. Please check your credentials.');
    }

    const user: LocalAuthUser = {
      id: body.user.id,
      email: body.user.email,
      role: body.user.role,
      display_name: body.user.display_name,
      created_at: body.user.created_at,
      updated_at: body.user.updated_at,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
    };

    const session: LocalAuthSession = {
      access_token: body.session.access_token,
      token_type: 'bearer',
      expires_at: body.session.expires_at,
      user,
    };

    this.setSession(session);
    return { user, session };
  }

  public async signUp(email: string, password: string): Promise<{ user: LocalAuthUser; session: LocalAuthSession }> {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Registration failed.');
    }

    const user: LocalAuthUser = {
      id: body.user.id,
      email: body.user.email,
      role: body.user.role,
      display_name: body.user.display_name,
      created_at: body.user.created_at,
      updated_at: body.user.updated_at,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
    };

    const session: LocalAuthSession = {
      access_token: body.session.access_token,
      token_type: 'bearer',
      expires_at: body.session.expires_at,
      user,
    };

    this.setSession(session);
    return { user, session };
  }

  public async signOut(): Promise<void> {
    try {
      const token = this.getStoredToken();
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
    } catch {
      // Ignore network errors during signout
    } finally {
      this.setSession(null);
    }
  }

  public async changePassword(params: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; message: string }> {
    const { currentPassword, newPassword, confirmPassword } = params;

    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    if (newPassword !== confirmPassword) {
      throw new Error('New password and confirmation do not match.');
    }
    if (currentPassword === newPassword) {
      throw new Error('New password must be different from current password.');
    }

    const token = this.getStoredToken();
    const res = await fetch('/api/v1/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Failed to update password.');
    }

    return { success: true, message: body.message || 'Password updated successfully.' };
  }

  public async changeEmail(params: {
    currentPassword: string;
    newEmail: string;
  }): Promise<{
    success: boolean;
    requiresVerification: boolean;
    newEmail: string;
    message: string;
    user: LocalAuthUser;
  }> {
    const { currentPassword, newEmail } = params;
    const token = this.getStoredToken();

    const res = await fetch('/api/v1/auth/change-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newEmail }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Failed to update email address.');
    }

    // Refresh session user with updated email
    if (this.currentSession) {
      this.currentSession.user.email = body.newEmail;
      this.notifyListeners();
    }

    const currentUser = (await this.getCurrentUser()) || {
      id: '',
      email: body.newEmail,
    };

    return {
      success: true,
      requiresVerification: false,
      newEmail: body.newEmail,
      message: body.message || 'Email address changed and synchronized successfully.',
      user: currentUser,
    };
  }

  public async resetPasswordForEmail(email: string): Promise<void> {
    const res = await fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Failed to request password reset.');
    }
  }

  public async verifyCurrentPassword(password: string): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user || !user.email) {
      throw new Error('No authenticated user session found.');
    }

    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: user.email, password }),
    });

    if (!res.ok) {
      throw new Error('Current password is incorrect. Please verify your password and try again.');
    }

    return true;
  }
}

export const globalLocalAuthClient = new LocalAuthClient();
