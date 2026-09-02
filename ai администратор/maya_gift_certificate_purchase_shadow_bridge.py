"""Disposable non-executable bridge for the first P4-06 checkout Shadow.

The legacy gift-certificate handlers remain the production owner during this
slice. This fixture submits only an explicit purchase intent, exact provider
Client identity, server-catalog offer code, and an already opaque recipient
subject reference. It cannot create a certificate, bearer, payment,
redemption, provider write, value mutation, or message.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_CONTRACT = "maya.gift-certificate-purchase-shadow-bridge/1"
_SHADOW_URL = (
    os.environ.get("MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_URL")
    or "http://127.0.0.1:3107/api/gift-certificates/internal/shadow/initiate-purchase"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()
_SUBJECT_REF_RE = re.compile(r"^[a-f0-9]{64}$")


def _enabled() -> bool:
    raw = (
        os.environ.get("MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED") or ""
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
        "providerCheckoutsCreatedByNewPath": 0,
        "paymentMutationsByNewPath": 0,
        "certificatesCreatedOrActivatedByNewPath": 0,
        "redemptionsCreatedByNewPath": 0,
        "providerValueWritesByNewPath": 0,
        "messagesSentByNewPath": 0,
    }


async def plan_purchase(
    *,
    external_client_id: int | str | None,
    purchase_intent_ref: str | None,
    offer_code: str | None,
    recipient_subject_ref: str | None,
    initiator: str = "telegram_gift_certificate_purchase",
) -> dict[str, Any]:
    """Plan checkout only; failure never interrupts the legacy owner."""
    if not _enabled():
        return _no_plan("shadow_disabled")

    client_ref = str(external_client_id or "").strip()
    intent_ref = str(purchase_intent_ref or "").strip()
    selected_offer = str(offer_code or "").strip().lower()
    recipient_ref = str(recipient_subject_ref or "").strip()
    company_id = _company_id()
    if not all((client_ref, intent_ref, selected_offer, company_id)):
        return _no_plan("identity_unresolved")
    if not _SUBJECT_REF_RE.fullmatch(recipient_ref):
        return _no_plan("identity_unresolved")

    body = {
        "contract": _CONTRACT,
        "initiator": str(initiator),
        "provider": _PROVIDER,
        "external_company_id": company_id,
        "external_client_id": client_ref,
        "purchase_intent_ref": intent_ref,
        "offer_code": selected_offer,
        "recipient_subject_ref": recipient_ref,
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
                        "gift certificate purchase shadow HTTP %s: %s",
                        response.status,
                        text[:240],
                    )
                    return _no_plan("shadow_rejected")
                result = await response.json()
                return result if isinstance(result, dict) else _no_plan(
                    "shadow_invalid_response"
                )
    except Exception as exc:  # Shadow cannot interrupt the legacy owner.
        logger.warning("gift certificate purchase shadow failed: %s", exc)
        return _no_plan("shadow_unavailable")
