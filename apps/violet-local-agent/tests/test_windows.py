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


def test_list_windows_requires_auth(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    assert client.get("/v1/windows/list").status_code == 401

    headers = {"Authorization": "Bearer " + "t" * 48}
    res = client.get("/v1/windows/list", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "windows" in data
    assert "count" in data
    assert isinstance(data["windows"], list)


def test_focus_window_nonexistent(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    headers = {"Authorization": "Bearer " + "t" * 48}

    res = client.post(
        "/v1/windows/focus",
        json={"title": "NonExistentWindowTitleXYZ99999"},
        headers=headers,
    )
    assert res.status_code == 404
