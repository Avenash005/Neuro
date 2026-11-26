"""Windows desktop thread attachment utility for background services and desktop agents."""

from __future__ import annotations

import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

_executor: ThreadPoolExecutor | None = None


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="violet-win32-desktop")
    return _executor


def _init_thread_desktop() -> None:
    """Ensure the current worker thread is attached to the interactive Windows 'default' desktop."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)  # Per-monitor DPI aware
        except Exception:
            pass

        import win32con
        import win32service

        desk = win32service.OpenDesktop("default", 0, False, win32con.GENERIC_ALL)
        desk.SetThreadDesktop()
    except Exception as exc:
        logger.debug(f"Could not attach thread to 'default' desktop: {exc}")


def run_in_desktop(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Execute a function inside a worker thread attached to the interactive 'default' desktop.

    On non-Windows platforms or in unit test mocks, executes func directly.
    """
    if sys.platform != "win32":
        return func(*args, **kwargs)

    def worker() -> T:
        _init_thread_desktop()
        return func(*args, **kwargs)

    executor = _get_executor()
    future = executor.submit(worker)
    return future.result()
