from pathlib import Path
from fastapi.testclient import TestClient

from violet_agent.config import CommandSpec, Settings
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
        commands={
            "python_version": CommandSpec("python", ("--version",), 0),
        },
        audit_path=root / "audit" / "violet.jsonl",
    )


def test_health_is_available_without_token(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "violet-local-agent"


def test_capabilities_require_authentication(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    assert client.get("/v1/capabilities").status_code == 401
    response = client.get("/v1/capabilities", headers={"Authorization": "Bearer " + "t" * 48})
    assert response.status_code == 200
    assert response.json()["desktop_input"] is False


def test_file_read_and_create_are_scoped_and_non_overwriting(tmp_path: Path):
    (tmp_path / "note.txt").write_text("hello", encoding="utf-8")
    client = TestClient(create_app(make_settings(tmp_path)))
    headers = {"Authorization": "Bearer " + "t" * 48}

    read = client.get("/v1/files/read-text", params={"path": str(tmp_path / "note.txt")}, headers=headers)
    assert read.status_code == 200
    assert read.json()["content"] == "hello"

    create = client.post("/v1/files/create-text", json={
        "path": str(tmp_path / "new.txt"),
        "content": "new file",
    }, headers=headers)
    assert create.status_code == 200
    assert (tmp_path / "new.txt").read_text(encoding="utf-8") == "new file"

    overwrite = client.post("/v1/files/create-text", json={
        "path": str(tmp_path / "note.txt"),
        "content": "changed",
    }, headers=headers)
    assert overwrite.status_code == 409
    assert (tmp_path / "note.txt").read_text(encoding="utf-8") == "hello"


def test_named_commands_only_accept_registered_ids(tmp_path: Path):
    client = TestClient(create_app(make_settings(tmp_path)))
    headers = {"Authorization": "Bearer " + "t" * 48}

    denied = client.post("/v1/commands/run", json={"command_id": "delete_everything"}, headers=headers)
    assert denied.status_code == 403

    accepted = client.post("/v1/commands/run", json={"command_id": "python_version"}, headers=headers)
    assert accepted.status_code == 200
    assert accepted.json()["returncode"] == 0
