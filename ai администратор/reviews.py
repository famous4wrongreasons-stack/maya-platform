"""
Сбор отзывов после визита.

Идея:
  • Когда мастер закрыл запись (тап «💵 Наличные» / «💳 Карта» под уведомлением)
    — планируем запрос-отзыв клиенту через `REVIEW_DELAY_HOURS` часов.
    Защита от двойного запроса через UNIQUE(client_id, record_id) в БД.
  • Раз в 5 минут scheduler-job ищет «созревшие» pending-запросы и шлёт.
  • Клиент тапает 1-5 ⭐:
      − 5 / 4 ⭐ → бот благодарит + кнопки «Отзыв на Яндекс» и «Отзыв на 2GIS».
      − 1-3 ⭐ → бот извиняется и просит описать, что не так → ответ улетает
        админам в Telegram, чтобы лично разрулить.
  • Через 7 дней без ответа — статус «expired», больше не пингуем.

152-ФЗ: запрос отзыва — это маркетинговая коммуникация (приглашение в внешний
сервис). Шлём только клиентам с marketing_consent. Без согласия — пропускаем.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, BadRequest
from telegram.ext import Application, ContextTypes

import database
from config import BARBERSHOP_2GIS, BARBERSHOP_YANDEX

logger = logging.getLogger(__name__)

# Через сколько часов после закрытия визита спрашиваем отзыв.
# 3 ч — клиент уже ушёл, эффект свежий, но не «прямо в момент стрижки».
REVIEW_DELAY_HOURS = 3

# Через сколько дней без ответа считаем запрос просроченным.
REVIEW_STALE_DAYS = 7

# Порог «довольный клиент» → внешние агрегаторы. Меньше — внутрь к админу.
REVIEW_HAPPY_THRESHOLD = 4


# ─── Планирование запроса при закрытии записи ─────────────────────────────

def schedule_after_close(
    client_id: int,
    record_id: int,
    staff_id: int | None = None,
) -> bool:
    # A payment/record update cannot attest arrived attendance or admit feedback.
    return False


# ─── Текст и клавиатура «оцените визит» ───────────────────────────────────

def _build_invite_message(client_name: str | None) -> tuple[str, InlineKeyboardMarkup]:
    name = (client_name or "").strip().split()[0] if client_name else "друг"
    text = (
        f"Привет, {name}! 👋\n\n"
        f"Спасибо, что заглянули в «Мужскую Эстетику». "
        f"*Как всё прошло?* Поставьте оценку, чтобы мы стали лучше:"
    )
    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton("⭐", callback_data="rev_1"),
        InlineKeyboardButton("⭐⭐", callback_data="rev_2"),
        InlineKeyboardButton("⭐⭐⭐", callback_data="rev_3"),
        InlineKeyboardButton("⭐⭐⭐⭐", callback_data="rev_4"),
        InlineKeyboardButton("⭐⭐⭐⭐⭐", callback_data="rev_5"),
    ]])
    return text, kb


def _build_happy_followup() -> tuple[str, InlineKeyboardMarkup]:
    text = (
        "Спасибо! ❤️ Очень приятно. Если не сложно — поделитесь отзывом "
        "на одной из площадок, это поможет другим узнать о нас:"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("⭐ Отзыв на Яндекс.Картах", url=BARBERSHOP_YANDEX)],
        [InlineKeyboardButton("📍 Отзыв в 2GIS",          url=BARBERSHOP_2GIS)],
    ])
    return text, kb


def _build_unhappy_followup() -> str:
    return (
        "Извините, что не оправдали ожидания 🙏\n\n"
        "Напишите *одним сообщением*, что не так — я передам это лично "
        "владельцу. Никаких ботов и автоматов, только живой разговор. "
        "Мы хотим разобраться и сделать хорошо."
    )


# ─── Главный entry-point: scheduler-job ───────────────────────────────────

async def send_pending_review_requests(app: Application) -> dict:
    return {'status':'retired_canonical_explicit_request_required','checked':0,'sent':0,'blocked':0,'skipped_no_consent':0}


def _fetch_client_minimal(client_id: int) -> dict | None:
    return None


# ─── Хендлер callback'ов рейтинга ────────────────────────────────────────

async def handle_rating_callback(
    update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    query = update.callback_query
    if not query or not str(query.data or '').startswith('rev_'):
        return False
    await query.answer('Оставьте или исправьте отзыв в личном кабинете MAYA.')
    return True


# ─── Дозапись комментария от негативного отзыва ───────────────────────────

async def handle_negative_comment(
    update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    # An unrelated next message never establishes feedback intent or authority.
    return False


# ─── Уведомления админам ──────────────────────────────────────────────────

async def _notify_admins_positive(context, req: dict, rating: int):
    return None


async def _notify_admins_negative(context, req: dict, rating: int, comment: str):
    return None
