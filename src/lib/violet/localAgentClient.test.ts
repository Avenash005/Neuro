import { describe, expect, it, vi } from "vitest";
import { VioletLocalAgentClient } from "./localAgentClient";

describe("VioletLocalAgentClient", () => {
  it("probes health endpoint successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", version: "0.1.0", service: "violet-local-agent" }),
    });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const health = await client.health();
    expect(health.online).toBe(true);
    expect(health.version).toBe("0.1.0");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("handles health check network failures gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const health = await client.health();
    expect(health.online).toBe(false);
    expect(health.error).toContain("Connection refused");
  });

  it("sends authorization bearer token for file listing and operations", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ name: "doc.txt", path: "C:/doc.txt", kind: "file" }] }),
    });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      token: "secret-token-12345",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const items = await client.listFiles("C:/Projects");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("doc.txt");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("http://127.0.0.1:8765/v1/files/list?path=C%3A%2FProjects"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token-12345",
        }),
      })
    );
  });

  it("executes named command and returns stdout and returncode", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        command_id: "python_version",
        returncode: 0,
        stdout: "Python 3.14.0",
        stderr: "",
      }),
    });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      token: "test-token",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await client.runNamedCommand("python_version");
    expect(result.command_id).toBe("python_version");
    expect(result.returncode).toBe(0);
    expect(result.stdout).toBe("Python 3.14.0");
  });
});
