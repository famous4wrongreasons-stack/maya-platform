"""Non-executable bridge for one P4-03 cancellation loyalty refund.

The adapter submits exact opaque client/redemption/cancellation evidence. It
never looks up identity by phone, reads or writes the legacy ledger, cancels an
appointment, or calls the CRM provider. Production refund paths stay untouched.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.legacy-loyalty-refund-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_LEGACY_LOYALTY_REFUND_SHADOW_URL")
    or "http://127.0.0.1:3107/api/loyalty/internal/shadow/legacy-refund"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()
_EVIDENCE_KINDS = frozenset(("action_execution", "domain_event"))


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_LEGACY_LOYALTY_REFUND_SHADOW_ENABLED") or ""
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


async def plan_refund(
    *,
    external_client_id: int | str | None,
    provider_record_id: int | str | None,
    original_redemption_execution_id: str | None,
    cancellation_evidence_kind: str | None,
    cancellation_evidence_id: str | None,
    legacy_claimed_refund_points: int,
) -> dict[str, Any]:
    """Submit exact refund evidence; never execute the compensation."""
    if not _enabled():
        return _no_plan("shadow_disabled")
    client_ref = str(external_client_id or "").strip()
    record_ref = str(provider_record_id or "").strip()
    redemption_ref = str(original_redemption_execution_id or "").strip()
    evidence_kind = str(cancellation_evidence_kind or "").strip()
    evidence_ref = str(cancellation_evidence_id or "").strip()
    company_id = _company_id()
    if (
        not client_ref
        or not record_ref
        or not redemption_ref
        or evidence_kind not in _EVIDENCE_KINDS
        or not evidence_ref
        or not company_id
        or int(legacy_claimed_refund_points) <= 0
    ):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "provider_record_id": record_ref,
        "original_redemption_execution_id": redemption_ref,
        "cancellation_evidence_kind": evidence_kind,
        "cancellation_evidence_id": evidence_ref,
        "legacy_claimed_refund_points": int(legacy_claimed_refund_points),
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
                        "legacy loyalty refund shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:
        logger.warning("legacy loyalty refund shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
