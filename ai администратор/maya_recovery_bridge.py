"""PII-free recovery attribution bridge for MAYA OS.

The legacy bot owns several proven outreach flows. This module records only a
stable pseudonymous subject and delivery metadata after a message was sent.
Names, phone numbers and Telegram identifiers never leave the legacy process.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_INGEST_URL = (
    os.environ.get("MAYA_RECOVERY_INGEST_URL")
    or "http://127.0.0.1:3107/api/recovery/internal/touchpoints"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_ATTRIBUTION_SECRET = (
    os.environ.get("MAYA_RECOVERY_ATTRIBUTION_SECRET") or _BRIDGE_TOKEN
).strip()
_TENANT_SLUG = (
    os.environ.get("MAYA_INBOX_TENANT_SLUG") or "muzhskaya-estetika"
).strip().lower()
_SUBJECT_DOMAIN = "maya-recovery-subject:v1:"


def _normalized_phone_digits(phone: str | None) -> str:
    raw = str(phone or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    explicit_country_code = raw.startswith("+")
    if not explicit_country_code and len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    elif not explicit_country_code and len(digits) == 10:
        digits = "7" + digits
    return digits if 8 <= len(digits) <= 15 else ""


def _subject_ref(phone: str | None) -> str:
    digits = _normalized_phone_digits(phone)
    if not digits or len(_ATTRIBUTION_SECRET) < 24:
        return ""
    return hmac.new(
        _ATTRIBUTION_SECRET.encode("utf-8"),
        f"{_SUBJECT_DOMAIN}{digits}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _external_event_id(kind: str, source_seed: str) -> str:
    digest = hashlib.sha256(
        f"maya-recovery-event:v1:{kind}:{source_seed}".encode("utf-8")
    ).hexdigest()[:32]
    return f"{kind}:{digest}"


async def publish_recovery_touchpoint(
    *,
    phone: str,
    kind: str,
    source_seed: str,
    channel: str = "telegram",
    status: str = "sent",
    occurred_at: datetime | None = None,
    attribution_window_days: int = 30,
) -> bool:
    """Record a successful outreach without exposing client PII."""
    subject_ref = _subject_ref(phone)
    if not subject_ref or not _BRIDGE_TOKEN or len(_BRIDGE_TOKEN) < 24:
        return False

    timestamp = occurred_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    body = {
        "tenant_slug": _TENANT_SLUG,
        "external_event_id": _external_event_id(kind, source_seed),
        "subject_ref": subject_ref,
        "kind": kind,
        "channel": channel,
        "status": status,
        "occurred_at": timestamp.astimezone(timezone.utc).isoformat(),
        "attribution_window_days": max(1, min(90, int(attribution_window_days))),
    }

    try:
        import aiohttp

        timeout = aiohttp.ClientTimeout(total=4)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _INGEST_URL,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Maya-Inbox-Bridge": _BRIDGE_TOKEN,
                },
            ) as response:
                if response.status >= 400:
                    logger.warning(
                        "recovery ingest HTTP %s for kind=%s",
                        response.status,
                        kind,
                    )
                    return False
                return True
    except Exception as exc:
        logger.warning("recovery ingest failed for kind=%s: %s", kind, exc)
        return False
