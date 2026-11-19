from __future__ import annotations

import io
import subprocess

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .audit import AuditWriter
from .config import Settings, load_settings
from .models.action import (
    ElementClickRequest,
    InputActionResult,
    KeyboardActionRequest,
    MouseActionRequest,
)
from .models.desktop import DesktopInfoResponse, ScreenshotRegionRequest
from .models.grounding import (
    PostActionVerificationRequest,
    VerificationResult,
    VisualGroundingResponse,
)
from .models.process import (
    LaunchAppRequest,
    LaunchAppResponse,
    ProcessListResponse,
    TerminateProcessRequest,
    TerminateProcessResponse,
)
from .models.ui_element import InspectWindowUIRequest, InspectWindowUIResponse
from .models.window import FocusWindowRequest, WindowInfo
from .security import bearer_dependency, resolve_approved_path
from .services.app_launcher import AppLauncherService
from .services.input_controller import InputControllerService
from .services.process_manager import ProcessManagerService
from .services.screen_capture import ScreenCaptureService
from .services.ui_automation import UIAutomationService
from .services.visual_grounding import VisualGroundingService
from .services.window_manager import WindowManagerService


class CreateTextFileRequest(BaseModel):
    path: str = Field(min_length=1, max_length=2048)
    content: str = Field(max_length=1_000_000)


class NamedCommandRequest(BaseModel):
    command_id: str = Field(pattern=r"^[A-Za-z0-9_]+$", max_length=80)


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="VIOLET Local Agent", version="0.2.0")
    audit = AuditWriter(settings.audit_path)
    require_auth = bearer_dependency(settings)

    screen_service = ScreenCaptureService()
    window_service = WindowManagerService()
    ui_service = UIAutomationService(window_manager=window_service)
    input_service = InputControllerService(
        screen_service=screen_service,
        window_service=window_service,
        ui_service=ui_service,
    )
    process_service = ProcessManagerService()
    launcher_service = AppLauncherService(allowed_roots=settings.allowed_roots)
    grounding_service = VisualGroundingService(
        screen_service=screen_service,
        window_service=window_service,
        ui_service=ui_service,
    )

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "violet-local-agent", "version": "0.2.0"}

    @app.get("/v1/capabilities")
    def capabilities(_authorized: bool = Depends(require_auth)):
        return {
            "device": "windows-local",
            "capabilities": [
                "files.list",
                "files.read_text",
                "files.create_text",
                "screen.capture",
                "commands.run_named",
                "desktop.info",
                "desktop.screenshot",
                "desktop.screenshot_region",
                "windows.list",
                "windows.focus",
                "ui.inspect",
                "input.mouse",
                "input.keyboard",
                "input.click_element",
                "processes.list",
                "processes.terminate",
                "applications.launch",
                "grounding.elements",
                "action.verify",
            ],
            "approved_root_count": len(settings.allowed_roots),
            "named_commands": sorted(settings.commands.keys()),
            "remote_pairing": False,
            "desktop_input": True,
            "browser_control": False,
        }

    # ── Desktop & Screen Endpoints ──────────────────────────────────────────

    @app.get("/v1/desktop/info", response_model=DesktopInfoResponse)
    def get_desktop_info(_authorized: bool = Depends(require_auth)):
        try:
            info = screen_service.get_desktop_info()
            audit.record("desktop.info", {"monitor_count": len(info.monitors)})
            return info
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not retrieve desktop info: {type(exc).__name__}: {str(exc)}") from exc

    @app.get("/v1/desktop/screenshot")
    def capture_desktop_screenshot(
        monitor: int = Query(default=1, ge=0, le=16),
        max_dimension: int = Query(default=1600, ge=100, le=3840),
        quality: int = Query(default=75, ge=10, le=100),
        _authorized: bool = Depends(require_auth),
    ):
        try:
            image_data, meta = screen_service.capture_screen(
                monitor_index=monitor,
                max_dimension=max_dimension,
                quality=quality,
            )
            audit.record("desktop.screenshot", {"monitor": monitor, "width": meta.width, "height": meta.height, "bytes": meta.byte_size})
            return Response(
                content=image_data,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "no-store",
                    "X-Capture-Width": str(meta.width),
                    "X-Capture-Height": str(meta.height),
                    "X-Capture-Timestamp": meta.timestamp,
                },
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Screen capture failed: {type(exc).__name__}: {str(exc)}") from exc

    @app.post("/v1/desktop/screenshot/region")
    def capture_desktop_region(
        region: ScreenshotRegionRequest,
        quality: int = Query(default=80, ge=10, le=100),
        _authorized: bool = Depends(require_auth),
    ):
        try:
            image_data, meta = screen_service.capture_region(region, quality=quality)
            audit.record(
                "desktop.screenshot_region",
                {"left": region.left, "top": region.top, "width": meta.width, "height": meta.height, "bytes": meta.byte_size},
            )
            return Response(
                content=image_data,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "no-store",
                    "X-Capture-Width": str(meta.width),
                    "X-Capture-Height": str(meta.height),
                    "X-Capture-Timestamp": meta.timestamp,
                },
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Region capture failed: {type(exc).__name__}: {str(exc)}") from exc

    # ── Window Discovery Endpoints ──────────────────────────────────────────

    @app.get("/v1/windows/list")
    def list_windows(
        include_minimized: bool = Query(default=True),
        _authorized: bool = Depends(require_auth),
    ):
        try:
            windows = window_service.list_windows(include_minimized=include_minimized)
            audit.record("windows.list", {"window_count": len(windows)})
            return {"windows": windows, "count": len(windows)}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to enumerate windows: {type(exc).__name__}: {str(exc)}") from exc

    @app.post("/v1/windows/focus")
    def focus_window(
        body: FocusWindowRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            success, target, message = window_service.focus_window(body)
            audit.record("windows.focus", {"success": success, "handle": body.handle, "title": body.title, "message": message})
            if not success:
                raise HTTPException(status_code=404 if not target else 500, detail=message)
            return {
                "success": True,
                "window": target,
                "message": message,
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to focus window: {type(exc).__name__}: {str(exc)}") from exc

    # ── UI Automation Endpoints ─────────────────────────────────────────────

    @app.post("/v1/ui/inspect", response_model=InspectWindowUIResponse)
    def inspect_ui(
        body: InspectWindowUIRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            result = ui_service.inspect_window_ui(body)
            audit.record("ui.inspect", {"window_title": result.window_title, "element_count": result.element_count})
            return result
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to inspect UI: {type(exc).__name__}: {str(exc)}") from exc

    # ── Controlled Input Endpoints ──────────────────────────────────────────

    @app.post("/v1/input/mouse", response_model=InputActionResult)
    def mouse_action(
        body: MouseActionRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            result = input_service.execute_mouse_action(body)
            audit.record("input.mouse", {"action": body.action, "success": result.success})
            return result
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Mouse action failed: {type(exc).__name__}: {str(exc)}") from exc

    @app.post("/v1/input/keyboard", response_model=InputActionResult)
    def keyboard_action(
        body: KeyboardActionRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            result = input_service.execute_keyboard_action(body)
            audit.record("input.keyboard", {"action": body.action, "success": result.success})
            return result
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Keyboard action failed: {type(exc).__name__}: {str(exc)}") from exc

    @app.post("/v1/input/click-element", response_model=InputActionResult)
    def click_element_action(
        body: ElementClickRequest,
        _authorized: bool = Depends(require_auth),
    ):
        result = input_service.click_element(body)
        audit.record("input.click_element", {"success": result.success, "details": result.details})
        return result

    # ── Process & Application Management Endpoints ──────────────────────────

    @app.get("/v1/processes/list", response_model=ProcessListResponse)
    def list_processes_endpoint(
        limit: int = Query(default=100, ge=1, le=500),
        filter_name: str | None = Query(default=None),
        _authorized: bool = Depends(require_auth),
    ):
        result = process_service.list_processes(limit=limit, filter_name=filter_name)
        audit.record("processes.list", {"count": result.count, "filter": filter_name})
        return result

    @app.post("/v1/applications/launch", response_model=LaunchAppResponse)
    def launch_application_endpoint(
        body: LaunchAppRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            result = launcher_service.launch(body)
            audit.record("applications.launch", {"app_name": body.app_name, "success": result.success, "pid": result.pid})
            return result
        except ValueError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to launch application: {type(exc).__name__}: {str(exc)}") from exc

    @app.post("/v1/processes/terminate", response_model=TerminateProcessResponse)
    def terminate_process_endpoint(
        body: TerminateProcessRequest,
        _authorized: bool = Depends(require_auth),
    ):
        result = process_service.terminate_process(pid=body.pid, force=body.force)
        audit.record("processes.terminate", {"pid": body.pid, "force": body.force, "success": result.success})
        if not result.success:
            if "does not exist" in result.message:
                raise HTTPException(status_code=404, detail=result.message)
            if "Refusing to terminate" in result.message:
                raise HTTPException(status_code=403, detail=result.message)
        return result

    # ── Visual Grounding & Post-Action Verification ─────────────────────────

    @app.post("/v1/grounding/elements", response_model=VisualGroundingResponse)
    def ground_elements(
        body: InspectWindowUIRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            result = grounding_service.ground_window_elements(body)
            audit.record("grounding.elements", {"window": result.window_title, "count": result.element_count})
            return result
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Visual grounding failed: {type(exc).__name__}: {str(exc)}") from exc

    @app.post("/v1/verification/verify", response_model=VerificationResult)
    def verify_action(
        body: PostActionVerificationRequest,
        _authorized: bool = Depends(require_auth),
    ):
        try:
            result = grounding_service.verify_action_outcome(body)
            audit.record("action.verify", {"action": body.action_type, "verified": result.verified})
            return result
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Action verification failed: {type(exc).__name__}: {str(exc)}") from exc

    # ── Legacy / File Endpoints ─────────────────────────────────────────────

    @app.get("/v1/files/list")
    def list_files(path: str, _authorized: bool = Depends(require_auth)):
        folder = resolve_approved_path(path, settings)
        if not folder.exists() or not folder.is_dir():
            raise HTTPException(status_code=404, detail="Directory not found")
        entries = []
        try:
            for item in sorted(folder.iterdir(), key=lambda p: (not p.is_dir(), p.name.casefold())):
                entries.append({
                    "name": item.name,
                    "path": str(item),
                    "kind": "directory" if item.is_dir() else "file",
                })
                if len(entries) >= 500:
                    break
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not list directory: {type(exc).__name__}") from exc
        audit.record("files.list", {"path": str(folder), "count": len(entries)})
        return {"items": entries}

    @app.get("/v1/files/read-text")
    def read_text_file(path: str, _authorized: bool = Depends(require_auth)):
        target = resolve_approved_path(path, settings)
        if not target.exists() or not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        if target.stat().st_size > settings.max_read_bytes:
            raise HTTPException(status_code=413, detail="File exceeds configured text-read limit")
        try:
            content = target.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=415, detail="Only UTF-8 text files are supported by this endpoint") from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not read file: {type(exc).__name__}") from exc
        audit.record("files.read_text", {"path": str(target), "bytes": target.stat().st_size})
        return {"path": str(target), "content": content}

    @app.post("/v1/files/create-text")
    def create_text_file(body: CreateTextFileRequest, _authorized: bool = Depends(require_auth)):
        target = resolve_approved_path(body.path, settings)
        encoded = body.content.encode("utf-8")
        if len(encoded) > settings.max_create_bytes:
            raise HTTPException(status_code=413, detail="Content exceeds configured create limit")
        if not target.parent.exists() or not target.parent.is_dir():
            raise HTTPException(status_code=400, detail="Parent directory must already exist")
        try:
            with target.open("x", encoding="utf-8", newline="") as stream:
                stream.write(body.content)
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail="Refusing to overwrite an existing file") from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not create file: {type(exc).__name__}") from exc
        audit.record("files.create_text", {"path": str(target), "bytes": len(encoded)})
        return {"created": True, "path": str(target)}

    @app.get("/v1/screen")
    def capture_screen(_authorized: bool = Depends(require_auth)):
        try:
            from PIL import Image
            import mss
            with mss.mss() as capture:
                monitor = capture.monitors[1]
                frame = capture.grab(monitor)
                image = Image.frombytes("RGB", frame.size, frame.rgb)
                image.thumbnail((1600, 1000))
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=75, optimize=True)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Screen capture unavailable: {type(exc).__name__}") from exc
        audit.record("screen.capture", {"width": image.width, "height": image.height})
        return Response(output.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.post("/v1/commands/run")
    def run_named_command(body: NamedCommandRequest, _authorized: bool = Depends(require_auth)):
        spec = settings.commands.get(body.command_id)
        if spec is None:
            raise HTTPException(status_code=403, detail="Command ID is not allowlisted")
        working_directory = settings.allowed_roots[spec.root_index]
        try:
            result = subprocess.run(
                [spec.executable, *spec.args],
                cwd=str(working_directory),
                shell=False,
                capture_output=True,
                text=True,
                timeout=settings.command_timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            audit.record("commands.timeout", {"command_id": body.command_id})
            raise HTTPException(status_code=408, detail="Named command timed out") from exc
        except OSError as exc:
            audit.record("commands.error", {"command_id": body.command_id, "error": type(exc).__name__})
            raise HTTPException(status_code=500, detail="Could not start named command") from exc
        stdout = result.stdout[-settings.command_output_bytes:]
        stderr = result.stderr[-settings.command_output_bytes:]
        audit.record("commands.run", {"command_id": body.command_id, "returncode": result.returncode})
        return {
            "command_id": body.command_id,
            "returncode": result.returncode,
            "stdout": stdout,
            "stderr": stderr,
        }

    return app


def run() -> None:
    import uvicorn
    settings = load_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, reload=False, access_log=False)


if __name__ == "__main__":
    run()
