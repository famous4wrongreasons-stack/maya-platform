"""B9 bridge: verified Client identity -> canonical wanted-slot command.

The AI supplies slot material only. Client authority is the authenticated
request context installed before tool execution; no phone, chat id, User id or
SQLite Client lookup participates in identity resolution.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from zoneinfo import ZoneInfo

import requests


_SALON_TIMEZONE = ZoneInfo("Europe/Moscow")


def _request(operation: str, proof: str, payload: dict) -> dict:
    if operation not in {"add", "referral-read", "match"}:
        raise ValueError("unsupported_wanted_slot_operation")
    from config import YCLIENTS_COMPANY_ID

    token = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("wanted_slot_bridge_unavailable")
    response = requests.post(
        "http://127.0.0.1:3107/api/internal/legacy/client-wanted-slot/" + operation,
        headers={"x-maya-legacy-bridge": token},
        json={
            "provider": "yclients",
            "externalCompanyId": str(YCLIENTS_COMPANY_ID),
            "channelProof": proof,
            "payload": payload,
        },
        timeout=8,
    )
    if response.status_code >= 400:
        if response.status_code in (400, 401, 403, 404, 409):
            raise ValueError("client_link_or_wanted_slot_contract_required")
        raise RuntimeError("wanted_slot_retry_required")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("invalid_wanted_slot_response")
    return result


def _utc_instant(value: datetime | str) -> str:
    if isinstance(value, str):
        raw = value.strip().replace(" ", "T")
        parsed = datetime.fromisoformat(raw)
    elif isinstance(value, datetime):
        parsed = value
    else:
        raise ValueError("invalid_wanted_slot_instant")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_SALON_TIMEZONE)
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def remember_wanted_slot(external_staff_id, requested_time) -> dict:
    from legacy_client_habits_bridge import current_context

    context = current_context()
    if context is None:
        return {"saved": False, "error": "client_link_required"}
    desired_start_at = _utc_instant(requested_time)
    material = json.dumps(
        [context.intent, str(external_staff_id), desired_start_at],
        separators=(",", ":"),
    )
    identity = hashlib.sha256(material.encode("utf-8")).hexdigest()
    try:
        return _request(
            "add",
            context.proof,
            {
                "desiredStartAt": desired_start_at,
                "externalStaffId": str(external_staff_id),
                "idempotencyKey": "wanted-slot:" + identity,
            },
        )
    except (ValueError, RuntimeError, requests.RequestException):
        return {"saved": False, "error": "client_link_or_retry_required"}


def read_referral_presentation() -> dict:
    from legacy_client_habits_bridge import current_context

    context = current_context()
    if context is None:
        return {"status": "unavailable", "referralLink": None}
    try:
        return _request("referral-read", context.proof, {})
    except (ValueError, RuntimeError, requests.RequestException):
        return {"status": "unavailable", "referralLink": None}


def match_available_slot(external_staff_id, available_time, source_event_id) -> dict:
    source = str(source_event_id or "").strip()
    if len(source) < 8:
        raise ValueError("stable_wanted_slot_source_required")
    return _request(
        "match",
        "",
        {
            "availableStartAt": _utc_instant(available_time),
            "externalStaffId": str(external_staff_id),
            "sourceEventId": source[:240],
        },
    )
