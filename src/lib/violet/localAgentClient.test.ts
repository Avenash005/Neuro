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

  it("retrieves desktop info and monitor metadata", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        monitors: [{ index: 1, left: 0, top: 0, width: 1920, height: 1080, is_primary: true }],
        primary_monitor: { index: 1, left: 0, top: 0, width: 1920, height: 1080, is_primary: true },
        virtual_screen_bounds: { left: 0, top: 0, width: 1920, height: 1080 },
        timestamp: "2026-11-19T00:00:00Z",
      }),
    });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      token: "test-token",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const info = await client.getDesktopInfo();
    expect(info.monitors).toHaveLength(1);
    expect(info.primary_monitor.width).toBe(1920);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/v1/desktop/info",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("captures region screenshot and parses headers", async () => {
    const fakeBlob = new Blob(["jpeg_bytes"], { type: "image/jpeg" });
    const mockHeaders = new Headers({
      "X-Capture-Width": "400",
      "X-Capture-Height": "300",
      "X-Capture-Timestamp": "2026-11-19T00:00:00Z",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: mockHeaders,
      blob: async () => fakeBlob,
    });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      token: "test-token",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const res = await client.captureRegion({ left: 100, top: 100, width: 400, height: 300 });
    expect(res.mimeType).toBe("image/jpeg");
    expect(res.width).toBe(400);
    expect(res.height).toBe(300);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/v1/desktop/screenshot/region",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ left: 100, top: 100, width: 400, height: 300 }),
      })
    );
  });

  it("lists open windows and focuses a target window", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          windows: [
            {
              handle: 1234,
              title: "Notepad",
              process_id: 5678,
              process_name: "notepad.exe",
              bounds: { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 },
              is_minimized: false,
              is_maximized: false,
              is_active: false,
            },
          ],
          count: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: "Focused window",
          window: { handle: 1234, title: "Notepad" },
        }),
      });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      token: "test-token",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const list = await client.listWindows();
    expect(list.count).toBe(1);
    expect(list.windows[0].title).toBe("Notepad");

    const focus = await client.focusWindow({ title: "Notepad" });
    expect(focus.success).toBe(true);
    expect(focus.message).toBe("Focused window");
  });

  it("inspects window accessibility UI elements", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        window_title: "Notepad",
        handle: 1234,
        process_id: 5678,
        element_count: 2,
        elements: [
          {
            element_id: "el_0_menu",
            name: "File",
            control_type: "MenuItem",
            class_name: "MenuItem",
            automation_id: "menu_file",
            bounds: { left: 10, top: 10, width: 40, height: 20, right: 50, bottom: 30 },
            enabled: true,
            visible: true,
            children_count: 0,
            source: "uia",
          },
          {
            element_id: "el_1_edit",
            name: "Text Editor",
            control_type: "Edit",
            class_name: "Edit",
            automation_id: "editor_01",
            bounds: { left: 10, top: 40, width: 780, height: 500, right: 790, bottom: 540 },
            enabled: true,
            visible: true,
            children_count: 0,
            source: "uia",
          },
        ],
      }),
    });

    const client = new VioletLocalAgentClient({
      baseUrl: "http://127.0.0.1:8765",
      token: "test-token",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const ui = await client.inspectWindowUI({ title: "Notepad" });
    expect(ui.element_count).toBe(2);
    expect(ui.elements[0].name).toBe("File");
    expect(ui.elements[1].control_type).toBe("Edit");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/v1/ui/inspect",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Notepad" }),
      })
    );
  });
});
