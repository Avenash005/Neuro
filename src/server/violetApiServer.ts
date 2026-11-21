/**
 * VIOLET AI & Lab — Backend API Server & Middleware
 *
 * Exposes standard REST & SSE streaming endpoints for multi-model intelligence,
 * multi-agent autonomous engineering pipelines, Git worktree inspection, and owner auth.
 * Can run standalone via Node http.createServer or mount directly into Vite server middleware.
 */

import http from "node:http";
import { globalModelGateway, ModelGateway } from "../lib/violet/ai/modelGateway";
import type { ChatRequest, UserPreferences } from "../lib/violet/ai/types";
import { globalGitWorktreeManager, GitWorktreeManager } from "../lib/violet/git/worktreeManager";
import { globalMultiAgentOrchestrator, MultiAgentOrchestrator } from "../lib/violet/multiAgent/agentOrchestrator";
import { globalLiveOperationsService, LiveOperationsService } from "../lib/violet/multiAgent/liveOperationsService";
import { globalIssueIntelligenceService, IssueIntelligenceService } from "../lib/violet/multiAgent/issueIntelligenceService";
import { globalIssueResolutionEngine, IssueResolutionEngine, ResolveIssueOptions } from "../lib/violet/multiAgent/issueResolutionEngine";
import type { IssueCaptureInput, IssueFilter, IssueStatus, SpecializedAgentRole } from "../types/issues";
import type { MultiAgentTaskRequest } from "../types/multiAgent";
import { globalOwnerBootstrapManager } from "./ownerBootstrapManager";
import { globalAuthService } from "./auth/authService";
import {
  extractSessionTokenFromRequest,
  validateSession,
  buildSessionCookie,
  buildClearSessionCookie,
  getCachedSession,
} from "./auth/sessionManager";

export interface ServerOptions {
  port?: number;
  host?: string;
  gateway?: ModelGateway;
  orchestrator?: MultiAgentOrchestrator;
  gitManager?: GitWorktreeManager;
  operationsService?: LiveOperationsService;
  issueService?: IssueIntelligenceService;
  issueEngine?: IssueResolutionEngine;
}

/**
 * Validates whether an incoming request belongs to the authenticated owner.
 */
export function validateOwnerAuth(req: http.IncomingMessage): {
  authorized: boolean;
  userId: string;
  error?: string;
} {
  const configuredOwnerId = process.env.VIOLET_OWNER_ID;
  const configuredOwnerEmail = process.env.VIOLET_OWNER_EMAIL;
  const configuredApiToken = process.env.VIOLET_API_TOKEN;
  const bootstrapStatus = globalOwnerBootstrapManager.getStatus();

  // If no owner ID, owner email, API token configured, and system is not yet bootstrapped, default to local single-user mode
  if (!configuredOwnerId && !configuredOwnerEmail && !configuredApiToken && !bootstrapStatus.isBootstrapped) {
    return { authorized: true, userId: "00000000-0000-0000-0000-000000000001" };
  }

  // 1. Direct API Key Header Match
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
  if (configuredApiToken && apiKeyHeader && apiKeyHeader === configuredApiToken) {
    return { authorized: true, userId: configuredOwnerId || "00000000-0000-0000-0000-000000000001" };
  }

  // 2. Extract Token from Cookie or Authorization Header
  const token = extractSessionTokenFromRequest(req);
  if (!token) {
    return {
      authorized: false,
      userId: "",
      error: "Missing or malformed Authorization header. Bearer token required.",
    };
  }

  // Direct API Token Match (Bearer Token)
  if (configuredApiToken && token === configuredApiToken) {
    return { authorized: true, userId: configuredOwnerId || "00000000-0000-0000-0000-000000000001" };
  }

  // 3. Local Server-Managed Session Check (Hot Cache)
  const cached = getCachedSession(token);
  if (cached) {
    const expectedOwnerId = globalOwnerBootstrapManager.getOwnerId() || configuredOwnerId;
    const expectedOwnerEmail = globalOwnerBootstrapManager.getOwnerEmail() || configuredOwnerEmail;

    if (expectedOwnerId && cached.userId !== expectedOwnerId) {
      return {
        authorized: false,
        userId: cached.userId,
        error: `Unauthorized: User UUID '${cached.userId}' does not match configured VIOLET owner ID.`,
      };
    }

    if (expectedOwnerEmail && cached.email && cached.email.toLowerCase() !== expectedOwnerEmail.toLowerCase()) {
      return {
        authorized: false,
        userId: cached.userId,
        error: `Unauthorized: User email '${cached.email}' does not match configured VIOLET owner email.`,
      };
    }

    return { authorized: true, userId: cached.userId };
  }

  // 4. JWT Validation (for mock unit tests and legacy compatibility)
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      // Decode JWT payload (without external libraries)
      const payloadBuf = Buffer.from(parts[1], "base64");
      const payload = JSON.parse(payloadBuf.toString("utf-8")) as {
        sub?: string;
        email?: string;
        exp?: number;
      };

      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return { authorized: false, userId: "", error: "Authentication token has expired." };
      }

      // For verified email synchronization, authorize owner by their immutable UUID
      if (req.url && req.url.includes("/api/v1/auth/sync-owner-email")) {
        const expectedOwnerId = globalOwnerBootstrapManager.getOwnerId() || configuredOwnerId;
        if (payload.sub && expectedOwnerId && payload.sub === expectedOwnerId) {
          return { authorized: true, userId: payload.sub };
        }
        return {
          authorized: false,
          userId: payload.sub || "",
          error: "Unauthorized: Access restricted to VIOLET owner.",
        };
      }

      // Check OwnerBootstrapManager
      const bootstrapCheck = globalOwnerBootstrapManager.validateOwner(payload);
      if (!bootstrapCheck.authorized) {
        return {
          authorized: false,
          userId: payload.sub || "",
          error: bootstrapCheck.error || "Unauthorized: Access restricted to VIOLET owner.",
        };
      }

      if (configuredOwnerId && payload.sub !== configuredOwnerId) {
        return {
          authorized: false,
          userId: payload.sub || "",
          error: `Unauthorized: User UUID '${payload.sub}' does not match configured VIOLET owner ID.`,
        };
      }

      if (configuredOwnerEmail && payload.email !== configuredOwnerEmail) {
        return {
          authorized: false,
          userId: payload.sub || "",
          error: `Unauthorized: User email '${payload.email}' does not match configured VIOLET owner email.`,
        };
      }

      return { authorized: true, userId: payload.sub || configuredOwnerId || "owner" };
    }
  } catch {
    // Malformed token
  }

  return { authorized: false, userId: "", error: "Invalid authentication credentials." };
}

export function handleVioletApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gateway: ModelGateway = globalModelGateway,
  orchestrator: MultiAgentOrchestrator = globalMultiAgentOrchestrator,
  gitManager: GitWorktreeManager = globalGitWorktreeManager,
  operationsService: LiveOperationsService = globalLiveOperationsService,
  issueService: IssueIntelligenceService = globalIssueIntelligenceService,
  issueEngine: IssueResolutionEngine = globalIssueResolutionEngine
): boolean {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;

  // Only handle /api/v1/*
  if (!pathname.startsWith("/api/v1")) {
    return false;
  }

  // Set standard CORS & JSON headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // Helper to send JSON response
  const sendJson = (data: unknown, statusCode = 200) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  // Helper to read JSON body
  const readJsonBody = async <T>(): Promise<T> => {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk: Buffer | string) => {
        data += chunk.toString();
        if (data.length > 5 * 1024 * 1024) {
          reject(new Error("Request payload too large"));
        }
      });
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : ({} as T));
        } catch {
          reject(new Error("Malformed JSON in request body"));
        }
      });
      req.on("error", reject);
    });
  };

  // Public Route: GET /api/v1/health
  if (req.method === "GET" && pathname === "/api/v1/health") {
    sendJson({
      status: "ok",
      version: "3.2.0",
      timestamp: new Date().toISOString(),
      service: "violet-ai-gateway",
      multiAgent: true,
      singleUser: true,
    });
    return true;
  }

  // Public Route: GET /api/v1/auth/bootstrap-status
  if (req.method === "GET" && pathname === "/api/v1/auth/bootstrap-status") {
    sendJson(globalOwnerBootstrapManager.getStatus());
    return true;
  }

  // Public Route: GET /api/v1/auth/owner (Metadata only)
  if (req.method === "GET" && pathname === "/api/v1/auth/owner") {
    const status = globalOwnerBootstrapManager.getStatus();
    sendJson({
      isSingleUser: true,
      isBootstrapped: status.isBootstrapped,
      hasConfiguredOwner: status.hasConfiguredOwner,
      ownerId: status.ownerId,
      ownerEmail: status.ownerEmail,
      bootstrappedAt: status.bootstrappedAt,
    });
    return true;
  }

  // Public Route: POST /api/v1/auth/bootstrap (One-Time Owner Bootstrap)
  if (req.method === "POST" && pathname === "/api/v1/auth/bootstrap") {
    readJsonBody<{ email: string; ownerId: string }>()
      .then((body) => {
        try {
          const result = globalOwnerBootstrapManager.completeBootstrap(body);
          sendJson(result, 200);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const statusCode = message.includes("already been bootstrapped") ? 403 : 400;
          sendJson({ error: message }, statusCode);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // ─── Local PostgreSQL Authentication Routes (Phase 4B) ────────────────────
  const isHttps = req.headers["x-forwarded-proto"] === "https" || (req.socket as any)?.encrypted === true;

  // Public Route: POST /api/v1/auth/register
  if (req.method === "POST" && pathname === "/api/v1/auth/register") {
    readJsonBody<{ email?: string; password?: string; displayName?: string }>()
      .then(async (body) => {
        try {
          if (!body.email || !body.password) {
            sendJson({ error: "Email and password are required for registration." }, 400);
            return;
          }

          const cleanEmail = body.email.trim().toLowerCase();
          console.log(`[VioletAPI] Registration request received: email=${cleanEmail}`);

          const userAgent = (req.headers["user-agent"] as string) || undefined;
          const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || undefined;

          const result = await globalAuthService.registerOwner({
            email: cleanEmail,
            password: body.password,
            displayName: body.displayName,
            userAgent,
            ipAddress,
          });

          console.log(`[VioletAPI] Registration committed to database: userId=${result.user.id}, email=${result.user.email}`);
          res.setHeader("Set-Cookie", buildSessionCookie(result.token, result.expiresAt, isHttps));
          sendJson(
            {
              success: true,
              user: result.user,
              session: {
                access_token: result.token,
                token_type: "bearer",
                expires_at: Math.floor(result.expiresAt.getTime() / 1000),
                user: result.user,
              },
            },
            201
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[VioletAPI] Registration rejected: ${message}`);
          const statusCode =
            message.includes("already been provisioned") || message.includes("permanently closed") || message.includes("Access restricted")
              ? 403
              : 400;
          sendJson({ error: message }, statusCode);
        }
      })
      .catch((err) => {
        console.error(`[VioletAPI] Registration parse error:`, err.message);
        sendJson({ error: err.message }, 400);
      });
    return true;
  }

  // Public Route: POST /api/v1/auth/login
  if (req.method === "POST" && pathname === "/api/v1/auth/login") {
    readJsonBody<{ email?: string; password?: string }>()
      .then(async (body) => {
        try {
          if (!body.email || !body.password) {
            sendJson({ error: "Email and password are required for sign-in." }, 400);
            return;
          }

          const cleanEmail = body.email.trim().toLowerCase();
          console.log(`[VioletAPI] Login request received: email=${cleanEmail}`);

          const userAgent = (req.headers["user-agent"] as string) || undefined;
          const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || undefined;

          const result = await globalAuthService.login({
            email: cleanEmail,
            password: body.password,
            userAgent,
            ipAddress,
          });

          console.log(`[VioletAPI] Login succeeded: userId=${result.user.id}, email=${result.user.email}`);
          res.setHeader("Set-Cookie", buildSessionCookie(result.token, result.expiresAt, isHttps));
          sendJson(
            {
              success: true,
              user: result.user,
              session: {
                access_token: result.token,
                token_type: "bearer",
                expires_at: Math.floor(result.expiresAt.getTime() / 1000),
                user: result.user,
              },
            },
            200
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[VioletAPI] Login failed: ${message}`);
          const statusCode = message.includes("Access restricted") ? 403 : 401;
          sendJson({ error: message }, statusCode);
        }
      })
      .catch((err) => {
        console.error(`[VioletAPI] Login parse error:`, err.message);
        sendJson({ error: err.message }, 400);
      });
    return true;
  }

  // Route: POST /api/v1/auth/logout
  if (req.method === "POST" && pathname === "/api/v1/auth/logout") {
    const token = extractSessionTokenFromRequest(req);
    if (token) {
      globalAuthService.logout(token).catch(() => {});
    }
    res.setHeader("Set-Cookie", buildClearSessionCookie());
    sendJson({ success: true, message: "Logged out successfully." }, 200);
    return true;
  }

  // Route: GET /api/v1/auth/session
  if (req.method === "GET" && pathname === "/api/v1/auth/session") {
    const token = extractSessionTokenFromRequest(req);
    if (!token) {
      sendJson({ authenticated: false, user: null, session: null }, 200);
      return true;
    }

    validateSession(token)
      .then((validation) => {
        if (!validation.valid || !validation.user || !validation.session) {
          res.setHeader("Set-Cookie", buildClearSessionCookie());
          sendJson({ authenticated: false, error: validation.error, user: null, session: null }, 200);
          return;
        }

        sendJson(
          {
            authenticated: true,
            user: validation.user,
            session: {
              access_token: token,
              token_type: "bearer",
              expires_at: Math.floor(new Date(validation.session.expiresAt).getTime() / 1000),
              user: validation.user,
            },
          },
          200
        );
      })
      .catch((err) => {
        sendJson({ authenticated: false, error: err.message, user: null, session: null }, 200);
      });
    return true;
  }

  // Public Route: POST /api/v1/auth/forgot-password
  if (req.method === "POST" && pathname === "/api/v1/auth/forgot-password") {
    readJsonBody<{ email: string }>()
      .then(async (body) => {
        try {
          const resObj = await globalAuthService.requestPasswordReset(body.email);
          sendJson(
            {
              success: true,
              message: "Password reset request processed. If the email exists, a reset token was generated.",
              resetToken: resObj.resetToken,
              expiresAt: resObj.expiresAt.toISOString(),
            },
            200
          );
        } catch (err) {
          sendJson({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // Public Route: POST /api/v1/auth/reset-password
  if (req.method === "POST" && pathname === "/api/v1/auth/reset-password") {
    readJsonBody<{ token: string; newPassword: string }>()
      .then(async (body) => {
        try {
          await globalAuthService.resetPassword(body.token, body.newPassword);
          res.setHeader("Set-Cookie", buildClearSessionCookie());
          sendJson({ success: true, message: "Password has been reset successfully." }, 200);
        } catch (err) {
          sendJson({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // ─── Owner Authentication Guard ───────────────────────────────────────────
  const auth = validateOwnerAuth(req);
  if (!auth.authorized) {
    sendJson({ error: auth.error || "Unauthorized: Access restricted to VIOLET owner" }, 401);
    return true;
  }

  // Owner Route: POST /api/v1/auth/sync-owner-email (Synchronize verified new owner email)
  if (req.method === "POST" && pathname === "/api/v1/auth/sync-owner-email") {
    readJsonBody<{ email: string }>()
      .then((body) => {
        try {
          const result = globalOwnerBootstrapManager.syncOwnerEmail({
            newEmail: body.email,
            callerSub: auth.userId,
          });
          sendJson(result, 200);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const statusCode = message.includes("Unauthorized") ? 403 : 400;
          sendJson({ error: message }, statusCode);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // Owner Route: GET /api/v1/auth/account-status
  if (req.method === "GET" && pathname === "/api/v1/auth/account-status") {
    const status = globalOwnerBootstrapManager.getStatus();
    sendJson(
      {
        isBootstrapped: status.isBootstrapped,
        ownerEmail: status.ownerEmail,
        ownerId: status.ownerId,
        bootstrappedAt: status.bootstrappedAt,
        sessionUserId: auth.userId,
      },
      200
    );
    return true;
  }

  // Owner Route: POST /api/v1/auth/change-password
  if (req.method === "POST" && pathname === "/api/v1/auth/change-password") {
    readJsonBody<{ currentPassword: string; newPassword: string }>()
      .then(async (body) => {
        try {
          await globalAuthService.changePassword({
            userId: auth.userId,
            currentPassword: body.currentPassword,
            newPassword: body.newPassword,
          });
          sendJson({ success: true, message: "Password updated successfully." }, 200);
        } catch (err) {
          sendJson({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // Owner Route: POST /api/v1/auth/change-email
  if (req.method === "POST" && pathname === "/api/v1/auth/change-email") {
    readJsonBody<{ currentPassword: string; newEmail: string }>()
      .then(async (body) => {
        try {
          const resObj = await globalAuthService.changeEmail({
            userId: auth.userId,
            currentPassword: body.currentPassword,
            newEmail: body.newEmail,
          });
          sendJson(
            {
              success: true,
              newEmail: resObj.newEmail,
              message: "Email address changed and synchronized successfully.",
            },
            200
          );
        } catch (err) {
          sendJson({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // ─── AI Model Gateway Routes ──────────────────────────────────────────────

  // GET /api/v1/providers
  if (req.method === "GET" && pathname === "/api/v1/providers") {
    gateway.registry
      .checkAllHealth()
      .then((health) => sendJson({ providers: health }))
      .catch((err) => sendJson({ error: String(err) }, 500));
    return true;
  }

  // GET /api/v1/models
  if (req.method === "GET" && pathname === "/api/v1/models") {
    gateway.registry
      .listAllModels()
      .then((models) => sendJson({ models }))
      .catch((err) => sendJson({ error: String(err) }, 500));
    return true;
  }

  // GET /api/v1/preferences
  if (req.method === "GET" && pathname === "/api/v1/preferences") {
    sendJson({ preferences: gateway.getUserPreferences() });
    return true;
  }

  // PUT /api/v1/preferences
  if (req.method === "PUT" && pathname === "/api/v1/preferences") {
    readJsonBody<Partial<UserPreferences>>()
      .then((updates) => {
        const updated = gateway.setUserPreferences(updates);
        sendJson({ preferences: updated });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // GET /api/v1/audit/logs
  if (req.method === "GET" && pathname === "/api/v1/audit/logs") {
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const logs = gateway.auditLogger.getRecentLogs(limit);
    const metrics = gateway.auditLogger.getSummaryMetrics();
    sendJson({ logs, metrics });
    return true;
  }

  // POST /api/v1/chat
  if (req.method === "POST" && pathname === "/api/v1/chat") {
    readJsonBody<ChatRequest>()
      .then(async (body) => {
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
          sendJson({ error: "Missing or invalid 'messages' array in chat request" }, 400);
          return;
        }

        try {
          const response = await gateway.chat(body);
          sendJson(response);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isPolicy = message.includes("Policy violation") || message.includes("LOCAL_ONLY");
          sendJson({ error: message, code: isPolicy ? "POLICY_VIOLATION" : "GATEWAY_ERROR" }, isPolicy ? 400 : 502);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // POST /api/v1/chat/stream
  if (req.method === "POST" && pathname === "/api/v1/chat/stream") {
    readJsonBody<ChatRequest>()
      .then(async (body) => {
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
          sendJson({ error: "Missing or invalid 'messages' array in stream request" }, 400);
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const abortController = new AbortController();
        req.on("close", () => {
          abortController.abort(new Error("Client disconnected from SSE stream"));
        });

        try {
          for await (const chunk of gateway.stream(body, abortController.signal)) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          res.write("data: [DONE]\n\n");
          res.end();
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ error: errMsg, finish_reason: "error" })}\n\n`);
          res.end();
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // ─── Multi-Agent Lab Routes ───────────────────────────────────────────────

  // POST /api/v1/agent/tasks (Create and start multi-agent task)
  if (req.method === "POST" && pathname === "/api/v1/agent/tasks") {
    readJsonBody<MultiAgentTaskRequest>()
      .then(async (body) => {
        if (!body.goal || !body.goal.trim()) {
          sendJson({ error: "Task goal cannot be empty" }, 400);
          return;
        }

        try {
          const taskState = await orchestrator.startTask({
            ...body,
            userId: auth.userId,
          });
          sendJson({ task: taskState });
        } catch (err) {
          sendJson({ error: `Failed to start multi-agent task: ${err instanceof Error ? err.message : String(err)}` }, 500);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // GET /api/v1/agent/tasks (List all multi-agent tasks)
  if (req.method === "GET" && pathname === "/api/v1/agent/tasks") {
    const list = orchestrator.listTasks();
    sendJson({ tasks: list });
    return true;
  }

  // GET /api/v1/agent/tasks/:id/events (SSE Stream for live task events)
  const eventsMatch = pathname.match(/^\/api\/v1\/agent\/tasks\/([^/]+)\/events$/);
  if (req.method === "GET" && eventsMatch) {
    const taskId = eventsMatch[1];
    const task = orchestrator.getTask(taskId);
    if (!task) {
      sendJson({ error: `Task not found: ${taskId}` }, 404);
      return true;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial replay of existing events
    for (const evt of task.events) {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }

    const unsubscribe = orchestrator.subscribeToTask(taskId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.eventType === "task.completed" || event.eventType === "task.failed" || event.eventType === "task.cancelled") {
        res.write("data: [DONE]\n\n");
      }
    });

    req.on("close", () => {
      unsubscribe();
    });

    return true;
  }

  // GET /api/v1/agent/tasks/:id (Get full task state)
  const taskGetMatch = pathname.match(/^\/api\/v1\/agent\/tasks\/([^/]+)$/);
  if (req.method === "GET" && taskGetMatch) {
    const taskId = taskGetMatch[1];
    const task = orchestrator.getTask(taskId);
    if (!task) {
      sendJson({ error: `Task not found: ${taskId}` }, 404);
      return true;
    }
    sendJson({ task });
    return true;
  }

  // POST /api/v1/agent/tasks/:id/cancel
  const taskCancelMatch = pathname.match(/^\/api\/v1\/agent\/tasks\/([^/]+)\/cancel$/);
  if (req.method === "POST" && taskCancelMatch) {
    const taskId = taskCancelMatch[1];
    readJsonBody<{ reason?: string }>()
      .then(async (body) => {
        await orchestrator.cancelTask(taskId, body.reason || "Manual cancellation by owner");
        sendJson({ success: true, taskId });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // GET /api/v1/agent/worktrees (List active worktrees)
  if (req.method === "GET" && pathname === "/api/v1/agent/worktrees") {
    gitManager
      .listAllWorktrees()
      .then((worktrees) => sendJson({ worktrees }))
      .catch((err) => sendJson({ error: err.message }, 500));
    return true;
  }

  // POST /api/v1/agent/worktrees/cleanup
  if (req.method === "POST" && pathname === "/api/v1/agent/worktrees/cleanup") {
    readJsonBody<{ worktreePath?: string }>()
      .then(async (body) => {
        if (body.worktreePath) {
          await gitManager.cleanupWorktree(body.worktreePath, true);
        }
        sendJson({ success: true });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // ─── Phase 3F Live Operations & Observability Routes ─────────────────────

  // GET /api/v1/operations/summary
  if (req.method === "GET" && pathname === "/api/v1/operations/summary") {
    try {
      const summary = operationsService.getOperationsSummary();
      sendJson(summary);
    } catch (err) {
      sendJson({ error: `Failed to get operations summary: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
    return true;
  }

  // GET /api/v1/operations/agents
  if (req.method === "GET" && pathname === "/api/v1/operations/agents") {
    try {
      const agents = operationsService.getLiveAgents();
      sendJson({ agents });
    } catch (err) {
      sendJson({ error: `Failed to get live agents: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
    return true;
  }

  // GET /api/v1/operations/agents/:id
  const opAgentMatch = pathname.match(/^\/api\/v1\/operations\/agents\/([^/]+)$/);
  if (req.method === "GET" && opAgentMatch) {
    const agentId = decodeURIComponent(opAgentMatch[1]);
    const detail = operationsService.getAgentDetail(agentId);
    if (!detail) {
      sendJson({ error: `Agent not found: ${agentId}` }, 404);
      return true;
    }
    sendJson({ agent: detail });
    return true;
  }

  // GET /api/v1/operations/workflow/:taskId
  const opWorkflowMatch = pathname.match(/^\/api\/v1\/operations\/workflow\/([^/]+)$/);
  if (req.method === "GET" && opWorkflowMatch) {
    const taskId = decodeURIComponent(opWorkflowMatch[1]);
    const dag = operationsService.getWorkflowDAG(taskId);
    if (!dag) {
      sendJson({ error: `Workflow not found for task: ${taskId}` }, 404);
      return true;
    }
    sendJson({ workflow: dag });
    return true;
  }

  // GET /api/v1/operations/resources
  if (req.method === "GET" && pathname === "/api/v1/operations/resources") {
    try {
      const telemetry = operationsService.getResourceTelemetry();
      sendJson(telemetry);
    } catch (err) {
      sendJson({ error: `Failed to get resource telemetry: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
    return true;
  }

  // GET /api/v1/operations/events (Live unified event stream or query)
  if (req.method === "GET" && pathname === "/api/v1/operations/events") {
    const acceptHeader = req.headers.accept || "";
    const isSSE = acceptHeader.includes("text/event-stream") || url.searchParams.get("stream") === "true";

    const filter = {
      taskId: url.searchParams.get("taskId") || undefined,
      agentRole: (url.searchParams.get("agentRole") as any) || undefined,
      eventType: url.searchParams.get("eventType") || undefined,
      search: url.searchParams.get("search") || undefined,
      since: url.searchParams.get("since") || undefined,
      limit: parseInt(url.searchParams.get("limit") || "100", 10),
    };

    if (isSSE) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const recent = operationsService.getEvents(filter);
      for (const evt of recent.reverse()) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }

      // Keep connection alive with heartbeat interval
      const timer = setInterval(() => {
        res.write(`: ping ${Date.now()}\n\n`);
      }, 15000);

      req.on("close", () => {
        clearInterval(timer);
      });
      return true;
    } else {
      const events = operationsService.getEvents(filter);
      sendJson({ events });
      return true;
    }
  }

  // GET /api/v1/operations/trace/:taskId
  const opTraceMatch = pathname.match(/^\/api\/v1\/operations\/trace\/([^/]+)$/);
  if (req.method === "GET" && opTraceMatch) {
    const taskId = decodeURIComponent(opTraceMatch[1]);
    const trace = operationsService.getTaskTraceability(taskId);
    if (!trace) {
      sendJson({ error: `Traceability not found for task: ${taskId}` }, 404);
      return true;
    }
    sendJson({ trace });
    return true;
  }

  // GET /api/v1/operations/diff/:taskId
  const opDiffMatch = pathname.match(/^\/api\/v1\/operations\/diff\/([^/]+)$/);
  if (req.method === "GET" && opDiffMatch) {
    const taskId = decodeURIComponent(opDiffMatch[1]);
    operationsService
      .getTaskDiff(taskId)
      .then((diff) => sendJson({ taskId, diff }))
      .catch((err) => sendJson({ error: err.message }, 500));
    return true;
  }

  // POST /api/v1/operations/tasks/:taskId/pause
  const opPauseMatch = pathname.match(/^\/api\/v1\/operations\/tasks\/([^/]+)\/pause$/);
  if (req.method === "POST" && opPauseMatch) {
    const taskId = decodeURIComponent(opPauseMatch[1]);
    operationsService
      .pauseTask(taskId)
      .then((paused) => sendJson({ success: paused, taskId }))
      .catch((err) => sendJson({ error: err.message }, 500));
    return true;
  }

  // POST /api/v1/operations/tasks/:taskId/resume
  const opResumeMatch = pathname.match(/^\/api\/v1\/operations\/tasks\/([^/]+)\/resume$/);
  if (req.method === "POST" && opResumeMatch) {
    const taskId = decodeURIComponent(opResumeMatch[1]);
    operationsService
      .resumeTask(taskId)
      .then((resumed) => sendJson({ success: resumed, taskId }))
      .catch((err) => sendJson({ error: err.message }, 500));
    return true;
  }

  // POST /api/v1/operations/tasks/:taskId/retry
  const opRetryMatch = pathname.match(/^\/api\/v1\/operations\/tasks\/([^/]+)\/retry$/);
  if (req.method === "POST" && opRetryMatch) {
    const taskId = decodeURIComponent(opRetryMatch[1]);
    operationsService
      .retryTask(taskId)
      .then((task) => sendJson({ success: true, task }))
      .catch((err) => sendJson({ error: err.message }, 500));
    return true;
  }

  // POST /api/v1/operations/tasks/:taskId/approve
  const opApproveMatch = pathname.match(/^\/api\/v1\/operations\/tasks\/([^/]+)\/approve$/);
  if (req.method === "POST" && opApproveMatch) {
    const taskId = decodeURIComponent(opApproveMatch[1]);
    operationsService
      .approveIntegration(taskId)
      .then((outcome) => sendJson(outcome))
      .catch((err) => sendJson({ error: err.message }, 500));
    return true;
  }

  // POST /api/v1/operations/tasks/:taskId/cancel
  const opCancelMatch = pathname.match(/^\/api\/v1\/operations\/tasks\/([^/]+)\/cancel$/);
  if (req.method === "POST" && opCancelMatch) {
    const taskId = decodeURIComponent(opCancelMatch[1]);
    readJsonBody<{ reason?: string }>()
      .then(async (body) => {
        const cancelled = await operationsService.cancelTask(taskId, body.reason || "Manual cancellation by owner");
        sendJson({ success: cancelled, taskId });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase 3F Extension: Issue Intelligence & Bug Tracking Routes
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/v1/issues
  if (req.method === "GET" && pathname === "/api/v1/issues") {
    const filter: IssueFilter = {
      status: (url.searchParams.get("status") as any) || undefined,
      severity: (url.searchParams.get("severity") as any) || undefined,
      category: (url.searchParams.get("category") as any) || undefined,
      assignedRole: (url.searchParams.get("assignedRole") as any) || undefined,
      taskId: url.searchParams.get("taskId") || undefined,
      search: url.searchParams.get("search") || undefined,
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined,
    };
    const issues = issueService.listIssues(filter);
    sendJson({ issues });
    return true;
  }

  // GET /api/v1/issues/stats
  if (req.method === "GET" && pathname === "/api/v1/issues/stats") {
    const stats = issueService.getIssueStats();
    sendJson({ stats });
    return true;
  }

  // GET /api/v1/issues/stream (SSE)
  if (req.method === "GET" && pathname === "/api/v1/issues/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("data: " + JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }) + "\n\n");

    const unsubscribe = issueService.subscribe((issue) => {
      try {
        res.write("data: " + JSON.stringify({ type: "issue_updated", issue }) + "\n\n");
      } catch {
        // stream closed
      }
    });

    req.on("close", () => {
      unsubscribe();
    });
    return true;
  }

  // POST /api/v1/issues/capture
  if (req.method === "POST" && pathname === "/api/v1/issues/capture") {
    readJsonBody<IssueCaptureInput>()
      .then((body) => {
        if (!body.category || !body.errorMessage) {
          sendJson({ error: "Missing required fields: category and errorMessage" }, 400);
          return;
        }
        const issue = issueService.captureIssue(body);
        sendJson({ success: true, issue });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // GET /api/v1/issues/:id
  const issueGetMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)$/);
  if (req.method === "GET" && issueGetMatch) {
    const issueId = decodeURIComponent(issueGetMatch[1]);
    const issue = issueService.getIssue(issueId);
    if (!issue) {
      sendJson({ error: `Issue not found: '${issueId}'` }, 404);
      return true;
    }
    sendJson({ issue });
    return true;
  }

  // POST /api/v1/issues/:id/assign
  const issueAssignMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)\/assign$/);
  if (req.method === "POST" && issueAssignMatch) {
    const issueId = decodeURIComponent(issueAssignMatch[1]);
    readJsonBody<{ agent: string; role?: SpecializedAgentRole }>()
      .then((body) => {
        if (!body.agent) {
          sendJson({ error: "Missing required field: agent" }, 400);
          return;
        }
        const issue = issueService.assignAgent(issueId, body.agent, body.role);
        sendJson({ success: true, issue });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // POST /api/v1/issues/:id/status
  const issueStatusMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)\/status$/);
  if (req.method === "POST" && issueStatusMatch) {
    const issueId = decodeURIComponent(issueStatusMatch[1]);
    readJsonBody<{ status: IssueStatus; notes?: string }>()
      .then((body) => {
        if (!body.status) {
          sendJson({ error: "Missing required field: status" }, 400);
          return;
        }
        const issue = issueService.updateStatus(issueId, body.status, body.notes);
        sendJson({ success: true, issue });
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // POST /api/v1/issues/:id/resolve
  const issueResolveMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)\/resolve$/);
  if (req.method === "POST" && issueResolveMatch) {
    const issueId = decodeURIComponent(issueResolveMatch[1]);
    readJsonBody<ResolveIssueOptions>()
      .then(async (body) => {
        try {
          const resolvedIssue = await issueEngine.resolveIssue(issueId, body);
          sendJson({ success: true, issue: resolvedIssue });
        } catch (resolveErr) {
          sendJson({ error: resolveErr instanceof Error ? resolveErr.message : String(resolveErr) }, 500);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // POST /api/v1/issues/:id/approve
  const issueApproveMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)\/approve$/);
  if (req.method === "POST" && issueApproveMatch) {
    const issueId = decodeURIComponent(issueApproveMatch[1]);
    readJsonBody<{ targetBranch?: string }>()
      .then(async (body) => {
        try {
          const outcome = await issueEngine.approveFix(issueId, body);
          sendJson(outcome);
        } catch (approveErr) {
          sendJson({ error: approveErr instanceof Error ? approveErr.message : String(approveErr) }, 500);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // POST /api/v1/issues/:id/reject
  const issueRejectMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)\/reject$/);
  if (req.method === "POST" && issueRejectMatch) {
    const issueId = decodeURIComponent(issueRejectMatch[1]);
    readJsonBody<{ reason?: string }>()
      .then(async (body) => {
        try {
          const issue = await issueEngine.rejectFix(issueId, body?.reason);
          sendJson({ success: true, issue });
        } catch (rejectErr) {
          sendJson({ error: rejectErr instanceof Error ? rejectErr.message : String(rejectErr) }, 500);
        }
      })
      .catch((err) => sendJson({ error: err.message }, 400));
    return true;
  }

  // Unknown route
  sendJson({ error: `Not found: ${req.method} ${pathname}` }, 404);
  return true;
}

export function createVioletApiServer(options?: ServerOptions): http.Server {
  const gateway = options?.gateway || globalModelGateway;
  const orchestrator = options?.orchestrator || globalMultiAgentOrchestrator;
  const gitManager = options?.gitManager || globalGitWorktreeManager;
  const operationsService = options?.operationsService || globalLiveOperationsService;
  const issueService = options?.issueService || globalIssueIntelligenceService;
  const issueEngine = options?.issueEngine || globalIssueResolutionEngine;

  return http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    const handled = handleVioletApiRequest(
      req,
      res,
      gateway,
      orchestrator,
      gitManager,
      operationsService,
      issueService,
      issueEngine
    );
    if (!handled) {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });
}

export function startVioletApiServer(options?: ServerOptions): Promise<http.Server> {
  const port = options?.port || 8766;
  const host = options?.host || "127.0.0.1";
  const server = createVioletApiServer(options);

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      resolve(server);
    });
    server.on("error", reject);
  });
}
