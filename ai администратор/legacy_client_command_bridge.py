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
    if init_data:
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
        "consent", "status", "issue", "consume", "delivery-consent",
        "booking-prefill", "appointment-create", "appointment-cancel", "appointment-reschedule",
        "appointment-services",
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
            "http://127.0.0.1:3107/api/internal/legacy/client-commands/" + operation,
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
    if response.status_code >= 400:
        # Never echo bearer, channel payload, upstream stack, or customer data.
        raise ValueError("client_link_or_authority_required" if response.status_code in (400, 401, 403, 404, 409) else "client_command_unavailable")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("client_bridge_invalid_result")
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
