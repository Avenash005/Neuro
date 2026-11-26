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


def test_desktop_info_requires_auth(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    assert client.get("/v1/desktop/info").status_code == 401

    headers = {"Authorization": "Bearer " + "t" * 48}
    res = client.get("/v1/desktop/info", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "monitors" in data
    assert "primary_monitor" in data
    assert "virtual_screen_bounds" in data
    assert len(data["monitors"]) >= 1
    assert data["primary_monitor"]["width"] > 0


def test_desktop_screenshot_endpoint(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    headers = {"Authorization": "Bearer " + "t" * 48}

    res = client.get("/v1/desktop/screenshot?monitor=1&max_dimension=800", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert "x-capture-width" in res.headers
    assert "x-capture-timestamp" in res.headers
    assert len(res.content) > 100


def test_desktop_region_screenshot(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    headers = {"Authorization": "Bearer " + "t" * 48}

    # Valid region
    res = client.post(
        "/v1/desktop/screenshot/region",
        json={"left": 0, "top": 0, "width": 300, "height": 200},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"

    # Out of bounds region
    out_of_bounds = client.post(
        "/v1/desktop/screenshot/region",
        json={"left": 999999, "top": 999999, "width": 100, "height": 100},
        headers=headers,
    )
    assert out_of_bounds.status_code == 400
