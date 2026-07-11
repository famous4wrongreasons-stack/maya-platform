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
  7. Если срок наступает в ближайшие 3 дня или уже прошёл не более чем на
     21 день — кандидат. Просроченные ранжируются выше.
  8. Проверки: нет будущей записи, не слали цикл-напоминание за 10 дней,
     не слали реактивацию за 14 дней (чтобы не задваивать).

Запуск: 11:00 МСК ежедневно (после реактивации и ДР, чтобы все нагрузки
на YClients API не упирались в один пик).
"""
from __future__ import annotations

import logging
import json
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
MAX_OVERDUE_DAYS = 21          # дальше клиент переходит в сценарий реактивации
CANDIDATE_SNAPSHOT_KEY = "cycle_candidates_snapshot_v1"

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


def _urgency(delta_days: int) -> str:
    if delta_days >= 7:
        return "overdue"
    if delta_days > 0:
        return "due"
    return "due_soon"


def _reason(delta_days: int, cycle_days: int) -> str:
    if delta_days > 0:
        return f"привычный срок прошёл {delta_days} дн. назад · цикл {cycle_days} дн."
    if delta_days == 0:
        return f"привычный срок наступил сегодня · цикл {cycle_days} дн."
    return f"привычный срок через {abs(delta_days)} дн. · цикл {cycle_days} дн."


def find_due_clients() -> list[dict]:
    """Находит и ранжирует клиентов, которым уже пора или скоро пора вернуться."""
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
        if delta_days < -WINDOW_DAYS or delta_days > MAX_OVERDUE_DAYS:
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
            "days_from_due": delta_days,
            "urgency": _urgency(delta_days),
            "reason": _reason(delta_days, cycle),
            "visit_count": len(visits),
            "priority_score": max(0, delta_days + WINDOW_DAYS) * 10 + min(len(visits), 10),
        })

    candidates.sort(key=lambda row: (
        -int(row.get("priority_score") or 0),
        str(row.get("predicted_visit") or ""),
        str(row.get("name") or ""),
    ))
    return candidates


def _snapshot_row(candidate: dict, contact_status: str = "pending") -> dict:
    """PII-free row persisted for Owner OS; names and contacts stay encrypted in clients."""
    return {
        "client_id": int(candidate.get("client_id") or 0),
        "cycle_days": int(candidate.get("cycle_days") or 0),
        "last_visit": str(candidate.get("last_visit") or "")[:10],
        "predicted_visit": str(candidate.get("predicted_visit") or "")[:10],
        "days_from_due": int(candidate.get("days_from_due") or 0),
        "urgency": str(candidate.get("urgency") or "due")[:20],
        "reason": str(candidate.get("reason") or "")[:160],
        "visit_count": int(candidate.get("visit_count") or 0),
        "priority_score": int(candidate.get("priority_score") or 0),
        "last_staff_id": candidate.get("last_staff_id"),
        "last_master": str(candidate.get("last_master") or "")[:100],
        "eligible_channels": ["telegram", "phone"],
        "contact_status": str(contact_status or "pending")[:24],
    }


def _persist_candidate_snapshot(
    candidates: list[dict],
    *,
    contact_statuses: dict[int, str] | None = None,
    mode: str = "scan",
) -> dict:
    statuses = contact_statuses or {}
    rows = [
        _snapshot_row(row, statuses.get(int(row.get("client_id") or 0), "pending"))
        for row in candidates
        if int(row.get("client_id") or 0)
    ]
    pending = [row for row in rows if row.get("contact_status") in ("pending", "quiet_hours", "error")]
    summary = {
        "candidates": len(rows),
        "pending": len(pending),
        "overdue": sum(1 for row in pending if row.get("urgency") == "overdue"),
        "due": sum(1 for row in pending if row.get("urgency") == "due"),
        "due_soon": sum(1 for row in pending if row.get("urgency") == "due_soon"),
        "sent": sum(1 for row in rows if row.get("contact_status") == "sent"),
        "blocked": sum(1 for row in rows if row.get("contact_status") == "blocked"),
        "errors": sum(1 for row in rows if row.get("contact_status") == "error"),
    }
    snapshot = {
        "version": "maya_cycle_candidates_v1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "mode": str(mode or "scan")[:20],
        "summary": summary,
        "candidates": rows[:50],
        "privacy": "pseudonymous_snapshot_no_names_or_contacts",
    }
    database.set_setting(CANDIDATE_SNAPSHOT_KEY, json.dumps(snapshot, ensure_ascii=False))
    return snapshot


def load_candidate_snapshot() -> dict:
    try:
        raw = database.get_setting(CANDIDATE_SNAPSHOT_KEY)
        payload = json.loads(raw) if raw else {}
        if isinstance(payload, dict) and payload.get("version") == "maya_cycle_candidates_v1":
            return payload
    except Exception as exc:
        logger.error("cycle candidate snapshot load: %s", exc)
    return {
        "version": "maya_cycle_candidates_v1",
        "generated_at": "",
        "mode": "pending_first_scan",
        "summary": {"candidates": None, "pending": None, "overdue": 0, "due": 0, "due_soon": 0},
        "candidates": [],
        "privacy": "pseudonymous_snapshot_no_names_or_contacts",
    }


def scan_cycle_candidates() -> dict:
    """Daily read-only scan. Sending remains a separate owner-confirmed action."""
    candidates = find_due_clients()
    snapshot = _persist_candidate_snapshot(candidates, mode="scan")
    logger.info("Цикл-скан: найдено %s кандидатов, отправка ждёт владельца", len(candidates))
    return snapshot


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
    """Owner-confirmed send. The scheduler only calls ``scan_cycle_candidates``."""
    candidates = find_due_clients()
    sent, blocked, errors, skipped = 0, 0, 0, 0
    contact_statuses: dict[int, str] = {}
    _persist_candidate_snapshot(candidates, mode="owner_confirmed_send")

    logger.info(f"🔁 Цикл-напоминание: найдено {len(candidates)} «по расписанию»")

    for c in candidates:
        # Персональные настройки: пропускаем при явно выключенном 'cycle' (дефолт ON),
        # и уважаем тихие часы (неспешное уведомление). Проверка ДО _build_message и
        # ДО log_cycle_reminder('sent') — иначе пропущенный клиент ложно «заглушится» на 10д.
        try:
            _prefs = database.get_notify_prefs(c["client_id"])
            if _prefs.get("cycle") is False:
                contact_statuses[int(c["client_id"])] = "disabled"
                skipped += 1
                continue
            import datetime as _dtm
            if database.in_quiet_hours(_prefs, _dtm.datetime.now().hour):
                contact_statuses[int(c["client_id"])] = "quiet_hours"
                skipped += 1
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
            contact_statuses[int(c["client_id"])] = "sent"
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
            contact_statuses[int(c["client_id"])] = "blocked"
            logger.info(f"  🚫 {c['name']}: {e}")
        except Exception as e:
            errors += 1
            contact_statuses[int(c["client_id"])] = "error"
            logger.error(f"  ❌ {c['name']}: {e}")

    snapshot = _persist_candidate_snapshot(
        candidates,
        contact_statuses=contact_statuses,
        mode="owner_confirmed_send",
    )
    summary = {
        "candidates": len(candidates),
        "sent": sent,
        "blocked": blocked,
        "errors": errors,
        "skipped": skipped,
        "snapshot_at": snapshot.get("generated_at"),
    }
    logger.info(f"🔁 Цикл-напоминание завершено: {summary}")
    return summary
