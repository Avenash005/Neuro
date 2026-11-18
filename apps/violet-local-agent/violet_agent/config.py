from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def _approved_roots(raw: str) -> tuple[Path, ...]:
    roots: list[Path] = []
    for entry in raw.split(";"):
        value = entry.strip()
        if not value:
            continue
        path = Path(value).expanduser().resolve()
        if not path.exists() or not path.is_dir():
            raise RuntimeError(f"Approved root must be an existing directory: {path}")
        roots.append(path)
    return tuple(roots)


@dataclass(frozen=True)
class CommandSpec:
    executable: str
    args: tuple[str, ...]
    root_index: int


def _commands(raw: str) -> dict[str, CommandSpec]:
    try:
        data = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError("VIOLET_COMMANDS_JSON must be valid JSON") from exc
    if not isinstance(data, dict):
        raise RuntimeError("VIOLET_COMMANDS_JSON must be a JSON object")
    commands: dict[str, CommandSpec] = {}
    for command_id, value in data.items():
        if not isinstance(command_id, str) or not command_id.replace("_", "").isalnum():
            raise RuntimeError("Command IDs must contain only letters, digits and underscores")
        if not isinstance(value, dict):
            raise RuntimeError(f"Invalid command specification: {command_id}")
        executable = value.get("executable")
        args = value.get("args", [])
        root_index = value.get("root_index", 0)
        if not isinstance(executable, str) or not executable or not isinstance(args, list) or not all(isinstance(a, str) for a in args):
            raise RuntimeError(f"Invalid executable/args for command: {command_id}")
        if not isinstance(root_index, int) or root_index < 0:
            raise RuntimeError(f"Invalid root_index for command: {command_id}")
        commands[command_id] = CommandSpec(executable, tuple(args), root_index)
    return commands


@dataclass(frozen=True)
class Settings:
    api_token: str
    host: str
    port: int
    allowed_roots: tuple[Path, ...]
    max_read_bytes: int
    max_create_bytes: int
    command_timeout_seconds: int
    command_output_bytes: int
    commands: dict[str, CommandSpec]
    audit_path: Path


def load_settings() -> Settings:
    token = os.getenv("VIOLET_API_TOKEN", "")
    if len(token) < 32 or token.startswith("REPLACE_"):
        raise RuntimeError("Set VIOLET_API_TOKEN to a random secret of at least 32 characters")
    host = os.getenv("VIOLET_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("VIOLET local agent must bind to loopback only")
    roots = _approved_roots(os.getenv("VIOLET_ALLOWED_ROOTS", ""))
    commands = _commands(os.getenv("VIOLET_COMMANDS_JSON", "{}"))
    for command_id, spec in commands.items():
        if spec.root_index >= len(roots):
            raise RuntimeError(f"Command {command_id} refers to an unavailable approved root")
    return Settings(
        api_token=token,
        host=host,
        port=int(os.getenv("VIOLET_PORT", "8765")),
        allowed_roots=roots,
        max_read_bytes=int(os.getenv("VIOLET_MAX_READ_BYTES", "1000000")),
        max_create_bytes=int(os.getenv("VIOLET_MAX_CREATE_BYTES", "1000000")),
        command_timeout_seconds=int(os.getenv("VIOLET_COMMAND_TIMEOUT_SECONDS", "20")),
        command_output_bytes=int(os.getenv("VIOLET_COMMAND_OUTPUT_BYTES", "12000")),
        commands=commands,
        audit_path=Path(os.getenv("VIOLET_AUDIT_PATH", "./data/violet-audit.jsonl")).resolve(),
    )
