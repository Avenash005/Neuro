from __future__ import annotations

import sys
from typing import List, Optional
import psutil

from ..models.window import FocusWindowRequest, WindowBounds, WindowInfo

try:
    import win32con
    import win32gui
    import win32process
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False


class WindowManagerService:
    def list_windows(self, include_minimized: bool = True) -> List[WindowInfo]:
        if not HAS_WIN32 or sys.platform != "win32":
            return self._mock_windows()

        windows: List[WindowInfo] = []
        foreground_hwnd = win32gui.GetForegroundWindow()

        def enum_callback(hwnd: int, _lparam: int):
            if not win32gui.IsWindowVisible(hwnd):
                return True

            title = win32gui.GetWindowText(hwnd).strip()
            if not title:
                return True

            rect = win32gui.GetWindowRect(hwnd)
            left, top, right, bottom = rect
            width = right - left
            height = bottom - top

            # Filter zero-sized or off-screen hidden overlays
            if width <= 0 or height <= 0:
                return True

            is_minimized = bool(win32gui.IsIconic(hwnd))
            if not include_minimized and is_minimized:
                return True

            is_maximized = False
            try:
                placement = win32gui.GetWindowPlacement(hwnd)
                is_maximized = placement[1] == win32con.SW_SHOWMAXIMIZED
            except Exception:
                pass

            pid = 0
            proc_name = "unknown"
            try:
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                if pid > 0:
                    proc = psutil.Process(pid)
                    proc_name = proc.name()
            except Exception:
                pass

            windows.append(
                WindowInfo(
                    handle=hwnd,
                    title=title,
                    process_id=pid,
                    process_name=proc_name,
                    bounds=WindowBounds(
                        left=left,
                        top=top,
                        width=width,
                        height=height,
                        right=right,
                        bottom=bottom,
                    ),
                    is_minimized=is_minimized,
                    is_maximized=is_maximized,
                    is_active=(hwnd == foreground_hwnd),
                )
            )
            return True

        win32gui.EnumWindows(enum_callback, 0)
        # Sort active first, then alphabetically by title
        windows.sort(key=lambda w: (not w.is_active, w.title.casefold()))
        return windows

    def find_window(self, request: FocusWindowRequest) -> Optional[WindowInfo]:
        windows = self.list_windows(include_minimized=True)

        if request.handle is not None:
            for w in windows:
                if w.handle == request.handle:
                    return w

        if request.title:
            target_title = request.title.casefold()
            for w in windows:
                if target_title in w.title.casefold():
                    return w

        if request.process_name:
            target_proc = request.process_name.casefold()
            for w in windows:
                if target_proc in w.process_name.casefold():
                    return w

        return None

    def focus_window(self, request: FocusWindowRequest) -> tuple[bool, Optional[WindowInfo], str]:
        target = self.find_window(request)
        if not target:
            return False, None, "Window not found matching criteria"

        if not HAS_WIN32 or sys.platform != "win32":
            return True, target, f"Focused mock window '{target.title}'"

        try:
            hwnd = target.handle
            if target.is_minimized:
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)

            # Bring to front
            win32gui.SetForegroundWindow(hwnd)
            return True, target, f"Successfully focused window '{target.title}' (HWND {hwnd})"
        except Exception as exc:
            return False, target, f"Failed to focus window: {type(exc).__name__}: {str(exc)}"

    def _mock_windows(self) -> List[WindowInfo]:
        return [
            WindowInfo(
                handle=1001,
                title="VIOLET AI - Personal AI OS",
                process_id=1234,
                process_name="violet.exe",
                bounds=WindowBounds(left=0, top=0, width=1920, height=1080, right=1920, bottom=1080),
                is_active=True,
            ),
            WindowInfo(
                handle=1002,
                title="Notepad",
                process_id=5678,
                process_name="notepad.exe",
                bounds=WindowBounds(left=100, top=100, width=800, height=600, right=900, bottom=700),
                is_active=False,
            ),
        ]
