"""Models for cryptographic device pairing and session lifecycle."""

from typing import Any, Optional
from pydantic import BaseModel, Field


class PairingChallengeRequest(BaseModel):
    device_id: str = Field(..., min_length=4, max_length=128, description="Unique client device identifier")
    device_name: str = Field(default="Desktop Client", max_length=100)
    client_info: dict[str, Any] = Field(default_factory=dict)


class PairingChallengeResponse(BaseModel):
    challenge_id: str
    nonce: str
    server_id: str
    expires_at: str


class PairingVerifyRequest(BaseModel):
    challenge_id: str
    device_id: str
    signature: str = Field(..., description="Cryptographic signature or HMAC over device_id:nonce")


class PairingVerifyResponse(BaseModel):
    success: bool
    session_token: Optional[str] = None
    device_id: str
    expires_at: str
    message: str


class SessionHeartbeatResponse(BaseModel):
    active: bool
    device_id: Optional[str] = None
    time_remaining_seconds: int = 0
    paired_at: Optional[str] = None
    message: str = "Active"
