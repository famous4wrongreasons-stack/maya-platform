"""
Оффер освободившегося слота.

Когда клиент отменяет запись (через бот, через YClients-кабинет, либо ему
звонит администратор и убирает), мы получаем webhook record.delete от
YClients. Здесь мы решаем, кому из наших клиентов это окно может подойти,
и сразу шлём 1-2 точечных предложения:

  «Привет, Сергей. У Стаса только что освободилось 18:00 завтра. Будешь?»

Принципы:
  • Шлём ТОЛЬКО точечно, не больше 2 человек на один освободившийся слот.
    Это предложение, а не рассылка.
  • Скоринг кандидатов: тот же мастер + цикл в окне предсказания.
  • Антиспам: не чаще раза в 7 дней одному и тому же клиенту.
  • Только в разумные часы (9-21 МСК).
  • Только в будущее: если слот уже в прошлом — игнорируем.
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

_yc = YClientsAPI()

# Параметры скоринга
MIN_VISITS = 2                    # клиент с 1 визитом — слабый сигнал, цикла нет
MIN_CYCLE_DAYS = 10
MAX_CYCLE_DAYS = 60
SCORE_SAME_MASTER = 50            # тот же мастер, что и в освободившемся слоте
SCORE_CYCLE_WINDOW_TIGHT = 30     # цикл предсказан в ±7 дней от слота
SCORE_CYCLE_WINDOW_LOOSE = 15     # цикл предсказан в ±14 дней
SCORE_RECENT_CLIENT = 10          # последний визит в течение 60 дней
SCORE_THRESHOLD = 30              # ниже этого — не шлём ничего
MAX_OFFERS_PER_SLOT = 2           # максимум людей, которым пингуем на один слот
ANTISPAM_DAYS = 7                 # тому же клиенту не чаще раза в N дней
QUIET_HOUR_START = 9              # не пингуем до этого часа
QUIET_HOUR_END = 21               # и после этого часа


# ─── Утилиты для разбора визитов (отдельно от cycle_reminder, чтобы не плодить циклические импорты) ──

def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _attended_visit_dates(bookings: list[dict]) -> list[date]:
    out: list[date] = []
    for b in (bookings or []):
        if not isinstance(b, dict):
            continue
        if not (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
            continue
        d = _parse_date(b.get("date") or b.get("datetime"))
        if d:
            out.append(d)
    return sorted(out)


def _avg_cycle_days(visit_dates: list[date]) -> int | None:
    if len(visit_dates) < MIN_VISITS:
        return None
    intervals = [
        (visit_dates[i + 1] - visit_dates[i]).days
        for i in range(len(visit_dates) - 1)
    ]
    intervals = [i for i in intervals if 1 <= i <= 120]
    if not intervals:
        return None
    return round(sum(intervals) / len(intervals))


def _last_master_id(bookings: list[dict]) -> int | None:
    """ID мастера последнего ПОСЕЩЁННОГО визита."""
    for b in reversed(bookings or []):
        if not isinstance(b, dict):
            continue
        if b.get("attendance") == 1 or b.get("visit_attendance") == 1:
            staff = b.get("staff") or {}
            sid = staff.get("id")
            return int(sid) if sid else None
    return None


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


# ─── Поиск кандидатов ────────────────────────────────────────────────────

def find_candidates(staff_id: int, slot_dt: datetime) -> list[dict]:
    """
    Возвращает топ-кандидатов для оффера. Сортировка по убыванию скоринга.
    Возвращает до MAX_OFFERS_PER_SLOT записей.
    """
    today = date.today()
    candidates: list[dict] = []

    for client in database.list_telegram_clients():
        chat_id = client.get("telegram_chat_id")
        phone = client.get("phone")
        client_id = client["id"]
        if not chat_id or not phone:
            continue

        # 152-ФЗ + Закон о рекламе: только клиенты с маркетинговым согласием
        if not database.has_marketing_consent(client_id):
            continue

        # Персональные настройки: «освободилось окно» выключаем только при явном False
        # (дефолт ON). Здесь — до scoring и YClients-запросов, чтобы не дёргать API зря.
        if database.get_notify_prefs(client_id).get("freed_slot") is False:
            continue

        # Антиспам: не больше 1 пинга в 7 дней этому клиенту
        if database.was_recently_offered_freed_slot(client_id, days=ANTISPAM_DAYS):
            continue
        # И с реактивацией / циклом не пересекаемся слишком часто
        if database.was_recently_reactivated(client_id, days=3):
            continue
        if database.was_recently_cycle_reminded(client_id, days=3):
            continue
        if database.was_recently_declined(client_id, days=14):
            continue

        try:
            bookings = _yc.get_client_bookings(phone)
        except Exception as e:
            logger.error(f"freed_slot: yc error for client_id={client_id}: {e}")
            continue

        # Если у клиента уже есть будущая запись — не предлагаем (вдруг это
        # как раз эта же запись? или другая? всё равно лишний пинг)
        if _has_upcoming_booking(bookings):
            continue

        visits = _attended_visit_dates(bookings)
        if len(visits) < MIN_VISITS:
            continue

        # Скоринг
        score = 0
        last_master = _last_master_id(bookings)
        if last_master == staff_id:
            score += SCORE_SAME_MASTER

        cycle = _avg_cycle_days(visits)
        if cycle and MIN_CYCLE_DAYS <= cycle <= MAX_CYCLE_DAYS:
            last_visit = visits[-1]
            predicted = last_visit + timedelta(days=cycle)
            delta_days = abs((slot_dt.date() - predicted).days)
            if delta_days <= 7:
                score += SCORE_CYCLE_WINDOW_TIGHT
            elif delta_days <= 14:
                score += SCORE_CYCLE_WINDOW_LOOSE

        days_since_last_visit = (today - visits[-1]).days
        if 14 <= days_since_last_visit <= 60:
            score += SCORE_RECENT_CLIENT

        if score < SCORE_THRESHOLD:
            continue

        candidates.append({
            "client_id": client_id,
            "chat_id": chat_id,
            "name": _first_name(client.get("name")),
            "score": score,
        })

    candidates.sort(key=lambda c: -c["score"])
    return candidates[:MAX_OFFERS_PER_SLOT]


# ─── Отправка предложения ────────────────────────────────────────────────

def _build_message(name: str, staff_name: str, slot_dt: datetime,
                    staff_id: int, waited: bool = False) -> tuple[str, InlineKeyboardMarkup]:
    when = _format_slot(slot_dt)
    master_first = staff_name.split()[0] if staff_name else "мастеру"

    if waited:
        text = (
            f"Привет, {name}! 👋\n\n"
            f"Вы спрашивали про *{when}* у {master_first} — место только что "
            f"освободилось! Если ещё актуально, могу забронировать прямо сейчас. "
            f"Слот может уйти за пару минут.\n"
        )
    else:
        text = (
            f"Привет, {name}! 👋\n\n"
            f"У {master_first} только что освободилось *{when}*. "
            f"Если интересно — могу забронировать прямо сейчас. "
            f"Слот может уйти за пару минут.\n"
        )

    # Кодируем дату-время компактно: YYYYMMDDHHMM. Без секунд хватает.
    slot_code = slot_dt.strftime("%Y%m%d%H%M")

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            f"📅 Беру {when.split(' в ')[-1]}",
            callback_data=f"freed_book_{staff_id}_{slot_code}",
        )],
        [InlineKeyboardButton("🙅 Не сейчас", callback_data="freed_decline")],
    ])
    return text, kb


def _in_quiet_hours() -> bool:
    """True если сейчас «тихий час» — не шлём предложения."""
    h = datetime.now().hour
    return h < QUIET_HOUR_START or h >= QUIET_HOUR_END


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


async def offer_freed_slot(app: Application, staff_id: int, slot_dt: datetime) -> dict:
    """
    Главная функция. Вызывается webhook'ом отмены.
    Находит кандидатов и шлёт им предложение.
    """
    # Только в будущее — если запись отменили задним числом, пинговать нечего
    if slot_dt <= datetime.now():
        logger.info(f"freed_slot: слот {slot_dt} в прошлом — пропускаем")
        return {"status": "slot_in_past"}

    if _in_quiet_hours():
        logger.info(f"freed_slot: тихий час, не шлём (now={datetime.now().hour})")
        return {"status": "quiet_hours"}

    staff_name = _master_name(staff_id)
    slot_iso = slot_dt.isoformat(timespec="minutes")
    sent, blocked, errors, wl_sent = 0, 0, 0, 0
    notified_chats = set()

    # 1) ЛИСТ ОЖИДАНИЯ — клиенты, которые явно спрашивали ЭТО время. Им — первым.
    try:
        waitlist = database.get_slot_waitlist(staff_id, slot_iso, tolerance_min=20)
    except Exception as e:
        logger.error(f"freed_slot: waitlist lookup: {e}")
        waitlist = []
    wl_ids = []
    wl_notified_info: list[tuple[str, str]] = []   # (имя, телефон) — для прозвона Антоном
    for w in waitlist[:3]:                       # это люди, которые ПРОСИЛИ — но без фанатизма
        chat = w.get("chat_id")
        if not chat or chat in notified_chats:
            continue
        # Персональные настройки: даже из листа ожидания уважаем явный opt-out
        # «освободилось окно» (дефолт ON — кто просил, тому шлём как раньше).
        try:
            if database.get_notify_prefs(w["client_id"]).get("freed_slot") is False:
                continue
        except Exception:
            pass
        cl = database.get_client(chat) or {}
        name = _first_name(cl.get("name")) or "клиент"
        phone = cl.get("phone") or "—"
        text, kb = _build_message(name, staff_name, slot_dt, staff_id, waited=True)
        try:
            await app.bot.send_message(chat, text, parse_mode="Markdown", reply_markup=kb)
            database.log_freed_slot_offer(client_id=w["client_id"], staff_id=staff_id,
                                          slot_datetime=slot_iso, action="sent")
            notified_chats.add(chat); wl_ids.append(w["id"]); wl_sent += 1; sent += 1
            wl_notified_info.append((name, phone))
            logger.info(f"freed_slot: ⏳✅ лист ожидания {name} (chat={chat}, slot={slot_dt})")
        except (Forbidden, BadRequest) as e:
            wl_ids.append(w["id"]); blocked += 1
            # клиент не получит пуш (заблокировал бота) — тем важнее прозвон Антоном
            wl_notified_info.append((name + " (не получил пуш)", phone))
            logger.info(f"freed_slot: ⏳🚫 {name}: {e}")
        except Exception as e:
            errors += 1
            logger.error(f"freed_slot: ⏳❌ {name}: {e}")
    if wl_ids:
        try:
            database.mark_slot_waitlist_notified(wl_ids)
        except Exception as e:
            logger.error(f"freed_slot: mark_notified: {e}")
    # Точка B: слот из листа ожидания освободился — сообщаем Антону (прозвонить).
    if wl_notified_info:
        master_first = staff_name.split()[0] if staff_name else "мастеру"
        lines = "\n".join(f"• {n} — `{p}`" for n, p in wl_notified_info)
        try:
            await _notify_admins(app, (
                f"⏳✅ *Освободился слот из листа ожидания*\n\n"
                f"🗓 *{_format_slot(slot_dt)}* · {master_first}\n"
                f"Майя оповестила ждавших — можешь прозвонить, вдруг не увидят:\n{lines}"
            ))
        except Exception as e:
            logger.error(f"freed_slot: admin freed-slot notify: {e}")

    # 2) Скоринг по циклу — добиваем оставшихся (тот же мастер + «пора стричься»)
    candidates = find_candidates(staff_id, slot_dt)
    cyc_sent = 0
    for c in candidates:
        if c["chat_id"] in notified_chats:
            continue
        if cyc_sent >= MAX_OFFERS_PER_SLOT:
            break
        text, kb = _build_message(c["name"], staff_name, slot_dt, staff_id)
        try:
            await app.bot.send_message(c["chat_id"], text, parse_mode="Markdown", reply_markup=kb)
            database.log_freed_slot_offer(client_id=c["client_id"], staff_id=staff_id,
                                          slot_datetime=slot_iso, action="sent")
            notified_chats.add(c["chat_id"]); sent += 1; cyc_sent += 1
            logger.info(f"freed_slot: ✅ {c['name']} (chat_id={c['chat_id']}, score={c['score']}, slot={slot_dt})")
        except (Forbidden, BadRequest) as e:
            database.log_freed_slot_offer(client_id=c["client_id"], staff_id=staff_id,
                                          slot_datetime=slot_iso, action="blocked")
            blocked += 1
            logger.info(f"freed_slot: 🚫 {c['name']}: {e}")
        except Exception as e:
            errors += 1
            logger.error(f"freed_slot: ❌ {c['name']}: {e}")

    if sent == 0 and not waitlist and not candidates:
        logger.info(f"freed_slot: кандидатов нет для staff_id={staff_id} @ {slot_dt}")
        return {"status": "no_candidates"}

    summary = {
        "status": "done",
        "waitlist_sent": wl_sent,
        "cycle_candidates": len(candidates),
        "sent": sent,
        "blocked": blocked,
        "errors": errors,
        "slot": slot_iso,
        "staff_id": staff_id,
    }
    logger.info(f"freed_slot: завершено {summary}")
    return summary
