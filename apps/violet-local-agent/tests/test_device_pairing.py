import hashlib
import hmac
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


def test_pairing_challenge_creation(test_client):
    res = test_client.post(
        "/v1/pairing/challenge",
        json={"device_id": "test-device-uuid-001", "device_name": "Test Client"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "challenge_id" in data
    assert "nonce" in data
    assert "server_id" in data
    assert "expires_at" in data


def test_pairing_verify_and_session_authentication(test_client):
    device_id = "test-device-uuid-002"
    secret_key = "t" * 48

    # 1. Get challenge
    challenge_res = test_client.post(
        "/v1/pairing/challenge",
        json={"device_id": device_id, "device_name": "Test Client"},
    )
    challenge_data = challenge_res.json()
    challenge_id = challenge_data["challenge_id"]
    nonce = challenge_data["nonce"]

    # 2. Compute signature
    payload = f"{device_id}:{nonce}".encode("utf-8")
    signature = hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    # 3. Verify challenge
    verify_res = test_client.post(
        "/v1/pairing/verify",
        json={"challenge_id": challenge_id, "device_id": device_id, "signature": signature},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    session_token = verify_data["session_token"]
    assert session_token.startswith("vsession_")

    # 4. Use session token to access protected endpoint
    auth_headers = {"Authorization": f"Bearer {session_token}"}
    cap_res = test_client.get("/v1/capabilities", headers=auth_headers)
    assert cap_res.status_code == 200
    assert cap_res.json()["remote_pairing"] is True

    # 5. Check session heartbeat
    session_res = test_client.get("/v1/pairing/session", headers=auth_headers)
    assert session_res.status_code == 200
    assert session_res.json()["active"] is True
    assert session_res.json()["device_id"] == device_id

    # 6. Revoke session
    revoke_res = test_client.post(f"/v1/pairing/revoke?session_token={session_token}", headers=auth_headers)
    assert revoke_res.status_code == 200
    assert revoke_res.json()["revoked"] is True

    # 7. Check session after revocation is rejected
    post_revoke = test_client.get("/v1/capabilities", headers=auth_headers)
    assert post_revoke.status_code == 401


def test_pairing_verify_invalid_signature(test_client):
    device_id = "test-device-uuid-003"
    challenge_res = test_client.post(
        "/v1/pairing/challenge",
        json={"device_id": device_id, "device_name": "Test Client"},
    )
    challenge_id = challenge_res.json()["challenge_id"]

    verify_res = test_client.post(
        "/v1/pairing/verify",
        json={"challenge_id": challenge_id, "device_id": device_id, "signature": "invalidsig123"},
    )
    assert verify_res.status_code == 401
