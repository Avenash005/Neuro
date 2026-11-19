"""Process and application models for Windows process management."""

from typing import List, Optional
from pydantic import BaseModel, Field


class ProcessEntry(BaseModel):
    pid: int
    name: str
    exe: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_mb: Optional[float] = None
    status: str = "running"
    create_time: str
    username: Optional[str] = None


class ProcessListResponse(BaseModel):
    processes: List[ProcessEntry]
    count: int


class LaunchAppRequest(BaseModel):
    app_name: str = Field(..., min_length=1, max_length=100, description="Approved application name or binary name")
    args: List[str] = Field(default_factory=list, description="Command-line arguments")
    working_dir: Optional[str] = Field(default=None, description="Working directory path")


class LaunchAppResponse(BaseModel):
    success: bool
    pid: Optional[int] = None
    app_name: str
    executable: str
    message: str


class TerminateProcessRequest(BaseModel):
    pid: int = Field(..., gt=0, description="Process ID to terminate")
    force: bool = Field(default=False, description="Whether to forcibly kill the process")
    reason: Optional[str] = Field(default=None, description="Reason for termination")


class TerminateProcessResponse(BaseModel):
    success: bool
    pid: int
    message: str
