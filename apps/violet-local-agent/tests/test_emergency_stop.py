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


def test_emergency_stop_lifecycle(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}

    # 1. Initial status
    status = test_client.get("/v1/emergency-stop/status").json()
    assert status["is_stopped"] is False

    # 2. Trigger emergency stop
    trig_res = test_client.post("/v1/emergency-stop/trigger?reason=TestEmergency")
    assert trig_res.status_code == 200
    data = trig_res.json()
    assert data["success"] is True
    assert data["is_stopped"] is True
    assert data["reason"] == "TestEmergency"

    # 3. Status is stopped
    status2 = test_client.get("/v1/emergency-stop/status").json()
    assert status2["is_stopped"] is True

    # 4. Resume
    res_res = test_client.post("/v1/emergency-stop/resume", headers=headers)
    assert res_res.status_code == 200
    assert res_res.json()["is_stopped"] is False

    # 5. Status is resumed
    status3 = test_client.get("/v1/emergency-stop/status").json()
    assert status3["is_stopped"] is False


def test_emergency_stop_blocks_input(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}

    # 1. Trigger emergency stop
    test_client.post("/v1/emergency-stop/trigger?reason=SafetyCheck")

    # 2. Attempt mouse action while stopped
    mouse_res = test_client.post(
        "/v1/input/mouse",
        headers=headers,
        json={"action": "move", "x": 100, "y": 100, "smooth": False},
    )
    assert mouse_res.status_code == 400
    assert "Emergency stop is currently active" in mouse_res.json()["detail"]

    # 3. Attempt keyboard action while stopped
    kb_res = test_client.post(
        "/v1/input/keyboard",
        headers=headers,
        json={"action": "type", "text": "hello"},
    )
    assert kb_res.status_code == 400
    assert "Emergency stop is currently active" in kb_res.json()["detail"]

    # 4. Resume
    test_client.post("/v1/emergency-stop/resume", headers=headers)

    # 5. Action succeeds after resume
    post_resume = test_client.post(
        "/v1/input/mouse",
        headers=headers,
        json={"action": "move", "x": 100, "y": 100, "smooth": False},
    )
    assert post_resume.status_code == 200
    assert post_resume.json()["success"] is True
