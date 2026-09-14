"""Теневая пересылка доставок YClients в Maya OS.

Роль модуля намеренно узкая:

    доставка провайдера → существующая обработка бота
                        → аутентифицированная КОПИЯ конверта в Nest

Бот здесь НЕ:
  • классифицирует неизвестные доставки;
  • создаёт доменные события;
  • вычисляет бизнес-смысл;
  • делает собственную дедупликацию;
  • заменяет существующие побочные действия.

Всё это делает Maya. Отсюда уходит только конверт.

🔴 Отказ пересылки не имеет права влиять на боевую обработку: у бота она
единственная, а теневой приём — наблюдение. Поэтому вызов «выстрелил и забыл»
с коротким таймаутом и без исключений наружу.

🔴 Персональные данные не пересылаются. Уходят: провайдер, компания, тип
доставки, идентификатор записи и ИМЕНА ключей верхнего уровня — без значений.
Значения могут содержать имя и телефон клиента; в теневом приёме они не нужны,
потому что Maya всё равно перечитывает запись у источника сама.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_SHADOW_URL = (
    os.environ.get("MAYA_SHADOW_INGEST_URL")
    or "http://127.0.0.1:3107/api/integrations/crm/shadow/deliveries"
).rstrip("/")
_BRIDGE_TOKEN = (os.environ.get("MAYA_INBOX_BRIDGE_TOKEN") or "").strip()
_PROVIDER = (os.environ.get("MAYA_BRIDGE_PROVIDER") or "yclients").strip().lower()


def _enabled() -> bool:
    raw = (os.environ.get("MAYA_SHADOW_FORWARD_ENABLED") or "").strip().lower()
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


def _scalar(value: Any) -> str | None:
    """Только короткие скаляры: словари и списки могут нести ПД."""
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    return text[:60] or None


async def forward_delivery(
    payload: dict[str, Any],
    *,
    event_type: str | None,
    record_id: int | None,
) -> None:
    """Копия конверта в Maya. Никогда не бросает в боевой путь."""
    if not _enabled():
        return

    try:
        body = {
            "provider": _PROVIDER,
            "external_company_id": _company_id(),
            "event": event_type,
            "resource": _scalar(payload.get("resource")),
            "status": _scalar(payload.get("status")),
            "external_id": str(record_id) if record_id else None,
            # Имена ключей верхнего уровня — состав трафика без его содержимого.
            "payload_keys": sorted(str(k)[:40] for k in list(payload.keys())[:40]),
        }
        timeout = aiohttp.ClientTimeout(total=3)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _SHADOW_URL,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Maya-Inbox-Bridge": _BRIDGE_TOKEN,
                },
            ) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    logger.warning(
                        "shadow forward HTTP %s: %s", resp.status, text[:200]
                    )
    except Exception as exc:  # noqa: BLE001 — теневой путь не роняет боевой
        logger.warning("shadow forward failed: %s", exc)
