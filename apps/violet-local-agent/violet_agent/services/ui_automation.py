from __future__ import annotations

import sys
from typing import List, Optional

from ..models.ui_element import (
    InspectWindowUIRequest,
    InspectWindowUIResponse,
    UIElement,
    UIElementBounds,
)
from .window_manager import WindowManagerService

try:
    import pywinauto
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False


class UIAutomationService:
    def __init__(self, window_manager: Optional[WindowManagerService] = None):
        self.window_manager = window_manager or WindowManagerService()

    def inspect_window_ui(self, request: InspectWindowUIRequest) -> InspectWindowUIResponse:
        target = None
        if request.handle or request.title:
            from ..models.window import FocusWindowRequest
            target = self.window_manager.find_window(
                FocusWindowRequest(handle=request.handle, title=request.title)
            )

        if not target:
            # Fall back to foreground window
            windows = self.window_manager.list_windows()
            active_windows = [w for w in windows if w.is_active]
            target = active_windows[0] if active_windows else (windows[0] if windows else None)

        if not target:
            return self._mock_inspect("Desktop Workspace", 0, 0)

        if not HAS_PYWINAUTO or sys.platform != "win32":
            return self._mock_inspect(target.title, target.handle, target.process_id)

        try:
            app = pywinauto.Application(backend="uia").connect(handle=target.handle, timeout=2.0)
            window_wrapper = app.window(handle=target.handle)
            elements: List[UIElement] = []

            raw_elements = window_wrapper.descendants()
            for idx, item in enumerate(raw_elements):
                if len(elements) >= request.max_elements:
                    break
                try:
                    name = item.element_info.name or ""
                    control_type = item.element_info.control_type or "Unknown"
                    class_name = item.element_info.class_name or ""
                    automation_id = item.element_info.automation_id or ""

                    rect = None
                    try:
                        r = item.rectangle()
                        rect = UIElementBounds(
                            left=r.left,
                            top=r.top,
                            width=r.width(),
                            height=r.height(),
                            right=r.right,
                            bottom=r.bottom,
                        )
                    except Exception:
                        pass

                    enabled = True
                    try:
                        enabled = item.is_enabled()
                    except Exception:
                        pass

                    visible = True
                    try:
                        visible = item.is_visible()
                    except Exception:
                        pass

                    children_count = 0
                    try:
                        children_count = len(item.children())
                    except Exception:
                        pass

                    elements.append(
                        UIElement(
                            element_id=f"el_{idx}_{control_type.lower()}",
                            name=name,
                            control_type=control_type,
                            class_name=class_name,
                            automation_id=automation_id,
                            bounds=rect,
                            enabled=enabled,
                            visible=visible,
                            children_count=children_count,
                            source="uia",
                        )
                    )
                except Exception:
                    continue

            return InspectWindowUIResponse(
                window_title=target.title,
                handle=target.handle,
                process_id=target.process_id,
                element_count=len(elements),
                elements=elements,
            )
        except Exception:
            # Fall back to structured baseline elements if UIA backend encounters permission/access restriction
            return self._mock_inspect(target.title, target.handle, target.process_id)

    def _mock_inspect(self, title: str, handle: int, pid: int) -> InspectWindowUIResponse:
        mock_elements = [
            UIElement(
                element_id="el_0_window",
                name=title,
                control_type="Window",
                class_name="StandardWindow",
                bounds=UIElementBounds(left=100, top=100, width=800, height=600, right=900, bottom=700),
                enabled=True,
                visible=True,
                children_count=4,
                source="mock",
            ),
            UIElement(
                element_id="el_1_menu",
                name="File",
                control_type="MenuItem",
                class_name="MenuItem",
                bounds=UIElementBounds(left=110, top=130, width=40, height=20, right=150, bottom=150),
                enabled=True,
                visible=True,
                children_count=0,
                source="mock",
            ),
            UIElement(
                element_id="el_2_menu",
                name="Edit",
                control_type="MenuItem",
                class_name="MenuItem",
                bounds=UIElementBounds(left=155, top=130, width=40, height=20, right=195, bottom=150),
                enabled=True,
                visible=True,
                children_count=0,
                source="mock",
            ),
            UIElement(
                element_id="el_3_edit",
                name="Text Editor",
                control_type="Edit",
                class_name="Scintilla",
                bounds=UIElementBounds(left=110, top=160, width=780, height=520, right=890, bottom=680),
                enabled=True,
                visible=True,
                children_count=0,
                source="mock",
            ),
        ]
        return InspectWindowUIResponse(
            window_title=title,
            handle=handle,
            process_id=pid,
            element_count=len(mock_elements),
            elements=mock_elements,
        )
