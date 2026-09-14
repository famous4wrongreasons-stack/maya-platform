"""Local non-executable bridge for one P4-04 referral reward issuance.

The legacy resolver remains the execution owner. This module submits exact
provider identities and optional comparison amounts only. It cannot issue a
reward, create a bearer, mutate loyalty value, write to a provider, or send a
message.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.referral-reward-issue-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_REFERRAL_REWARD_ISSUE_SHADOW_URL")
    or "http://127.0.0.1:3107/api/referrals/internal/shadow/issue-referral-rewards"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED") or ""
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
        "newPathRewardIssuances": 0,
        "newPathRewards": 0,
        "newPathLoyaltyValueMutations": 0,
        "newPathProviderWrites": 0,
        "newPathMessages": 0,
    }


async def plan_issuance(
    *,
    referrer_external_client_id: int | str | None,
    referred_external_client_id: int | str | None,
    legacy_claimed_inviter_reward_kopecks: int | None = None,
    legacy_claimed_invitee_reward_kopecks: int | None = None,
    initiator: str = "qualified_resolution",
) -> dict[str, Any]:
    """Plan one issuance; failure never interrupts the legacy owner."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    referrer_ref = str(referrer_external_client_id or "").strip()
    referred_ref = str(referred_external_client_id or "").strip()
    company_id = _company_id()
    if not referrer_ref or not referred_ref or not company_id:
        return _no_plan("identity_unresolved")

    body: dict[str, Any] = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "referrer_external_client_id": referrer_ref,
        "referred_external_client_id": referred_ref,
    }
    if legacy_claimed_inviter_reward_kopecks is not None:
        body["legacy_claimed_inviter_reward_kopecks"] = int(
            legacy_claimed_inviter_reward_kopecks
        )
    if legacy_claimed_invitee_reward_kopecks is not None:
        body["legacy_claimed_invitee_reward_kopecks"] = int(
            legacy_claimed_invitee_reward_kopecks
        )

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
                        "referral reward issue shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:  # Shadow cannot interrupt the legacy owner.
        logger.warning("referral reward issue shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
