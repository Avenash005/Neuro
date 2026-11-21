from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class MonitorInfo(BaseModel):
    index: int
    left: int
    top: int
    width: int
    height: int
    is_primary: bool = False


class DesktopInfoResponse(BaseModel):
    monitors: List[MonitorInfo]
    primary_monitor: MonitorInfo
    virtual_screen_bounds: dict[str, int]
    timestamp: str


class ScreenshotRegionRequest(BaseModel):
    left: int = Field(..., description="Left coordinate in virtual screen space")
    top: int = Field(..., description="Top coordinate in virtual screen space")
    width: int = Field(..., gt=0, le=7680, description="Width of region in pixels")
    height: int = Field(..., gt=0, le=4320, description="Height of region in pixels")
    max_dimension: Optional[int] = Field(default=1600, gt=100, le=3840, description="Max dimension for thumbnail scaling")


class ScreenshotMetadata(BaseModel):
    timestamp: str
    width: int
    height: int
    format: str = "jpeg"
    byte_size: int
