"""A18 transport only: authenticated channel -> verified Client -> command.

No phone/User resolution, local consent write, or mutating fallback. The shared
transport binds the configured tenant, never the consenting Client.
"""
from __future__ import annotations

import json
import os
import requests


def channel_proof(headers, body: dict) -> str:
    init_data = headers.get("X-Telegram-InitData", "")
    authorization = headers.get("Authorization", "")
    maya_token = body.get("maya_token")
    if isinstance(maya_token, str) and maya_token:
        value = {"type": "maya_jwt", "credential": maya_token}
    elif init_data:
        value = {"type": "telegram_init_data", "credential": init_data}
    elif authorization.startswith("Bearer "):
        value = {"type": "maya_jwt", "credential": authorization[7:]}
    elif isinstance(body.get("auth_data"), dict):
        value = {"type": "telegram_widget", "credential": json.dumps(body["auth_data"], separators=(",", ":"))}
    else:
        raise ValueError("verified_channel_required")
    return json.dumps(value, separators=(",", ":"))


def command(operation: str, proof: str, payload: dict) -> dict:
    if operation not in {
        "consent", "status", "issue", "consume", "delivery-consent", "push-subscribe", "push-unsubscribe",
        "booking-prefill", "appointment-create", "appointment-cancel", "appointment-reschedule",
        "appointment-services", "cabinet-projection", "realtime-authority",
    }:
        raise ValueError("unsupported_client_command")
    from config import YCLIENTS_COMPANY_ID
    token = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("client_bridge_unavailable")
    # This is the same fixed YClients installation as the existing appointment
    # bridge. The backend independently checks the configured provider/company.
    try:
        response = requests.post(
            ("http://127.0.0.1:3107/api/internal/legacy/client-web-push/" + operation[5:]
             if operation in {"push-subscribe", "push-unsubscribe"}
             else "http://127.0.0.1:3107/api/internal/legacy/client-commands/" + operation),
            headers={"x-maya-legacy-bridge": token},
            json={"provider": "yclients", "externalCompanyId": str(YCLIENTS_COMPANY_ID),
                  "channelProof": proof, "payload": payload}, timeout=8,
        )
    except (requests.Timeout, requests.ConnectionError):
        # A lost response after create dispatch cannot prove failure. The
        # caller must not retry outside the durable ActionExecution identity.
        if operation == "appointment-create":
            raise RuntimeError("client_command_outcome_unknown")
        raise
    if response.status_code >= 500 and operation == "appointment-create":
        raise RuntimeError("client_command_outcome_unknown")
    if operation == "push-subscribe" and response.status_code == 409:
        try:
            if response.json().get("message") == "CLIENT_WEB_PUSH_LIMIT_EXCEEDED":
                raise ValueError("CLIENT_WEB_PUSH_LIMIT_EXCEEDED")
        except (AttributeError, requests.exceptions.JSONDecodeError):
            pass
    if response.status_code >= 400:
        # Never echo bearer, channel payload, upstream stack, or customer data.
        raise ValueError("client_link_or_authority_required" if response.status_code in (400, 401, 403, 404, 409) else "client_command_unavailable")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("client_bridge_invalid_result")
    return result


def staff_ai_turn(proof: str, messages: list[dict], request_id: str) -> dict:
    """One staff voice turn through canonical AI Core.

    The Maya JWT is an in-memory transport credential for this socket. Raw
    Telegram/channel ids and legacy role databases never enter staff authority.
    """
    try:
        parsed = json.loads(proof)
    except (TypeError, ValueError):
        raise ValueError("canonical_staff_session_required")
    if (
        not isinstance(parsed, dict)
        or set(parsed) != {"type", "credential"}
        or parsed.get("type") != "maya_jwt"
        or not isinstance(parsed.get("credential"), str)
        or not parsed["credential"]
    ):
        raise ValueError("canonical_staff_session_required")
    safe_messages = []
    for item in messages[-12:]:
        if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
            raise ValueError("invalid_realtime_context")
        content = item.get("content")
        if not isinstance(content, str) or not content or len(content) > 2000:
            raise ValueError("invalid_realtime_context")
        safe_messages.append({"role": item["role"], "content": content})
    if not safe_messages or not isinstance(request_id, str):
        raise ValueError("invalid_realtime_context")
    response = requests.post(
        "http://127.0.0.1:3107/api/ai/chat",
        headers={"Authorization": "Bearer " + parsed["credential"]},
        json={"surface": "voice", "audience": "staff",
              "requestId": request_id, "messages": safe_messages},
        timeout=45,
    )
    if response.status_code >= 400:
        raise ValueError("canonical_staff_ai_unavailable")
    result = response.json()
    if not isinstance(result, dict) or not isinstance(result.get("reply"), str):
        raise RuntimeError("canonical_staff_ai_invalid_result")
    return result


def delivery_consent(telegram_subject) -> dict:
    """Internal read-only delivery gate; no cached legacy consent authority."""
    subject = str(telegram_subject or "")
    if not subject.isdigit() or subject.startswith("0") or len(subject) > 20:
        return {}
    try:
        return command("delivery-consent", "", {"telegramSubject": subject})
    except (ValueError, RuntimeError, requests.RequestException):
        return {}


def consent_status(result: dict) -> str:
    if result.get("client_link_required"):
        return "client_link_required"
    if not result.get("privacy"):
        return "need_pdn"
    return "pass" if result.get("marketing_decided") else "need_marketing"
