"""Visual grounding and post-action verification service."""

import logging
import time
from datetime import datetime, timezone
from typing import Any, List, Optional

from ..models.grounding import (
    GroundedElement,
    PostActionVerificationRequest,
    VerificationCondition,
    VerificationResult,
    VisualGroundingResponse,
)
from ..models.ui_element import InspectWindowUIRequest
from .screen_capture import ScreenCaptureService
from .ui_automation import UIAutomationService
from .window_manager import WindowManagerService

logger = logging.getLogger(__name__)


class VisualGroundingService:
    def __init__(
        self,
        screen_service: Optional[ScreenCaptureService] = None,
        window_service: Optional[WindowManagerService] = None,
        ui_service: Optional[UIAutomationService] = None,
    ):
        self.screen_service = screen_service or ScreenCaptureService()
        self.window_service = window_service or WindowManagerService()
        self.ui_service = ui_service or UIAutomationService()

    def ground_window_elements(
        self,
        request: InspectWindowUIRequest,
    ) -> VisualGroundingResponse:
        """Inspect window elements and normalize their bounding boxes into [0.0, 1.0] coordinate space."""
        desktop = self.screen_service.get_desktop_info()
        vs = desktop.virtual_screen_bounds
        vs_left = vs.get("left", 0)
        vs_top = vs.get("top", 0)
        vs_width = max(1, vs.get("width", 1920))
        vs_height = max(1, vs.get("height", 1080))

        ui_resp = self.ui_service.inspect_window_ui(request)
        grounded: List[GroundedElement] = []

        for el in ui_resp.elements:
            bounds = el.bounds
            if bounds:
                p_left = bounds.left
                p_top = bounds.top
                p_right = bounds.right
                p_bottom = bounds.bottom
                p_width = bounds.width
                p_height = bounds.height
            else:
                p_left = p_top = p_right = p_bottom = p_width = p_height = 0

            center_px = (p_left + p_right) // 2
            center_py = (p_top + p_bottom) // 2

            norm_left = round(max(0.0, min(1.0, (p_left - vs_left) / vs_width)), 4)
            norm_top = round(max(0.0, min(1.0, (p_top - vs_top) / vs_height)), 4)
            norm_right = round(max(0.0, min(1.0, (p_right - vs_left) / vs_width)), 4)
            norm_bottom = round(max(0.0, min(1.0, (p_bottom - vs_top) / vs_height)), 4)
            norm_width = round(max(0.0, min(1.0, p_width / vs_width)), 4)
            norm_height = round(max(0.0, min(1.0, p_height / vs_height)), 4)

            center_nx = round(max(0.0, min(1.0, (center_px - vs_left) / vs_width)), 4)
            center_ny = round(max(0.0, min(1.0, (center_py - vs_top) / vs_height)), 4)

            grounded.append(
                GroundedElement(
                    element_id=el.element_id,
                    name=el.name,
                    control_type=el.control_type,
                    automation_id=el.automation_id,
                    pixel_bounds={
                        "left": p_left,
                        "top": p_top,
                        "right": p_right,
                        "bottom": p_bottom,
                        "width": p_width,
                        "height": p_height,
                    },
                    normalized_bounds={
                        "left": norm_left,
                        "top": norm_top,
                        "right": norm_right,
                        "bottom": norm_bottom,
                        "width": norm_width,
                        "height": norm_height,
                    },
                    center_pixel={"x": center_px, "y": center_py},
                    center_normalized={"x": center_nx, "y": center_ny},
                    enabled=el.enabled,
                    visible=el.visible,
                )
            )

        return VisualGroundingResponse(
            window_title=ui_resp.window_title,
            window_handle=ui_resp.handle,
            screen_width=vs_width,
            screen_height=vs_height,
            element_count=len(grounded),
            elements=grounded,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def verify_action_outcome(
        self,
        request: PostActionVerificationRequest,
    ) -> VerificationResult:
        """Verify whether an action achieved its intended visual/state outcome."""
        condition_results: List[dict[str, Any]] = []

        for cond in request.conditions:
            cond_res = self._check_condition(
                cond,
                target_handle=request.target_window_handle,
                target_title=request.target_window_title,
            )
            condition_results.append(cond_res)

        all_verified = all(c.get("passed", False) for c in condition_results)
        passed_count = sum(1 for c in condition_results if c.get("passed", False))
        total_count = len(condition_results)

        summary = (
            f"Action '{request.action_type}' verification {'SUCCEEDED' if all_verified else 'FAILED'}: "
            f"{passed_count}/{total_count} conditions satisfied."
        )

        screenshot_evidence = None
        if request.capture_screenshot_evidence:
            try:
                img_bytes, meta = self.screen_service.capture_screen(max_dimension=1200, quality=70)
                from pathlib import Path
                evidence_dir = Path("data/evidence").resolve()
                evidence_dir.mkdir(parents=True, exist_ok=True)
                safe_action = request.action_type.replace(" ", "_").replace("/", "_")
                ts_slug = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
                evidence_file = evidence_dir / f"evidence_{safe_action}_{ts_slug}.jpg"
                evidence_file.write_bytes(img_bytes)

                screenshot_evidence = {
                    "captured": True,
                    "timestamp": meta.timestamp,
                    "width": meta.width,
                    "height": meta.height,
                    "byte_size": meta.byte_size,
                    "format": meta.format,
                    "file_path": str(evidence_file),
                    "file_uri": evidence_file.as_uri(),
                }
            except Exception as exc:
                logger.debug(f"Could not capture screenshot evidence: {exc}")
                screenshot_evidence = {
                    "captured": False,
                    "error": str(exc),
                }

        return VerificationResult(
            verified=all_verified,
            action_type=request.action_type,
            condition_results=condition_results,
            screenshot_evidence=screenshot_evidence,
            evidence_summary=summary,
            verified_at=datetime.now(timezone.utc).isoformat(),
        )

    def _check_condition(
        self,
        cond: VerificationCondition,
        target_handle: Optional[int] = None,
        target_title: Optional[str] = None,
    ) -> dict[str, Any]:
        """Check a single verification condition."""
        start_time = time.time()
        timeout = cond.timeout_seconds

        resolved_handle = cond.window_handle or target_handle
        resolved_title = cond.window_title or cond.expected_title or target_title

        while time.time() - start_time <= timeout:
            if cond.check_type == "window_exists":
                windows = self.window_service.list_windows()
                if not windows:
                    if not resolved_title or resolved_title.lower() in ["desktop", "desktop workspace", "workspace"]:
                        return {
                            "check_type": cond.check_type,
                            "passed": True,
                            "message": "Desktop workspace confirmed present (headless/fallback)",
                        }
                if resolved_title:
                    found = any(resolved_title.lower() in w.title.lower() for w in windows)
                elif resolved_handle:
                    found = any(w.handle == resolved_handle for w in windows)
                else:
                    found = len(windows) > 0

                if found:
                    return {
                        "check_type": cond.check_type,
                        "passed": True,
                        "message": f"Window matching '{resolved_title or resolved_handle or 'any'}' was confirmed present",
                    }

            elif cond.check_type == "window_title_contains":
                windows = self.window_service.list_windows()
                if resolved_handle:
                    matching = [w for w in windows if w.handle == resolved_handle]
                    current_title = matching[0].title if matching else ""
                else:
                    active = [w for w in windows if w.is_active]
                    current_title = active[0].title if active else (windows[0].title if windows else "")

                expected = cond.expected_title or cond.window_title or ""
                if expected and expected.lower() in current_title.lower():
                    return {
                        "check_type": cond.check_type,
                        "passed": True,
                        "message": f"Window title '{current_title}' contains '{expected}'",
                    }

            elif cond.check_type == "element_visible":
                inspect_req = InspectWindowUIRequest(
                    handle=resolved_handle,
                    title=resolved_title if not resolved_handle else None,
                    max_depth=cond.max_depth or 8,
                    max_elements=cond.max_elements or 250,
                )
                ui_res = self.ui_service.inspect_window_ui(inspect_req)
                found = False

                for el in ui_res.elements:
                    matches = True
                    if cond.expected_automation_id:
                        if el.automation_id != cond.expected_automation_id:
                            matches = False
                    if cond.expected_element_name:
                        if not el.name or cond.expected_element_name.lower() not in el.name.lower():
                            matches = False
                    if cond.control_type:
                        if not el.control_type or cond.control_type.lower() != el.control_type.lower():
                            matches = False

                    if matches and el.visible:
                        found = True
                        break

                if found:
                    target_desc = cond.expected_element_name or cond.expected_automation_id or cond.control_type or "element"
                    return {
                        "check_type": cond.check_type,
                        "passed": True,
                        "message": f"Element '{target_desc}' is confirmed visible in window '{ui_res.window_title}'",
                    }

            elif cond.check_type == "dialog_opened":
                windows = self.window_service.list_windows()
                dialogs = [
                    w for w in windows
                    if "#32770" in (getattr(w, "class_name", "") or "") or "dialog" in w.title.lower()
                ]
                if dialogs:
                    return {
                        "check_type": cond.check_type,
                        "passed": True,
                        "message": f"Dialog confirmed open: '{dialogs[0].title}'",
                    }

            time.sleep(0.2)

        return {
            "check_type": cond.check_type,
            "passed": False,
            "message": f"Condition '{cond.check_type}' timed out after {cond.timeout_seconds}s without satisfying criteria",
        }
