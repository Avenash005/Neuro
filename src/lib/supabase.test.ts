import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  normalizeMemory,
  isOwnerUser,
  connectSupabase,
  getSession,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  signOutUser,
  resetPasswordForEmail,
  onAuthChange,
  supabase,
} from "./supabase";

const baseMemory = {
  id: "memory-1",
  title: "Test memory",
  content: "A useful idea",
  created_at: "2026-07-19T00:00:00.000Z",
  storage_path: null,
  original_filename: null,
  mime_type: null,
  file_size: null,
  summary: null,
  extracted_text: null,
  extracted_at: null,
  is_favorite: false,
  tags: [],
  graph_analyzed_at: null,
  study_analyzed_at: null,
};

describe("normalizeMemory", () => {
  it("maps database values into UI-safe values", () => {
    expect(normalizeMemory({ ...baseMemory, kind: "voice", processing_status: "ready" })).toEqual({
      ...baseMemory,
      kind: "Voice",
      processing_status: "ready",
      sourceUrl: undefined,
    });
  });

  it("falls back safely for unknown database values", () => {
    expect(normalizeMemory({ ...baseMemory, kind: "future-format", processing_status: "unknown" })).toMatchObject({
      kind: "Note",
      processing_status: "pending",
    });
  });
});

describe("isOwnerUser", () => {
  const mockUser: User = {
    id: "usr-12345",
    email: "owner@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };

  it("returns isOwner: false when user is null", () => {
    const result = isOwnerUser(null);
    expect(result.isOwner).toBe(false);
    expect(result.reason).toBe("No authenticated user.");
  });

  it("returns isOwner: true when email matches configured owner (case-insensitive)", () => {
    const result = isOwnerUser(mockUser, "OWNER@EXAMPLE.COM");
    expect(result.isOwner).toBe(true);
  });

  it("returns isOwner: false with reason when email does not match configured owner", () => {
    const intruder: User = {
      ...mockUser,
      id: "intruder-6789",
      email: "intruder@domain.com",
    };
    const result = isOwnerUser(intruder, "owner@example.com");
    expect(result.isOwner).toBe(false);
    expect(result.reason).toContain("Access restricted");
    expect(result.reason).toContain("intruder@domain.com");
  });

  it("returns isOwner: true if neither owner email nor owner ID is configured (single-user personal mode)", () => {
    const origViteEmail = process.env.VITE_VIOLET_OWNER_EMAIL;
    const origVioletEmail = process.env.VIOLET_OWNER_EMAIL;
    delete process.env.VITE_VIOLET_OWNER_EMAIL;
    delete process.env.VIOLET_OWNER_EMAIL;
    vi.stubEnv("VITE_VIOLET_OWNER_EMAIL", "");
    vi.stubEnv("VIOLET_OWNER_EMAIL", "");

    try {
      const result = isOwnerUser(mockUser, null);
      // If no env variables set for owner, single-user mode permits first authenticated user
      expect(result.isOwner).toBe(true);
    } finally {
      if (origViteEmail !== undefined) process.env.VITE_VIOLET_OWNER_EMAIL = origViteEmail;
      if (origVioletEmail !== undefined) process.env.VIOLET_OWNER_EMAIL = origVioletEmail;
      vi.unstubAllEnvs();
    }
  });
});

describe("Supabase Authentication Methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("connectSupabase returns null when no active session exists and does not sign in anonymously", async () => {
    if (supabase) {
      vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
      const user = await connectSupabase();
      expect(user).toBeNull();
    }
  });

  it("connectSupabase returns user when valid session exists", async () => {
    if (supabase) {
      const fakeUser = { id: "user-abc", email: "test@example.com" } as User;
      const fakeSession = { user: fakeUser, access_token: "jwt-token-123" } as any;
      vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      const user = await connectSupabase();
      expect(user).toEqual(fakeUser);
    }
  });

  it("getSession returns current session or null", async () => {
    if (supabase) {
      const fakeSession = { access_token: "xyz-token" } as any;
      vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      const session = await getSession();
      expect(session).toEqual(fakeSession);
    }
  });

  it("signInWithEmailPassword successfully authenticates", async () => {
    if (supabase) {
      const fakeUser = { id: "user-1", email: "user@example.com" } as User;
      const fakeSession = { user: fakeUser, access_token: "token-1" } as any;
      vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValueOnce({
        data: { user: fakeUser, session: fakeSession },
        error: null,
      });

      const res = await signInWithEmailPassword("user@example.com", "validPassword123");
      expect(res.user).toEqual(fakeUser);
      expect(res.session).toEqual(fakeSession);
    }
  });

  it("signInWithEmailPassword propagates authentication error", async () => {
    if (supabase) {
      vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new Error("Invalid login credentials") as any,
      });

      await expect(
        signInWithEmailPassword("user@example.com", "wrongPassword")
      ).rejects.toThrow("Invalid login credentials");
    }
  });

  it("signUpWithEmailPassword calls supabase.auth.signUp", async () => {
    if (supabase) {
      const fakeUser = { id: "user-2", email: "new@example.com" } as User;
      vi.spyOn(supabase.auth, "signUp").mockResolvedValueOnce({
        data: { user: fakeUser, session: null },
        error: null,
      });

      const res = await signUpWithEmailPassword("new@example.com", "strongPassword123");
      expect(res.user).toEqual(fakeUser);
    }
  });

  it("signOutUser calls supabase.auth.signOut", async () => {
    if (supabase) {
      const signOutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValueOnce({
        error: null,
      });

      await signOutUser();
      expect(signOutSpy).toHaveBeenCalledTimes(1);
    }
  });

  it("resetPasswordForEmail calls supabase.auth.resetPasswordForEmail", async () => {
    if (supabase) {
      const resetSpy = vi.spyOn(supabase.auth, "resetPasswordForEmail").mockResolvedValueOnce({
        data: {},
        error: null,
      });

      await resetPasswordForEmail("reset@example.com");
      expect(resetSpy).toHaveBeenCalledTimes(1);
      expect(resetSpy).toHaveBeenCalledWith(
        "reset@example.com",
        expect.objectContaining({ redirectTo: expect.any(String) })
      );
    }
  });

  it("onAuthChange listens for auth events including token refresh and passes session", () => {
    if (supabase) {
      let listenerCallback: any = null;
      const unsubscribeMock = vi.fn();
      vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementationOnce((cb: any) => {
        listenerCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeMock } } } as any;
      });

      const userCallback = vi.fn();
      const unsub = onAuthChange(userCallback);

      expect(listenerCallback).toBeDefined();

      // Trigger TOKEN_REFRESHED event
      const refreshedUser = { id: "user-refreshed", email: "owner@violet.ai" };
      const refreshedSession = { user: refreshedUser, access_token: "new-fresh-token" };
      listenerCallback("TOKEN_REFRESHED", refreshedSession);

      expect(userCallback).toHaveBeenCalledWith(refreshedUser, refreshedSession);

      unsub();
      expect(unsubscribeMock).toHaveBeenCalled();
    }
  });
});
