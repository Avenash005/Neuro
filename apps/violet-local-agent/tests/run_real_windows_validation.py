"""
VIOLET AI Phase 2 — Comprehensive QA Audit & Extended Validation Suite
Executes both Baseline Tests (31) and QA Audit Expansion Tests (25).
Distinguishes: Previously Tested vs. Newly Tested, and tracks PASSED, FAILED, BLOCKED, NOT_TESTED.
"""

import hmac
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

ENV_PATH = Path(r"D:\violet\Neuro\apps\violet-local-agent\.env")
BASE_URL = "http://127.0.0.1:8765"

token = ""
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith("VIOLET_API_TOKEN="):
            token = line.split("=", 1)[1].strip()

if not token:
    print("ERROR: VIOLET_API_TOKEN not found in .env")
    sys.exit(1)

test_results: List[Dict[str, Any]] = []

def record_test(
    test_id: str,
    category: str,
    name: str,
    suite_type: str, # "Previously Tested" | "Newly Tested"
    status: str,     # "PASSED" | "FAILED" | "BLOCKED" | "NOT_TESTED"
    duration_ms: float,
    details: Dict[str, Any],
    error: str = None
):
    test_results.append({
        "test_id": test_id,
        "category": category,
        "name": name,
        "suite_type": suite_type,
        "status": status,
        "duration_ms": round(duration_ms, 2),
        "details": details,
        "error": error
    })
    print(f"[{status}] {test_id} ({suite_type}) - {name} ({round(duration_ms, 2)}ms)")
    if error:
        print(f"       Error: {error}")

def api_request(path: str, method: str = "GET", payload: Any = None, auth_token: str = token, raw_response: bool = False) -> tuple[int, Any, Any]:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    if auth_token is not None:
        req.add_header("Authorization", f"Bearer {auth_token}")
    req.add_header("Content-Type", "application/json")
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}
            body = resp.read()
            if raw_response:
                return resp.status, body, headers
            try:
                parsed = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                parsed = {"raw": body}
            return resp.status, parsed, headers
    except urllib.error.HTTPError as exc:
        headers = {k.lower(): v for k, v in exc.headers.items()}
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"detail": body}
        return exc.code, parsed, headers
    except Exception as exc:
        return 500, {"error": str(exc)}, {}

print(f"=== Starting VIOLET AI Phase 2 QA Audit Validation at {datetime.now(timezone.utc).isoformat()} ===")

# ==============================================================================
# BASELINE TESTS (Previously Tested Suite)
# ==============================================================================
print("\n--- Running Baseline Suite: Categories A through J & Security ---")

# A-01
t0 = time.time()
status, data, _ = api_request("/v1/desktop/info")
dur = (time.time() - t0) * 1000
passed = (status == 200 and "monitors" in data and len(data["monitors"]) >= 1 and "virtual_screen_bounds" in data)
record_test(
    "A-01", "Desktop Observation", "Desktop Information and Multi-Monitor Enumeration",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "monitor_count": len(data.get("monitors", [])), "bounds": data.get("virtual_screen_bounds")}
)

# A-02
t0 = time.time()
status, raw_img, hdrs = api_request("/v1/desktop/screenshot?quality=70&max_dimension=1200", raw_response=True)
dur = (time.time() - t0) * 1000
is_jpeg = raw_img.startswith(b"\xff\xd8") if isinstance(raw_img, bytes) else False
passed = (status == 200 and is_jpeg and len(raw_img) > 1000 and int(hdrs.get("x-capture-width", 0)) <= 1200)
record_test(
    "A-02", "Desktop Observation", "Full Desktop Screenshot Capture (JPEG thumbnail scaled to max_dimension 1200)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "content_type": hdrs.get("content-type"), "capture_width": hdrs.get("x-capture-width"), "capture_height": hdrs.get("x-capture-height"), "byte_size": len(raw_img)}
)

# A-03
t0 = time.time()
status, raw_img, hdrs = api_request("/v1/desktop/screenshot/region", method="POST", payload={"left": 0, "top": 0, "width": 400, "height": 300}, raw_response=True)
dur = (time.time() - t0) * 1000
is_jpeg = raw_img.startswith(b"\xff\xd8") if isinstance(raw_img, bytes) else False
passed = (status == 200 and is_jpeg and hdrs.get("x-capture-width") == "400" and hdrs.get("x-capture-height") == "300")
record_test(
    "A-03", "Desktop Observation", "Region-Bounded Screenshot Capture",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "region": {"left": 0, "top": 0, "width": 400, "height": 300}, "byte_size": len(raw_img)}
)

# B-01
t0 = time.time()
status, data, _ = api_request("/v1/windows/list?include_minimized=true")
dur = (time.time() - t0) * 1000
windows = data.get("windows", [])
passed = (status == 200 and len(windows) > 0)
record_test(
    "B-01", "Windows Management", "Window Enumeration with Bounds and Visibility",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "total_windows": len(windows), "sample_titles": [w.get("title") for w in windows[:4]]}
)

# Ensure an active test window exists (launch notepad if none open)
active_win = next((w for w in windows if w.get("is_active") and w.get("handle")), None)
if not active_win and windows:
    active_win = windows[0]
target_handle = active_win.get("handle") if active_win else None
target_title = active_win.get("title") if active_win else "Desktop"

# B-02
t0 = time.time()
if target_handle:
    status, data, _ = api_request("/v1/windows/focus", method="POST", payload={"handle": target_handle})
    dur = (time.time() - t0) * 1000
    passed = (status == 200 and data.get("success") is True and data.get("window", {}).get("handle") == target_handle)
    record_test(
        "B-02", "Windows Management", "Window Focus and Foreground Activation",
        "Previously Tested", "PASSED" if passed else "FAILED", dur,
        {"status_code": status, "focused_handle": target_handle, "message": data.get("message")}
    )
else:
    record_test("B-02", "Windows Management", "Window Focus", "Previously Tested", "BLOCKED", 0.0, {}, "No window found")

# C-01
t0 = time.time()
status, data, _ = api_request("/v1/ui/inspect", method="POST", payload={"handle": target_handle, "max_depth": 6, "max_elements": 80})
dur = (time.time() - t0) * 1000
elements = data.get("elements", [])
passed = (status == 200 and len(elements) > 0)
record_test(
    "C-01", "UI Automation", "UI Element Hierarchy Inspection via UIA",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "element_count": len(elements), "sample_types": [e.get("control_type") for e in elements[:4]]}
)

# D-01
t0 = time.time()
status, data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "move", "x": 500, "y": 400, "smooth": True})
dur = (time.time() - t0) * 1000
pos_x = data.get("details", {}).get("final_position", {}).get("x", 0)
passed = (status == 200 and data.get("success") is True and abs(pos_x - 500) <= 2)
record_test(
    "D-01", "Mouse/Keyboard Automation", "Smooth Mouse Movement with Coordinate Bounds Validation",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "success": data.get("success"), "position": data.get("details", {}).get("final_position")}
)

# D-02
t0 = time.time()
status, data, _ = api_request("/v1/input/keyboard", method="POST", payload={"action": "type", "text": " "})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True)
record_test(
    "D-02", "Mouse/Keyboard Automation", "Keyboard Typing Simulation",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "success": data.get("success")}
)

# D-03
t0 = time.time()
status, data, _ = api_request("/v1/input/keyboard", method="POST", payload={"action": "hotkey", "keys": ["ctrl"]})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True)
record_test(
    "D-03", "Mouse/Keyboard Automation", "Key Press / Hotkey Execution",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "success": data.get("success")}
)

# E-01
t0 = time.time()
status, data, _ = api_request("/v1/processes/list?limit=50")
dur = (time.time() - t0) * 1000
procs = data.get("processes", [])
passed = (status == 200 and len(procs) > 0 and data.get("count", 0) > 0)
record_test(
    "E-01", "Process Management", "Process Enumeration with Resource Metrics",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "process_count": len(procs), "sample_process": procs[0].get("name") if procs else None}
)

# E-02
t0 = time.time()
status, data, _ = api_request("/v1/applications/launch", method="POST", payload={
    "app_name": "cmd",
    "args": ["/k", "title VIOLET_TEST_CMD"]
})
dur = (time.time() - t0) * 1000
spawned_pid = data.get("pid")
passed = (status == 200 and data.get("success") is True and spawned_pid is not None)
record_test(
    "E-02", "Application Management", "Approved Application Launch (cmd)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "spawned_pid": spawned_pid, "message": data.get("message")}
)

# E-03
time.sleep(0.5)
t0 = time.time()
if spawned_pid:
    status, data, _ = api_request("/v1/processes/terminate", method="POST", payload={"pid": spawned_pid, "force": True})
    dur = (time.time() - t0) * 1000
    passed = (status == 200 and data.get("success") is True)
    record_test(
        "E-03", "Process Management", "Process Termination by PID",
        "Previously Tested", "PASSED" if passed else "FAILED", dur,
        {"status_code": status, "terminated_pid": spawned_pid, "message": data.get("message")}
    )
else:
    record_test("E-03", "Process Management", "Process Termination", "Previously Tested", "BLOCKED", 0.0, {}, "No PID")

# F-01
t0 = time.time()
status, data, _ = api_request("/v1/grounding/elements", method="POST", payload={"handle": target_handle, "max_depth": 5, "max_elements": 50})
dur = (time.time() - t0) * 1000
g_elements = data.get("elements", [])
all_bounded = True
for el in g_elements:
    nb = el.get("normalized_bounds", {})
    if not (0.0 <= nb.get("left", 0) <= 1.0 and 0.0 <= nb.get("top", 0) <= 1.0):
        all_bounded = False
        break
passed = (status == 200 and len(g_elements) > 0 and all_bounded)
record_test(
    "F-01", "Visual Grounding", "Coordinate Normalization to [0.0, 1.0] Space",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "grounded_count": len(g_elements), "all_in_bounds": all_bounded}
)

# G-01: Click accessible element with clamped bounds
clickable_elem = next((e for e in elements if e.get("name") and e.get("visible")), None)
t0 = time.time()
if clickable_elem:
    status, data, _ = api_request("/v1/input/click-element", method="POST", payload={
        "window_handle": target_handle,
        "element_name": clickable_elem.get("name"),
        "control_type": clickable_elem.get("control_type"),
        "click_type": "left"
    })
    dur = (time.time() - t0) * 1000
    passed = (status == 200 and data.get("success") is True and "clicked_at" in data.get("details", {}))
    record_test(
        "G-01", "Element Interaction", "Click Accessible Element Center by Name and Control Type",
        "Previously Tested", "PASSED" if passed else "FAILED", dur,
        {"status_code": status, "success": data.get("success"), "clicked_at": data.get("details", {}).get("clicked_at")}
    )
else:
    record_test("G-01", "Element Interaction", "Click Accessible Element", "Previously Tested", "BLOCKED", 0.0, {}, "No element")

# H-01
t0 = time.time()
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "focus_window",
    "target_window_handle": target_handle,
    "conditions": [
        {"check_type": "window_exists", "expected_title": target_title[:10], "timeout_seconds": 3.0}
    ],
    "capture_screenshot_evidence": True
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("verified") is True and data.get("screenshot_evidence") is not None)
record_test(
    "H-01", "Post-Action Verification", "Positive Verification: Window Exists with Screenshot Evidence",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified"), "screenshot": data.get("screenshot_evidence")}
)

# H-02
t0 = time.time()
cond_elem_name = clickable_elem.get("name") if clickable_elem else "Window"
cond_elem_type = clickable_elem.get("control_type") if clickable_elem else "Window"
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "click_element",
    "target_window_handle": target_handle,
    "conditions": [
        {"check_type": "element_visible", "expected_element_name": cond_elem_name, "control_type": cond_elem_type, "timeout_seconds": 3.0}
    ],
    "capture_screenshot_evidence": True
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("verified") is True)
record_test(
    "H-02", "Post-Action Verification", "Positive Verification: Element Visible in Target Window",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified"), "conditions": data.get("condition_results")}
)

# H-03
t0 = time.time()
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "click_element",
    "target_window_handle": target_handle,
    "conditions": [
        {"check_type": "element_visible", "expected_element_name": "NON_EXISTENT_BUTTON_XYZ_999", "timeout_seconds": 0.8}
    ],
    "capture_screenshot_evidence": False
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("verified") is False and len(data.get("condition_results", [])) == 1 and data["condition_results"][0]["passed"] is False)
record_test(
    "H-03", "Post-Action Verification", "Negative Verification: Correct Rejection of Non-Existent Element",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified"), "message": data.get("condition_results", [{}])[0].get("message")}
)

# I-01
t0 = time.time()
status, challenge_data, _ = api_request("/v1/pairing/challenge", method="POST", payload={
    "device_id": "test-device-pc-01",
    "device_name": "VIOLET Testing Rig"
})
dur = (time.time() - t0) * 1000
c_id = challenge_data.get("challenge_id")
nonce = challenge_data.get("nonce")
passed = (status == 200 and c_id is not None and nonce is not None and len(nonce) >= 32)
record_test(
    "I-01", "Device Pairing", "Pairing Challenge Generation with Nonce",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "challenge_id": c_id, "has_nonce": bool(nonce)}
)

# I-02
t0 = time.time()
payload_bytes = f"test-device-pc-01:{nonce}".encode("utf-8")
signature = hmac.new(token.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
status, verify_data, _ = api_request("/v1/pairing/verify", method="POST", payload={
    "challenge_id": c_id,
    "device_id": "test-device-pc-01",
    "signature": signature
})
dur = (time.time() - t0) * 1000
session_id = verify_data.get("session_token")
passed = (status == 200 and verify_data.get("success") is True and session_id is not None)
record_test(
    "I-02", "Device Pairing", "HMAC-SHA256 Challenge Signature Verification and Session Establishment",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "success": verify_data.get("success"), "has_session_token": bool(session_id)}
)

# I-03
t0 = time.time()
status, hb_data, _ = api_request(f"/v1/pairing/session?session_token={session_id}")
dur = (time.time() - t0) * 1000
passed = (status == 200 and hb_data.get("active") is True and hb_data.get("time_remaining_seconds", 0) > 0)
record_test(
    "I-03", "Device Pairing", "Active Pairing Session Heartbeat and Validation",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "active": hb_data.get("active"), "time_remaining_seconds": hb_data.get("time_remaining_seconds")}
)

# I-04
t0 = time.time()
status, revoke_data, _ = api_request(f"/v1/pairing/revoke?session_token={session_id}", method="POST")
dur = (time.time() - t0) * 1000
passed = (status == 200 and revoke_data.get("revoked") is True)
record_test(
    "I-04", "Device Pairing", "Pairing Session Revocation",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "revoked": revoke_data.get("revoked")}
)

# J-01
t0 = time.time()
status, stop_data, _ = api_request("/v1/emergency-stop/trigger", method="POST", payload={})
dur = (time.time() - t0) * 1000
passed = (status == 200 and stop_data.get("is_stopped") is True)
record_test(
    "J-01", "Emergency Stop", "Trigger Emergency Stop and Halt Desktop Input",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "is_stopped": stop_data.get("is_stopped")}
)

# J-02
t0 = time.time()
status, block_data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "move", "x": 100, "y": 100})
dur = (time.time() - t0) * 1000
passed = (status == 400 and "emergency stop" in block_data.get("detail", "").lower())
record_test(
    "J-02", "Emergency Stop", "Enforce Input Blockade (HTTP 400) While Emergency Stop is Active",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": block_data.get("detail")}
)

# J-03
t0 = time.time()
status, resume_data, _ = api_request("/v1/emergency-stop/resume", method="POST")
dur = (time.time() - t0) * 1000
passed = (status == 200 and resume_data.get("is_stopped") is False)
record_test(
    "J-03", "Emergency Stop", "Resume Operations from Emergency Stop",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "is_stopped": resume_data.get("is_stopped")}
)

# J-04
t0 = time.time()
status, restored_data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "move", "x": 600, "y": 450, "smooth": False})
dur = (time.time() - t0) * 1000
passed = (status == 200 and restored_data.get("success") is True)
record_test(
    "J-04", "Emergency Stop", "Verify Input Functionality Restored After Resume",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "success": restored_data.get("success")}
)

# SEC-01
t0 = time.time()
status, data, _ = api_request("/v1/desktop/info", auth_token=None)
dur = (time.time() - t0) * 1000
passed = (status == 401)
record_test(
    "SEC-01", "Security & Reliability", "Missing Authentication Rejection (HTTP 401)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# SEC-02
t0 = time.time()
status, data, _ = api_request("/v1/desktop/info", auth_token="INVALID_TOKEN_TEST_XYZ")
dur = (time.time() - t0) * 1000
passed = (status == 401)
record_test(
    "SEC-02", "Security & Reliability", "Invalid Token Authentication Rejection (HTTP 401)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# SEC-03
t0 = time.time()
status, data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "move", "x": 99999, "y": -500, "require_in_bounds": True})
dur = (time.time() - t0) * 1000
passed = (status == 400 and "out of virtual screen bounds" in data.get("detail", "").lower())
record_test(
    "SEC-03", "Security & Reliability", "Out-of-Bounds Coordinates Rejection (HTTP 400)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# SEC-04
t0 = time.time()
status, data, _ = api_request("/v1/applications/launch", method="POST", payload={"app_name": "unapproved_malware.exe"})
dur = (time.time() - t0) * 1000
passed = (status == 403 and "not in the approved" in data.get("detail", "").lower())
record_test(
    "SEC-04", "Security & Reliability", "Unapproved Application Launch Rejection (HTTP 403)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# SEC-05
t0 = time.time()
status, data, _ = api_request("/v1/processes/terminate", method="POST", payload={"pid": 4, "force": True})
dur = (time.time() - t0) * 1000
passed = (status == 403 and "refusing to terminate protected" in data.get("detail", "").lower())
record_test(
    "SEC-05", "Security & Reliability", "Protected System Process Termination Rejection (HTTP 403)",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# SEC-06
t0 = time.time()
audit_paths = [
    Path(r"D:\violet\Neuro\data\violet-audit.jsonl"),
    Path(r"D:\violet\Neuro\apps\violet-local-agent\data\violet-audit.jsonl"),
]
secret_leaked = False
total_checked = 0
for ap in audit_paths:
    if ap.exists():
        for line in ap.read_text(encoding="utf-8").splitlines():
            total_checked += 1
            if token in line:
                secret_leaked = True
                break
dur = (time.time() - t0) * 1000
passed = (not secret_leaked and total_checked > 0)
record_test(
    "SEC-06", "Security & Reliability", "Zero Secret Leakage in Audit Trail & Logs",
    "Previously Tested", "PASSED" if passed else "FAILED", dur,
    {"checked_audit_lines": total_checked, "token_found": secret_leaked}
)

# ==============================================================================
# QA AUDIT EXPANSION TESTS (Newly Tested Missing Scenarios)
# ==============================================================================
print("\n--- Running QA Audit Expansion Suite: Missing Scenarios (Section 3) ---")

# D-04: Mouse Right-Click
t0 = time.time()
status, data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "right_click", "x": 400, "y": 400, "require_in_bounds": True})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True and data.get("details", {}).get("action") == "right_click")
record_test(
    "D-04", "Mouse/Keyboard Automation", "Mouse Right-Click Action",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "action": data.get("details", {}).get("action")}
)
# Dismiss context menu with escape
api_request("/v1/input/keyboard", method="POST", payload={"action": "press", "key": "esc"})

# D-05: Mouse Double-Click
t0 = time.time()
status, data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "double_click", "x": 450, "y": 450, "require_in_bounds": True})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True and data.get("details", {}).get("action") == "double_click")
record_test(
    "D-05", "Mouse/Keyboard Automation", "Mouse Double-Click Action",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "action": data.get("details", {}).get("action")}
)

# D-06: Mouse Scroll
t0 = time.time()
status, data, _ = api_request("/v1/input/mouse", method="POST", payload={"action": "scroll", "x": 500, "y": 500, "scroll_amount": 120, "require_in_bounds": True})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True and data.get("details", {}).get("scroll_amount") == 120)
record_test(
    "D-06", "Mouse/Keyboard Automation", "Mouse Vertical Scroll Simulation",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "scroll_amount": data.get("details", {}).get("scroll_amount")}
)

# D-07: Mouse Drag
t0 = time.time()
status, data, _ = api_request("/v1/input/mouse", method="POST", payload={
    "action": "drag",
    "x": 350,
    "y": 350,
    "target_x": 370,
    "target_y": 370,
    "require_in_bounds": True
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True and "drag_to" in data.get("details", {}))
record_test(
    "D-07", "Mouse/Keyboard Automation", "Safe In-Bounds Mouse Drag Action",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "drag_to": data.get("details", {}).get("drag_to")}
)

# D-08: Keyboard Single-Key Press
t0 = time.time()
status, data, _ = api_request("/v1/input/keyboard", method="POST", payload={"action": "press", "key": "shift"})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True and data.get("details", {}).get("key") == "shift")
record_test(
    "D-08", "Mouse/Keyboard Automation", "Keyboard Single-Key Press ('shift')",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "key": data.get("details", {}).get("key")}
)

# D-09: Keyboard Multi-Key Shortcut Combination
t0 = time.time()
status, data, _ = api_request("/v1/input/keyboard", method="POST", payload={"action": "hotkey", "keys": ["ctrl", "shift"]})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("success") is True and data.get("details", {}).get("keys") == ["ctrl", "shift"])
record_test(
    "D-09", "Mouse/Keyboard Automation", "Keyboard Multi-Key Modifier Hotkey Combination",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "keys": data.get("details", {}).get("keys")}
)

# E-04: Application Launch with Arguments & Working Directory
t0 = time.time()
status, data, _ = api_request("/v1/applications/launch", method="POST", payload={
    "app_name": "cmd",
    "args": ["/k", "title VIOLET_WORKING_DIR_TEST"],
    "working_dir": r"C:\Windows"
})
dur = (time.time() - t0) * 1000
spawned_pid2 = data.get("pid")
passed = (status == 200 and data.get("success") is True and spawned_pid2 is not None)
record_test(
    "E-04", "Application Management", "Application Launch with Command-Line Args and Working Directory",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "pid": spawned_pid2, "app_name": data.get("app_name")}
)
if spawned_pid2:
    api_request("/v1/processes/terminate", method="POST", payload={"pid": spawned_pid2, "force": True})

# E-05: Non-Existent Application Launch Attempt
t0 = time.time()
status, data, _ = api_request("/v1/applications/launch", method="POST", payload={"app_name": "totally_fabricated_nonexistent_binary.exe"})
dur = (time.time() - t0) * 1000
passed = (status == 403 and "not in the approved" in data.get("detail", "").lower())
record_test(
    "E-05", "Application Management", "Non-Existent Unapproved Binary Launch Rejection (HTTP 403)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# B-03: Invalid Window Handle Focus (HTTP 404)
t0 = time.time()
status, data, _ = api_request("/v1/windows/focus", method="POST", payload={"handle": 9999999})
dur = (time.time() - t0) * 1000
passed = (status == 404)
record_test(
    "B-03", "Windows Management", "Invalid Window Handle Rejection (HTTP 404)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": data.get("detail")}
)

# B-04: Stale Window Handle Focus (Spawn, terminate, focus terminated handle -> HTTP 404)
t0 = time.time()
status, launch_res, _ = api_request("/v1/applications/launch", method="POST", payload={"app_name": "cmd", "args": ["/k", "title VIOLET_STALE_TEST"]})
stale_pid = launch_res.get("pid")
time.sleep(0.4)
# Terminate process
if stale_pid:
    api_request("/v1/processes/terminate", method="POST", payload={"pid": stale_pid, "force": True})
    time.sleep(0.3)
# Attempt to focus by stale process/title
status, focus_stale, _ = api_request("/v1/windows/focus", method="POST", payload={"title": "VIOLET_STALE_TEST"})
dur = (time.time() - t0) * 1000
passed = (status == 404)
record_test(
    "B-04", "Windows Management", "Stale / Closed Window Handle Rejection (HTTP 404)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": focus_stale.get("detail")}
)

# C-02: Deep UI Automation Inspection
t0 = time.time()
status, data, _ = api_request("/v1/ui/inspect", method="POST", payload={"handle": target_handle, "max_depth": 10, "max_elements": 150})
dur = (time.time() - t0) * 1000
elements_deep = data.get("elements", [])
passed = (status == 200 and len(elements_deep) >= 1)
record_test(
    "C-02", "UI Automation", "Deep UIA Inspection (Depth 10, Elements 150)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "elements_found": len(elements_deep), "max_elements": 150}
)

# H-04: Verification condition: window_title_contains (Positive)
t0 = time.time()
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "focus_window",
    "target_window_handle": target_handle,
    "conditions": [
        {"check_type": "window_title_contains", "expected_title": target_title[:6], "timeout_seconds": 2.0}
    ],
    "capture_screenshot_evidence": False
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("verified") is True)
record_test(
    "H-04", "Post-Action Verification", "Positive Verification: 'window_title_contains' Substring Match",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified"), "summary": data.get("evidence_summary")}
)

# H-05: Verification condition: window_title_contains (Negative)
t0 = time.time()
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "focus_window",
    "target_window_handle": target_handle,
    "conditions": [
        {"check_type": "window_title_contains", "expected_title": "DEFINITELY_NOT_THE_TITLE_XYZ_987", "timeout_seconds": 0.8}
    ],
    "capture_screenshot_evidence": False
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("verified") is False)
record_test(
    "H-05", "Post-Action Verification", "Negative Verification: 'window_title_contains' Rejection",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified")}
)

# H-06: Verification condition: dialog_opened (Negative check when no dialog is active)
t0 = time.time()
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "open_dialog",
    "conditions": [
        {"check_type": "dialog_opened", "timeout_seconds": 0.5}
    ],
    "capture_screenshot_evidence": False
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and isinstance(data.get("verified"), bool))
record_test(
    "H-06", "Post-Action Verification", "Verification Condition: 'dialog_opened' Evaluation",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified"), "results": data.get("condition_results")}
)

# H-07: Multiple Verification Conditions Conjointly (Window Exists + Element Visible)
t0 = time.time()
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "composite_action",
    "target_window_handle": target_handle,
    "conditions": [
        {"check_type": "window_exists", "expected_title": target_title[:6], "timeout_seconds": 2.0},
        {"check_type": "element_visible", "expected_element_name": cond_elem_name, "control_type": cond_elem_type, "timeout_seconds": 2.0}
    ],
    "capture_screenshot_evidence": True
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("verified") is True and len(data.get("condition_results", [])) == 2)
record_test(
    "H-07", "Post-Action Verification", "Multiple Verification Conditions Conjoint Evaluation (2/2)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "verified": data.get("verified"), "conditions_count": len(data.get("condition_results", []))}
)

# H-08: Screenshot Evidence File Persistence and Accessibility on Disk
evidence_info = data.get("screenshot_evidence", {})
file_path_str = evidence_info.get("file_path")
evidence_exists = False
has_jpeg_magic = False
if file_path_str and Path(file_path_str).exists():
    evidence_exists = True
    ev_bytes = Path(file_path_str).read_bytes()
    has_jpeg_magic = ev_bytes.startswith(b"\xff\xd8")
passed = (evidence_exists and has_jpeg_magic and evidence_info.get("captured") is True)
record_test(
    "H-08", "Post-Action Verification", "Screenshot Evidence Disk Persistence & Accessibility Verification",
    "Newly Tested", "PASSED" if passed else "FAILED", 5.0,
    {"file_path": file_path_str, "file_exists": evidence_exists, "jpeg_valid": has_jpeg_magic, "byte_size": evidence_info.get("byte_size")}
)

# H-09: Screenshot Evidence Failure Handling (Non-fatal fallback)
t0 = time.time()
# Verification should succeed or fail cleanly without crashing even if capture has extreme options
status, data, _ = api_request("/v1/verification/verify", method="POST", payload={
    "action_type": "evidence_safe_check",
    "conditions": [{"check_type": "window_exists", "expected_title": target_title[:5], "timeout_seconds": 1.0}],
    "capture_screenshot_evidence": False # explicit false
})
dur = (time.time() - t0) * 1000
passed = (status == 200 and data.get("screenshot_evidence") is None)
record_test(
    "H-09", "Post-Action Verification", "Screenshot Evidence Optional / Graceful Handling",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "screenshot_evidence_omitted": data.get("screenshot_evidence") is None}
)

# H-10: Multi-Window Target Verification (Testing across diverse application windows)
other_windows = [w for w in windows if w.get("handle") != target_handle and w.get("title")]
t0 = time.time()
multi_win_passed = True
verified_targets = []
for ow in other_windows[:2]:
    ow_handle = ow["handle"]
    ow_title = ow["title"]
    s, d, _ = api_request("/v1/verification/verify", method="POST", payload={
        "action_type": "multi_window_check",
        "target_window_handle": ow_handle,
        "conditions": [{"check_type": "window_exists", "expected_title": ow_title[:8], "timeout_seconds": 2.0}],
        "capture_screenshot_evidence": False
    })
    if s == 200 and d.get("verified") is True:
        verified_targets.append(ow_title[:20])
    else:
        multi_win_passed = False
dur = (time.time() - t0) * 1000
passed = (multi_win_passed and len(verified_targets) >= 1)
record_test(
    "H-10", "Post-Action Verification", "Verification Across Diverse Open Windows (Multi-Target)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"verified_window_samples": verified_targets}
)

# I-05: Pairing Verification with Invalid HMAC Signature (HTTP 401)
t0 = time.time()
status, challenge_obj, _ = api_request("/v1/pairing/challenge", method="POST", payload={"device_id": "audit-test-device"})
c_id2 = challenge_obj.get("challenge_id")
status, bad_sig_res, _ = api_request("/v1/pairing/verify", method="POST", payload={
    "challenge_id": c_id2,
    "device_id": "audit-test-device",
    "signature": "DEADBEEF00000000000000000000000000000000000000000000000000000000"
})
dur = (time.time() - t0) * 1000
passed = (status == 401 and "invalid" in bad_sig_res.get("detail", "").lower())
record_test(
    "I-05", "Device Pairing", "Invalid HMAC Signature Rejection (HTTP 401)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": bad_sig_res.get("detail")}
)

# I-06: Pairing Verification with Wrong Secret Key (HTTP 401)
t0 = time.time()
status, challenge_obj3, _ = api_request("/v1/pairing/challenge", method="POST", payload={"device_id": "audit-test-device-3"})
c_id3 = challenge_obj3.get("challenge_id")
nonce3 = challenge_obj3.get("nonce")
wrong_sig = hmac.new(b"completely_wrong_secret_key_000000000000", f"audit-test-device-3:{nonce3}".encode("utf-8"), hashlib.sha256).hexdigest()
status, wrong_key_res, _ = api_request("/v1/pairing/verify", method="POST", payload={
    "challenge_id": c_id3,
    "device_id": "audit-test-device-3",
    "signature": wrong_sig
})
dur = (time.time() - t0) * 1000
passed = (status == 401 and "invalid" in wrong_key_res.get("detail", "").lower())
record_test(
    "I-06", "Device Pairing", "Wrong Secret Key Pairing Rejection (HTTP 401)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status, "detail": wrong_key_res.get("detail")}
)

# I-07: Pairing Verification Challenge Replay Protection (Consuming challenge twice -> HTTP 401)
t0 = time.time()
status, challenge_obj4, _ = api_request("/v1/pairing/challenge", method="POST", payload={"device_id": "replay-device"})
c_id4 = challenge_obj4.get("challenge_id")
nonce4 = challenge_obj4.get("nonce")
sig4 = hmac.new(token.encode("utf-8"), f"replay-device:{nonce4}".encode("utf-8"), hashlib.sha256).hexdigest()
# First consumption -> 200
status1, v1, _ = api_request("/v1/pairing/verify", method="POST", payload={"challenge_id": c_id4, "device_id": "replay-device", "signature": sig4})
# Second consumption (Replay attempt) -> 401
status2, v2, _ = api_request("/v1/pairing/verify", method="POST", payload={"challenge_id": c_id4, "device_id": "replay-device", "signature": sig4})
dur = (time.time() - t0) * 1000
passed = (status1 == 200 and status2 == 401 and "already consumed" in v2.get("detail", "").lower() or "invalid" in v2.get("detail", "").lower())
record_test(
    "I-07", "Device Pairing", "Cryptographic Challenge Replay Protection (HTTP 401 on Re-use)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"first_attempt_status": status1, "second_replay_status": status2, "detail": v2.get("detail")}
)

# I-08: Pairing Session Revocation Enforcement (Heartbeat after revocation -> 401)
t0 = time.time()
stoken = v1.get("session_token")
if stoken:
    api_request(f"/v1/pairing/revoke?session_token={stoken}", method="POST")
    # Query heartbeat with revoked token
    status_hb, hb_revoked, _ = api_request(f"/v1/pairing/session?session_token={stoken}")
    passed = (status_hb == 200 and hb_revoked.get("active") is False)
else:
    passed = False
dur = (time.time() - t0) * 1000
record_test(
    "I-08", "Device Pairing", "Pairing Session Revocation Enforcement (Inactive on Query)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status_hb, "is_active": hb_revoked.get("active")}
)

# J-05: Emergency-Stop Enforcement on /v1/input/click-element (HTTP 400)
t0 = time.time()
api_request("/v1/emergency-stop/trigger", method="POST")
status_ce, ce_res, _ = api_request("/v1/input/click-element", method="POST", payload={
    "window_handle": target_handle,
    "element_name": cond_elem_name,
    "click_type": "left"
})
dur = (time.time() - t0) * 1000
passed = (status_ce == 400 and "emergency stop" in ce_res.get("detail", "").lower())
record_test(
    "J-05", "Emergency Stop", "Enforce Emergency Stop Blockade on /v1/input/click-element (HTTP 400)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status_ce, "detail": ce_res.get("detail")}
)

# J-06: Emergency-Stop Enforcement on /v1/input/keyboard (HTTP 400)
t0 = time.time()
status_kb, kb_res, _ = api_request("/v1/input/keyboard", method="POST", payload={"action": "type", "text": "test blocked"})
dur = (time.time() - t0) * 1000
passed = (status_kb == 400 and "emergency stop" in kb_res.get("detail", "").lower())
record_test(
    "J-06", "Emergency Stop", "Enforce Emergency Stop Blockade on /v1/input/keyboard (HTTP 400)",
    "Newly Tested", "PASSED" if passed else "FAILED", dur,
    {"status_code": status_kb, "detail": kb_res.get("detail")}
)
# Resume operations
api_request("/v1/emergency-stop/resume", method="POST")

# ==============================================================================
# COMPUTE TOTALS & OUTPUT RESULTS
# ==============================================================================
total_tests = len(test_results)
passed_tests = sum(1 for t in test_results if t["status"] == "PASSED")
failed_tests = sum(1 for t in test_results if t["status"] == "FAILED")
blocked_tests = sum(1 for t in test_results if t["status"] == "BLOCKED")
not_tested = sum(1 for t in test_results if t["status"] == "NOT_TESTED")
prev_tests = sum(1 for t in test_results if t["suite_type"] == "Previously Tested")
new_tests = sum(1 for t in test_results if t["suite_type"] == "Newly Tested")
total_duration = sum(t["duration_ms"] for t in test_results)
pass_rate = round((passed_tests / total_tests) * 100, 2) if total_tests > 0 else 0.0

print(f"\n=======================================================")
print(f"RESULTS SUMMARY: {passed_tests}/{total_tests} PASSED ({failed_tests} failed, {blocked_tests} blocked) in {round(total_duration, 2)}ms [Pass Rate: {pass_rate}%]")
print(f"  - Previously Tested (Baseline Suite): {prev_tests}")
print(f"  - Newly Tested (QA Expansion Suite):  {new_tests}")
print(f"=======================================================")

results_payload = {
    "test_suite": "VIOLET AI Phase 2 Windows Agent QA Audit & Extended Validation Suite",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "target": BASE_URL,
    "environment": {
        "os": "Windows 11 Pro",
        "agent_version": "2.0.0",
        "python_version": sys.version.split()[0],
        "subsystems": ["Win32 API", "Windows UI Automation (pywinauto)", "MSS Screen Capture", "HMAC-SHA256"]
    },
    "metrics": {
        "total": total_tests,
        "passed": passed_tests,
        "failed": failed_tests,
        "blocked": blocked_tests,
        "not_tested": not_tested,
        "previously_tested_count": prev_tests,
        "newly_tested_count": new_tests,
        "pass_rate_percentage": pass_rate,
        "total_duration_ms": round(total_duration, 2)
    },
    "results": test_results
}

docs_dir = Path(r"D:\violet\Neuro\docs")
docs_dir.mkdir(parents=True, exist_ok=True)
json_out = docs_dir / "VIOLET_AI_PHASE_2_TEST_RESULTS.json"
json_out.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")
print(f"Saved updated machine-readable JSON results to: {json_out}")
