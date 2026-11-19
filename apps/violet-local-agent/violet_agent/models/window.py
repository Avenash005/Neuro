from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class WindowBounds(BaseModel):
    left: int
    top: int
    width: int
    height: int
    right: int
    bottom: int


class WindowInfo(BaseModel):
    handle: int
    title: str
    process_id: int
    process_name: str
    bounds: WindowBounds
    is_minimized: bool = False
    is_maximized: bool = False
    is_active: bool = False


class FocusWindowRequest(BaseModel):
    handle: Optional[int] = Field(default=None, description="Window handle (HWND)")
    title: Optional[str] = Field(default=None, max_length=256, description="Substring or exact window title")
    process_name: Optional[str] = Field(default=None, max_length=128, description="Process executable name")
