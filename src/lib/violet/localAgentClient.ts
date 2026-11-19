export interface LocalFileEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
}

export interface LocalAgentCapabilities {
  device: string;
  capabilities: string[];
  approved_root_count: number;
  named_commands: string[];
  remote_pairing: boolean;
  desktop_input: boolean;
  browser_control: boolean;
}

export interface CommandExecutionResult {
  command_id: string;
  returncode: number;
  stdout: string;
  stderr: string;
}

export interface ScreenCaptureResult {
  mimeType: string;
  blobUrl?: string;
  byteLength: number;
}

export class VioletLocalAgentClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: { baseUrl?: string; token?: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = (options?.baseUrl || "http://127.0.0.1:8765").replace(/\/+$/, "");
    this.token = options?.token || "";
    this.fetchImpl = options?.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : (undefined as unknown as typeof fetch));
  }

  private getHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  async health(): Promise<{ online: boolean; version?: string; error?: string }> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return { online: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }
      const data = (await res.json()) as { status: string; version: string; service: string };
      return { online: data.status === "ok", version: data.version };
    } catch (err) {
      return {
        online: false,
        error: err instanceof Error ? err.message : "Failed to connect to local agent",
      };
    }
  }

  async getCapabilities(): Promise<LocalAgentCapabilities> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/capabilities`, {
      method: "GET",
      headers: this.getHeaders("application/json"),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Local agent capabilities error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<LocalAgentCapabilities>;
  }

  async listFiles(path: string): Promise<LocalFileEntry[]> {
    const params = new URLSearchParams({ path });
    const res = await this.fetchImpl(`${this.baseUrl}/v1/files/list?${params.toString()}`, {
      method: "GET",
      headers: this.getHeaders("application/json"),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent listFiles error (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { items: LocalFileEntry[] };
    return data.items;
  }

  async readTextFile(path: string): Promise<string> {
    const params = new URLSearchParams({ path });
    const res = await this.fetchImpl(`${this.baseUrl}/v1/files/read-text?${params.toString()}`, {
      method: "GET",
      headers: this.getHeaders("application/json"),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent readTextFile error (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { path: string; content: string };
    return data.content;
  }

  async createTextFile(path: string, content: string): Promise<{ created: boolean; path: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/files/create-text`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify({ path, content }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Local agent createTextFile error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<{ created: boolean; path: string }>;
  }

  async captureScreen(): Promise<ScreenCaptureResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/screen`, {
      method: "GET",
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent captureScreen error (${res.status}): ${await res.text()}`);
    }
    const blob = await res.blob();
    const blobUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : undefined;
    return {
      mimeType: "image/jpeg",
      blobUrl,
      byteLength: blob.size,
    };
  }

  async runNamedCommand(commandId: string): Promise<CommandExecutionResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/commands/run`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify({ command_id: commandId }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`Local agent command error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<CommandExecutionResult>;
  }
}
