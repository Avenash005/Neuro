"""Application launcher service with allowlist validation."""

import logging
import os
from pathlib import Path
import shutil
import subprocess
from typing import Sequence
from ..models.process import LaunchAppRequest, LaunchAppResponse

logger = logging.getLogger(__name__)

# Default approved desktop applications allowlist
APPROVED_APPLICATIONS: dict[str, str] = {
    "notepad": "notepad.exe",
    "calc": "calc.exe",
    "calculator": "calc.exe",
    "explorer": "explorer.exe",
    "mspaint": "mspaint.exe",
    "paint": "mspaint.exe",
    "cmd": "cmd.exe",
    "powershell": "powershell.exe",
    "wt": "wt.exe",
    "terminal": "wt.exe",
    "code": "code.cmd",
    "chrome": "chrome.exe",
    "msedge": "msedge.exe",
    "blender": "blender.exe",
}


class AppLauncherService:
    def __init__(self, allowed_roots: Sequence[Path] | None = None):
        self.allowed_roots = tuple(allowed_roots or ())

    def resolve_executable(self, app_name: str) -> tuple[str, bool]:
        """
        Resolve application name to an executable path.
        Returns (executable_path_or_name, is_approved).
        """
        app_clean = app_name.strip().lower()

        # 1. Check alias allowlist
        if app_clean in APPROVED_APPLICATIONS:
            target_exe = APPROVED_APPLICATIONS[app_clean]
            resolved = shutil.which(target_exe)
            return resolved or target_exe, True

        # 2. Check if name directly matches an approved binary in PATH
        for approved_alias, approved_exe in APPROVED_APPLICATIONS.items():
            if app_clean == approved_exe.lower() or app_clean == approved_alias:
                resolved = shutil.which(approved_exe)
                return resolved or approved_exe, True

        # 3. Check if app_name is an executable path inside one of the allowed_roots
        candidate_path = Path(app_name).resolve()
        if candidate_path.is_file() and candidate_path.suffix.lower() in [".exe", ".cmd", ".bat"]:
            for root in self.allowed_roots:
                try:
                    candidate_path.relative_to(root)
                    return str(candidate_path), True
                except ValueError:
                    continue

        return app_name, False

    def launch(
        self,
        request: LaunchAppRequest,
    ) -> LaunchAppResponse:
        """Launch an approved application with validated arguments."""
        executable, is_approved = self.resolve_executable(request.app_name)

        if not is_approved:
            raise ValueError(
                f"Application '{request.app_name}' is not in the approved application allowlist "
                f"or approved workspace roots"
            )

        # Validate arguments to prevent injection
        for arg in request.args:
            if len(arg) > 500:
                raise ValueError("Command argument exceeds maximum length of 500 characters")
            if "\n" in arg or "\r" in arg:
                raise ValueError("Command argument contains illegal newline characters")

        working_dir = None
        if request.working_dir:
            wd_path = Path(request.working_dir).resolve()
            if self.allowed_roots:
                in_root = False
                for root in self.allowed_roots:
                    try:
                        wd_path.relative_to(root)
                        in_root = True
                        break
                    except ValueError:
                        continue
                if not in_root:
                    raise ValueError(f"Working directory '{request.working_dir}' is not within approved roots")
            working_dir = str(wd_path)

        cmd = [executable, *request.args]

        try:
            # shell=False is strictly enforced
            proc = subprocess.Popen(
                cmd,
                cwd=working_dir,
                shell=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return LaunchAppResponse(
                success=True,
                pid=proc.pid,
                app_name=request.app_name,
                executable=executable,
                message=f"Successfully launched '{request.app_name}' (PID: {proc.pid})",
            )
        except FileNotFoundError:
            return LaunchAppResponse(
                success=False,
                pid=None,
                app_name=request.app_name,
                executable=executable,
                message=f"Executable '{executable}' was not found on system PATH",
            )
        except PermissionError:
            return LaunchAppResponse(
                success=False,
                pid=None,
                app_name=request.app_name,
                executable=executable,
                message=f"Permission denied launching '{executable}'. Elevation may be required.",
            )
        except Exception as exc:
            logger.error(f"Failed to launch application '{request.app_name}': {exc}", exc_info=True)
            return LaunchAppResponse(
                success=False,
                pid=None,
                app_name=request.app_name,
                executable=executable,
                message=f"Failed to launch '{request.app_name}': {str(exc)}",
            )
