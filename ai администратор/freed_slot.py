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
    """Точка A: как только клиент попал в лист ожидания на занятое время —
    пингуем админа (Антона), чтобы он знал и мог прозвонить/предложить альтернативу.
    Идемпотентно: помечаем admin_notified_at, дважды по одной записи не шлём."""
    try:
        pending = database.get_waitlist_pending_admin_alert(limit=20)
    except Exception as e:
        logger.error(f"freed_slot: pending admin alert lookup: {e}")
        return {"pending": 0, "alerted": 0}
    if not pending:
        return {"pending": 0, "alerted": 0}

    done_ids: list[int] = []
    alerted = 0
    for w in pending:
        name, phone = _client_name_phone(w.get("chat_id"), w.get("client_id"))
        staff_name = _master_name(int(w.get("staff_id") or 0))
        master_first = staff_name.split()[0] if staff_name else "мастеру"
        try:
            when = _format_slot(datetime.fromisoformat(str(w["slot_datetime"])[:16]))
        except Exception:
            when = str(w.get("slot_datetime") or "")
        text = (
            f"⏳ *Новый в листе ожидания*\n\n"
            f"👤 {name} — `{phone}`\n"
            f"🗓 хочет *{when}* · {master_first} (сейчас занято)\n\n"
            f"Как освободится — Майя оповестит и клиента, и тебя. "
            f"Можешь прозвонить и предложить альтернативу."
        )
        if await _notify_admins(app, text):
            done_ids.append(int(w["id"]))
            alerted += 1
        else:
            # админов нет/не доставилось — всё равно не долбим по кругу
            done_ids.append(int(w["id"]))
    if done_ids:
        try:
            database.mark_waitlist_admin_alerted(done_ids)
        except Exception as e:
            logger.error(f"freed_slot: mark_waitlist_admin_alerted: {e}")
    if alerted:
        logger.info(f"freed_slot: ⏳📣 админам о новых в листе ожидания: {alerted}")
    return {"pending": len(pending), "alerted": alerted}


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
