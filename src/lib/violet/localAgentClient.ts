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
  width?: number;
  height?: number;
  timestamp?: string;
}

export interface MonitorInfoEntry {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  is_primary: boolean;
}

export interface DesktopInfoResponse {
  monitors: MonitorInfoEntry[];
  primary_monitor: MonitorInfoEntry;
  virtual_screen_bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  timestamp: string;
}

export interface WindowBoundsEntry {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface WindowInfoEntry {
  handle: number;
  title: string;
  process_id: number;
  process_name: string;
  bounds: WindowBoundsEntry;
  is_minimized: boolean;
  is_maximized: boolean;
  is_active: boolean;
}

export interface FocusWindowResponse {
  success: boolean;
  window?: WindowInfoEntry;
  message: string;
}

export interface UIElementBoundsEntry {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface UIElementEntry {
  element_id: string;
  name: string;
  control_type: string;
  class_name: string;
  automation_id: string;
  bounds?: UIElementBoundsEntry | null;
  enabled: boolean;
  visible: boolean;
  children_count: number;
  source: string;
}

export interface InspectWindowUIResponse {
  window_title: string;
  handle: number;
  process_id: number;
  element_count: number;
  elements: UIElementEntry[];
}

export interface MouseActionRequest {
  action: "move" | "click" | "double_click" | "right_click" | "middle_click" | "scroll" | "drag";
  x?: number;
  y?: number;
  target_x?: number;
  target_y?: number;
  button?: "left" | "middle" | "right";
  clicks?: number;
  scroll_amount?: number;
  smooth?: boolean;
  require_in_bounds?: boolean;
}

export interface KeyboardActionRequest {
  action: "type" | "press" | "hotkey";
  text?: string;
  key?: string;
  keys?: string[];
  interval_ms?: number;
}

export interface ElementClickRequest {
  window_handle?: number;
  process_id?: number;
  automation_id?: string;
  element_name?: string;
  control_type?: string;
  click_type?: "left" | "double" | "right";
}

export interface InputActionResult {
  success: boolean;
  action_type: string;
  details: Record<string, unknown>;
  executed_at: string;
  error?: string | null;
}

export interface ProcessEntry {
  pid: number;
  name: string;
  exe?: string | null;
  cpu_percent?: number | null;
  memory_mb?: number | null;
  status: string;
  create_time: string;
  username?: string | null;
}

export interface ProcessListResponse {
  processes: ProcessEntry[];
  count: number;
}

export interface LaunchAppRequest {
  app_name: string;
  args?: string[];
  working_dir?: string;
}

export interface LaunchAppResponse {
  success: boolean;
  pid?: number | null;
  app_name: string;
  executable: string;
  message: string;
}

export interface TerminateProcessRequest {
  pid: number;
  force?: boolean;
  reason?: string;
}

export interface TerminateProcessResponse {
  success: boolean;
  pid: number;
  message: string;
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

  async getDesktopInfo(): Promise<DesktopInfoResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/desktop/info`, {
      method: "GET",
      headers: this.getHeaders("application/json"),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Local agent desktopInfo error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<DesktopInfoResponse>;
  }

  async captureScreen(options?: {
    monitor?: number;
    maxDimension?: number;
    quality?: number;
  }): Promise<ScreenCaptureResult> {
    const params = new URLSearchParams();
    if (options?.monitor !== undefined) params.set("monitor", String(options.monitor));
    if (options?.maxDimension !== undefined) params.set("max_dimension", String(options.maxDimension));
    if (options?.quality !== undefined) params.set("quality", String(options.quality));

    const url = `${this.baseUrl}/v1/desktop/screenshot${params.toString() ? "?" + params.toString() : ""}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`Local agent captureScreen error (${res.status}): ${await res.text()}`);
    }

    const width = parseInt(res.headers.get("X-Capture-Width") || "0", 10) || undefined;
    const height = parseInt(res.headers.get("X-Capture-Height") || "0", 10) || undefined;
    const timestamp = res.headers.get("X-Capture-Timestamp") || undefined;

    const blob = await res.blob();
    const blobUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : undefined;

    return {
      mimeType: "image/jpeg",
      blobUrl,
      byteLength: blob.size,
      width,
      height,
      timestamp,
    };
  }

  async captureRegion(region: {
    left: number;
    top: number;
    width: number;
    height: number;
    maxDimension?: number;
    quality?: number;
  }): Promise<ScreenCaptureResult> {
    const params = new URLSearchParams();
    if (region.quality !== undefined) params.set("quality", String(region.quality));

    const url = `${this.baseUrl}/v1/desktop/screenshot/region${params.toString() ? "?" + params.toString() : ""}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify({
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
        max_dimension: region.maxDimension,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`Local agent captureRegion error (${res.status}): ${await res.text()}`);
    }

    const width = parseInt(res.headers.get("X-Capture-Width") || "0", 10) || undefined;
    const height = parseInt(res.headers.get("X-Capture-Height") || "0", 10) || undefined;
    const timestamp = res.headers.get("X-Capture-Timestamp") || undefined;

    const blob = await res.blob();
    const blobUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : undefined;

    return {
      mimeType: "image/jpeg",
      blobUrl,
      byteLength: blob.size,
      width,
      height,
      timestamp,
    };
  }

  async listWindows(options?: { includeMinimized?: boolean }): Promise<{ windows: WindowInfoEntry[]; count: number }> {
    const params = new URLSearchParams();
    if (options?.includeMinimized !== undefined) {
      params.set("include_minimized", String(options.includeMinimized));
    }
    const url = `${this.baseUrl}/v1/windows/list${params.toString() ? "?" + params.toString() : ""}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.getHeaders("application/json"),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent listWindows error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<{ windows: WindowInfoEntry[]; count: number }>;
  }

  async focusWindow(request: {
    handle?: number;
    title?: string;
    process_name?: string;
  }): Promise<FocusWindowResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/windows/focus`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent focusWindow error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<FocusWindowResponse>;
  }

  async inspectWindowUI(request?: {
    handle?: number;
    title?: string;
    max_depth?: number;
    max_elements?: number;
  }): Promise<InspectWindowUIResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/ui/inspect`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request || {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Local agent inspectWindowUI error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<InspectWindowUIResponse>;
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

  async executeMouseAction(request: MouseActionRequest): Promise<InputActionResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/input/mouse`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent mouseAction error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<InputActionResult>;
  }

  async executeKeyboardAction(request: KeyboardActionRequest): Promise<InputActionResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/input/keyboard`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent keyboardAction error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<InputActionResult>;
  }

  async clickElement(request: ElementClickRequest): Promise<InputActionResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/input/click-element`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Local agent clickElement error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<InputActionResult>;
  }

  async listProcesses(options?: {
    limit?: number;
    filter_name?: string;
  }): Promise<ProcessListResponse> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.filter_name !== undefined) params.set("filter_name", options.filter_name);

    const url = `${this.baseUrl}/v1/processes/list${params.toString() ? "?" + params.toString() : ""}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.getHeaders("application/json"),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent listProcesses error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<ProcessListResponse>;
  }

  async launchApp(request: LaunchAppRequest): Promise<LaunchAppResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/applications/launch`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Local agent launchApp error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<LaunchAppResponse>;
  }

  async terminateProcess(request: TerminateProcessRequest): Promise<TerminateProcessResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/processes/terminate`, {
      method: "POST",
      headers: this.getHeaders("application/json"),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Local agent terminateProcess error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<TerminateProcessResponse>;
  }
}
