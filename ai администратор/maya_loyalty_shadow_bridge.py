"""Non-executable bridge for one P4-03 legacy loyalty earn candidate.

The legacy job remains the value executor. This module submits only an exact,
PII-free intent to Canonical Action Ingress and never calls a database or a
provider mutator.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.legacy-loyalty-earn-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_LEGACY_LOYALTY_EARN_SHADOW_URL")
    or "http://127.0.0.1:3107/api/loyalty/internal/shadow/legacy-earn"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED") or ""
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


async def plan_earn(
    *,
    external_client_id: int | str | None,
    visit_record_id: int | str | None,
    visit_occurred_on: str,
    visit_amount_rubles: int,
    legacy_claimed_points: int,
) -> dict[str, Any]:
    """Plan exactly one earn intent; failure never changes legacy execution."""
    if not _enabled():
        return _no_plan("shadow_disabled")
    client_ref = str(external_client_id or "").strip()
    visit_ref = str(visit_record_id or "").strip()
    company_id = _company_id()
    if not client_ref or not visit_ref or not company_id:
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "visit_record_id": visit_ref,
        "visit_occurred_on": str(visit_occurred_on),
        "visit_amount_rubles": int(visit_amount_rubles),
        "legacy_claimed_points": int(legacy_claimed_points),
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
                        "legacy loyalty earn shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:  # shadow cannot interrupt the legacy owner
        logger.warning("legacy loyalty earn shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
