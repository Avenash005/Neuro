from __future__ import annotations

import hmac
from pathlib import Path
from typing import Any
from fastapi import Header, HTTPException
from .config import Settings


def verify_bearer(
    authorization: str | None,
    settings: Settings,
    pairing_service: Any = None,
) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")

    token = authorization[7:].strip()
    expected_token = settings.api_token

    # 1. Check primary api token
    if hmac.compare_digest(token, expected_token):
        return

    # 2. Check active pairing session token
    if pairing_service and hasattr(pairing_service, "is_session_valid"):
        if pairing_service.is_session_valid(token):
            return

    raise HTTPException(status_code=401, detail="Invalid or missing bearer token")


def resolve_approved_path(raw_path: str, settings: Settings) -> Path:
    candidate = Path(raw_path).expanduser().resolve()
    for root in settings.allowed_roots:
        try:
            candidate.relative_to(root)
            return candidate
        except ValueError:
            pass
    raise HTTPException(status_code=403, detail="Path is outside configured approved roots")


def bearer_dependency(settings: Settings, pairing_service: Any = None):
    def dependency(authorization: str | None = Header(default=None)) -> bool:
        verify_bearer(authorization, settings, pairing_service)
        return True
    return dependency
