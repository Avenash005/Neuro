import type {
  VioletToolContext,
  VioletToolManifest,
} from "../../types/violet";
import { VioletLocalAgentClient } from "./localAgentClient";
import { VioletToolRegistry } from "./toolRegistry";

export function createDefaultToolRegistry(options?: {
  localAgentClient?: VioletLocalAgentClient;
}): VioletToolRegistry {
  const registry = new VioletToolRegistry();
  const agentClient = options?.localAgentClient ?? new VioletLocalAgentClient();

  // 1. System Ping
  const pingManifest: VioletToolManifest = {
    name: "system.ping",
    version: "1.0.0",
    domain: "productivity",
    description: "Check system health and latency",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requiredScopes: [],
    risk: "read_only",
    platforms: ["windows", "web", "cloud"],
    timeoutMs: 3000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(pingManifest, async () => ({
    status: "succeeded",
    data: { pong: true, timestamp: new Date().toISOString() },
    evidence: [],
    summary: "System is responsive and operational",
    recoverable: false,
  }));

  // 2. Knowledge Search
  const searchManifest: VioletToolManifest = {
    name: "knowledge.search",
    version: "1.0.0",
    domain: "knowledge",
    description: "Search personal memories, notes, and documents in Neuro memory engine",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["knowledge:read"],
    risk: "read_only",
    platforms: ["web", "windows", "cloud"],
    timeoutMs: 8000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(searchManifest, async (args) => {
    const query = String(args.query || "").toLowerCase();
    if (!query.trim()) {
      return {
        status: "failed",
        summary: "Search query cannot be empty",
        recoverable: true,
        evidence: [],
      };
    }
    try {
      const { listLocalKnowledge } = await import("../localDb");
      const items = await listLocalKnowledge();
      const matched = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.summary && item.summary.toLowerCase().includes(query)) ||
          (item.extractedText && item.extractedText.toLowerCase().includes(query))
      );
      const limit = Number(args.limit) || 5;
      const results = matched.slice(0, limit);

      return {
        status: "succeeded",
        data: { items: results, count: results.length },
        evidence: results.map((r) => ({ type: "text" as const, reference: `knowledge:${r.id}` })),
        summary: `Found ${results.length} relevant items in personal knowledge base`,
        recoverable: false,
      };
    } catch {
      return {
        status: "succeeded",
        data: { items: [], count: 0 },
        evidence: [],
        summary: "Knowledge search completed with 0 results",
        recoverable: false,
      };
    }
  });

  // 3. Computer: Files List
  const listFilesManifest: VioletToolManifest = {
    name: "computer.files.list",
    version: "1.0.0",
    domain: "computer",
    description: "List directory contents in an approved local Windows workspace folder",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:files:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(listFilesManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const targetPath = String(args.path || "");
    try {
      const items = await client.listFiles(targetPath);
      return {
        status: "succeeded",
        data: { items, count: items.length },
        evidence: [{ type: "file", reference: targetPath }],
        summary: `Listed ${items.length} items in '${targetPath}'`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to list files",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 4. Computer: Files Read
  const readFileManifest: VioletToolManifest = {
    name: "computer.files.read",
    version: "1.0.0",
    domain: "computer",
    description: "Read UTF-8 text from an approved file on the local Windows PC",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:files:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(readFileManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const targetPath = String(args.path || "");
    try {
      const content = await client.readTextFile(targetPath);
      return {
        status: "succeeded",
        data: { path: targetPath, content, byteLength: content.length },
        evidence: [{ type: "file", reference: targetPath }],
        summary: `Read ${content.length} characters from '${targetPath}'`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to read file",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 5. Computer: Files Create
  const createFileManifest: VioletToolManifest = {
    name: "computer.files.create",
    version: "1.0.0",
    domain: "computer",
    description: "Create a new UTF-8 text file in an approved local Windows workspace (non-overwriting)",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:files:write"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 15000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(createFileManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const targetPath = String(args.path || "");
    const content = String(args.content || "");
    try {
      const result = await client.createTextFile(targetPath, content);
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "file", reference: targetPath }],
        summary: `Created file at '${targetPath}' (${content.length} characters)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to create file",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 6. Computer: Screen Capture
  const screenManifest: VioletToolManifest = {
    name: "computer.screen.capture",
    version: "1.0.0",
    domain: "computer",
    description: "Capture visible desktop screen snapshot from the Windows PC",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:screen:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 12000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(screenManifest, async (_args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.captureScreen();
      return {
        status: "succeeded",
        data: { mimeType: result.mimeType, byteLength: result.byteLength, blobUrl: result.blobUrl },
        evidence: [{ type: "screenshot", reference: result.blobUrl || "screenshot:desktop" }],
        summary: `Captured screen snapshot (${Math.round(result.byteLength / 1024)} KB)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Screen capture unavailable",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // 7. Computer: Run Named Command
  const runCommandManifest: VioletToolManifest = {
    name: "computer.commands.run",
    version: "1.0.0",
    domain: "computer",
    description: "Execute an allowlisted named command on the local Windows PC",
    inputSchema: {
      type: "object",
      properties: { command_id: { type: "string" } },
      required: ["command_id"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:command:run"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 30000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(runCommandManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    const commandId = String(args.command_id || "");
    try {
      const result = await client.runNamedCommand(commandId);
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "text", reference: `cmd:${commandId}` }],
        summary: `Executed command '${commandId}' with exit code ${result.returncode}`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to run command",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 8. Computer: Desktop Info ──────────────────────────────────────────
  const desktopInfoManifest: VioletToolManifest = {
    name: "computer.desktop.info",
    version: "1.0.0",
    domain: "computer",
    description: "Get Windows desktop display and monitor metrics",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:screen:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 5000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(desktopInfoManifest, async (_args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const info = await client.getDesktopInfo();
      return {
        status: "succeeded",
        data: info,
        evidence: [{ type: "text", reference: `monitors:${info.monitors.length}` }],
        summary: `Retrieved desktop info: ${info.monitors.length} monitor(s), primary ${info.primary_monitor.width}x${info.primary_monitor.height}`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to get desktop info",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 9. Computer: Desktop Region Screenshot ──────────────────────────────
  const screenshotRegionManifest: VioletToolManifest = {
    name: "computer.desktop.screenshot_region",
    version: "1.0.0",
    domain: "computer",
    description: "Capture a specific rectangular region of the Windows desktop",
    inputSchema: {
      type: "object",
      properties: {
        left: { type: "number" },
        top: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["left", "top", "width", "height"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:screen:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 12000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(screenshotRegionManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.captureRegion({
        left: Number(args.left) || 0,
        top: Number(args.top) || 0,
        width: Number(args.width) || 400,
        height: Number(args.height) || 300,
      });
      return {
        status: "succeeded",
        data: { mimeType: result.mimeType, byteLength: result.byteLength, blobUrl: result.blobUrl },
        evidence: [{ type: "screenshot", reference: result.blobUrl || "screenshot:region" }],
        summary: `Captured region (${args.left},${args.top}) ${args.width}x${args.height} (${Math.round(result.byteLength / 1024)} KB)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to capture region",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 10. Computer: Windows List ──────────────────────────────────────────
  const windowsListManifest: VioletToolManifest = {
    name: "computer.windows.list",
    version: "1.0.0",
    domain: "computer",
    description: "List all visible top-level application windows on the desktop",
    inputSchema: {
      type: "object",
      properties: { include_minimized: { type: "boolean" } },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:windows:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(windowsListManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.listWindows({
        includeMinimized: args.include_minimized !== false,
      });
      return {
        status: "succeeded",
        data: result,
        evidence: result.windows.slice(0, 5).map((w) => ({ type: "text" as const, reference: `hwnd:${w.handle}:${w.title}` })),
        summary: `Discovered ${result.count} open window(s) across running applications`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to list windows",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 11. Computer: Windows Focus ─────────────────────────────────────────
  const windowsFocusManifest: VioletToolManifest = {
    name: "computer.windows.focus",
    version: "1.0.0",
    domain: "computer",
    description: "Bring a specific application window to the foreground by title or handle",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "number" },
        title: { type: "string" },
        process_name: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:windows:write"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(windowsFocusManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.focusWindow({
        handle: args.handle !== undefined ? Number(args.handle) : undefined,
        title: args.title ? String(args.title) : undefined,
        process_name: args.process_name ? String(args.process_name) : undefined,
      });
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "text", reference: `focused:${result.window?.title || "window"}` }],
        summary: result.message,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to focus window",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 12. Computer: UI Inspect ────────────────────────────────────────────
  const uiInspectManifest: VioletToolManifest = {
    name: "computer.ui.inspect",
    version: "1.0.0",
    domain: "computer",
    description: "Inspect accessible UI Automation element tree of a window (buttons, text fields, menus)",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "number" },
        title: { type: "string" },
        max_depth: { type: "number" },
        max_elements: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:ui:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 15000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(uiInspectManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.inspectWindowUI({
        handle: args.handle !== undefined ? Number(args.handle) : undefined,
        title: args.title ? String(args.title) : undefined,
        max_depth: args.max_depth ? Number(args.max_depth) : undefined,
        max_elements: args.max_elements ? Number(args.max_elements) : undefined,
      });
      return {
        status: "succeeded",
        data: result,
        evidence: result.elements.slice(0, 5).map((el) => ({
          type: "text" as const,
          reference: `ui:${el.control_type}:${el.name || el.element_id}`,
        })),
        summary: `Inspected UI of '${result.window_title}': found ${result.element_count} accessible element(s)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to inspect window UI",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 13. Computer: Mouse Action ──────────────────────────────────────────
  const mouseManifest: VioletToolManifest = {
    name: "computer.mouse.action",
    version: "1.0.0",
    domain: "computer",
    description: "Perform mouse actions (move, click, double click, right click, scroll, drag)",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["move", "click", "double_click", "right_click", "middle_click", "scroll", "drag"],
        },
        x: { type: "number" },
        y: { type: "number" },
        target_x: { type: "number" },
        target_y: { type: "number" },
        button: { type: "string", enum: ["left", "middle", "right"] },
        clicks: { type: "number" },
        scroll_amount: { type: "number" },
        smooth: { type: "boolean" },
      },
      required: ["action"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:input:mouse"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(mouseManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.executeMouseAction({
        action: (args.action as any) || "click",
        x: args.x !== undefined ? Number(args.x) : undefined,
        y: args.y !== undefined ? Number(args.y) : undefined,
        target_x: args.target_x !== undefined ? Number(args.target_x) : undefined,
        target_y: args.target_y !== undefined ? Number(args.target_y) : undefined,
        button: args.button as any,
        clicks: args.clicks !== undefined ? Number(args.clicks) : undefined,
        scroll_amount: args.scroll_amount !== undefined ? Number(args.scroll_amount) : undefined,
        smooth: args.smooth !== undefined ? Boolean(args.smooth) : true,
      });
      return {
        status: result.success ? "succeeded" : "failed",
        data: result,
        evidence: [{ type: "text", reference: `mouse:${result.action_type}` }],
        summary: result.success
          ? `Executed mouse action: ${result.action_type}`
          : `Mouse action failed: ${result.error || "unknown"}`,
        recoverable: !result.success,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to execute mouse action",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 14. Computer: Keyboard Action ───────────────────────────────────────
  const keyboardManifest: VioletToolManifest = {
    name: "computer.keyboard.type",
    version: "1.0.0",
    domain: "computer",
    description: "Type text, press specific keys, or send key combinations (hotkeys)",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["type", "press", "hotkey"] },
        text: { type: "string" },
        key: { type: "string" },
        keys: { type: "array", items: { type: "string" } },
        interval_ms: { type: "number" },
      },
      required: ["action"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:input:keyboard"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(keyboardManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.executeKeyboardAction({
        action: (args.action as any) || "type",
        text: args.text ? String(args.text) : undefined,
        key: args.key ? String(args.key) : undefined,
        keys: Array.isArray(args.keys) ? args.keys.map(String) : [],
        interval_ms: args.interval_ms !== undefined ? Number(args.interval_ms) : undefined,
      });
      return {
        status: result.success ? "succeeded" : "failed",
        data: result,
        evidence: [{ type: "text", reference: `keyboard:${result.action_type}` }],
        summary: result.success
          ? `Executed keyboard action: ${result.action_type}`
          : `Keyboard action failed: ${result.error || "unknown"}`,
        recoverable: !result.success,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to execute keyboard action",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 15. Computer: Click UI Element ──────────────────────────────────────
  const clickElementManifest: VioletToolManifest = {
    name: "computer.ui.click_element",
    version: "1.0.0",
    domain: "computer",
    description: "Locate an accessible UI element, focus its parent window, and click its center",
    inputSchema: {
      type: "object",
      properties: {
        window_handle: { type: "number" },
        process_id: { type: "number" },
        automation_id: { type: "string" },
        element_name: { type: "string" },
        control_type: { type: "string" },
        click_type: { type: "string", enum: ["left", "double", "right"] },
      },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:input:mouse", "computer:ui:read"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 15000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(clickElementManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.clickElement({
        window_handle: args.window_handle !== undefined ? Number(args.window_handle) : undefined,
        process_id: args.process_id !== undefined ? Number(args.process_id) : undefined,
        automation_id: args.automation_id ? String(args.automation_id) : undefined,
        element_name: args.element_name ? String(args.element_name) : undefined,
        control_type: args.control_type ? String(args.control_type) : undefined,
        click_type: args.click_type as any,
      });
      return {
        status: result.success ? "succeeded" : "failed",
        data: result,
        evidence: [{ type: "text", reference: `ui_click:${result.action_type}` }],
        summary: result.success
          ? `Clicked element: ${args.element_name || args.automation_id || "target"}`
          : `Click element failed: ${result.error || "unknown"}`,
        recoverable: !result.success,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to click UI element",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 16. Computer: Processes List ────────────────────────────────────────
  const processListManifest: VioletToolManifest = {
    name: "computer.processes.list",
    version: "1.0.0",
    domain: "computer",
    description: "List active Windows processes with PID, memory, and status",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        filter_name: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:processes:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(processListManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.listProcesses({
        limit: args.limit !== undefined ? Number(args.limit) : undefined,
        filter_name: args.filter_name ? String(args.filter_name) : undefined,
      });
      return {
        status: "succeeded",
        data: result,
        evidence: result.processes.slice(0, 5).map((p) => ({
          type: "text" as const,
          reference: `process:${p.pid}:${p.name}`,
        })),
        summary: `Retrieved ${result.count} running process(es)`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to list processes",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 17. Computer: Applications Launch ───────────────────────────────────
  const launchAppManifest: VioletToolManifest = {
    name: "computer.applications.launch",
    version: "1.0.0",
    domain: "computer",
    description: "Launch an approved Windows application from the allowlist or workspace",
    inputSchema: {
      type: "object",
      properties: {
        app_name: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        working_dir: { type: "string" },
      },
      required: ["app_name"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:applications:launch"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 15000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(launchAppManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.launchApp({
        app_name: String(args.app_name),
        args: Array.isArray(args.args) ? args.args.map(String) : [],
        working_dir: args.working_dir ? String(args.working_dir) : undefined,
      });
      return {
        status: result.success ? "succeeded" : "failed",
        data: result,
        evidence: [{ type: "text", reference: `app_launch:${result.app_name}:${result.pid || "none"}` }],
        summary: result.message,
        recoverable: !result.success,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to launch application",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 18. Computer: Processes Terminate ───────────────────────────────────
  const terminateProcessManifest: VioletToolManifest = {
    name: "computer.processes.terminate",
    version: "1.0.0",
    domain: "computer",
    description: "Terminate a running Windows process by PID (requires explicit approval)",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number" },
        force: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["pid"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:processes:terminate"],
    risk: "destructive",
    platforms: ["windows"],
    timeoutMs: 10000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(terminateProcessManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.terminateProcess({
        pid: Number(args.pid),
        force: Boolean(args.force),
        reason: args.reason ? String(args.reason) : undefined,
      });
      return {
        status: result.success ? "succeeded" : "failed",
        data: result,
        evidence: [{ type: "text", reference: `process_terminate:${result.pid}` }],
        summary: result.message,
        recoverable: !result.success,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to terminate process",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 19. Computer: Grounding Elements ────────────────────────────────────
  const groundingManifest: VioletToolManifest = {
    name: "computer.grounding.elements",
    version: "1.0.0",
    domain: "computer",
    description: "Inspect window elements and normalize their bounding boxes into [0.0, 1.0] coordinate space",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "number" },
        title: { type: "string" },
        max_depth: { type: "number" },
        max_elements: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:ui:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 15000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(groundingManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.groundWindowElements({
        handle: args.handle !== undefined ? Number(args.handle) : undefined,
        title: args.title ? String(args.title) : undefined,
        max_depth: args.max_depth !== undefined ? Number(args.max_depth) : undefined,
        max_elements: args.max_elements !== undefined ? Number(args.max_elements) : undefined,
      });
      return {
        status: "succeeded",
        data: result,
        evidence: result.elements.slice(0, 5).map((el) => ({
          type: "text" as const,
          reference: `grounded:${el.control_type}:${el.name || el.element_id}@(${el.center_normalized.x},${el.center_normalized.y})`,
        })),
        summary: `Grounded ${result.element_count} UI element(s) in window '${result.window_title}'`,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to visually ground elements",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 20. Computer: Action Verify ─────────────────────────────────────────
  const actionVerifyManifest: VioletToolManifest = {
    name: "computer.action.verify",
    version: "1.0.0",
    domain: "computer",
    description: "Verify whether an automated desktop action achieved its intended outcome",
    inputSchema: {
      type: "object",
      properties: {
        action_type: { type: "string" },
        target_window_handle: { type: "number" },
        target_window_title: { type: "string" },
        conditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              check_type: { type: "string" },
              window_handle: { type: "number" },
              window_title: { type: "string" },
              expected_title: { type: "string" },
              expected_element_name: { type: "string" },
              expected_automation_id: { type: "string" },
              control_type: { type: "string" },
              max_depth: { type: "number" },
              max_elements: { type: "number" },
              timeout_seconds: { type: "number" },
            },
            required: ["check_type"],
          },
        },
        capture_screenshot_evidence: { type: "boolean" },
      },
      required: ["action_type", "conditions"],
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:windows:read"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 35000,
    supportsIdempotency: false,
    enabled: true,
  };
  registry.register(actionVerifyManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.verifyActionOutcome({
        action_type: String(args.action_type),
        target_window_handle: args.target_window_handle !== undefined ? Number(args.target_window_handle) : undefined,
        target_window_title: args.target_window_title ? String(args.target_window_title) : undefined,
        conditions: (args.conditions as any[]) || [],
        capture_screenshot_evidence: args.capture_screenshot_evidence !== undefined ? Boolean(args.capture_screenshot_evidence) : true,
      });
      return {
        status: result.verified ? "succeeded" : "failed",
        data: result,
        evidence: [{ type: "text", reference: `verification:${result.action_type}:${result.verified ? 'passed' : 'failed'}` }],
        summary: result.evidence_summary,
        recoverable: !result.verified,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to execute post-action verification",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 21. Computer: Emergency Stop Trigger ────────────────────────────────
  const stopTriggerManifest: VioletToolManifest = {
    name: "computer.emergency_stop.trigger",
    version: "1.0.0",
    domain: "computer",
    description: "Instantly halt desktop interaction, release all held inputs, and lock down automated actions",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:system:control"],
    risk: "read_only",
    platforms: ["windows"],
    timeoutMs: 5000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(stopTriggerManifest, async (args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.triggerEmergencyStop(args.reason ? String(args.reason) : undefined);
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "text", reference: `emergency_stop:triggered` }],
        summary: result.message,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to trigger emergency stop",
        recoverable: true,
        evidence: [],
      };
    }
  });

  // ── 22. Computer: Emergency Stop Resume ─────────────────────────────────
  const stopResumeManifest: VioletToolManifest = {
    name: "computer.emergency_stop.resume",
    version: "1.0.0",
    domain: "computer",
    description: "Clear emergency stop and restore normal desktop automation operation",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requiredScopes: ["computer:system:control"],
    risk: "reversible",
    platforms: ["windows"],
    timeoutMs: 5000,
    supportsIdempotency: true,
    enabled: true,
  };
  registry.register(stopResumeManifest, async (_args, context) => {
    const client = resolveAgentClient(agentClient, context);
    try {
      const result = await client.resumeEmergencyStop();
      return {
        status: "succeeded",
        data: result,
        evidence: [{ type: "text", reference: `emergency_stop:resumed` }],
        summary: result.message,
        recoverable: false,
      };
    } catch (err) {
      return {
        status: "failed",
        summary: err instanceof Error ? err.message : "Failed to resume from emergency stop",
        recoverable: true,
        evidence: [],
      };
    }
  });

  return registry;
}

function resolveAgentClient(
  fallback: VioletLocalAgentClient,
  context: VioletToolContext
): VioletLocalAgentClient {
  if (context.localAgentUrl || context.localAgentToken) {
    return new VioletLocalAgentClient({
      baseUrl: context.localAgentUrl,
      token: context.localAgentToken,
    });
  }
  return fallback;
}
