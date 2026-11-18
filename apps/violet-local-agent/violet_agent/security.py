from __future__ import annotations

import hmac
from pathlib import Path
from fastapi import Header, HTTPException
from .config import Settings


def verify_bearer(authorization: str | None, settings: Settings) -> None:
    expected = f"Bearer {settings.api_token}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
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


def bearer_dependency(settings: Settings):
    def dependency(authorization: str | None = Header(default=None)) -> bool:
        verify_bearer(authorization, settings)
        return True
    return dependency
