from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class UIElementBounds(BaseModel):
    left: int
    top: int
    width: int
    height: int
    right: int
    bottom: int


class UIElement(BaseModel):
    element_id: str
    name: str = ""
    control_type: str = "Unknown"
    class_name: str = ""
    automation_id: str = ""
    bounds: Optional[UIElementBounds] = None
    enabled: bool = True
    visible: bool = True
    children_count: int = 0
    source: str = "uia"


class InspectWindowUIRequest(BaseModel):
    handle: Optional[int] = Field(default=None, description="Window handle (HWND)")
    title: Optional[str] = Field(default=None, max_length=256, description="Window title substring")
    max_depth: int = Field(default=4, ge=1, le=10, description="Max depth of accessibility tree traversal")
    max_elements: int = Field(default=100, ge=1, le=500, description="Max number of UI elements to return")


class InspectWindowUIResponse(BaseModel):
    window_title: str
    handle: int
    process_id: int
    element_count: int
    elements: List[UIElement]
