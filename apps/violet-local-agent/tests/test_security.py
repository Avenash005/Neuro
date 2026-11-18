from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from violet_agent.security import resolve_approved_path, verify_bearer


def test_bearer_token_uses_exact_value():
    settings = SimpleNamespace(api_token="a" * 48)
    verify_bearer("Bearer " + "a" * 48, settings)
    with pytest.raises(HTTPException) as error:
        verify_bearer("Bearer wrong", settings)
    assert error.value.status_code == 401


def test_path_inside_approved_root_is_allowed(tmp_path: Path):
    child = tmp_path / "project"
    child.mkdir()
    settings = SimpleNamespace(allowed_roots=(tmp_path.resolve(),))
    assert resolve_approved_path(str(child), settings) == child.resolve()


def test_path_outside_approved_root_is_rejected(tmp_path: Path):
    approved = tmp_path / "approved"
    outside = tmp_path / "outside"
    approved.mkdir()
    outside.mkdir()
    settings = SimpleNamespace(allowed_roots=(approved.resolve(),))
    with pytest.raises(HTTPException) as error:
        resolve_approved_path(str(outside), settings)
    assert error.value.status_code == 403
