"""Process management service for enumerating and terminating processes."""

import logging
from datetime import datetime, timezone
from typing import List, Optional
import psutil

from ..models.process import ProcessEntry, ProcessListResponse, TerminateProcessResponse

logger = logging.getLogger(__name__)


class ProcessManagerService:
    def list_processes(
        self,
        limit: int = 100,
        filter_name: Optional[str] = None,
    ) -> ProcessListResponse:
        """Enumerate active processes with CPU, memory, and executable metadata."""
        entries: List[ProcessEntry] = []
        name_lower = filter_name.lower().strip() if filter_name else None

        for proc in psutil.process_iter(
            ["pid", "name", "exe", "cpu_percent", "memory_info", "status", "create_time", "username"]
        ):
            try:
                pinfo = proc.info
                pname = pinfo.get("name") or "unknown"
                if name_lower and name_lower not in pname.lower():
                    continue

                mem_mb = None
                if pinfo.get("memory_info"):
                    mem_mb = round(pinfo["memory_info"].rss / (1024 * 1024), 2)

                ctime_str = ""
                if pinfo.get("create_time"):
                    try:
                        ctime_str = datetime.fromtimestamp(pinfo["create_time"], timezone.utc).isoformat()
                    except (ValueError, OSError):
                        ctime_str = datetime.now(timezone.utc).isoformat()

                entries.append(
                    ProcessEntry(
                        pid=pinfo["pid"],
                        name=pname,
                        exe=pinfo.get("exe"),
                        cpu_percent=pinfo.get("cpu_percent"),
                        memory_mb=mem_mb,
                        status=str(pinfo.get("status") or "running"),
                        create_time=ctime_str,
                        username=pinfo.get("username"),
                    )
                )

                if len(entries) >= limit:
                    break
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception as exc:
                logger.debug(f"Error inspecting process {getattr(proc, 'pid', '?')}: {exc}")
                continue

        # Sort descending by memory usage
        entries.sort(key=lambda p: (p.memory_mb or 0.0), reverse=True)
        return ProcessListResponse(processes=entries, count=len(entries))

    def terminate_process(self, pid: int, force: bool = False) -> TerminateProcessResponse:
        """Safely terminate or kill a process by PID."""
        try:
            if not psutil.pid_exists(pid):
                return TerminateProcessResponse(
                    success=False,
                    pid=pid,
                    message=f"Process with PID {pid} does not exist",
                )

            proc = psutil.Process(pid)
            pname = proc.name()

            # Prevent terminating critical system processes or self
            current_pid = psutil.Process().pid
            if pid == current_pid:
                return TerminateProcessResponse(
                    success=False,
                    pid=pid,
                    message="Refusing to terminate local agent's own process",
                )

            if force:
                proc.kill()
                action_word = "killed"
            else:
                proc.terminate()
                action_word = "terminated"

            gone, alive = psutil.wait_procs([proc], timeout=3)
            if proc in alive and force:
                proc.kill()
                psutil.wait_procs([proc], timeout=1)

            return TerminateProcessResponse(
                success=True,
                pid=pid,
                message=f"Successfully {action_word} process '{pname}' (PID: {pid})",
            )
        except psutil.NoSuchProcess:
            return TerminateProcessResponse(
                success=True,
                pid=pid,
                message=f"Process with PID {pid} already exited",
            )
        except psutil.AccessDenied:
            return TerminateProcessResponse(
                success=False,
                pid=pid,
                message=f"Access denied terminating process {pid}. Elevation or administrator privilege required.",
            )
        except Exception as exc:
            logger.error(f"Failed to terminate process {pid}: {exc}", exc_info=True)
            return TerminateProcessResponse(
                success=False,
                pid=pid,
                message=f"Failed to terminate process {pid}: {str(exc)}",
            )
