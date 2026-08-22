"""Fail-closed client for the MAYA appointment Action Engine bridge.

Legacy Python is an initiator only. Create, reschedule, and cancel always go
through Action Engine; this module has no direct CRM execution or fallback.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any

import requests


logger = logging.getLogger("legacy_appointment_bridge")

BRIDGE_CONTRACT = "maya.legacy-appointment-bridge/1"
BRIDGE_RESULT_CONTRACT = "maya.legacy-appointment-bridge-result/1"
DEFAULT_BRIDGE_URL = (
    "http://127.0.0.1:3107/api/internal/legacy/appointment-actions"
)
VALID_MODES = frozenset({"cutover"})
INVALID_MODE = "invalid"
TERMINAL_FAILURE_STATES = frozenset({"FAILED", "NOT_EXECUTED"})


def bridge_mode() -> str:
    """Return cutover mode; every other configuration fails closed."""
    value = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE", "").strip().lower()
    if value not in VALID_MODES:
        logger.error("Invalid legacy appointment bridge mode; refusing mutation")
        return INVALID_MODE
    return value


def _timeout_seconds() -> float:
    raw = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TIMEOUT_SECONDS", "8")
    try:
        return max(1.0, min(30.0, float(raw)))
    except (TypeError, ValueError):
        return 8.0


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def opaque_client_reference(phone: str, fallback: str = "anonymous") -> str:
    """Build a stable, PII-free client reference for the typed bridge payload."""
    digits = "".join(char for char in str(phone or "") if char.isdigit())
    material = digits or str(fallback or "anonymous")
    return f"legacy-client:{hashlib.sha256(material.encode('utf-8')).hexdigest()}"


def appointment_idempotency_key(
    *,
    provider: str,
    external_company_id: str,
    action_class: str,
    payload: dict[str, Any],
) -> str:
    """Return a deterministic transport alias; Action Engine owns identity."""
    identity = {
        "contract": BRIDGE_CONTRACT,
        "provider": str(provider).strip().lower(),
        "external_company_id": str(external_company_id).strip(),
        "action_class": action_class,
        "payload": payload,
    }
    return f"legacy-v1:{_digest(identity)}"


def _requester_reference(origin: str, action_class: str, payload: dict[str, Any]) -> str:
    return f"legacy:{origin}:{action_class}:{_digest(payload)[:20]}"


def _bridge_url(path: str) -> str:
    base = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_URL", DEFAULT_BRIDGE_URL)
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _bridge_headers() -> dict[str, str]:
    token = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("legacy_appointment_bridge_token_missing")
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-maya-legacy-bridge": token,
    }


def _safe_error_code(response: requests.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = {}
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("code"), str):
            return error["code"][:80]
        if isinstance(body.get("code"), str):
            return body["code"][:80]
    return "legacy_appointment_bridge_rejected"


def _transport_unknown(code: str = "bridge_outcome_unknown") -> dict[str, Any]:
    return {
        "success": False,
        "accepted": None,
        "unknown": True,
        "code": code,
        "retry_allowed": False,
        "error": "Результат операции уточняется. Не повторяйте действие.",
        "safe_explanation": "Результат операции уточняется. Не повторяйте действие.",
    }


def _rejected_result(code: str, http_status: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "success": False,
        "accepted": False,
        "unknown": False,
        "retry_allowed": False,
        "code": code,
        "error": "Операция не принята.",
        "safe_explanation": "Операция не принята.",
    }
    if http_status is not None:
        result["http_status"] = http_status
    return result


def _canonical_result(body: dict[str, Any]) -> dict[str, Any]:
    if body.get("contract") != BRIDGE_RESULT_CONTRACT or body.get("accepted") is not True:
        return _rejected_result("legacy_appointment_bridge_contract_invalid")

    execution = body.get("execution")
    if not isinstance(execution, dict):
        return _rejected_result("legacy_appointment_execution_result_missing")

    state = str(execution.get("state") or "").upper()
    execution_id = execution.get("executionId")
    safe_result = execution.get("safeResult")
    if not isinstance(safe_result, dict):
        safe_result = {}
    safe_explanation = str(body.get("safe_explanation") or "Операция принята.")

    common: dict[str, Any] = {
        "accepted": True,
        "execution_id": execution_id,
        "execution_state": state,
        "safe_explanation": safe_explanation,
    }
    if state == "SUCCEEDED":
        return {
            **common,
            "success": True,
            "unknown": False,
            "record_id": safe_result.get("externalId") or safe_result.get("external_id"),
            "safe_result": safe_result,
        }
    if state == "UNKNOWN":
        return {
            **common,
            "success": False,
            "unknown": True,
            "retry_allowed": False,
            "code": "outcome_unknown",
            "error": safe_explanation,
        }
    if state in TERMINAL_FAILURE_STATES:
        return {
            **common,
            "success": False,
            "unknown": False,
            "code": str(execution.get("outcomeCode") or "action_not_executed"),
            "error": safe_explanation,
        }
    return {
        **common,
        "success": False,
        "unknown": True,
        "retry_allowed": False,
        "code": "action_in_progress",
        "error": safe_explanation,
    }


def _post_bridge(path: str, envelope: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.post(
            _bridge_url(path),
            headers=_bridge_headers(),
            json=envelope,
            timeout=_timeout_seconds(),
        )
    except RuntimeError as exc:
        return _rejected_result(str(exc))
    except (requests.Timeout, requests.ConnectionError):
        # A transport failure cannot prove whether ActionExecution was persisted.
        return _transport_unknown()
    except requests.RequestException:
        return _transport_unknown("legacy_appointment_bridge_transport_error")

    if response.status_code >= 500:
        # The server may have persisted ActionExecution before failing to
        # serialize or return the response. Treat this as uncertain and let
        # Action Engine own reconciliation; never authorize a legacy fallback.
        return _transport_unknown(_safe_error_code(response))
    if response.status_code >= 400:
        return _rejected_result(_safe_error_code(response), response.status_code)
    try:
        body = response.json()
    except ValueError:
        return _transport_unknown("legacy_appointment_bridge_response_invalid")
    if not isinstance(body, dict):
        return _transport_unknown("legacy_appointment_bridge_response_invalid")
    return body


def _envelope(
    *,
    provider: str,
    external_company_id: str,
    origin: str,
    action_class: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "contract": BRIDGE_CONTRACT,
        "provider": str(provider).strip().lower(),
        "external_company_id": str(external_company_id).strip(),
        "origin": origin,
        "requester_ref": _requester_reference(origin, action_class, payload),
        "idempotency_key": appointment_idempotency_key(
            provider=provider,
            external_company_id=external_company_id,
            action_class=action_class,
            payload=payload,
        ),
        "action_class": action_class,
        "payload": payload,
    }


def dispatch_appointment_action(
    *,
    provider: str,
    external_company_id: str,
    origin: str | None,
    action_class: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Dispatch one appointment mutation through the sole canonical executor."""
    mode = bridge_mode()
    if mode == INVALID_MODE:
        return _rejected_result("legacy_appointment_bridge_mode_invalid")
    if not origin:
        return _rejected_result("legacy_appointment_bridge_origin_missing")

    envelope = _envelope(
        provider=provider,
        external_company_id=external_company_id,
        origin=origin,
        action_class=action_class,
        payload=payload,
    )
    result = _post_bridge("execute", envelope)
    if "execution" not in result:
        return result
    return _canonical_result(result)


def get_appointment_execution_status(
    *, provider: str, external_company_id: str, execution_id: str
) -> dict[str, Any]:
    """Read canonical execution state; this performs no Python reconciliation."""
    try:
        response = requests.get(
            _bridge_url(f"executions/{execution_id}"),
            headers=_bridge_headers(),
            params={
                "provider": str(provider).strip().lower(),
                "external_company_id": str(external_company_id).strip(),
            },
            timeout=_timeout_seconds(),
        )
    except RuntimeError as exc:
        return _rejected_result(str(exc))
    except requests.RequestException:
        return _transport_unknown("legacy_appointment_bridge_status_unavailable")
    if response.status_code >= 400:
        return _rejected_result(_safe_error_code(response), response.status_code)
    try:
        body = response.json()
    except ValueError:
        return _transport_unknown("legacy_appointment_bridge_response_invalid")
    if not isinstance(body, dict):
        return _transport_unknown("legacy_appointment_bridge_response_invalid")
    return _canonical_result(body)
