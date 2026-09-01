"""Disposable non-executable bridge for P4-05 subscription cancellation Shadow.

The bridge submits only opaque source identities and an intent reference.
Actor authority, cancellation reason, effective semantics, lifecycle state,
policy, approval, and the terminal plan are derived by the canonical backend.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.customer-subscription-cancellation-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_URL")
    or "http://127.0.0.1:3107/api/customer-subscriptions/internal/shadow/cancel"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_ENABLED")
        or ""
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
        "intendedCancellation": None,
        "subscriptionsCancelledByNewPath": 0,
        "termMutationsByNewPath": 0,
        "renewalsCreatedByNewPath": 0,
        "paymentMutationsByNewPath": 0,
        "providerWritesByNewPath": 0,
        "usageMutationsByNewPath": 0,
        "messagesSentByNewPath": 0,
    }


async def plan_subscription_cancellation(
    *,
    external_client_id: int | str | None,
    subscription_id: int | str | None,
    requester_identity_provider: str,
    external_requester_id: int | str | None,
    cancellation_intent_ref: int | str | None,
    initiator: str = "telegram_client_cancellation",
) -> dict[str, Any]:
    """Request one cancellation plan without asserting authority or mutating."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    client_ref = str(external_client_id or "").strip()
    subscription_ref = str(subscription_id or "").strip()
    requester_provider = str(requester_identity_provider or "").strip().lower()
    requester_ref = str(external_requester_id or "").strip()
    intent_ref = str(cancellation_intent_ref or "").strip()
    company_id = _company_id()
    if not all(
        (
            client_ref,
            subscription_ref,
            requester_provider,
            requester_ref,
            intent_ref,
            company_id,
        )
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "subscription_id": subscription_ref,
        "requester_identity_provider": requester_provider,
        "external_requester_id": requester_ref,
        "cancellation_intent_ref": intent_ref,
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
                    text = await response.text()
                    logger.warning(
                        "subscription cancellation shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return (
                    result
                    if isinstance(result, dict)
                    else _no_plan("shadow_invalid_response")
                )
    except Exception as exc:  # Shadow cannot interrupt the legacy owner.
        logger.warning("subscription cancellation shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
