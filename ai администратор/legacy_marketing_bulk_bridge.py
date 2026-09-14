"""B35 panel transport: canonical owner proof and durable campaign identity only."""
import json
import os
import requests


def command(operation: str, proof: str, payload: dict) -> dict:
    if operation not in {"preview", "confirm", "resume", "status"}:
        raise ValueError("B35_OPERATION_UNSUPPORTED")
    try:
        identity = json.loads(proof)
    except (TypeError, ValueError):
        raise ValueError("B35_CANONICAL_OWNER_SESSION_REQUIRED")
    if (not isinstance(identity, dict) or set(identity) != {"type", "credential"}
            or identity.get("type") != "maya_jwt" or not isinstance(identity.get("credential"), str)
            or not identity["credential"]):
        raise ValueError("B35_CANONICAL_OWNER_SESSION_REQUIRED")
    from config import YCLIENTS_COMPANY_ID
    token = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("B35_BRIDGE_UNAVAILABLE")
    try:
        response = requests.post(
            "http://127.0.0.1:3107/api/internal/legacy/marketing-bulk/" + operation,
            headers={"x-maya-legacy-bridge": token},
            json={"provider": "yclients", "externalCompanyId": str(YCLIENTS_COMPANY_ID),
                  "channelProof": proof, "payload": payload}, timeout=30,
        )
    except (requests.Timeout, requests.ConnectionError):
        raise RuntimeError("B35_OUTCOME_UNKNOWN_RESUME_SAME_CAMPAIGN")
    if response.status_code >= 500:
        raise RuntimeError("B35_OUTCOME_UNKNOWN_RESUME_SAME_CAMPAIGN")
    if response.status_code >= 400:
        if response.status_code == 409:
            raise ValueError("IDEMPOTENCY_CONFLICT")
        raise ValueError("B35_AUTHORITY_OR_REQUEST_REJECTED")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("B35_OUTCOME_UNKNOWN_RESUME_SAME_CAMPAIGN")
    return result
