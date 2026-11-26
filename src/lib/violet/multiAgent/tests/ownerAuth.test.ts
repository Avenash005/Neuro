import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type http from "node:http";
import { validateOwnerAuth } from "../../../../server/violetApiServer";

function createMockReq(authorizationHeader?: string): http.IncomingMessage {
  return {
    headers: {
      ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
    },
  } as unknown as http.IncomingMessage;
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${header}.${body}.mock-signature-hash`;
}

describe("Owner Authentication Guard (validateOwnerAuth)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VIOLET_OWNER_ID;
    delete process.env.VIOLET_OWNER_EMAIL;
    delete process.env.VIOLET_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("permits default local single-user mode when no owner ID or token is configured", () => {
    const req = createMockReq();
    const result = validateOwnerAuth(req);
    expect(result.authorized).toBe(true);
    expect(result.userId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rejects requests missing Bearer authorization when security is enabled", () => {
    process.env.VIOLET_OWNER_ID = "owner-uuid-456";

    // No header
    const noHeaderReq = createMockReq();
    expect(validateOwnerAuth(noHeaderReq)).toEqual({
      authorized: false,
      userId: "",
      error: "Missing or malformed Authorization header. Bearer token required.",
    });

    // Basic auth header instead of Bearer
    const basicReq = createMockReq("Basic dXNlcjpwYXNz");
    expect(validateOwnerAuth(basicReq).authorized).toBe(false);
  });

  it("authorizes requests with valid VIOLET_API_TOKEN", () => {
    process.env.VIOLET_API_TOKEN = "violet-super-secret-key-12345";
    process.env.VIOLET_OWNER_ID = "owner-uuid-456";

    const req = createMockReq("Bearer violet-super-secret-key-12345");
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(true);
    expect(result.userId).toBe("owner-uuid-456");
  });

  it("authorizes requests with valid Supabase JWT matching VIOLET_OWNER_ID", () => {
    process.env.VIOLET_OWNER_ID = "owner-uuid-789";

    const validToken = makeJwt({
      sub: "owner-uuid-789",
      email: "owner@violet.ai",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq(`Bearer ${validToken}`);
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(true);
    expect(result.userId).toBe("owner-uuid-789");
  });

  it("authorizes requests with valid Supabase JWT matching VIOLET_OWNER_EMAIL", () => {
    process.env.VIOLET_OWNER_EMAIL = "alex@violet.personal";

    const validToken = makeJwt({
      sub: "some-user-id",
      email: "alex@violet.personal",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq(`Bearer ${validToken}`);
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(true);
    expect(result.userId).toBe("some-user-id");
  });

  it("rejects expired Supabase JWT tokens", () => {
    process.env.VIOLET_OWNER_ID = "owner-uuid-789";

    const expiredToken = makeJwt({
      sub: "owner-uuid-789",
      email: "owner@violet.ai",
      exp: Math.floor(Date.now() / 1000) - 120, // Expired 2 minutes ago
    });

    const req = createMockReq(`Bearer ${expiredToken}`);
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.error).toContain("Authentication token has expired");
  });

  it("strictly rejects users with mismatched owner UUID", () => {
    process.env.VIOLET_OWNER_ID = "legitimate-owner-uuid";

    const intruderToken = makeJwt({
      sub: "attacker-uuid-999",
      email: "attacker@bad.org",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq(`Bearer ${intruderToken}`);
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.error).toContain("does not match configured VIOLET owner ID");
  });

  it("strictly rejects users with mismatched owner email", () => {
    process.env.VIOLET_OWNER_EMAIL = "owner@domain.com";

    const token = makeJwt({
      sub: "user-123",
      email: "other@domain.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const req = createMockReq(`Bearer ${token}`);
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.error).toContain("does not match configured VIOLET owner email");
  });

  it("rejects completely malformed JWT tokens", () => {
    process.env.VIOLET_OWNER_ID = "owner-123";

    const req = createMockReq("Bearer not-a-valid-jwt-token");
    const result = validateOwnerAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.error).toBeDefined();
  });
});
