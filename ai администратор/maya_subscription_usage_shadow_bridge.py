"""Disposable non-executable bridge for P4-05 subscription usage Shadow.

The bridge submits only opaque source references. Tenant, canonical Client,
term, frozen plan, service eligibility, attendance, quantity, remaining
allowance, policy, and the exact usage claim are resolved by the backend from
canonical PostgreSQL state and a fresh provider read.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.customer-subscription-usage-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_URL")
    or "http://127.0.0.1:3107/api/customer-subscriptions/internal/shadow/sync-usage"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_ENABLED") or ""
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
        "intendedUsageClaim": None,
        "usageClaimsCreatedByNewPath": 0,
        "subscriptionEntitlementMutationsByNewPath": 0,
        "paymentMutationsByNewPath": 0,
        "providerWritesByNewPath": 0,
        "messagesSentByNewPath": 0,
    }


async def plan_subscription_usage(
    *,
    external_client_id: int | str | None,
    subscription_id: int | str | None,
    visit_record_id: int | str | None,
    initiator: str = "daily_scheduler",
) -> dict[str, Any]:
    """Request one read-only exact-visit plan; never assert or mutate usage."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    client_ref = str(external_client_id or "").strip()
    subscription_ref = str(subscription_id or "").strip()
    visit_ref = str(visit_record_id or "").strip()
    company_id = _company_id()
    if not client_ref or not subscription_ref or not visit_ref or not company_id:
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "subscription_id": subscription_ref,
        "visit_record_id": visit_ref,
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
                        "subscription usage shadow HTTP %s: %s",
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
        logger.warning("subscription usage shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
