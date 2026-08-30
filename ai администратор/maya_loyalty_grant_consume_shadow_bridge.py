"""Non-executable bridge for one P4-03 loyalty grant consume candidate.

The raw bearer credential is sent only to the canonical server for a transient
HMAC lookup. The adapter never logs or persists it, never submits tenant,
canonical identity, role, entitlement, approval, cap, executor, or binding as
authority, and never calls the legacy ledger/provider mutators. Production
consume paths stay untouched.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.legacy-loyalty-grant-consume-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_URL")
    or "http://127.0.0.1:3107/api/loyalty/internal/shadow/legacy-grant-consume"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()
_INITIATORS = frozenset(("telegram_cashier", "panel_cashier"))


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_ENABLED") or ""
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
        "newPathValueMutations": 0,
        "newPathProviderWrites": 0,
    }


async def plan_grant_consume(
    *,
    external_requester_id: int | str | None,
    initiator_kind: str | None,
    redemption_code: str | None,
    legacy_claimed_points: int,
    legacy_claimed_balance_points: int,
    legacy_claimed_used: bool,
    legacy_claimed_expired: bool,
) -> dict[str, Any]:
    """Submit consume comparison evidence; never redeem or mutate value."""
    if not _enabled():
        return _no_plan("shadow_disabled")
    requester_ref = str(external_requester_id or "").strip()
    initiator = str(initiator_kind or "").strip()
    bearer = str(redemption_code or "").strip().upper()
    company_id = _company_id()
    points = int(legacy_claimed_points)
    balance = int(legacy_claimed_balance_points)
    if (
        not requester_ref
        or initiator not in _INITIATORS
        or len(bearer) < 8
        or len(bearer) > 128
        or not bearer.replace("-", "").isalnum()
        or not company_id
        or points < 1
        or points > 5_000_000
        or balance < 0
        or balance > 5_000_000
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "requester_identity_provider": "telegram",
        "external_requester_id": requester_ref,
        "initiator_kind": initiator,
        "redemption_code": bearer,
        "legacy_claimed_points": points,
        "legacy_claimed_balance_points": balance,
        "legacy_claimed_used": bool(legacy_claimed_used),
        "legacy_claimed_expired": bool(legacy_claimed_expired),
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
                    logger.warning(
                        "legacy loyalty grant consume shadow rejected with HTTP %s",
                        response.status,
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:
        logger.warning(
            "legacy loyalty grant consume shadow unavailable: %s",
            type(exc).__name__,
        )
        return _no_plan("shadow_unavailable")
