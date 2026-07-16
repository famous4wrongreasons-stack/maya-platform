"""
Алерт админу о зависшей заявке (lost lead).

Идея:
  • Каждое сообщение клиента — фиксируем в client_chat_state как «открытый
    эпизод».
  • Каждый ответ MAYA — кладём в last_ai_reply.
  • Если клиент явно отказался («не сейчас», «передумал», «спасибо нет») —
    маркируем эпизод как resolved = 'declined' → больше не алертим.
  • Если клиент дошёл до записи (booking_confirm) — resolved = 'booked'.
  • Scheduler-job раз в 5 мин ищет эпизоды:
      − last_client_message_at старше 30 мин,
      − эпизод не закрыт,
      − последний алерт был более 6 ч назад (или ни разу).
    → пингует владельцу.

Защита от ложных тревог:
  • Cooldown 6 ч на одного клиента.
  • Эпизод закрывается при booking_confirm и declined keywords.
  • Не алертим мастеров/админов (их эпизоды просто не создаются).
"""
from __future__ import annotations

import logging
import re

from telegram import InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import Application, ContextTypes

import database

logger = logging.getLogger(__name__)


# Окно «зависшей заявки»: молчание дольше MIN, но не старше MAX.
# Старше MAX — это уже не «горячий лид», а вчерашний диалог, не пингуем.
IDLE_MINUTES_TO_ALERT = 30
MAX_IDLE_MINUTES = 180  # 3 часа

# ─── Детектор намерения записаться ───────────────────────────────────────
# Алерт нужен ТОЛЬКО когда клиент реально хотел записаться, а не просто
# поздоровался («привет», «как дела»).
_INTENT_PATTERNS = [
    r"запиш", r"записа", r"записыва", r"запис[ьи]",
    r"стри[жг]", r"подстри", r"постри", r"бород", r"усы",
    r"фейд", r"тонир", r"бритьё|бритье|побрить",
    r"\bмастер", r"\bк\s+(стасу|илье|саше|алексею|максиму|александру|лёхе|лехе)",
    r"свободн", r"во\s+сколько", r"когда\s+(можно|есть|свободн)",
    r"на\s+(сегодня|завтра|послезавтра|пятниц|субботу|понедельник|вторник|среду|четверг|воскресенье)",
    r"во\s+сколько", r"есть\s+(окно|время|место)", r"абонемент",
    r"хочу\s+(постри|записа|стри|на\s)", r"можно\s+(ли\s+)?(сегодня|завтра|записа|на)",
]
_INTENT_RE = re.compile("|".join(_INTENT_PATTERNS), re.IGNORECASE)


def looks_like_booking_intent(text: str | None) -> bool:
    """True, если в сообщении есть намерение записаться/услуга/время."""
    if not text:
        return False
    return bool(_INTENT_RE.search(text))


# ─── Детектор «отказа» в сообщении клиента ───────────────────────────────
# Покрывает основные русские варианты вежливого отказа.
_DECLINE_PATTERNS = [
    r"\bне\s+сейчас\b",
    r"\bпередум\w*",
    r"\bпотом\b",
    r"\bпозже\b",
    r"\bв\s+другой\s+раз\b",
    r"\bспасибо[\s,]+(не\s+)?(надо|нужно|нет)\b",
    r"\bне\s+(надо|нужно)\b",
    r"\bотменя\w*",
    r"\bотказ\w*",
    r"\bне\s+буду\b",
    r"\bпропу(?:щу|стить)\b",
]
_DECLINE_RE = re.compile("|".join(_DECLINE_PATTERNS), re.IGNORECASE)


def looks_like_decline(text: str | None) -> bool:
    if not text:
        return False
    return bool(_DECLINE_RE.search(text))


# ─── Хуки из process_message / claude_ai / booking flow ─────────────────

def on_client_message(client_id: int, message_text: str):
    """Вызывается из process_message КАЖДЫЙ раз, когда клиент написал боту.

    Открывает новый «эпизод» в client_chat_state. Если клиент явно отказался —
    сразу маркируем как declined, не дожидаясь scheduler-тика.
    """
    if not client_id:
        return
    try:
        database.upsert_client_chat_state(
            client_id=client_id,
            client_message=message_text,
            booking_intent=looks_like_booking_intent(message_text),
        )
        if looks_like_decline(message_text):
            database.upsert_client_chat_state(
                client_id=client_id,
                resolved_reason="declined",
            )
            logger.info(
                f"lead_alerts: client_id={client_id} явно отказался "
                f"(\"{(message_text or '')[:60]}\") — эпизод закрыт"
            )
    except Exception as e:
        logger.error(f"lead_alerts: on_client_message client_id={client_id}: {e}")


def on_ai_reply(client_id: int, reply_text: str):
    """Вызывается из process_message после ответа AI."""
    if not client_id or not reply_text:
        return
    try:
        database.upsert_client_chat_state(
            client_id=client_id,
            ai_reply=reply_text,
        )
    except Exception as e:
        logger.error(f"lead_alerts: on_ai_reply client_id={client_id}: {e}")


def on_booking_confirmed(client_id: int):
    """Вызывается из _finalize_booking — клиент дошёл до записи. Эпизод закрыт."""
    if not client_id:
        return
    try:
        database.upsert_client_chat_state(
            client_id=client_id,
            resolved_reason="booked",
        )
        logger.info(f"lead_alerts: client_id={client_id} оформил запись — эпизод закрыт")
    except Exception as e:
        logger.error(f"lead_alerts: on_booking_confirmed client_id={client_id}: {e}")


# ─── Главный scheduler-job ──────────────────────────────────────────────

async def scan_and_alert(app: Application) -> dict:
    """Тик scheduler'а. Ищет зависшие эпизоды и шлёт админам."""
    candidates = database.find_pending_lead_alerts(
        min_idle_minutes=IDLE_MINUTES_TO_ALERT,
        max_idle_minutes=MAX_IDLE_MINUTES,
    )
    if not candidates:
        return {"checked": 0, "alerted": 0}

    admins = database.list_admins()
    if not admins:
        logger.warning("lead_alerts: нет админов для рассылки")
        return {"checked": len(candidates), "alerted": 0}

    alerted = 0
    for state in candidates:
        client_id = state["client_id"]
        client = database.get_client_by_id(client_id)
        if not client:
            continue

        # Только клиенты с привязанным Telegram считаются «заявкой» — иначе
        # это случайный человек, не наша зона ответственности.
        if not client.get("telegram_chat_id"):
            continue

        text = _build_alert_text(state, client)
        # Кнопка «досье»: владелец одним тапом видит визиты + переписку клиента,
        # чтобы понять — наш клиент завис или новенький.
        kb = InlineKeyboardMarkup([[InlineKeyboardButton(
            "📋 Кто это? (визиты + переписка)", callback_data="dossierc_" + str(client_id))]])
        sent_any = False
        for admin_id in admins:
            try:
                await app.bot.send_message(
                    chat_id=admin_id,
                    text=text,
                    parse_mode="Markdown",
                    disable_web_page_preview=True,
                    reply_markup=kb,
                )
                sent_any = True
            except Exception as e:
                logger.error(
                    f"lead_alerts: не отправил admin_id={admin_id} "
                    f"client_id={client_id}: {e}"
                )
        if sent_any:
            database.mark_lead_alerted(client_id)
            alerted += 1
            logger.info(
                f"lead_alerts: ⚠️ пинг по client_id={client_id} "
                f"({client.get('name', '?')})"
            )

    summary = {"checked": len(candidates), "alerted": alerted}
    logger.info(f"lead_alerts: scheduler tick {summary}")
    return summary


def _build_alert_text(state: dict, client: dict) -> str:
    """Формат сообщения админу."""
    from datetime import datetime
    name = (client.get("name") or "—").strip()
    phone = client.get("phone") or "—"
    chat_id = client.get("telegram_chat_id")
    last_msg = (state.get("last_client_message") or "—").strip()
    last_reply = (state.get("last_ai_reply") or "—").strip()
    last_msg_at = state.get("last_client_message_at") or ""
    try:
        dt = datetime.fromisoformat(last_msg_at)
        minutes_ago = int((datetime.now() - dt).total_seconds() // 60)
    except Exception:
        minutes_ago = "?"

    return (
        f"⚠️ *Зависшая заявка — клиент не дошёл до записи*\n\n"
        f"👤 *{name}*\n"
        f"📞 `{phone}`\n"
        f"💬 Telegram id: `{chat_id}`\n"
        f"⏰ {minutes_ago} мин назад\n\n"
        f"*Последнее сообщение клиента:*\n"
        f"_{last_msg[:300]}_\n\n"
        f"*Последний ответ MAYA:*\n"
        f"_{last_reply[:300]}_\n\n"
        f"Похоже, MAYA не довела диалог до записи. "
        f"Свяжитесь лично — клиент уже горячий."
    )
