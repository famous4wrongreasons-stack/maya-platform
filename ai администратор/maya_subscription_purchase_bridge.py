"""B10 transport: verified channel -> canonical P4-05 purchase executor.

This bridge has no Client, subscription, payment, provider, or delivery writer.
The backend binds the integration, verifies ClientChannelLink, derives all value
facts and executes the existing P4-05 Action Engine capability.
"""
from __future__ import annotations

import os
from typing import Any

import requests

_CONTRACT = "maya.customer-subscription-purchase-cutover-bridge/1"
_URL = (
    os.environ.get("MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_URL")
    or "http://127.0.0.1:3107/api/customer-subscriptions/internal/cutover/initiate-purchase"
).strip()


def _company_id() -> str:
    from config import YCLIENTS_COMPANY_ID

    return str(YCLIENTS_COMPANY_ID).strip()


def initiate_purchase(
    *, channel_proof: str, purchase_intent_ref: str, offer_code: str
) -> dict[str, Any]:
    token = os.environ.get("MAYA_INBOX_BRIDGE_TOKEN", "").strip()
    company_id = _company_id()
    if not token or not company_id:
        raise RuntimeError("subscription_purchase_bridge_unavailable")
    response = requests.post(
        _URL,
        headers={"x-maya-inbox-bridge": token},
        json={
            "contract": _CONTRACT,
            "initiator": "pwa_subscription_purchase",
            "provider": "yclients",
            "external_company_id": company_id,
            "channel_proof": channel_proof,
            "purchase_intent_ref": purchase_intent_ref,
            "offer_code": offer_code,
        },
        timeout=12,
    )
    if response.status_code >= 400:
        if response.status_code in (400, 401, 403, 404, 409):
            raise ValueError("verified_client_or_checkout_conflict")
        raise RuntimeError("subscription_purchase_bridge_unavailable")
    result = response.json()
    if (
        not isinstance(result, dict)
        or result.get("outcome") != "checkout_ready"
        or not result.get("confirmation_url")
    ):
        raise RuntimeError("subscription_purchase_bridge_invalid_result")
    return result
