from pathlib import Path
from fastapi.testclient import TestClient

from violet_agent.config import Settings
from violet_agent.main import create_app


def make_settings(root: Path) -> Settings:
    return Settings(
        api_token="t" * 48,
        host="127.0.0.1",
        port=8765,
        allowed_roots=(root.resolve(),),
        max_read_bytes=1024,
        max_create_bytes=1024,
        command_timeout_seconds=2,
        command_output_bytes=1024,
        commands={},
        audit_path=root / "audit" / "violet.jsonl",
    )


def test_inspect_ui_requires_auth(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    assert client.post("/v1/ui/inspect", json={}).status_code == 401


def test_inspect_ui_returns_structured_elements(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    headers = {"Authorization": "Bearer " + "t" * 48}

    res = client.post(
        "/v1/ui/inspect",
        json={"max_depth": 3, "max_elements": 20},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "window_title" in data
    assert "handle" in data
    assert "elements" in data
    assert "element_count" in data
    assert isinstance(data["elements"], list)

    if len(data["elements"]) > 0:
        first = data["elements"][0]
        assert "element_id" in first
        assert "name" in first
        assert "control_type" in first
        assert "enabled" in first
        assert "visible" in first
