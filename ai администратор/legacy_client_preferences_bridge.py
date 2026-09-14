"""B5/B6 transport/read projections. No SQL or CRM mutation fallback."""
from __future__ import annotations
import os
import requests


def command(operation: str, proof: str, payload: dict) -> dict:
    if operation not in {"read", "notifications", "visit-mood", "delivery-read", "visit-projection"}:
        raise ValueError("unsupported_preference_operation")
    from config import YCLIENTS_COMPANY_ID
    token = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("preference_bridge_unavailable")
    response = requests.post(
        "http://127.0.0.1:3107/api/internal/legacy/client-preferences/" + operation,
        headers={"x-maya-legacy-bridge": token},
        json={"provider": "yclients", "externalCompanyId": str(YCLIENTS_COMPANY_ID),
              "channelProof": proof, "payload": payload}, timeout=8,
    )
    if response.status_code >= 400:
        raise ValueError("preference_request_rejected")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("invalid_preference_response")
    return result


def delivery_read(subject) -> dict:
    subject = str(subject or "")
    if not subject.isdigit() or subject.startswith("0") or len(subject) > 20:
        return {"linked": False}
    try:
        return command("delivery-read", "", {"telegramSubject": subject})
    except (ValueError, RuntimeError, requests.RequestException):
        return {"linked": False}


def delivery_preferences(subject) -> dict:
    result = delivery_read(subject)
    if not result.get("linked"):
        return {"record_changes": False, "reminder": False, "marketing": False,
                "cycle": False, "birthday": False, "freed_slot": False,
                "_canonical_quiet_now": True}
    prefs = dict(result.get("prefs") or {})
    prefs["_canonical_quiet_now"] = bool(result.get("quietNow"))
    return prefs


def visit_projection(record_ids) -> dict:
    ids = list(dict.fromkeys(str(value) for value in record_ids if value is not None))
    if not ids:
        return {}
    try:
        result = {}
        for offset in range(0, len(ids), 200):
            result.update(command("visit-projection", "", {"recordIds": ids[offset:offset + 200]}).get("moods") or {})
        return {int(key): value for key, value in result.items() if key.isdigit() and value in ("red", "blue")}
    except (ValueError, RuntimeError, requests.RequestException):
        return {}
