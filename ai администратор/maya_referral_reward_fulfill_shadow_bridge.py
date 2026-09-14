"""Local non-executable bridge for one P4-04 referral reward claim.

The legacy executor remains the execution owner. The bearer exists only in the
transient HTTP request; this module cannot persist it, fulfill a reward, mutate
loyalty value, write to a provider, or send a message.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.referral-reward-fulfill-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_REFERRAL_REWARD_FULFILL_SHADOW_URL")
    or "http://127.0.0.1:3107/api/referrals/internal/shadow/fulfill-referral-reward"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED") or ""
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
        "newPathFulfillments": 0,
        "newPathLoyaltyValueMutations": 0,
        "newPathProviderWrites": 0,
        "newPathMessages": 0,
    }


async def plan_fulfillment(
    *,
    requester_identity_provider: str,
    external_requester_id: int | str | None,
    recipient_external_client_id: int | str | None,
    target_external_record_id: int | str | None,
    reward_claim: str,
    legacy_claimed_value_kopecks: int = 0,
    legacy_claimed_fulfilled: bool = False,
    initiator: str = "cashier_claim",
) -> dict[str, Any]:
    """Submit one transient claim to Shadow; failure never changes value."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    requester_provider = str(requester_identity_provider or "").strip().lower()
    requester_ref = str(external_requester_id or "").strip()
    recipient_ref = str(recipient_external_client_id or "").strip()
    target_record_ref = str(target_external_record_id or "").strip()
    transient_claim = str(reward_claim or "").strip()
    company_id = _company_id()
    if (
        not requester_provider
        or not requester_ref
        or not recipient_ref
        or not target_record_ref
        or not transient_claim
        or not company_id
    ):
        return _no_plan("identity_unresolved")

    body: dict[str, Any] = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "requester_identity_provider": requester_provider,
        "external_requester_id": requester_ref,
        "recipient_external_client_id": recipient_ref,
        "target_external_record_id": target_record_ref,
        "reward_claim": transient_claim,
        "legacy_claimed_value_kopecks": int(legacy_claimed_value_kopecks),
        "legacy_claimed_fulfilled": bool(legacy_claimed_fulfilled),
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
                        "referral reward fulfill shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:  # Shadow cannot interrupt the legacy owner.
        logger.warning("referral reward fulfill shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
