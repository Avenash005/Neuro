"""Action models for mouse, keyboard, and UI element interaction."""

from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, Field


class MouseActionRequest(BaseModel):
    action: Literal["move", "click", "double_click", "right_click", "middle_click", "scroll", "drag"] = "click"
    x: int | None = None
    y: int | None = None
    target_x: int | None = None
    target_y: int | None = None
    button: Literal["left", "middle", "right"] = "left"
    clicks: int = Field(default=1, ge=1, le=10)
    scroll_amount: int = 0
    smooth: bool = True
    require_in_bounds: bool = True


class KeyboardActionRequest(BaseModel):
    action: Literal["type", "press", "hotkey"] = "type"
    text: str | None = None
    key: str | None = None
    keys: list[str] = Field(default_factory=list)
    interval_ms: int = Field(default=15, ge=0, le=1000)


class ElementClickRequest(BaseModel):
    window_handle: int | None = None
    process_id: int | None = None
    automation_id: str | None = None
    element_name: str | None = None
    control_type: str | None = None
    click_type: Literal["left", "double", "right"] = "left"


class InputActionResult(BaseModel):
    success: bool
    action_type: str
    details: dict[str, Any] = Field(default_factory=dict)
    executed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error: str | None = None
