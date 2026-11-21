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


def test_ground_window_elements(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.post(
        "/v1/grounding/elements",
        headers=headers,
        json={"max_depth": 2, "max_elements": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert "elements" in data
    assert "screen_width" in data
    assert "screen_height" in data
    for el in data["elements"]:
        nb = el["normalized_bounds"]
        assert 0.0 <= nb["left"] <= 1.0
        assert 0.0 <= nb["top"] <= 1.0
        assert 0.0 <= nb["right"] <= 1.0
        assert 0.0 <= nb["bottom"] <= 1.0
        cn = el["center_normalized"]
        assert 0.0 <= cn["x"] <= 1.0
        assert 0.0 <= cn["y"] <= 1.0


def test_verify_action_outcome_success(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.post(
        "/v1/verification/verify",
        headers=headers,
        json={
            "action_type": "check_desktop",
            "conditions": [
                {
                    "check_type": "window_exists",
                    "expected_title": "",
                    "timeout_seconds": 0.5,
                }
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["verified"] is True
    assert "SUCCEEDED" in data["evidence_summary"]


def test_verify_action_outcome_failure(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    res = test_client.post(
        "/v1/verification/verify",
        headers=headers,
        json={
            "action_type": "check_non_existent",
            "conditions": [
                {
                    "check_type": "window_exists",
                    "expected_title": "ImpossibleWindowTitleThatNeverExists99999",
                    "timeout_seconds": 0.3,
                }
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["verified"] is False
    assert "FAILED" in data["evidence_summary"]


def test_verify_action_element_visible_regression(test_client):
    headers = {"Authorization": "Bearer " + "t" * 48}
    # Test positive element_visible in mock inspected window
    res = test_client.post(
        "/v1/verification/verify",
        headers=headers,
        json={
            "action_type": "click_element",
            "target_window_title": "Mock Window",
            "conditions": [
                {
                    "check_type": "element_visible",
                    "expected_element_name": "File",
                    "control_type": "MenuItem",
                    "timeout_seconds": 0.5,
                }
            ],
            "capture_screenshot_evidence": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["verified"] is True
    assert "screenshot_evidence" in data
    assert data["screenshot_evidence"] is not None
    assert data["screenshot_evidence"]["captured"] is True
    assert "file_path" in data["screenshot_evidence"]

    # Test conjoint mismatch: automation_id matches but expected_element_name does not
    res_mismatch = test_client.post(
        "/v1/verification/verify",
        headers=headers,
        json={
            "action_type": "click_element",
            "target_window_title": "Mock Window",
            "conditions": [
                {
                    "check_type": "element_visible",
                    "expected_element_name": "CompletelyWrongNameThatDoesNotMatch",
                    "expected_automation_id": "menu_file",
                    "timeout_seconds": 0.3,
                }
            ],
        },
    )
    assert res_mismatch.status_code == 200
    assert res_mismatch.json()["verified"] is False
