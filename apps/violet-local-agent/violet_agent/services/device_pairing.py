"""Cryptographic device pairing and session management service."""

import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from ..models.device import (
    PairingChallengeRequest,
    PairingChallengeResponse,
    PairingVerifyRequest,
    PairingVerifyResponse,
    SessionHeartbeatResponse,
)

logger = logging.getLogger(__name__)


class DevicePairingService:
    def __init__(self, secret_key: str, server_id: str = "violet-local-host-01"):
        self.secret_key = secret_key
        self.server_id = server_id
        # challenge_id -> (device_id, nonce, expires_at_epoch)
        self._pending_challenges: Dict[str, Tuple[str, str, float]] = {}
        # session_token -> (device_id, paired_at_epoch, expires_at_epoch)
        self._active_sessions: Dict[str, Tuple[str, float, float]] = {}

    def create_challenge(self, req: PairingChallengeRequest) -> PairingChallengeResponse:
        """Create a cryptographic challenge with nonce and 120s TTL."""
        self._clean_expired()
        challenge_id = secrets.token_hex(16)
        nonce = secrets.token_hex(32)
        expires_at_epoch = time.time() + 120.0

        self._pending_challenges[challenge_id] = (req.device_id, nonce, expires_at_epoch)

        return PairingChallengeResponse(
            challenge_id=challenge_id,
            nonce=nonce,
            server_id=self.server_id,
            expires_at=datetime.fromtimestamp(expires_at_epoch, timezone.utc).isoformat(),
        )

    def verify_challenge(self, req: PairingVerifyRequest) -> PairingVerifyResponse:
        """Verify the challenge response signature and issue a 24h pairing session token."""
        self._clean_expired()
        challenge = self._pending_challenges.pop(req.challenge_id, None)

        if not challenge:
            return PairingVerifyResponse(
                success=False,
                device_id=req.device_id,
                expires_at="",
                message="Challenge expired, invalid, or already consumed",
            )

        expected_device_id, nonce, expires_epoch = challenge
        if time.time() > expires_epoch:
            return PairingVerifyResponse(
                success=False,
                device_id=req.device_id,
                expires_at="",
                message="Challenge has expired",
            )

        if req.device_id != expected_device_id:
            return PairingVerifyResponse(
                success=False,
                device_id=req.device_id,
                expires_at="",
                message="Device ID mismatch",
            )

        # Verify HMAC-SHA256 signature
        payload = f"{req.device_id}:{nonce}".encode("utf-8")
        expected_sig = hmac.new(
            self.secret_key.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

        # Also support fallback SHA256(payload + secret)
        alt_sig = hashlib.sha256(payload + b":" + self.secret_key.encode("utf-8")).hexdigest()

        is_valid = hmac.compare_digest(req.signature.lower(), expected_sig.lower()) or hmac.compare_digest(req.signature.lower(), alt_sig.lower())

        if not is_valid:
            logger.warning(f"Device pairing signature verification failed for device {req.device_id}")
            return PairingVerifyResponse(
                success=False,
                device_id=req.device_id,
                expires_at="",
                message="Invalid cryptographic signature",
            )

        # Issue session token valid for 24 hours
        session_token = f"vsession_{secrets.token_urlsafe(32)}"
        now = time.time()
        session_expires = now + 86400.0

        self._active_sessions[session_token] = (req.device_id, now, session_expires)

        logger.info(f"Device successfully paired: {req.device_id}")
        return PairingVerifyResponse(
            success=True,
            session_token=session_token,
            device_id=req.device_id,
            expires_at=datetime.fromtimestamp(session_expires, timezone.utc).isoformat(),
            message="Device authenticated and pairing session established",
        )

    def check_session(self, session_token: str) -> SessionHeartbeatResponse:
        """Validate an active pairing session token."""
        self._clean_expired()
        session = self._active_sessions.get(session_token)

        if not session:
            return SessionHeartbeatResponse(
                active=False,
                device_id=None,
                time_remaining_seconds=0,
                paired_at=None,
                message="Session not found, expired, or revoked",
            )

        device_id, paired_at, expires_at = session
        remaining = int(max(0, expires_at - time.time()))

        if remaining <= 0:
            self._active_sessions.pop(session_token, None)
            return SessionHeartbeatResponse(
                active=False,
                device_id=device_id,
                time_remaining_seconds=0,
                paired_at=datetime.fromtimestamp(paired_at, timezone.utc).isoformat(),
                message="Session expired",
            )

        return SessionHeartbeatResponse(
            active=True,
            device_id=device_id,
            time_remaining_seconds=remaining,
            paired_at=datetime.fromtimestamp(paired_at, timezone.utc).isoformat(),
            message="Session active",
        )

    def is_session_valid(self, session_token: str) -> bool:
        """Check if a session token is currently valid."""
        return self.check_session(session_token).active

    def revoke_session(self, session_token: str) -> bool:
        """Revoke an active session token."""
        if session_token in self._active_sessions:
            del self._active_sessions[session_token]
            return True
        return False

    def _clean_expired(self) -> None:
        """Prune expired challenges and sessions."""
        now = time.time()
        expired_challenges = [
            cid for cid, (_, _, exp) in self._pending_challenges.items() if now > exp
        ]
        for cid in expired_challenges:
            del self._pending_challenges[cid]

        expired_sessions = [
            st for st, (_, _, exp) in self._active_sessions.items() if now > exp
        ]
        for st in expired_sessions:
            del self._active_sessions[st]
