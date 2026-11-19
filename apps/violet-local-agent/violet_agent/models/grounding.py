"""Models for visual grounding (normalized coordinate space) and post-action verification."""

from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field


class GroundedElement(BaseModel):
    element_id: str
    name: str
    control_type: str
    automation_id: str
    pixel_bounds: dict[str, int]
    normalized_bounds: dict[str, float]
    center_pixel: dict[str, int]
    center_normalized: dict[str, float]
    enabled: bool
    visible: bool


class VisualGroundingResponse(BaseModel):
    window_title: str
    window_handle: int
    screen_width: int
    screen_height: int
    element_count: int
    elements: List[GroundedElement]
    timestamp: str


class VerificationCondition(BaseModel):
    check_type: Literal[
        "window_exists",
        "window_title_contains",
        "element_visible",
        "dialog_opened",
    ]
    expected_title: Optional[str] = None
    expected_element_name: Optional[str] = None
    expected_automation_id: Optional[str] = None
    timeout_seconds: float = Field(default=3.0, ge=0.1, le=30.0)


class PostActionVerificationRequest(BaseModel):
    action_type: str
    conditions: List[VerificationCondition]
    capture_screenshot_evidence: bool = True


class VerificationResult(BaseModel):
    verified: bool
    action_type: str
    condition_results: List[dict[str, Any]]
    evidence_summary: str
    verified_at: str
