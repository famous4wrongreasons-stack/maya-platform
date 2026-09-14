"""Disposable non-executable bridge for P4-06 certificate redemption.

The raw certificate claim is carried only in the transient HTTP request. The
canonical backend derives the tenant-scoped lookup, exact certificate, target,
Client, value, actor authority, and policy. This module is deliberately not
wired into production Telegram or PWA redemption owners.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.gift-certificate-redemption-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_URL")
    or "http://127.0.0.1:3107/api/gift-certificates/internal/shadow/redeem"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_ENABLED") or ""
    ).strip().lower()
    return raw in ("1", "true", "on", "yes") and len(_BRIDGE_TOKEN) >= 24


def _company_id() -> str:
    explicit = (os.environ.get("MAYA_BRIDGE_COMPANY_ID") or "").strip()
    if explicit:
        return explicit
    try:
        from config import YCLIENTS_COMPANY_ID

        return str(YCLIENTS_COMPANY_ID).strip()
    except Exception:
        return ""


def _no_plan(outcome: str) -> dict[str, Any]:
    return {
        "outcome": outcome,
        "actionExecutionId": None,
        "shadowDivergences": 0,
        "redemptionsCreatedByNewPath": 0,
        "certificateValueMutationsByNewPath": 0,
        "rawBearerOrCodePersistedByNewPath": 0,
        "loyaltyTransactionsCreatedByNewPath": 0,
        "paymentProviderWritesByNewPath": 0,
        "messagesSentByNewPath": 0,
    }


async def plan_redemption(
    *,
    requester_identity_provider: str,
    external_requester_id: int | str | None,
    target_external_client_id: int | str | None,
    target_external_record_id: int | str | None,
    certificate_claim: str | None,
    initiator: str = "cashier_redeem",
) -> dict[str, Any]:
    """Submit an exact full-redemption Shadow request without mutating value."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    requester_provider = str(requester_identity_provider or "").strip().lower()
    requester_ref = str(external_requester_id or "").strip()
    client_ref = str(target_external_client_id or "").strip()
    record_ref = str(target_external_record_id or "").strip()
    transient_claim = str(certificate_claim or "").strip()
    company_id = _company_id()
    if not all(
        (
            requester_provider,
            requester_ref,
            client_ref,
            record_ref,
            transient_claim,
            company_id,
        )
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "requester_identity_provider": requester_provider,
        "external_requester_id": requester_ref,
        "target_external_client_id": client_ref,
        "target_external_record_id": record_ref,
        "certificate_claim": transient_claim,
        "redemption_mode": "full",
    }
    try:
        timeout = aiohttp.ClientTimeout(total=4.0)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _SHADOW_URL,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Maya-Inbox-Bridge": _BRIDGE_TOKEN,
                },
            ) as response:
                if response.status >= 400:
                    logger.warning(
                        "gift certificate redemption shadow HTTP %s",
                        response.status,
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception:  # Shadow cannot interrupt the legacy owner.
        logger.warning("gift certificate redemption shadow unavailable")
        return _no_plan("shadow_unavailable")
