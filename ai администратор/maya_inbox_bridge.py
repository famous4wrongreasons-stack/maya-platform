"""Fail-closed bridge for proactive MAYA communication.

Python producers describe one logical message. Nest/Action Engine owns the
durable Inbox/APNS/Telegram deliveries; callers must not fall back to a direct
channel send when this bridge rejects the request or returns an unknown result.
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_INGEST_URL = (
    os.environ.get("MAYA_INBOX_INGEST_URL")
    or "http://127.0.0.1:3107/api/inbox/internal/ingest"
).rstrip("/")
_LEGACY_TELEGRAM_OBSERVE_URL = (
    os.environ.get("MAYA_COMMUNICATION_SHADOW_URL")
    or _INGEST_URL.rsplit("/", 1)[0] + "/observe-legacy-telegram"
).rstrip("/")
_PRIVACY_DELIVERY_URL = (
    os.environ.get("MAYA_PRIVACY_DELIVERY_URL")
    or _INGEST_URL.rsplit("/", 1)[0] + "/deliver-privacy-telegram"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_TENANT_SLUG = (
    os.environ.get("MAYA_INBOX_TENANT_SLUG") or "muzhskaya-estetika"
).strip().lower()



# 🔴 Устойчивое отображение источника на арендатора: пара (провайдер, компания).
# Слаг остаётся в теле только для совместимости — он ИМЯ, а не идентичность, и
# именно его расхождение (`muzhskaya-estetika` против `muzhskaya-estetika-3`)
# рвало приём: каждый вызов моста получал 403, и Maya OS не узнавала о записях.
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _external_company_id() -> str:
    explicit = (os.environ.get("MAYA_BRIDGE_COMPANY_ID") or "").strip()
    if explicit:
        return explicit
    try:
        from config import YCLIENTS_COMPANY_ID

        return str(YCLIENTS_COMPANY_ID).strip()
    except Exception:  # конфиг недоступен — остаётся совместимость по слагу
        return ""

def _source_event_id(kind: str, seed: str) -> str:
    digest = hashlib.sha1(f"{kind}|{seed}".encode("utf-8")).hexdigest()[:20]
    return f"{kind}:{digest}"


async def trigger_owner_report(kind: str) -> bool:
    """Trigger only: no content, date, recipients, provider delivery or fallback."""
    paths = {"daily_report": "daily-report", "morning_owner": "morning-owner", "morning_staff": "morning-staff"}
    if kind not in paths:
        raise ValueError("canonical_report_kind_required")
    token = (os.environ.get("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN") or "").strip()
    company = _external_company_id()
    if len(token) < 24 or not company:
        return False
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.post(
                "http://127.0.0.1:3107/api/internal/legacy/owner-reports/" + paths[kind],
                json={"provider": _PROVIDER, "externalCompanyId": company},
                headers={"x-maya-legacy-bridge": token},
            ) as response:
                return 200 <= response.status < 300
    except Exception:
        # Lost response cannot select a new report/revision/route or direct send.
        logger.warning("canonical daily report trigger unresolved")
        return False


async def trigger_owner_daily_report() -> bool:
    return await trigger_owner_report("daily_report")


async def publish_inbox_item(
    *,
    type: str,
    title: str,
    body_text: str,
    source_seed: str,
    telegram_chat_ids: list[int] | None = None,
    deep_link: str | None = None,
    payload: dict[str, Any] | None = None,
    fanout_owners: bool = True,
    telegram_parse_mode: str | None = None,
    telegram_buttons: list[dict[str, str]] | None = None,
) -> bool:
    # A generic payload cannot prove its business owner or delivery authority.
    return False


async def observe_legacy_telegram_send(
    *,
    telegram_chat_id: int,
    message_id: int | str,
    body_text: str,
) -> bool:
    """Record an already-sent legacy Telegram message in shadow only."""
    if not _BRIDGE_TOKEN or len(_BRIDGE_TOKEN) < 24:
        return False
    clean = (body_text or "").strip()
    if not clean:
        return False
    source_event_id = f"telegram:{int(telegram_chat_id)}:{message_id}"[:160]
    body = {
        "tenant_slug": _TENANT_SLUG,
        "provider": _PROVIDER,
        "external_company_id": _external_company_id(),
        "source_event_id": source_event_id,
        "telegram_chat_id": str(int(telegram_chat_id)),
        "body_text": clean[:12000],
        "template_ref": "legacy.telegram.text",
    }
    try:
        timeout = aiohttp.ClientTimeout(total=2)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _LEGACY_TELEGRAM_OBSERVE_URL,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Maya-Inbox-Bridge": _BRIDGE_TOKEN,
                },
            ) as resp:
                if resp.status >= 400:
                    response_text = await resp.text()
                    logger.warning(
                        "communication shadow HTTP %s: %s",
                        resp.status,
                        response_text[:300],
                    )
                    return False
                return True
    except Exception as exc:
        logger.warning("communication shadow observe failed: %s", exc)
        return False


async def deliver_privacy_telegram(
    *,
    telegram_chat_id: int,
    source_event_id: str,
) -> bool:
    """Ask Action Engine to deliver the fixed privacy response.

    This is a fail-closed cutover. Callers must never fall back to a direct
    Telegram send when the bridge is unavailable or the outcome is unknown.
    """
    if not _BRIDGE_TOKEN or len(_BRIDGE_TOKEN) < 24:
        return False
    try:
        chat_id = int(telegram_chat_id)
    except (TypeError, ValueError):
        return False
    event_id = str(source_event_id or "").strip()
    if chat_id <= 0 or not event_id or len(event_id) > 160:
        return False
    body = {
        "tenant_slug": _TENANT_SLUG,
        "provider": _PROVIDER,
        "external_company_id": _external_company_id(),
        "source_event_id": event_id,
        "telegram_chat_id": str(chat_id),
    }
    try:
        timeout = aiohttp.ClientTimeout(total=6)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _PRIVACY_DELIVERY_URL,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Maya-Inbox-Bridge": _BRIDGE_TOKEN,
                },
            ) as resp:
                if resp.status >= 400:
                    logger.warning(
                        "privacy delivery rejected by Action Engine: HTTP %s",
                        resp.status,
                    )
                    return False
                return True
    except Exception as exc:
        logger.warning("privacy delivery via Action Engine failed: %s", exc)
        return False


async def publish_owner_message(
    text: str,
    *,
    title: str = "MAYA",
    tag: str = "owner_alert",
    url: str = "/app/?panel=report",
    owner_ids: list[int] | None = None,
    telegram_buttons: list[dict[str, str]] | None = None,
) -> bool:
    return False
