"""Emergency stop service for fast cancellation and desktop input lockdown."""

import logging
import threading
from datetime import datetime, timezone
from typing import Optional
import pyautogui

logger = logging.getLogger(__name__)


class EmergencyStopService:
    def __init__(self):
        self._lock = threading.Lock()
        self._is_stopped = False
        self._triggered_at: Optional[str] = None
        self._reason: Optional[str] = None

    def is_active(self) -> bool:
        """Return True if emergency stop is currently active."""
        with self._lock:
            return self._is_stopped

    def trigger(self, reason: str = "Emergency stop initiated by user") -> dict[str, str | bool]:
        """Instantly halt desktop inputs, release held keys/mouse buttons, and lockdown operations."""
        with self._lock:
            self._is_stopped = True
            self._triggered_at = datetime.now(timezone.utc).isoformat()
            self._reason = reason

        logger.warning(f"EMERGENCY STOP TRIGGERED: {reason}")

        # Safety: Release any mouse buttons or modifier keys that might be held down
        try:
            for btn in ["left", "middle", "right"]:
                try:
                    pyautogui.mouseUp(button=btn)
                except Exception:
                    pass
            for key in ["ctrl", "alt", "shift", "win"]:
                try:
                    pyautogui.keyUp(key)
                except Exception:
                    pass
        except Exception as exc:
            logger.error(f"Error resetting input state during emergency stop: {exc}")

        return {
            "success": True,
            "is_stopped": True,
            "reason": reason,
            "triggered_at": self._triggered_at,
            "message": "Emergency stop successfully triggered. Desktop inputs locked.",
        }

    def resume(self) -> dict[str, str | bool]:
        """Resume normal desktop operation after emergency stop."""
        with self._lock:
            self._is_stopped = False
            self._triggered_at = None
            self._reason = None

        logger.info("Emergency stop resumed by user. Desktop inputs unlocked.")
        return {
            "success": True,
            "is_stopped": False,
            "message": "Emergency stop cleared. Desktop operations resumed.",
        }

    def get_status(self) -> dict[str, str | bool | None]:
        """Get current emergency stop status."""
        with self._lock:
            return {
                "is_stopped": self._is_stopped,
                "triggered_at": self._triggered_at,
                "reason": self._reason,
            }
