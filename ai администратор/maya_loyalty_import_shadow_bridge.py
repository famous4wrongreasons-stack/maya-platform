"""Non-executable bridge for one P4-03 provider-card loyalty import.

The adapter submits only the exact opaque provider client reference and legacy
comparison values. It never submits a phone, card identity, policy decision,
provider snapshot, or execution authority, and never reads or writes either
ledger. Production lazy-import paths stay untouched.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.legacy-loyalty-import-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_LEGACY_LOYALTY_IMPORT_SHADOW_URL")
    or "http://127.0.0.1:3107/api/loyalty/internal/shadow/legacy-import"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_LEGACY_LOYALTY_IMPORT_SHADOW_ENABLED") or ""
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


async def plan_import(
    *,
    external_client_id: int | str | None,
    legacy_claimed_provider_balance_points: int,
    legacy_claimed_current_balance_points: int,
    legacy_claimed_delta_points: int,
) -> dict[str, Any]:
    """Submit import comparison evidence; never execute the alignment."""
    if not _enabled():
        return _no_plan("shadow_disabled")
    client_ref = str(external_client_id or "").strip()
    company_id = _company_id()
    provider_balance = int(legacy_claimed_provider_balance_points)
    current_balance = int(legacy_claimed_current_balance_points)
    delta = int(legacy_claimed_delta_points)
    if (
        not client_ref
        or not company_id
        or provider_balance < 0
        or current_balance < 0
        or provider_balance > 5_000_000
        or current_balance > 5_000_000
        or delta < -5_000_000
        or delta > 5_000_000
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "legacy_claimed_provider_balance_points": provider_balance,
        "legacy_claimed_current_balance_points": current_balance,
        "legacy_claimed_delta_points": delta,
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
                        "legacy loyalty import shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:
        logger.warning("legacy loyalty import shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
