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
    """
    Планирует запрос отзыва. Вызывается из bot.py из обработчика
    «мастер тапнул Наличные/Карта» сразу после фиксации в YClients.

    Возвращает True если запланировали, False — если уже было.
    """
    if not client_id or not record_id:
        return False
    ok = database.schedule_review_request(
        client_id=client_id,
        record_id=record_id,
        staff_id=staff_id,
        delay_hours=REVIEW_DELAY_HOURS,
    )
    if ok:
        logger.info(
            f"reviews: запланирован запрос отзыва client_id={client_id} "
            f"record_id={record_id} через {REVIEW_DELAY_HOURS} ч"
        )
    return ok


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
    """
    Скан pending-запросов, чьё время отправки наступило, и рассылка.
    Запускается scheduler'ом раз в N минут.
    """
    pending = database.pending_review_requests_to_send()
    if not pending:
        return {"checked": 0, "sent": 0, "blocked": 0, "skipped_no_consent": 0}

    sent = blocked = errors = skipped = 0
    for req in pending:
        client_id = req["client_id"]
        client = _fetch_client_minimal(client_id)
        if not client or not client.get("telegram_chat_id"):
            database.mark_review_request_failed(req["id"], reason="no_chat_id")
            continue

        # 152-ФЗ: только клиенты с маркетинговым согласием.
        if not database.has_marketing_consent(client_id):
            database.mark_review_request_failed(req["id"], reason="no_marketing_consent")
            skipped += 1
            continue

        text, kb = _build_invite_message(client.get("name"))
        try:
            msg = await app.bot.send_message(
                chat_id=client["telegram_chat_id"],
                text=text,
                parse_mode="Markdown",
                reply_markup=kb,
            )
            # Меняем callback_data на rev_<rating>_<review_id> — нужен id запроса
            # чтобы хендлер знал, какой запрос мы обновляем.
            review_id = req["id"]
            new_kb = InlineKeyboardMarkup([[
                InlineKeyboardButton("⭐",     callback_data=f"rev_1_{review_id}"),
                InlineKeyboardButton("⭐⭐",   callback_data=f"rev_2_{review_id}"),
                InlineKeyboardButton("⭐⭐⭐", callback_data=f"rev_3_{review_id}"),
                InlineKeyboardButton("⭐⭐⭐⭐", callback_data=f"rev_4_{review_id}"),
                InlineKeyboardButton("⭐⭐⭐⭐⭐", callback_data=f"rev_5_{review_id}"),
            ]])
            try:
                await app.bot.edit_message_reply_markup(
                    chat_id=client["telegram_chat_id"],
                    message_id=msg.message_id,
                    reply_markup=new_kb,
                )
            except Exception:
                pass  # некритично, callback всё равно поймаем по prefix
            database.mark_review_request_sent(req["id"])
            sent += 1
            logger.info(
                f"reviews: ✅ отправил приглашение review_id={req['id']} "
                f"client_id={client_id}"
            )
        except (Forbidden, BadRequest) as e:
            database.mark_review_request_failed(req["id"], reason="blocked")
            blocked += 1
            logger.info(f"reviews: 🚫 client_id={client_id}: {e}")
        except Exception as e:
            database.mark_review_request_failed(req["id"], reason="send_error")
            errors += 1
            logger.error(f"reviews: ❌ client_id={client_id}: {e}")

    # Чистим просрочки заодно
    expired = database.expire_stale_review_requests(REVIEW_STALE_DAYS)

    summary = {
        "checked": len(pending),
        "sent": sent,
        "blocked": blocked,
        "errors": errors,
        "skipped_no_consent": skipped,
        "expired": expired,
    }
    logger.info(f"reviews: scheduler tick {summary}")
    return summary


def _fetch_client_minimal(client_id: int) -> dict | None:
    """Быстрая выборка клиента по client_id с расшифровкой имени/телефона."""
    if not client_id:
        return None
    return database.get_client_by_id(int(client_id))


# ─── Хендлер callback'ов рейтинга ────────────────────────────────────────

async def handle_rating_callback(
    update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    """
    Обработка кнопок rev_<rating>_<review_id>. Возвращает True если callback
    был наш и обработан, False если это не про отзывы.
    """
    query = update.callback_query
    if not query or not query.data or not query.data.startswith("rev_"):
        return False
    parts = query.data.split("_")
    # Ожидаем rev_<rating>_<review_id>
    if len(parts) != 3:
        return False
    try:
        rating = int(parts[1])
        review_id = int(parts[2])
    except ValueError:
        return False
    if rating < 1 or rating > 5:
        return False

    await query.answer()

    # Сохраняем рейтинг
    database.record_review_response(review_id, rating=rating)
    req = database.get_review_request_by_id(review_id) or {}

    chat_id = query.from_user.id
    # Меняем сообщение, убираем кнопки
    try:
        stars = "⭐" * rating
        await query.edit_message_text(
            f"Ваша оценка: {stars}",
            parse_mode="Markdown",
        )
    except Exception:
        pass

    if rating >= REVIEW_HAPPY_THRESHOLD:
        # Довольный — ведём на агрегаторы
        text, kb = _build_happy_followup()
        await context.bot.send_message(
            chat_id, text, parse_mode="Markdown", reply_markup=kb
        )
        await _notify_admins_positive(context, req, rating)
    else:
        # Недовольный — просим текст, начинаем ждать сообщения
        await context.bot.send_message(
            chat_id, _build_unhappy_followup(), parse_mode="Markdown"
        )
        # Кладём в context.user_data, что следующее сообщение от клиента —
        # это комментарий к негативному отзыву. Обработчик в bot.py
        # подхватит и допишет в review_requests.comment + ping админам.
        context.user_data["pending_review_comment_id"] = review_id

    return True


# ─── Дозапись комментария от негативного отзыва ───────────────────────────

async def handle_negative_comment(
    update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    """
    Если в user_data есть pending_review_comment_id — это очередное сообщение
    клиента после негативной оценки. Допишем в review_requests.comment и
    разошлём админам. Возвращает True если перехватили.
    """
    review_id = context.user_data.get("pending_review_comment_id")
    if not review_id:
        return False
    comment = (update.message.text or "").strip()
    if not comment:
        return False

    req = database.get_review_request_by_id(review_id) or {}
    rating = req.get("rating") or 0
    # Сохраняем коммент
    with database._db() as conn:
        conn.execute(
            "UPDATE review_requests SET comment = ? WHERE id = ?",
            (comment[:2000], review_id),
        )

    # Очищаем флаг
    context.user_data.pop("pending_review_comment_id", None)

    # Благодарим клиента
    await update.message.reply_text(
        "Спасибо за обратную связь 🙏\n"
        "Передал владельцу. Если нужно — он свяжется лично.",
    )

    # Уведомляем админов
    await _notify_admins_negative(context, req, rating, comment)
    return True


# ─── Уведомления админам ──────────────────────────────────────────────────

async def _notify_admins_positive(context, req: dict, rating: int):
    """Положительный отзыв — короткий пинг админам (для статистики). """
    try:
        client = _fetch_client_minimal(req.get("client_id"))
        name = (client or {}).get("name", "—")
        stars = "⭐" * rating
        text = (
            f"✨ *Положительный отзыв*\n\n"
            f"{stars} от {name}\n"
            f"_Клиенту отправлены ссылки на Яндекс и 2GIS._"
        )
        for admin_id in database.list_admins():
            try:
                await context.bot.send_message(
                    admin_id, text, parse_mode="Markdown"
                )
            except Exception:
                pass
    except Exception as e:
        logger.error(f"reviews: notify positive: {e}")


async def _notify_admins_negative(context, req: dict, rating: int, comment: str):
    """Отрицательный отзыв — детальный пинг владельцу для личной работы."""
    try:
        client = _fetch_client_minimal(req.get("client_id"))
        name = (client or {}).get("name", "—")
        phone = (client or {}).get("phone", "—")
        chat_id = (client or {}).get("telegram_chat_id")
        stars = "⭐" * rating
        text = (
            f"⚠️ *Негативный отзыв — нужна реакция*\n\n"
            f"{stars} от *{name}*\n"
            f"Телефон: `{phone}`\n"
            f"Telegram: id `{chat_id}`\n\n"
            f"Комментарий клиента:\n_{comment}_\n\n"
            f"Свяжитесь лично, чтобы разобраться."
        )
        for admin_id in database.list_admins():
            try:
                await context.bot.send_message(
                    admin_id, text, parse_mode="Markdown"
                )
            except Exception:
                pass
    except Exception as e:
        logger.error(f"reviews: notify negative: {e}")
