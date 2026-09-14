"""Non-executable bridge for one P4-03 legacy loyalty backfill candidate.

The adapter submits only an opaque provider client reference, initiator label,
and legacy comparison values. It never submits a phone, canonical identity,
provider result, cap, approval, or execution authority, and never reads or
writes either ledger or the provider. Production backfill paths stay untouched.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.legacy-loyalty-backfill-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_LEGACY_LOYALTY_BACKFILL_SHADOW_URL")
    or "http://127.0.0.1:3107/api/loyalty/internal/shadow/legacy-backfill"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()
_INITIATORS = frozenset(("lazy_access", "admin_batch"))


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_LEGACY_LOYALTY_BACKFILL_SHADOW_ENABLED") or ""
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


async def plan_backfill(
    *,
    external_client_id: int | str | None,
    initiator_kind: str | None,
    legacy_claimed_sold_amount_rubles: int,
    legacy_claimed_points: int,
) -> dict[str, Any]:
    """Submit legacy comparison evidence; never grant welcome points."""
    if not _enabled():
        return _no_plan("shadow_disabled")
    client_ref = str(external_client_id or "").strip()
    initiator = str(initiator_kind or "").strip()
    company_id = _company_id()
    sold_amount = int(legacy_claimed_sold_amount_rubles)
    points = int(legacy_claimed_points)
    if (
        not client_ref
        or initiator not in _INITIATORS
        or not company_id
        or sold_amount < 0
        or sold_amount > 100_000_000
        or points < 0
        or points > 5_000_000
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "initiator_kind": initiator,
        "legacy_claimed_sold_amount_rubles": sold_amount,
        "legacy_claimed_points": points,
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
                        "legacy loyalty backfill shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:
        logger.warning("legacy loyalty backfill shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
