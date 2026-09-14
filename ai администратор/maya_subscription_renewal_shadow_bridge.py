"""Disposable non-executable bridge for the third P4-05 renewal Shadow.

The legacy subscription handlers remain the production owner during this
slice. This fixture submits only an explicit renewal intent and exact provider
identity; it has no database, checkout, payment, subscription, provider, or
message mutation authority.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.customer-subscription-renewal-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_URL")
    or "http://127.0.0.1:3107/api/customer-subscriptions/internal/shadow/initiate-renewal"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED") or ""
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
        "renewalCheckoutsCreatedByNewPath": 0,
        "subscriptionTermMutationsByNewPath": 0,
        "paymentMutationsByNewPath": 0,
        "providerWritesByNewPath": 0,
        "messagesSentByNewPath": 0,
    }


async def plan_renewal(
    *,
    external_client_id: int | str | None,
    subscription_id: int | str | None,
    renewal_intent_ref: str | None,
    initiator: str = "telegram_subscription_renewal",
) -> dict[str, Any]:
    """Plan one successor checkout; failure never changes legacy execution."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    client_ref = str(external_client_id or "").strip()
    predecessor_ref = str(subscription_id or "").strip()
    intent_ref = str(renewal_intent_ref or "").strip()
    company_id = _company_id()
    if not client_ref or not predecessor_ref or not intent_ref or not company_id:
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "subscription_id": predecessor_ref,
        "renewal_intent_ref": intent_ref,
    }
    try:
        timeout = aiohttp.ClientTimeout(total=2.5)
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
                    text = await response.text()
                    logger.warning(
                        "subscription renewal shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:  # Shadow cannot interrupt the legacy owner.
        logger.warning("subscription renewal shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
