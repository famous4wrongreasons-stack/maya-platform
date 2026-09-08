"""
Canonical wanted-slot match for released capacity.

Когда клиент отменяет запись (через бот, через YClients-кабинет, либо ему
звонит администратор и убирает), мы получаем webhook record.delete от
YClients. The provider event may inform canonical Opportunity analysis. This
module invokes only the approved B9 exact-time wanted-slot path.

Принципы:
  • Delivery exists only for an approved ClientWantedSlotInterest.
  • Cycle scoring never grants communication authority.
  • Client identity, policy and delivery endpoint checks stay in Maya OS.
  • Только в будущее: если слот уже в прошлом — игнорируем.
"""
from __future__ import annotations

import logging
from datetime import date, datetime

from telegram.ext import Application

import database
import legacy_wanted_slot_bridge
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

_yc = YClientsAPI()


def _first_name(full: str | None) -> str:
    if not full:
        return "друг"
    return full.strip().split()[0]


def _master_name(staff_id: int) -> str:
    """Получаем имя мастера по id из YClients — используем для текста сообщения."""
    if not staff_id:
        return "мастеру"
    for m in (_yc.get_masters() or []):
        if m.get("id") == staff_id:
            return m.get("name") or "мастеру"
    return "мастеру"


def _format_slot(slot_dt: datetime) -> str:
    """'2026-05-28T18:00:00' → 'завтра в 18:00' / '28 мая в 18:00' и т.п."""
    today = date.today()
    delta = (slot_dt.date() - today).days
    time_part = slot_dt.strftime("%H:%M")
    if delta == 0:
        return f"сегодня в {time_part}"
    if delta == 1:
        return f"завтра в {time_part}"
    if delta == 2:
        return f"послезавтра в {time_part}"
    months = ["января", "февраля", "марта", "апреля", "мая", "июня",
              "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    return f"{slot_dt.day} {months[slot_dt.month - 1]} в {time_part}"


# ─── Уведомления администратору (Антону) по листу ожидания ───────────────

def _admin_ids() -> list[int]:
    try:
        return [int(a) for a in (database.list_admins() or []) if a]
    except Exception as e:
        logger.error(f"freed_slot: list_admins: {e}")
        return []


async def _notify_admins(app: Application, text: str) -> int:
    """Шлём операционное уведомление всем админам (среди них Антон). Внутреннее —
    без тихого часа. Возвращает число успешных отправок."""
    sent = 0
    for aid in _admin_ids():
        try:
            await app.bot.send_message(aid, text, parse_mode="Markdown",
                                       disable_web_page_preview=True)
            sent += 1
        except Exception as e:
            logger.error(f"freed_slot: admin notify {aid}: {e}")
    return sent


def _client_name_phone(chat_id, client_id) -> tuple[str, str]:
    cl = None
    try:
        if chat_id:
            cl = database.get_client(int(chat_id))
        if not cl and client_id:
            cl = database.get_client_by_id(int(client_id))
    except Exception:
        cl = None
    cl = cl or {}
    return _first_name(cl.get("name")), (cl.get("phone") or "—")


async def alert_admins_new_waitlist(app: Application) -> dict:
    from canonical_operational_alerts import trigger
    triggered = await trigger()
    return {'triggered':triggered,'pending':0,'alerted':0,'authority':'canonical_wanted_interest_only'}


async def offer_freed_slot(
    app: Application,
    staff_id: int,
    slot_dt: datetime,
    source_event_id: str | None = None,
) -> dict:
    """Match only approved B9 exact-time interests for released capacity.

    Record-delete evidence may feed the canonical Opportunity lifecycle, but
    cycle scoring is not outreach authority. This initiator never reads a
    legacy recipient, sends Telegram directly, or writes a legacy offer fact.
    """
    del app  # Delivery is owned by canonical Communication Delivery.
    if slot_dt <= datetime.now():
        logger.info("freed_slot: released slot is in the past; skipping")
        return {"status": "slot_in_past", "waitlist_sent": 0}

    slot_iso = slot_dt.isoformat(timespec="minutes")
    try:
        canonical = await __import__("asyncio").to_thread(
            legacy_wanted_slot_bridge.match_available_slot,
            staff_id,
            slot_dt,
            source_event_id or f"legacy-freed-slot:{staff_id}:{slot_iso}",
        )
    except Exception as exc:
        logger.error(
            "freed_slot: canonical wanted-slot match failed: %s",
            type(exc).__name__,
        )
        return {
            "status": "canonical_match_unavailable",
            "waitlist_sent": 0,
            "cycle_scored_outreach": "disabled",
        }

    outcomes = canonical.get("outcomes", []) if isinstance(canonical, dict) else []
    notified = sum(
        1
        for item in outcomes
        if isinstance(item, dict) and item.get("status") == "notified"
    )
    summary = {
        "status": "done",
        "waitlist_sent": notified,
        "cycle_scored_outreach": "disabled",
        "slot": slot_iso,
        "staff_id": staff_id,
    }
    logger.info("freed_slot: canonical wanted-slot outcome %s", summary)
    return summary
