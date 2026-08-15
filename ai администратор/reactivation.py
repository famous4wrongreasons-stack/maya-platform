"""
Реактивация уснувших клиентов через Telegram-бот.

Запускается ежедневно в 10:00 МСК. Для каждого клиента, который:
  • когда-то писал боту (есть telegram_chat_id в нашей БД)
  • был последний раз 4–8 недель назад
  • не записан на ближайшее время
  • не был реактивирован за последние 14 дней
  • не отказался от реактивации за последние 30 дней

— шлёт персональное сообщение от MAYA с inline-кнопками для записи.

Telegram запрещает писать тем, кто не нажимал /start. Поэтому охват
ограничен теми, кто уже знаком с ботом. Постепенно (с подключением QR
у мастеров, ссылок в SMS-напоминаниях из YClients) этот круг расширится.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, BadRequest
from telegram.ext import Application

import database
from maya_recovery_bridge import publish_recovery_touchpoint
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

# Целевое окно: клиент уснул 4–8 недель назад. Раньше — рано, позже —
# уже почти не вернётся, не стоит грузить.
DORMANT_MIN_DAYS = 28
DORMANT_MAX_DAYS = 56

# Лимиты на спам.
COOLDOWN_AFTER_SENT_DAYS = 14    # после отправленного — пауза
COOLDOWN_AFTER_DECLINE_DAYS = 30  # после отказа — длиннее пауза

_yc = YClientsAPI()


def _first_name(full: str | None) -> str:
    """«Дмитрий Петров» → «Дмитрий». Безопасно для пустых."""
    if not full:
        return "друг"
    return full.strip().split()[0]


def _find_last_attended_visit(bookings: list[dict]) -> dict | None:
    """Самый свежий состоявшийся визит (attendance=1)."""
    visits = [b for b in (bookings or []) if isinstance(b, dict)]
    attended = [
        b for b in visits
        if b.get("attendance") == 1 or b.get("visit_attendance") == 1
    ]
    if not attended:
        return None
    return max(attended, key=lambda b: (b.get("date") or b.get("datetime") or ""))


def _has_upcoming_booking(bookings: list[dict]) -> bool:
    """Есть ли запись на сегодня/потом — тогда реактивировать не нужно."""
    today_str = date.today().isoformat()
    for b in (bookings or []):
        if not isinstance(b, dict):
            continue
        dt = (b.get("date") or b.get("datetime") or "")[:10]
        if dt >= today_str and not (
            b.get("attendance") == 1 or b.get("visit_attendance") == 1
        ):
            return True
    return False


def find_dormant_clients() -> list[dict]:
    """Возвращает список кандидатов на реактивацию (с расшифрованным name/phone)."""
    today = date.today()
    candidates = []

    for client in database.list_telegram_clients():
        chat_id = client.get("telegram_chat_id")
        phone = client.get("phone")
        if not chat_id or not phone:
            continue

        # 152-ФЗ + Закон о рекламе: только клиенты с маркетинговым согласием
        if not database.has_marketing_consent(client["id"]):
            continue

        # Лимиты на спам
        if database.was_recently_reactivated(client["id"], COOLDOWN_AFTER_SENT_DAYS):
            continue
        if database.was_recently_declined(client["id"], COOLDOWN_AFTER_DECLINE_DAYS):
            continue

        # История из YClients
        try:
            bookings = _yc.get_client_bookings(phone)
        except Exception as e:
            logger.error(f"Реактивация: YClients ошибка для chat_id={chat_id}: {e}")
            continue

        if _has_upcoming_booking(bookings):
            continue  # уже записан

        last = _find_last_attended_visit(bookings)
        if not last:
            continue  # ни разу не был в гостях

        last_date_str = (last.get("date") or last.get("datetime") or "")[:10]
        try:
            last_date = datetime.strptime(last_date_str, "%Y-%m-%d").date()
        except Exception:
            continue

        days_since = (today - last_date).days
        if not (DORMANT_MIN_DAYS <= days_since <= DORMANT_MAX_DAYS):
            continue

        staff = last.get("staff") or {}
        candidates.append({
            "client_id": client["id"],
            "chat_id": chat_id,
            "phone": phone,
            "name": _first_name(client.get("name")),
            "last_master": staff.get("name") or "вашему мастеру",
            "last_staff_id": staff.get("id"),
            "days_since": days_since,
            "weeks_since": days_since // 7,
            "last_date": last_date_str,
        })

    return candidates


def _build_message(candidate: dict) -> tuple[str, InlineKeyboardMarkup]:
    name = candidate["name"]
    weeks = candidate["weeks_since"]
    master_first = _first_name(candidate["last_master"])

    if weeks == 1:
        period = "уже неделя"
    elif weeks <= 4:
        period = f"{weeks} недел{'и' if weeks < 5 else 'ь'}"
    elif weeks == 8:
        period = "почти 2 месяца"
    else:
        period = f"{weeks} недель"

    text = (
        f"Привет, {name}! 👋\n\n"
        f"Прошло {period} с последнего визита к {master_first} — "
        f"пора освежить причёску?\n\n"
        f"Если что — могу подобрать удобное время прямо сейчас."
    )

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            f"📅 Записаться к {master_first}",
            callback_data=f"react_book_{candidate['last_staff_id'] or 0}",
        )],
        [InlineKeyboardButton(
            "🗓 Выбрать другое время / мастера",
            callback_data="react_pick_other",
        )],
        [InlineKeyboardButton("🙅 Не сейчас", callback_data="react_decline")],
    ])
    return text, keyboard


async def run_reactivation_job(app: Application) -> dict:
    """Главный entry point — запускается scheduler'ом раз в день."""
    candidates = find_dormant_clients()
    sent, blocked, errors = 0, 0, 0

    logger.info(f"🔄 Реактивация: найдено {len(candidates)} уснувших клиентов")
    # AI-директор (owner_ai.return_candidates) читает это число мгновенно, без ре-скана
    # базы, чтобы показать владельцу в брифинге «кого вернуть» с потенциалом в рублях.
    try:
        import json as _json
        database.set_setting("reactivation_last", _json.dumps({
            "count": len(candidates),
            "at": date.today().isoformat(),
        }))
    except Exception as _e:
        logger.error(f"reactivation persist count: {_e}")

    for c in candidates:
        # Персональные настройки: «давно не были» относится к семейству 'cycle' —
        # пропускаем при явно выключенном 'cycle' (дефолт ON) + уважаем тихие часы.
        try:
            _prefs = database.get_notify_prefs(c["client_id"])
            if _prefs.get("cycle") is False:
                continue
            import datetime as _dtm
            if database.in_quiet_hours(_prefs, _dtm.datetime.now().hour):
                continue
        except Exception:
            pass
        text, keyboard = _build_message(c)
        try:
            await app.bot.send_message(
                chat_id=c["chat_id"],
                text=text,
                reply_markup=keyboard,
            )
            database.log_reactivation(c["client_id"], "sent")
            await publish_recovery_touchpoint(
                phone=c.get("phone") or "",
                kind="reactivation",
                source_seed=(
                    f"{c['client_id']}:{c.get('last_date') or date.today().isoformat()}"
                ),
                attribution_window_days=30,
            )
            sent += 1
            logger.info(
                f"  ✅ {c['name']} (chat_id={c['chat_id']}, "
                f"{c['weeks_since']} нед назад) — отправлено"
            )
        except Forbidden:
            # Клиент заблокировал бот — фиксируем и больше не пробуем
            database.log_reactivation(c["client_id"], "blocked")
            blocked += 1
            logger.info(f"  🚫 {c['name']} (chat_id={c['chat_id']}) — заблокировал бот")
        except BadRequest as e:
            database.log_reactivation(c["client_id"], "blocked")
            blocked += 1
            logger.info(f"  ⚠️ {c['name']}: {e}")
        except Exception as e:
            errors += 1
            logger.error(f"  ❌ Ошибка для {c['name']}: {e}")

    summary = {
        "candidates": len(candidates),
        "sent": sent,
        "blocked": blocked,
        "errors": errors,
    }
    logger.info(f"🔄 Реактивация завершена: {summary}")
    return summary
