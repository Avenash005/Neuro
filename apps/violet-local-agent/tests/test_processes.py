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


def test_list_processes(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.get("/v1/processes/list?limit=10", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "processes" in data
    assert data["count"] > 0
    first = data["processes"][0]
    assert "pid" in first
    assert "name" in first


def test_list_processes_filter(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.get("/v1/processes/list?filter_name=python", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "processes" in data
    for proc in data["processes"]:
        assert "python" in proc["name"].lower()


def test_launch_unapproved_app_rejected(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.post(
        "/v1/applications/launch",
        headers=headers,
        json={"app_name": "malicious_binary.exe"},
    )
    assert res.status_code == 403
    assert "not in the approved application allowlist" in res.json()["detail"]


def test_terminate_non_existent_process(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.post(
        "/v1/processes/terminate",
        headers=headers,
        json={"pid": 99999999},
    )
    assert res.status_code == 404
    assert "does not exist" in res.json()["detail"]
