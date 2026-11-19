"""Controlled mouse and keyboard input service for Windows automation."""

import logging
import time
from datetime import datetime, timezone
from typing import Any
import pyautogui

from ..models.action import (
    ElementClickRequest,
    InputActionResult,
    KeyboardActionRequest,
    MouseActionRequest,
)
from ..models.ui_element import InspectWindowUIRequest
from .screen_capture import ScreenCaptureService
from .ui_automation import UIAutomationService
from .window_manager import WindowManagerService

logger = logging.getLogger(__name__)

# Disable PyAutoGUI's (0,0) corner exception for background services.
# Emergency stop is managed by EmergencyStopService.
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.05


class InputControllerService:
    def __init__(
        self,
        screen_service: ScreenCaptureService | None = None,
        window_service: WindowManagerService | None = None,
        ui_service: UIAutomationService | None = None,
    ):
        self._screen_service = screen_service or ScreenCaptureService()
        self._window_service = window_service or WindowManagerService()
        self._ui_service = ui_service or UIAutomationService()

    def validate_coordinates(self, x: int | None, y: int | None) -> tuple[int, int]:
        """Validate coordinates against virtual desktop bounds."""
        if x is None or y is None:
            curr_x, curr_y = pyautogui.position()
            return int(curr_x), int(curr_y)

        desktop = self._screen_service.get_desktop_info()
        vs = desktop.virtual_screen_bounds
        min_x = vs.get("left", 0)
        max_x = min_x + vs.get("width", 1920)
        min_y = vs.get("top", 0)
        max_y = min_y + vs.get("height", 1080)

        if not (min_x <= x <= max_x and min_y <= y <= max_y):
            raise ValueError(
                f"Coordinates ({x}, {y}) out of virtual screen bounds: "
                f"X=[{min_x}, {max_x}], Y=[{min_y}, {max_y}]"
            )
        return x, y

    def execute_mouse_action(self, req: MouseActionRequest) -> InputActionResult:
        """Execute a validated mouse action."""
        target_x, target_y = None, None
        if req.require_in_bounds:
            target_x, target_y = self.validate_coordinates(req.x, req.y)
        else:
            target_x = req.x if req.x is not None else pyautogui.position()[0]
            target_y = req.y if req.y is not None else pyautogui.position()[1]

        duration = 0.15 if req.smooth else 0.0

        details: dict[str, Any] = {
            "action": req.action,
            "x": target_x,
            "y": target_y,
            "button": req.button,
        }

        try:
            if req.action == "move":
                pyautogui.moveTo(target_x, target_y, duration=duration)
            elif req.action == "click":
                pyautogui.click(target_x, target_y, clicks=req.clicks, button=req.button)
                details["clicks"] = req.clicks
            elif req.action == "double_click":
                pyautogui.doubleClick(target_x, target_y, button=req.button)
            elif req.action == "right_click":
                pyautogui.rightClick(target_x, target_y)
            elif req.action == "middle_click":
                pyautogui.middleClick(target_x, target_y)
            elif req.action == "scroll":
                pyautogui.scroll(req.scroll_amount, x=target_x, y=target_y)
                details["scroll_amount"] = req.scroll_amount
            elif req.action == "drag":
                if req.target_x is None or req.target_y is None:
                    raise ValueError("drag action requires target_x and target_y")
                tx, ty = self.validate_coordinates(req.target_x, req.target_y)
                pyautogui.moveTo(target_x, target_y)
                pyautogui.dragTo(tx, ty, duration=0.25, button=req.button)
                details["drag_to"] = {"x": tx, "y": ty}
            else:
                raise ValueError(f"Unsupported mouse action: {req.action}")

            current_pos = pyautogui.position()
            details["final_position"] = {"x": current_pos[0], "y": current_pos[1]}

            return InputActionResult(
                success=True,
                action_type=f"mouse_{req.action}",
                details=details,
                executed_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as exc:
            logger.error(f"Mouse action failed: {exc}", exc_info=True)
            return InputActionResult(
                success=False,
                action_type=f"mouse_{req.action}",
                details={"error_detail": str(exc)},
                executed_at=datetime.now(timezone.utc).isoformat(),
                error=str(exc),
            )

    def execute_keyboard_action(self, req: KeyboardActionRequest) -> InputActionResult:
        """Execute a keyboard typing, key press, or hotkey combination."""
        if req.action == "type":
            if not req.text:
                raise ValueError("Text must be provided for type action")
            if len(req.text) > 5000:
                raise ValueError("Text payload exceeds maximum limit of 5000 characters")
        elif req.action == "press":
            if not req.key:
                raise ValueError("Key must be provided for press action")
        elif req.action == "hotkey":
            if not req.keys:
                raise ValueError("Keys list cannot be empty for hotkey action")

        try:
            details: dict[str, Any] = {"action": req.action}

            if req.action == "type":
                interval_sec = req.interval_ms / 1000.0
                try:
                    pyautogui.write(req.text, interval=interval_sec)
                except UnicodeEncodeError:
                    import pyperclip
                    pyperclip.copy(req.text)
                    pyautogui.hotkey("ctrl", "v")
                details["text_length"] = len(req.text)

            elif req.action == "press":
                key_lower = req.key.strip().lower()
                pyautogui.press(key_lower)
                details["key"] = key_lower

            elif req.action == "hotkey":
                cleaned_keys = [k.strip().lower() for k in req.keys]
                pyautogui.hotkey(*cleaned_keys)
                details["keys"] = cleaned_keys

            else:
                raise ValueError(f"Unsupported keyboard action: {req.action}")

            return InputActionResult(
                success=True,
                action_type=f"keyboard_{req.action}",
                details=details,
                executed_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as exc:
            logger.error(f"Keyboard action failed: {exc}", exc_info=True)
            return InputActionResult(
                success=False,
                action_type=f"keyboard_{req.action}",
                details={"error_detail": str(exc)},
                executed_at=datetime.now(timezone.utc).isoformat(),
                error=str(exc),
            )

    def click_element(self, req: ElementClickRequest) -> InputActionResult:
        """Locate an accessible UI element, focus its window, and click its center."""
        try:
            # 1. Focus target window if handle given
            if req.window_handle:
                from ..models.window import FocusWindowRequest
                self._window_service.focus_window(FocusWindowRequest(handle=req.window_handle))
                time.sleep(0.1)

            # 2. Inspect UI tree of window
            inspect_req = InspectWindowUIRequest(
                handle=req.window_handle,
                max_depth=4,
                max_elements=100,
            )
            inspect_resp = self._ui_service.inspect_window_ui(inspect_req)

            # 3. Match element
            matched = None
            for elem in inspect_resp.elements:
                if req.automation_id and elem.automation_id == req.automation_id:
                    matched = elem
                    break
                if req.element_name and elem.name and req.element_name.lower() in elem.name.lower():
                    if req.control_type:
                        if elem.control_type and req.control_type.lower() == elem.control_type.lower():
                            matched = elem
                            break
                    else:
                        matched = elem
                        break

            if not matched:
                return InputActionResult(
                    success=False,
                    action_type="click_element",
                    details={"searched": req.model_dump()},
                    executed_at=datetime.now(timezone.utc).isoformat(),
                    error=f"Element matching criteria not found in window {inspect_resp.window_title}",
                )

            # 4. Calculate center coordinates
            bounds = matched.bounds
            center_x = (bounds.left + bounds.right) // 2
            center_y = (bounds.top + bounds.bottom) // 2

            # 5. Click center coordinates
            mouse_req = MouseActionRequest(
                action="double_click" if req.click_type == "double" else ("right_click" if req.click_type == "right" else "click"),
                x=center_x,
                y=center_y,
                button="right" if req.click_type == "right" else "left",
                smooth=True,
            )
            mouse_result = self.execute_mouse_action(mouse_req)

            return InputActionResult(
                success=mouse_result.success,
                action_type="click_element",
                details={
                    "element": matched.model_dump(),
                    "clicked_at": {"x": center_x, "y": center_y},
                    "click_type": req.click_type,
                    "mouse_result": mouse_result.details,
                },
                executed_at=datetime.now(timezone.utc).isoformat(),
                error=mouse_result.error,
            )
        except Exception as exc:
            logger.error(f"Click element failed: {exc}", exc_info=True)
            return InputActionResult(
                success=False,
                action_type="click_element",
                details={"error_detail": str(exc)},
                executed_at=datetime.now(timezone.utc).isoformat(),
                error=str(exc),
            )
