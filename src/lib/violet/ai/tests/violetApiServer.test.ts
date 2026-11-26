import { beforeEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type http from "node:http";
import { CircuitBreaker } from "../circuitBreaker";
import { ModelGateway } from "../modelGateway";
import { ProviderRegistry } from "../providerRegistry";
import { handleVioletApiRequest } from "../../../../server/violetApiServer";
import type { IProviderAdapter, ModelDefinition, ProviderAdapterConfig } from "../types";

class MockRequest extends EventEmitter {
  url: string;
  method: string;
  headers: Record<string, string>;

  constructor(method: string, url: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: "127.0.0.1:8766", ...headers };
  }
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

describe("handleVioletApiRequest", () => {
  let gateway: ModelGateway;
  let registry: ProviderRegistry;

  const mockModel: ModelDefinition = {
    id: "llama3",
    name: "Llama 3 Local",
    provider: "ollama",
    capabilities: {
      text: true,
      vision: false,
      tool_calling: true,
      structured_output: true,
      streaming: true,
      context_window: 8192,
      local_or_cloud: "local",
    },
    available: true,
  };

  beforeEach(() => {
    registry = new ProviderRegistry();
    const mockAdapter: IProviderAdapter = {
      provider: "ollama",
      isConfigured: true,
      circuitBreaker: new CircuitBreaker("ollama"),
      config: {} as ProviderAdapterConfig,
      listModels: async () => [mockModel],
      getModelInfo: async () => mockModel,
      chat: async () => ({
        request_id: "req_test",
        provider: "ollama",
        model: "llama3",
        content: "API test response",
        finish_reason: "stop",
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        latency_ms: 10,
        routing: {
          taskCategory: "general_chat",
          selectedReason: "test",
          policy: "AUTO",
          mode: "auto",
          fallbackUsed: false,
        },
      }),
      stream: async function* () {
        yield {
          request_id: "req_stream",
          provider: "ollama",
          model: "llama3",
          delta: "stream chunk",
          finish_reason: "stop",
        };
      },
      healthCheck: async () => ({
        provider: "ollama",
        healthy: true,
        configured: true,
        modelCount: 1,
        circuitBreakerStatus: "closed",
        lastChecked: new Date().toISOString(),
      }),
    };

    registry.registerAdapter("ollama", mockAdapter);
    gateway = new ModelGateway(registry);
  });

  it("handles GET /api/v1/health", async () => {
    const req = new MockRequest("GET", "/api/v1/health") as unknown as http.IncomingMessage;
    const res = new MockResponse() as unknown as http.ServerResponse;

    const handled = handleVioletApiRequest(req, res, gateway);
    expect(handled).toBe(true);

    const mockRes = res as unknown as MockResponse;
    const body = JSON.parse(mockRes.body);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("violet-ai-gateway");
  });

  it("handles GET /api/v1/models", async () => {
    const req = new MockRequest("GET", "/api/v1/models") as unknown as http.IncomingMessage;
    const res = new MockResponse() as unknown as http.ServerResponse;

    const mockRes = res as unknown as MockResponse;
    const donePromise = new Promise((resolve) => mockRes.on("finish", resolve));

    handleVioletApiRequest(req, res, gateway);
    await donePromise;

    const body = JSON.parse(mockRes.body);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].id).toBe("llama3");
  });

  it("handles POST /api/v1/chat", async () => {
    const req = new MockRequest("POST", "/api/v1/chat") as unknown as http.IncomingMessage;
    const res = new MockResponse() as unknown as http.ServerResponse;

    const mockRes = res as unknown as MockResponse;
    const donePromise = new Promise((resolve) => mockRes.on("finish", resolve));

    handleVioletApiRequest(req, res, gateway);

    // Send payload
    req.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        })
      )
    );
    req.emit("end");

    await donePromise;

    const body = JSON.parse(mockRes.body);
    expect(body.content).toBe("API test response");
    expect(body.provider).toBe("ollama");
  });

  it("handles POST /api/v1/chat/stream with SSE headers", async () => {
    const req = new MockRequest("POST", "/api/v1/chat/stream") as unknown as http.IncomingMessage;
    const res = new MockResponse() as unknown as http.ServerResponse;

    const mockRes = res as unknown as MockResponse;
    const donePromise = new Promise((resolve) => mockRes.on("finish", resolve));

    handleVioletApiRequest(req, res, gateway);

    req.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          messages: [{ role: "user", content: "stream please" }],
        })
      )
    );
    req.emit("end");

    await donePromise;

    expect(mockRes.headers["content-type"]).toBe("text/event-stream");
    expect(mockRes.body).toContain("data: ");
    expect(mockRes.body).toContain("[DONE]");
  });

  it("returns false for non-/api/v1 paths", () => {
    const req = new MockRequest("GET", "/index.html") as unknown as http.IncomingMessage;
    const res = new MockResponse() as unknown as http.ServerResponse;

    const handled = handleVioletApiRequest(req, res, gateway);
    expect(handled).toBe(false);
  });
});
