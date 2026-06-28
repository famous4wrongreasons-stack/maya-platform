"""
Напоминание о визите по индивидуальному циклу клиента.

В отличие от реактивации (которая ждёт 4–8 недель после последнего визита
и работает для УЖЕ уснувших), это напоминание срабатывает ПРЕДСКАЗАТЕЛЬНО:
мы вычисляем средний интервал между визитами клиента и пингуем за пару
дней до его обычного срока — чтобы он зашёл к нам, а не задумался «надо
постричься где-то».

Алгоритм:
  1. Для каждого клиента из нашей БД с привязанным Telegram.
  2. Тянем историю визитов из YClients (только attended).
  3. Если визитов меньше 3 — не считаем (мало данных, цикл неустойчив).
  4. Считаем средний интервал = average diff между датами визитов.
  5. Если интервал вне 10–60 дней — пропускаем (нестабильный клиент).
  6. Предсказанная дата = last_visit + avg_cycle_days.
  7. Если сегодня в окне ±3 дня от предсказанной — кандидат.
  8. Проверки: нет будущей записи, не слали цикл-напоминание за 10 дней,
     не слали реактивацию за 14 дней (чтобы не задваивать).

Запуск: 11:00 МСК ежедневно (после реактивации и ДР, чтобы все нагрузки
на YClients API не упирались в один пик).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, BadRequest
from telegram.ext import Application

import database
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

MIN_VISITS_FOR_CYCLE = 3       # нужно минимум столько, чтобы цикл был устойчив
MIN_CYCLE_DAYS = 10            # клиент стрижётся чаще раза в 10 дней — это шумит
MAX_CYCLE_DAYS = 60            # > 2 месяцев — это уже не «цикл», а «уснувший»
WINDOW_DAYS = 3                # пинг если сегодня ± этого от предсказания

_yc = YClientsAPI()


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _extract_attended_visit_dates(bookings: list[dict]) -> list[date]:
    """Только реально посещённые визиты (attendance=1), даты по возрастанию."""
    dates: list[date] = []
    for b in (bookings or []):
        if not isinstance(b, dict):
            continue
        if not (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
            continue
        d = _parse_date(b.get("date") or b.get("datetime"))
        if d:
            dates.append(d)
    return sorted(dates)


def _avg_cycle_days(visit_dates: list[date]) -> int | None:
    """Средний интервал между визитами. None — недостаточно данных."""
    if len(visit_dates) < MIN_VISITS_FOR_CYCLE:
        return None
    intervals = [
        (visit_dates[i + 1] - visit_dates[i]).days
        for i in range(len(visit_dates) - 1)
    ]
    intervals = [i for i in intervals if 1 <= i <= 120]  # выбросы исключаем
    if not intervals:
        return None
    return round(sum(intervals) / len(intervals))


def _has_upcoming_booking(bookings: list[dict]) -> bool:
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


def _first_name(full: str | None) -> str:
    if not full:
        return "друг"
    return full.strip().split()[0]


def find_due_clients() -> list[dict]:
    """Находит клиентов, чей следующий визит «по расписанию» — сегодня ± окно."""
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

        # Спам-защита: не чаще 1 раза в 10 дней
        if database.was_recently_cycle_reminded(client["id"], days=10):
            continue
        # И с реактивацией не пересекаемся
        if database.was_recently_reactivated(client["id"], days=14):
            continue
        if database.was_recently_declined(client["id"], days=30):
            continue

        try:
            bookings = _yc.get_client_bookings(phone)
        except Exception as e:
            logger.error(f"cycle_reminder: yc error for chat_id={chat_id}: {e}")
            continue

        if _has_upcoming_booking(bookings):
            continue

        visits = _extract_attended_visit_dates(bookings)
        if len(visits) < MIN_VISITS_FOR_CYCLE:
            continue

        cycle = _avg_cycle_days(visits)
        if not cycle or not (MIN_CYCLE_DAYS <= cycle <= MAX_CYCLE_DAYS):
            continue

        last_visit = visits[-1]
        predicted = last_visit + timedelta(days=cycle)
        delta_days = (today - predicted).days
        # Окно: предсказали на сегодня ± WINDOW_DAYS
        if abs(delta_days) > WINDOW_DAYS:
            continue

        # Последний мастер клиента
        master_id, master_name = None, None
        for b in reversed(bookings or []):
            if not isinstance(b, dict):
                continue
            if (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
                staff = b.get("staff") or {}
                master_id = staff.get("id")
                master_name = staff.get("name")
                break

        candidates.append({
            "client_id": client["id"],
            "chat_id": chat_id,
            "name": _first_name(client.get("name")),
            "cycle_days": cycle,
            "last_visit": last_visit.isoformat(),
            "predicted_visit": predicted.isoformat(),
            "last_master": master_name or "вашему мастеру",
            "last_staff_id": master_id,
        })

    return candidates


def _build_message(c: dict) -> tuple[str, InlineKeyboardMarkup]:
    name = c["name"]
    cycle_weeks = round(c["cycle_days"] / 7)
    master_first = _first_name(c["last_master"])

    text = (
        f"Привет, {name}! 👋\n\n"
        f"Ты обычно стрижёшься примерно раз в {cycle_weeks} нед — и сейчас как раз "
        f"подходит срок. Не хочешь забронировать визит к {master_first}, "
        f"пока есть удобное время?\n"
    )

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            f"📅 К {master_first}",
            callback_data=f"react_book_{c['last_staff_id'] or 0}",
        )],
        [InlineKeyboardButton("🗓 Другое время / мастер", callback_data="react_pick_other")],
        [InlineKeyboardButton("🙅 Не сейчас", callback_data="react_decline")],
    ])
    return text, keyboard


async def run_cycle_reminder_job(app: Application) -> dict:
    """Главный entry. Запускается scheduler'ом раз в день."""
    candidates = find_due_clients()
    sent, blocked, errors = 0, 0, 0

    logger.info(f"🔁 Цикл-напоминание: найдено {len(candidates)} «по расписанию»")

    for c in candidates:
        # Персональные настройки: пропускаем при явно выключенном 'cycle' (дефолт ON),
        # и уважаем тихие часы (неспешное уведомление). Проверка ДО _build_message и
        # ДО log_cycle_reminder('sent') — иначе пропущенный клиент ложно «заглушится» на 10д.
        try:
            _prefs = database.get_notify_prefs(c["client_id"])
            if _prefs.get("cycle") is False:
                continue
            import datetime as _dtm
            if database.in_quiet_hours(_prefs, _dtm.datetime.now().hour):
                continue
        except Exception:
            pass
        text, kb = _build_message(c)
        try:
            await app.bot.send_message(c["chat_id"], text, reply_markup=kb)
            database.log_cycle_reminder(
                client_id=c["client_id"],
                avg_cycle_days=c["cycle_days"],
                predicted_visit=c["predicted_visit"],
                action="sent",
            )
            sent += 1
            logger.info(
                f"  ✅ {c['name']} (chat_id={c['chat_id']}, цикл≈{c['cycle_days']}д)"
            )
        except (Forbidden, BadRequest) as e:
            database.log_cycle_reminder(
                client_id=c["client_id"],
                avg_cycle_days=c["cycle_days"],
                predicted_visit=c["predicted_visit"],
                action="blocked",
            )
            blocked += 1
            logger.info(f"  🚫 {c['name']}: {e}")
        except Exception as e:
            errors += 1
            logger.error(f"  ❌ {c['name']}: {e}")

    summary = {
        "candidates": len(candidates),
        "sent": sent,
        "blocked": blocked,
        "errors": errors,
    }
    logger.info(f"🔁 Цикл-напоминание завершено: {summary}")
    return summary
