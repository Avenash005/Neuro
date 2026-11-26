from pathlib import Path
import pytest
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


@pytest.fixture
def test_client(tmp_path: Path):
    app = create_app(make_settings(tmp_path))
    return TestClient(app)


def test_mouse_out_of_bounds_rejected(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    response = test_client.post(
        "/v1/input/mouse",
        headers=headers,
        json={"action": "move", "x": -99999, "y": -99999, "require_in_bounds": True},
    )
    assert response.status_code == 400
    assert "out of virtual screen bounds" in response.json()["detail"]


def test_mouse_move_in_bounds(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    response = test_client.post(
        "/v1/input/mouse",
        headers=headers,
        json={"action": "move", "x": 100, "y": 100, "smooth": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action_type"] == "mouse_move"
    assert data["details"]["x"] == 100
    assert data["details"]["y"] == 100


def test_keyboard_type(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    response = test_client.post(
        "/v1/input/keyboard",
        headers=headers,
        json={"action": "type", "text": "hello violet", "interval_ms": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action_type"] == "keyboard_type"
    assert data["details"]["text_length"] == 12


def test_keyboard_hotkey(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    response = test_client.post(
        "/v1/input/keyboard",
        headers=headers,
        json={"action": "hotkey", "keys": ["ctrl"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action_type"] == "keyboard_hotkey"
    assert data["details"]["keys"] == ["ctrl"]


def test_click_element_not_found(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    response = test_client.post(
        "/v1/input/click-element",
        headers=headers,
        json={"element_name": "NonExistentWidget123456789"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "not found" in data["error"].lower()
