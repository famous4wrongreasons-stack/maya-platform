"""Non-executable bridge for one P4-03 loyalty grant issue candidate.

The adapter submits only opaque client/request/service references and legacy
comparison values. It never generates or submits a raw code, code hash,
canonical identity, price authority, approval, or execution permission, and it
never reads or writes the legacy ledger/provider. Production issue paths stay
untouched.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.legacy-loyalty-grant-issue-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_URL")
    or "http://127.0.0.1:3107/api/loyalty/internal/shadow/legacy-grant-issue"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()
_INITIATORS = frozenset(("telegram_client", "pwa_client"))


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_ENABLED") or ""
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


async def plan_grant_issue(
    *,
    external_client_id: int | str | None,
    initiator_kind: str | None,
    caller_request_id: str | None,
    service_id: int | str | None,
    legacy_claimed_service_title: str | None,
    legacy_claimed_points: int,
) -> dict[str, Any]:
    """Submit issue comparison evidence; never create a grant or code."""
    if not _enabled():
        return _no_plan("shadow_disabled")
    client_ref = str(external_client_id or "").strip()
    initiator = str(initiator_kind or "").strip()
    request_ref = str(caller_request_id or "").strip()
    service_ref = str(service_id or "").strip()
    service_title = str(legacy_claimed_service_title or "").strip()
    company_id = _company_id()
    points = int(legacy_claimed_points)
    if (
        not client_ref
        or initiator not in _INITIATORS
        or not request_ref
        or not service_ref
        or not service_title
        or not company_id
        or points < 1
        or points > 5_000_000
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "initiator_kind": initiator,
        "caller_request_id": request_ref,
        "service_id": service_ref,
        "legacy_claimed_service_title": service_title,
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
                        "legacy loyalty grant issue shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:
        logger.warning("legacy loyalty grant issue shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
