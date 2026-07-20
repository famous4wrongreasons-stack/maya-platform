import asyncio
import io
import logging
import os
import re
import signal
import tempfile
from datetime import date, datetime, timedelta
from collections import defaultdict

from telegram import (
    Update,
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    InputFile,
)
from telegram.error import Forbidden, BadRequest
from telegram.ext import (
    Application,
    ApplicationHandlerStop,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    TypeHandler,
    filters,
    ContextTypes,
)
from telegram.request import HTTPXRequest
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import database
import admin_nlu
import ai_billing
import anonymizer
import birthday
import broadcast_templates
import cert_pdf
import claude_ai
import cycle_reminder
import lead_alerts
import loyalty
import masters_ai
import migration
import reactivation
import referral
import reviews
import sources
import subscriptions
import yukassa_api
import webhook_server
from identity_utils import normalize_tg_user
from config import (
    TELEGRAM_TOKEN, PROXY_URL, REMINDER_MINUTES_BEFORE, BARBERSHOP_NAME,
    SITE_URL, APP_URL, INITIAL_ADMIN_IDS, BOT_USERNAME,
    PII_RETENTION_MONTHS, FOUNDER_IDS,
)
from claude_ai import get_ai_response
from memory import (
    load_conversations,
    save_conversations,
    warm_client_history_cache_for_phone,
)
from yclients import YClientsAPI
import voice  # «дешёвый голос»: озвучка ответа MAYA (выключено флагом в config)

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def _telegram_ai_model(update: Update | None = None) -> str:
    """Telegram-текст держим на более лёгкой модели, голос — на отдельном профиле."""
    message = getattr(update, "message", None)
    if message and getattr(message, "voice", None):
        return claude_ai.VOICE_CLAUDE_MODEL
    return getattr(claude_ai, "OPENAI_TELEGRAM_CHAT_MODEL", claude_ai.OPENAI_CHAT_MODEL)


async def _get_ai_response_async(
    conversation_history: list[dict],
    chat_id: int,
    update: Update | None = None,
) -> tuple[str, dict | None, dict | None]:
    history_snapshot = conversation_history.copy()
    return await asyncio.to_thread(
        get_ai_response,
        history_snapshot,
        chat_id,
        _telegram_ai_model(update),
        420,
    )

# История переписки: {user_id: [...]}. Содержит только обезличенный текст —
# персональные данные в неё не попадают.
conversations: dict[int, list[dict]] = defaultdict(list)
conversations.update(load_conversations())
if conversations:
    logger.info(f"📚 Загружено сохранённых переписок: {len(conversations)}")

# Пошаговый сбор контактов: {chat_id: {...}}. Живёт в памяти — это короткий
# флоу оформления записи. Персональные данные отсюда сразу уходят в БД.
booking_flow: dict[int, dict] = {}

# Флоу оформления подарочного сертификата: {chat_id: {stage, amount}}
# stage: awaiting_amount → клиент назвал номинал → awaiting_method → кнопка нажата → flow удаляется.
gift_cert_flow: dict[int, dict] = {}

# MAYA попросила клиента поделиться контактом (инструмент request_client_contact):
# нужно узнать клиента (имя+телефон), чтобы найти записи/баллы/дозаполнить карточку.
# chat_id лежит здесь, пока клиент не нажал кнопку «Поделиться контактом» →
# handle_contact увидит его тут, сохранит ПД и бесшовно продолжит диалог.
pending_contact_share: set[int] = set()
# Клиенты из приложения «Поделитесь номером» (?start=linkphone), открывшие бота ДО
# оформления согласия: после прохождения гейта согласия покажем им кнопку-контакт,
# чтобы интент «привязать номер» не терялся в гейте.
pending_linkphone: set[int] = set()

# Флоу покупки ЦИФРОВОГО сертификата (после нажатия «💻 Получить цифровой»):
# собираем телефон + имя получателя, потом шлём инвойс ЮKassa.
# {chat_id: {amount, recipient_phone, recipient_name, code, stage}}
digital_cert_flow: dict[int, dict] = {}

# Админский флоу рассылки по базе. stage: 'awaiting_text' → ждём текст
# следующим сообщением; 'awaiting_confirm' → ждём кнопку подтверждения.
broadcast_flow: dict[int, dict] = {}

# Планировщик напоминаний
scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

# Клиент YClients для оформления записи на стороне backend
yc = YClientsAPI()


# ─── Главное меню ─────────────────────────────────────────────────────────

MENU_BUTTONS = {
    "✂️ Записаться", "📅 Мои записи", "🎟 Абонементы",
    "🪙 Баллы", "📨 Пригласить друга", "📺 Наш канал",
    "ℹ️ О барбершопе",
}

MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("✂️ Записаться"), KeyboardButton("📅 Мои записи")],
        [KeyboardButton("🎟 Абонементы"), KeyboardButton("🪙 Баллы")],
        [KeyboardButton("📨 Пригласить друга"), KeyboardButton("📺 Наш канал")],
        [KeyboardButton("ℹ️ О барбершопе")],
    ],
    resize_keyboard=True,
)

# Клавиатура для привязанных мастеров — заменяет клиентское меню.
# Сами текст-кнопки перехватываются в process_message и вызывают
# соответствующие команды (cmd_today / cmd_mute / cmd_unbind).
MASTER_MENU_BUTTONS = {
    "📅 Записи на сегодня",
    "📆 На месяц",
    "🔕 Пауза уведомлений",
    "🔔 Включить уведомления",
    "🚪 Отвязать Telegram",
    "ℹ️ Помощь мастеру",
}

MASTER_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("📅 Записи на сегодня"),
         KeyboardButton("📆 На месяц")],
        [KeyboardButton("🔕 Пауза уведомлений"),
         KeyboardButton("🔔 Включить уведомления")],
        [KeyboardButton("ℹ️ Помощь мастеру"),
         KeyboardButton("🚪 Отвязать Telegram")],
    ],
    resize_keyboard=True,
)


def _keyboard_for(chat_id: int):
    """
    Возвращает клавиатуру в зависимости от роли пользователя:
    • привязанный мастер → MASTER_KEYBOARD
    • остальные (клиенты + админы без привязки) → MAIN_KEYBOARD

    Если пользователь сразу и админ и мастер — показываем MASTER_KEYBOARD
    (всё равно админские команды печатать через слэш в чате).
    """
    try:
        if database.get_master_by_chat_id(chat_id):
            return MASTER_KEYBOARD
    except Exception:
        pass
    return MAIN_KEYBOARD

# Статичный ответ «О барбершопе» с инлайн-кнопками сайта и приложения
ABOUT_TEXT = f"""
✂️ *{BARBERSHOP_NAME}* — барбершоп в Ставрополе

📍 ул. Лермонтова, 343
🕒 Пн–Вс: 10:00–21:00
📞 8-962-447-67-47

📺 [Наш Telegram-канал](https://t.me/malesthetic_tv) — образы, бэкстейдж, полезные советы

Открыть на картах:
• [2GIS](https://2gis.ru/stavropol/geo/70000001038177627)
• [Яндекс.Карты](https://yandex.com/maps/org/cuts_shaves/20695024342/)
""".strip()

ABOUT_KEYBOARD = InlineKeyboardMarkup([
    [InlineKeyboardButton("📺 Наш Telegram-канал", url="https://t.me/malesthetic_tv")],
    [InlineKeyboardButton("🌐 Сайт", url=SITE_URL)],
    [InlineKeyboardButton("🍎 Приложение iOS", url=APP_URL),
     InlineKeyboardButton("🤖 Android", url=APP_URL)],
])

# Контекстные приветствия по deep-link: /start <payload> → тематический ответ.
# На сайте: https://t.me/malesthetic_bot?start=<ключ>
DEEP_LINK_RESPONSES = {
    "gift_cert": (
        "🎁 *Подарочный сертификат «Мужская Эстетика»*\n\n"
        "Лучший подарок — тот, который точно оценят. Сертификат "
        "«Мужской Эстетики» открывает доступ ко всем услугам барбершопа: "
        "от классической стрижки и моделирования бороды до комплексного "
        "ухода. Просто выбери номинал — и мы позаботимся об остальном.\n\n"
        "*Номиналы:* 2 000, 3 000 и 5 000 ₽\n\n"
        "Напишите, какой номинал нужен — подскажу, как оформить."
    ),
}

# Человекочитаемые названия тем для системной пометки в истории AI
DEEP_LINK_TOPICS = {
    "gift_cert": "Подарочный сертификат",
}

# Допустимые номиналы подарочного сертификата (₽)
GIFT_CERT_AMOUNTS = (2000, 3000, 5000)

# Через сколько минут неактивности флоу (запись/сертификат) автосбрасывается.
# Иначе они могут висеть бесконечно и перехватывать вообще ЛЮБОЕ сообщение,
# включая голос про запись (классический баг 26.05).
FLOW_TTL_MINUTES = 30


def _touch_flow(flow: dict | None):
    """Помечает флоу как 'живой сейчас'. Вызываем при любой активности."""
    if flow is not None:
        flow["_touched_at"] = datetime.now().isoformat(timespec="seconds")


def _flow_expired(flow: dict | None) -> bool:
    """True, если флоу не трогали > FLOW_TTL_MINUTES минут."""
    if not flow:
        return False
    ts = flow.get("_touched_at")
    if not ts:
        # Старые флоу без таймстампа — считаем живыми (один раз), при первом
        # touch обновятся.
        return False
    try:
        age = datetime.now() - datetime.fromisoformat(ts)
        return age > timedelta(minutes=FLOW_TTL_MINUTES)
    except Exception:
        return False


def _drop_expired_flows(chat_id: int):
    """Убирает у клиента флоу, которые давно неактивны."""
    if _flow_expired(booking_flow.get(chat_id)):
        booking_flow.pop(chat_id, None)
    if _flow_expired(gift_cert_flow.get(chat_id)):
        gift_cert_flow.pop(chat_id, None)
    if _flow_expired(digital_cert_flow.get(chat_id)):
        digital_cert_flow.pop(chat_id, None)
    if _flow_expired(broadcast_flow.get(chat_id)):
        broadcast_flow.pop(chat_id, None)

# Инлайн-кнопки выбора способа покупки сертификата
GIFT_CERT_METHOD_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("🏬 Приехать в шоп и купить", callback_data="gift_method_physical")],
    [InlineKeyboardButton("💻 Получить цифровой сертификат", callback_data="gift_method_digital")],
])


def _parse_gift_amount(text: str) -> int | None:
    """
    Распознаёт номинал сертификата из текста клиента.
    Понимает: '3000', '3', '3к', '3 тысячи', 'три тысячи', 'на 3000', 'пять'.
    Возвращает 2000/3000/5000 или None.
    """
    t = (text or "").lower().strip()
    word_map = {
        "две тысячи": 2000, "две": 2000,
        "три тысячи": 3000, "три": 3000,
        "пять тысяч": 5000, "пять": 5000,
    }
    for w, n in word_map.items():
        if re.search(rf"\b{re.escape(w)}\b", t):
            return n
    digits = re.findall(r"\d+", t)
    if not digits:
        return None
    n = int(digits[0])
    if n in GIFT_CERT_AMOUNTS:
        return n
    if n in (2, 3, 5):
        return n * 1000
    return None

PRIVACY_TEXT = """
📋 *Политика конфиденциальности*
Барбершоп «Мужская Эстетика», Ставрополь

*Оператор персональных данных:* ИП Мосин Станислав Евгеньевич, ИНН 263409096156.

*Какие данные собираем:* имя и номер телефона — только для оформления записи.

*Зачем:* записать вас к мастеру, связаться по записи, напомнить о визите.

*Хранение:* данные хранятся в нашей базе и используются согласно настоящей Политике. Имя и телефон передаются в систему записи YClients для оформления записи.

*AI-помощник:* для формирования ответов используется автоматизированный сервис — ему передаётся только обезличенная информация (услуга, мастер, дата, время), без имени и телефона.

*Маркетинговые сообщения:* напоминания о новой стрижке, поздравления с ДР и спецпредложения шлём *только если вы дали отдельное согласие на рассылки*. Согласие на рассылки — добровольное; без него вы продолжите получать только служебные сообщения по своим записям. Отписаться можно в любой момент командой /unsubscribe.

*Ваши права:* вы можете запросить уточнение или удаление данных, отозвать любое согласие — напишите или позвоните: 8-962-447-67-47, malehaircut@gmail.com.
""".strip()

# «Что нового» — версия и текст. При обновлении содержимого меняй версию
# (например, '2026-06-10') — после этого всем клиентам покажется один раз
# заново. Хранится в clients.whats_new_seen_version.
WHATS_NEW_VERSION = "2026-05-28"
WHATS_NEW_TEXT = (
    "✨ *Что нового в @malesthetic_bot:*\n\n"
    "🪙 *Программа лояльности* — 5% кэшбэка с каждого визита. "
    "Тратится на уход: Spa, массаж, маска, патчи. Загляни в «🪙 Баллы» — "
    "у тебя может уже быть welcome-бонус за прошлые визиты.\n\n"
    "🎟 *Абонементы* — стрижка раз в 2 недели от 3300 ₽/мес, экономия "
    "до 400 ₽. Кнопка «🎟 Абонементы» в меню.\n\n"
    "📨 *Приведи друга* — оба получите −15% после его первого визита. "
    "Кнопка «📨 Пригласить друга» — там твоя личная ссылка.\n\n"
    "⚡ *Точечные напоминания* — если у твоего мастера освободился "
    "слот, бот пингует первым.\n\n"
    "📅 *Удобная отмена* — теперь под каждой записью в «📅 Мои записи» "
    "есть кнопка «❌ Отменить»."
)


CONSENT_TEXT = (
    "Для записи нам нужно сохранить ваше имя и телефон.\n\n"
    "Нажимая «Продолжить», вы соглашаетесь на обработку персональных данных "
    "согласно Политике конфиденциальности."
)


# ─── Глобальный гейт согласий ────────────────────────────────────────────
#
# Ни одно действие в боте не выполняется, пока пользователь не подписал
# обязательное согласие на ПД и не сделал явный выбор по маркетинговым
# рассылкам. Реализовано как TypeHandler в group=-1 — срабатывает раньше
# всех остальных хендлеров. Если гейт не пройден — показываем экран
# согласия и блокируем апдейт через ApplicationHandlerStop.
#
# Исключения (пропускаем без проверки):
#   • Мастера и админы — для них консент в договоре/трудовых отношениях
#   • /start — он сам запускает поток согласий
#   • /privacy — право посмотреть политику до подписания
#   • Callback-кнопки самих согласий (pdn_*, mkt_*)
#   • Любая команда /unsubscribe, /subscribe — но это ловится после ПД-гейта,
#     потому что без подписания ПД клиента в базе ещё нет

# Команды, которые НЕ блокируются гейтом (всегда работают).
_GATE_ALLOWED_COMMANDS = {"/start", "/privacy", "/cancel"}

# Префиксы callback_data, которые пропускаем — это сами кнопки согласий.
_GATE_ALLOWED_CALLBACK_PREFIXES = ("pdn_", "mkt_")


def _is_staff_chat_id(chat_id: int) -> bool:
    """Мастер или админ — для них гейт не применяется."""
    try:
        if database.is_admin(chat_id):
            return True
    except Exception:
        pass
    try:
        if database.get_master_by_chat_id(chat_id):
            return True
    except Exception:
        pass
    return False


def _gate_should_skip(update: Update) -> bool:
    """True — если этот апдейт нужно пропустить без проверки согласия."""
    # Только апдейты от реального человека (не каналы, не channel_post и т.п.)
    user = update.effective_user
    if not user or user.is_bot:
        return True

    # Сотрудники барбершопа — без гейта
    if _is_staff_chat_id(user.id):
        return True

    # Разрешённые callback-кнопки (сами согласия)
    if update.callback_query and update.callback_query.data:
        data = update.callback_query.data
        if any(data.startswith(p) for p in _GATE_ALLOWED_CALLBACK_PREFIXES):
            return True

    # Разрешённые команды
    msg = update.effective_message
    if msg and msg.text:
        first_word = msg.text.strip().split()[0] if msg.text.strip() else ""
        # Telegram-команды могут быть с @ботом — отрезаем
        if "@" in first_word:
            first_word = first_word.split("@", 1)[0]
        if first_word in _GATE_ALLOWED_COMMANDS:
            return True
        # Самопредставление сотрудника («я Стас Мосин») — пропускаем мимо гейта,
        # сотрудник не клиент и не должен подписывать клиентское согласие.
        if _detect_master_self_intro(msg.text):
            return True

        # Deep-link привязки номера из приложения (?start=linkphone): для привязки
        # телефона достаточно согласия на ПДн (маркетинг по 152-ФЗ для этого не нужен).
        # Если ПДн уже дано (в т.ч. в приложении) — пропускаем гейт, чтобы бот показал
        # кнопку «Поделиться номером» сразу, в ОДИН ТАП, без повторного согласия.
        if first_word == "/start" and "linkphone" in msg.text:
            try:
                if database.has_valid_consent_by_chat_id(user.id):
                    return True
            except Exception:
                pass

        # Deep-link нативного входа (?start=app_<nonce>): пропускаем мимо гейта.
        # Сам вход (привязка web-сессии к Telegram-аккаунту) согласий бота не требует,
        # как и прежний веб-виджет; согласие на ПДн приложение берёт своим экраном.
        if first_word == "/start" and "app_" in msg.text:
            return True

    return False


async def _gate_show_consent_screen(update: Update, status: str):
    """Показать пользователю экран нужного согласия."""
    msg = update.effective_message
    if status == "need_pdn":
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("📋 Политика конфиденциальности", callback_data="pdn_policy")],
            [InlineKeyboardButton("✅ Согласен на обработку ПД",   callback_data="pdn_accept")],
        ])
        text = (
            "👋 Привет!\n\n"
            "Прежде чем пользоваться ботом — нужно подписать согласие на обработку "
            "персональных данных. Это требование 152-ФЗ.\n\n"
            "Без него я не могу обрабатывать сообщения, запоминать имя/телефон и "
            "записывать к мастерам.\n\n"
            "_Согласие можно отозвать в любой момент: 8-962-447-67-47, "
            "malehaircut@gmail.com._"
        )
    else:  # need_marketing
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔔 Да, хочу получать",         callback_data="mkt_accept")],
            [InlineKeyboardButton("✖️ Только запись, без рассылок", callback_data="mkt_decline")],
        ])
        text = (
            "Остался ещё один шаг — определись по рассылкам.\n\n"
            "🎁 *Хотите получать промокоды, акции и напоминания?*\n"
            "• День рождения — промокод −20%\n"
            "• «Не были давно? Соскучились» — раз в 1-2 месяца\n"
            "• «У вашего мастера освободилось окно» — точечно\n"
            "• Сезонные акции и скидки\n\n"
            "_Согласие можно отозвать в любой момент командой /unsubscribe._\n"
            "_На напоминания о ваших записях согласие не нужно — они придут в любом случае._"
        )

    try:
        if update.callback_query:
            await update.callback_query.answer()
            await update.callback_query.message.reply_text(
                text, parse_mode="Markdown", reply_markup=kb,
            )
        elif msg:
            await msg.reply_text(text, parse_mode="Markdown", reply_markup=kb)
    except Exception as e:
        logger.error(f"gate: не удалось показать экран согласия: {e}")


async def consent_gate(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Глобальный гейт: блокирует все взаимодействия с ботом, пока пользователь
    не подписал ПД и не сделал выбор по маркетингу.
    """
    if _gate_should_skip(update):
        return  # пропускаем дальше — пусть отрабатывают обычные хендлеры

    chat_id = update.effective_user.id
    status = database.consent_gate_status(chat_id)
    if status == "pass":
        return  # всё подписано — продолжаем

    # Иначе — показываем нужный экран и блокируем всю дальнейшую цепочку
    logger.info(
        f"🔒 Гейт: блокирую chat_id={chat_id} (status={status})"
    )
    await _gate_show_consent_screen(update, status)
    raise ApplicationHandlerStop


# ─── Команды ──────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user

    # Deep-link с сайта: /start gift_cert → контекстный ответ по конкретному блоку
    payload = context.args[0] if context.args else None
    # 🔎 Диагностика входа: КТО открыл бота и с каким payload (без ПДн — только id/имя).
    try:
        logger.info("[START] chat_id=%s name=%r username=%s payload=%r staff=%s",
                    user.id, user.first_name, user.username, payload,
                    _is_staff_chat_id(user.id))
    except Exception:
        pass

    # Атрибуция источника: фиксируем «откуда пришёл» по first-touch.
    # Если у клиента уже есть first_source — НЕ перезаписываем (логика в БД).
    # Только для не-сотрудников: мастера и админы — не клиенты.
    if not _is_staff_chat_id(user.id):
        try:
            cid = database.get_or_create_client(user.id)
            sources.record_first_touch(cid, payload)
        except Exception as e:
            logger.error(f"sources first_touch для {user.id}: {e}")

    # Deep-link из приложения «Поделитесь номером»: показываем родную кнопку
    # Telegram «Поделиться контактом». Клиент жмёт один раз → handle_contact
    # привяжет телефон к ЭТОМУ аккаунту и начислит welcome-баллы; в приложении
    # кабинет подтянет карточку, визиты и баллы. App-first онбординг без SMS.
    if payload == "linkphone":
        client_id = database.get_or_create_client(user.id)
        if database.has_valid_consent(client_id):
            client = database.get_client(user.id)
            if client and client.get("phone"):
                await update.message.reply_text(
                    "Готово — номер уже привязан 🙂 Откройте «Личный кабинет» в "
                    "приложении: там ваши баллы и история визитов.",
                    reply_markup=_keyboard_for(user.id),
                )
            else:
                kb = ReplyKeyboardMarkup(
                    [[KeyboardButton("📱 Поделиться номером", request_contact=True)]],
                    resize_keyboard=True, one_time_keyboard=True,
                )
                await update.message.reply_text(
                    "Чтобы показать ваши баллы и историю визитов прямо в приложении, "
                    "поделитесь номером — найду вас в нашей базе и всё подтяну.\n\n"
                    "_Жмите кнопку ниже. Номер нужен только чтобы вас узнать._",
                    parse_mode="Markdown",
                    reply_markup=kb,
                )
            return
        # Согласия ещё нет → запоминаем «пришёл за привязкой номера» и пускаем в
        # гейт согласия; СРАЗУ после согласия покажем кнопку-контакт (mkt-колбэк ниже).
        pending_linkphone.add(user.id)
        # пусть стандартный /start оформит согласие (не прерываем).

    # Deep-link нативного входа из приложения (?start=app_<nonce>):
    # standalone-приложение не может использовать веб-виджет Telegram (origin
    # WKWebView не проходит проверку домена бота). Поэтому приложение генерит nonce,
    # открывает эту ссылку, а бот привязывает к nonce web-сессию ЭТОГО Telegram-
    # аккаунта; приложение опрашивает /api/applogin/poll и забирает токен.
    # Сам вход согласий бота НЕ требует (как и прежний веб-виджет) — согласие на ПДн
    # и доступ к MAYA приложение оформляет отдельным экраном (/api/consent/submit).
    if payload and payload.startswith("app_"):
        nonce = payload[len("app_"):]
        ok = False
        try:
            import web_auth
            token = web_auth._new_token()
            subject_kind = "staff" if _is_staff_chat_id(user.id) else "client"
            tg_profile = normalize_tg_user({
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "username": user.username,
            })
            database.create_web_session(
                token,
                chat_id=user.id,
                display_name=tg_profile.get("display_name") or "",
                subject_kind=subject_kind,
                tg_first_name=tg_profile.get("first_name") or "",
                tg_last_name=tg_profile.get("last_name") or "",
                tg_username=tg_profile.get("username") or "",
                ttl_days=30,
            )
            ok = database.applogin_authorize(nonce, user.id, token)
        except Exception as e:
            logger.error(f"applogin authorize chat_id={user.id}: {e}")
        if not ok:
            await update.message.reply_text(
                "Ссылка для входа устарела 🙈 Откройте приложение и нажмите "
                "«Войти через Telegram» ещё раз — создам новую.",
                reply_markup=_keyboard_for(user.id),
            )
            return
        # Вход состоялся (сессия привязана выше → вход не сломается, даже если номер
        # или согласие не дадут). Дальше — КЛИЕНТУ без телефона хотим выдать номер в
        # ТОМ ЖЕ заходе, чтобы не гонять в бота второй раз (за linkphone).
        _has_phone, _has_consent = False, False
        try:
            _client_id = database.get_or_create_client(user.id)
            _client = database.get_client(user.id)
            _has_phone = bool(_client and _client.get("phone"))
            _has_consent = database.has_valid_consent(_client_id)
        except Exception as e:
            logger.error(f"app_login phone-prompt check chat_id={user.id}: {e}")
        if subject_kind != "client" or _has_phone:
            # Сотрудник или телефон уже есть → просто подтверждаем вход.
            await update.message.reply_text(
                "✅ Готово, вход выполнен! Возвращайтесь в приложение — "
                "оно само подхватит вашу авторизацию.\n\n"
                "_Если не открылось автоматически — переключитесь на приложение вручную._",
                parse_mode="Markdown",
                reply_markup=_keyboard_for(user.id),
            )
            return
        if _has_consent:
            # Согласие на ПДн уже есть → сразу кнопка номера (один заход).
            kb = ReplyKeyboardMarkup(
                [[KeyboardButton("📱 Поделиться номером", request_contact=True)]],
                resize_keyboard=True, one_time_keyboard=True,
            )
            await update.message.reply_text(
                "✅ Вход выполнен! Остался один шаг — поделитесь номером, и я "
                "сразу подтяну ваши баллы и историю визитов прямо в приложение.\n\n"
                "_Жмите кнопку ниже. Номер нужен только чтобы вас узнать._",
                parse_mode="Markdown",
                reply_markup=kb,
            )
            return
        # Согласия ещё нет (приложение берёт его ПОСЛЕ входа — отсюда и был второй
        # заход). Оформляем согласие ПРЯМО ЗДЕСЬ, в этом же заходе, и запоминаем
        # интент: после согласия mkt-callback (~стр.2228) сам покажет кнопку номера.
        # Один заход = вход + согласие + номер. НЕ прерываем — падаем в стандартный
        # /start ниже, который покажет экран согласия (как и путь linkphone).
        pending_linkphone.add(user.id)
        # без return: ниже обычный flow оформит согласие, затем — кнопку номера.

    # Погашение сертификата администратором по QR-коду: /start redeem_<код>
    if payload and payload.startswith("redeem_"):
        await _handle_redeem(update, context, payload[len("redeem_"):])
        return

    # Погашение баллов лояльности администратором: /start loy_<код>
    if payload and payload.startswith("loy_"):
        await _handle_loyalty_redeem(update, context, payload[len("loy_"):])
        return

    # Реферальная ссылка: /start ref_REF-XXXXXX
    if payload and payload.startswith("ref_"):
        ref_code = payload[len("ref_"):]
        result = referral.handle_referral_visit(user.id, ref_code)
        # Подбираем приветственный текст в зависимости от исхода
        if result["status"] == "ok":
            welcome = (
                f"Привет, {user.first_name or 'друг'}! 👋\n\n"
                f"Тебя пригласил *{result['referrer_name']}*. "
                f"После твоего первого визита у нас в «{BARBERSHOP_NAME}» "
                f"вы оба получите промокод *−{referral.REFERRAL_DISCOUNT_PERCENT}%* "
                f"на следующую стрижку 🎁\n\n"
                f"Я MAYA, администратор. Помогу записаться — жми «✂️ Записаться»."
            )
        elif result["status"] == "self_referral_blocked":
            welcome = (
                f"Привет, {user.first_name or 'друг'}! 👋\n\n"
                f"Это твоя же реферальная ссылка — пригласить самого себя не получится. "
                f"Поделись ею с друзьями: когда они придут впервые, оба получите "
                f"промокод −{referral.REFERRAL_DISCOUNT_PERCENT}% ✨"
            )
        elif result["status"] in ("already_attached", "already_attached_to_other"):
            welcome = (
                f"С возвращением, {user.first_name or 'друг'}! 👋\n"
                f"Я уже помню, что тебя пригласил друг — после твоего первого визита "
                f"вы оба получите бонус. Запишемся?"
            )
        else:
            welcome = (
                f"Привет, {user.first_name or 'друг'}! 👋\n"
                f"Не нашла такого реферального кода — но это не страшно, "
                f"помогу записаться. Жми «✂️ Записаться»."
            )
        await update.message.reply_text(
            welcome, parse_mode="Markdown", reply_markup=MAIN_KEYBOARD,
        )
        return

    if payload and payload in DEEP_LINK_RESPONSES:
        response_text = DEEP_LINK_RESPONSES[payload]
        topic_label = DEEP_LINK_TOPICS.get(payload, payload)
        await update.message.reply_text(
            response_text,
            parse_mode="Markdown",
            reply_markup=MAIN_KEYBOARD,
        )
        # Кладём метку и ответ в историю переписки — иначе AI не поймёт, о чём
        # речь, когда клиент после этого напишет «3» или «5 тысяч».
        conversations[user.id].append({
            "role": "user",
            "content": f"[Система: клиент перешёл с сайта из раздела «{topic_label}»]",
        })
        conversations[user.id].append({"role": "assistant", "content": response_text})
        conversations[user.id] = conversations[user.id][-30:]
        save_conversations(conversations)
        # Для сертификата активируем флоу: ждём номинал, дальше покажем кнопки
        if payload == "gift_cert":
            gift_cert_flow[user.id] = {"stage": "awaiting_amount"}
            booking_flow.pop(user.id, None)
        return

    # Если это привязанный мастер — у него совсем другое меню (рабочее).
    master_row = database.get_master_by_chat_id(user.id)
    if master_row:
        await update.message.reply_text(
            f"С возвращением, {master_row['full_name']}! 💈\n\n"
            f"Снизу — твоё рабочее меню. Через «📅 Записи на сегодня» — план дня.",
            reply_markup=MASTER_KEYBOARD,
        )
        return

    # Историю НЕ стираем — бот помнит клиента, даже если он удалил чат
    is_returning = bool(conversations.get(user.id))

    if is_returning:
        text = (
            f"С возвращением, {user.first_name or 'друг'}! 👋\n"
            "Рада снова вас видеть. Чем помочь?"
        )
    else:
        text = (
            f"Здравствуйте, {user.first_name or 'друг'}! 👋\n\n"
            f"Я MAYA, администратор барбершопа «{BARBERSHOP_NAME}».\n"
            "Помогу записаться, подскажу свободное время и цены."
        )
    await update.message.reply_text(text, reply_markup=MAIN_KEYBOARD)

    # ── Глобальное правило: ничего нельзя делать без подписания документов.
    # Если у клиента нет ПД-согласия или он не сделал выбор по маркетингу —
    # показываем экран согласия СРАЗУ после приветствия, не дожидаясь, пока
    # клиент упрётся в гейт на первой кнопке.
    gate_status = database.consent_gate_status(user.id)
    if gate_status != "pass":
        await _gate_show_consent_screen(update, gate_status)
        return  # «Что нового» покажем уже после подписания

    # Показываем «что нового» один раз каждой версии. Если клиент уже видел
    # текущую WHATS_NEW_VERSION — не показываем.
    try:
        seen = database.get_whats_new_seen(user.id)
        if seen != WHATS_NEW_VERSION:
            kb = InlineKeyboardMarkup([
                [InlineKeyboardButton("👌 Понятно, спасибо", callback_data="whatsnew_dismiss")],
            ])
            await update.message.reply_text(
                WHATS_NEW_TEXT,
                parse_mode="Markdown",
                reply_markup=kb,
                disable_web_page_preview=True,
            )
    except Exception as e:
        logger.error(f"cmd_start: whats_new err: {e}")


async def cmd_whats_new(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /whats_new — посмотреть «что нового» вручную в любой момент."""
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("👌 Понятно", callback_data="whatsnew_dismiss")],
    ])
    await update.message.reply_text(
        WHATS_NEW_TEXT,
        parse_mode="Markdown",
        reply_markup=kb,
        disable_web_page_preview=True,
    )


async def cmd_privacy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(PRIVACY_TEXT, parse_mode="Markdown")


async def cmd_unsubscribe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/unsubscribe — отозвать согласие на маркетинговые рассылки."""
    chat_id = update.effective_user.id
    client = database.get_client(chat_id)
    if not client:
        await update.message.reply_text(
            "Ты пока не записывался у нас — рассылки и так не приходят 🙂"
        )
        return
    database.set_marketing_consent(client["id"], False)
    await update.message.reply_text(
        "🔕 Готово, рассылки отключены.\n\n"
        "Что больше НЕ придёт:\n"
        "• ДР-промокоды\n"
        "• «Соскучились, давно не были»\n"
        "• Уведомления об освободившихся слотах\n"
        "• Сезонные акции\n\n"
        "Что ВСЁ ЕЩЁ работает (это не реклама, а часть услуги):\n"
        "• Напоминания о твоих записях\n"
        "• Подтверждения бронирования / отмены\n"
        "• Чеки об оплате\n\n"
        "_Передумаешь — команда /subscribe._",
        parse_mode="Markdown",
    )


async def cmd_subscribe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/subscribe — вернуть согласие на маркетинговые рассылки."""
    chat_id = update.effective_user.id
    client = database.get_client(chat_id)
    if not client:
        await update.message.reply_text(
            "Сначала запишись у нас хотя бы раз — после этого согласие "
            "можно настраивать. Для записи жми «✂️ Записаться».",
        )
        return
    database.set_marketing_consent(client["id"], True)
    await update.message.reply_text(
        "🔔 Промокоды и акции снова приходят. Спасибо ✨",
    )


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    conversations[user_id] = []
    booking_flow.pop(user_id, None)
    gift_cert_flow.pop(user_id, None)
    digital_cert_flow.pop(user_id, None)
    save_conversations(conversations)
    await update.message.reply_text("История очищена. Начнём сначала!", reply_markup=MAIN_KEYBOARD)


async def cmd_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /cancel — выйти из любого активного флоу (запись, сертификат, цифровой
    сертификат). Используется когда клиент застрял на этапе ввода
    телефона/имени и хочет вернуться к свободному разговору.
    """
    user_id = update.effective_user.id
    cleared = []
    if user_id in booking_flow:
        booking_flow.pop(user_id, None)
        cleared.append("запись")
    if user_id in gift_cert_flow:
        gift_cert_flow.pop(user_id, None)
        cleared.append("сертификат")
    if user_id in digital_cert_flow:
        digital_cert_flow.pop(user_id, None)
        cleared.append("оформление цифрового сертификата")

    if cleared:
        await update.message.reply_text(
            f"Отменил: {', '.join(cleared)}. О чём поговорим? 🙂",
            reply_markup=MAIN_KEYBOARD,
        )
    else:
        await update.message.reply_text(
            "Активного действия и так нет. Чем помочь?",
            reply_markup=MAIN_KEYBOARD,
        )


# ─── Команды мастеров (уведомления о новых записях) ───────────────────────

async def cmd_bind(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/bind <код> — мастер привязывает свой Telegram к YClients-аккаунту."""
    chat_id = update.effective_user.id
    args = context.args or []
    logger.info(f"/bind from chat_id={chat_id}, args={args!r}, raw_text={update.message.text!r}")
    if not args:
        await update.message.reply_text(
            "Использование: `/bind ME-XXXXXX`\n"
            "(без угловых скобок и кавычек)\n\n"
            "Bind-код выдаёт администратор.",
            parse_mode="Markdown",
        )
        return
    # Чистим всё, кроме букв, цифр и тире — пользователи присылают код в самых
    # разных обёртках: <ME-...>, "ME-...", `ME-...` и т.п.
    raw = " ".join(args).upper()
    code = re.sub(r"[^A-Z0-9-]", "", raw)
    logger.info(f"/bind нормализованный код: {code!r}")
    master = database.bind_master(code, chat_id)
    logger.info(f"/bind результат: master={master}")
    if not master:
        await update.message.reply_text(
            "Код не подошёл — возможно, неверный или уже использован другим аккаунтом. "
            "Уточни у администратора."
        )
        return
    await update.message.reply_text(
        f"✅ Привязка прошла, {master['full_name']}!\n\n"
        f"Теперь сюда будут приходить уведомления о ваших новых записях с подсказкой "
        f"по апсейлу. Под каждым уведомлением — кнопки оплаты «Наличные» / «Карта», "
        f"которые сами закроют запись в YClients после визита.\n\n"
        f"Снизу — твоё рабочее меню: «📅 Записи на сегодня», пауза/возобновление "
        f"уведомлений и отвязка. Команды также работают вручную (/today, /mute, "
        f"/unbind), но обычно проще через кнопки.",
        reply_markup=MASTER_KEYBOARD,
    )


async def _handle_master_menu_button(
    update: Update, context: ContextTypes.DEFAULT_TYPE, chat_id: int, text: str,
):
    """Маршрутизация кнопок мастерского меню в соответствующие команды."""
    master = database.get_master_by_chat_id(chat_id)
    if not master:
        # Не привязан, а нажал на мастерскую кнопку (например, после unbind)
        await update.message.reply_text(
            "Ты сейчас не привязан как мастер. Если нужно — попроси у админа "
            "новый bind-код и используй `/bind ME-XXXXXX`.",
            parse_mode="Markdown",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    if text == "📅 Записи на сегодня":
        await cmd_today(update, context)
        return

    if text == "📆 На месяц":
        await cmd_month(update, context)
        return

    if text == "🔕 Пауза уведомлений":
        # По умолчанию 2 часа — самый частый кейс. Если нужно дольше, мастер
        # сам напишет `/mute 6h` или `/mute 30m`.
        database.mute_master(chat_id, hours=2)
        await update.message.reply_text(
            "🔕 Уведомления на паузе 2 часа.\n\n"
            "Нужно дольше — напиши, например, «/mute 4h» или «/mute 30m». "
            "Снять раньше — кнопка «🔔 Включить уведомления».",
            reply_markup=MASTER_KEYBOARD,
        )
        return

    if text == "🔔 Включить уведомления":
        database.unmute_master(chat_id)
        await update.message.reply_text(
            "🔔 Уведомления снова приходят.",
            reply_markup=MASTER_KEYBOARD,
        )
        return

    if text == "ℹ️ Помощь мастеру":
        await update.message.reply_text(
            "💈 *Меню мастера*\n\n"
            "📅 *Записи на сегодня* — твой план: список всех клиентов "
            "с AI-советом по апсейлу под каждой записью и кнопками "
            "«💵 Наличные» / «💳 Карта».\n\n"
            "📆 *На месяц* — компактное расписание на 30 дней вперёд: "
            "по дням, со временем, именем клиента и услугами. Без "
            "телефонов и фамилий — для планирования.\n\n"
            "🔕 *Пауза уведомлений* — на 2 часа не присылать ничего "
            "(удобно когда занят со сложным клиентом).\n\n"
            "🔔 *Включить уведомления* — снять паузу.\n\n"
            "🚪 *Отвязать Telegram* — удалит твою привязку, уведомления "
            "перестанут приходить. Чтобы вернуть — попроси у админа "
            "новый bind-код.\n\n"
            "_Голосом или текстом «наличные» / «карта» можно закрыть "
            "последнюю запись без тапа по кнопкам — удобно если руки "
            "заняты на клиенте._",
            parse_mode="Markdown",
            reply_markup=MASTER_KEYBOARD,
        )
        return

    if text == "🚪 Отвязать Telegram":
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Да, отвязать", callback_data="master_unbind_yes"),
            InlineKeyboardButton("✖️ Передумал",   callback_data="master_unbind_no"),
        ]])
        await update.message.reply_text(
            "Точно отвязаться? Уведомления о новых записях перестанут приходить, "
            "пока админ не выдаст новый bind-код.",
            reply_markup=kb,
        )
        return


async def cmd_unbind(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/unbind — мастер отвязывает свой Telegram."""
    chat_id = update.effective_user.id
    if database.unbind_master(chat_id):
        await update.message.reply_text(
            "Отвязал. Уведомления больше приходить не будут. "
            "Чтобы вернуться — попроси у админа новый код и сделай `/bind`.",
            parse_mode="Markdown",
            reply_markup=MAIN_KEYBOARD,
        )
    else:
        await update.message.reply_text(
            "Ты и так не был привязан 🙂",
            reply_markup=_keyboard_for(chat_id),
        )


# ── Локализация для расписания мастера ──────────────────────────────────
_MONTH_RU_GENITIVE = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]
_WEEKDAY_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /today — показывает мастеру каждую запись отдельной карточкой с AI-советом
    по апсейлу и кнопками оплаты (если ещё не закрыта).

    Логика выбора дня:
      • Если есть записи сегодня — показываем сегодня.
      • Если сегодня выходной (нет записей) — ищем ближайший рабочий день в
        окне 30 дней и показываем его. Тогда в заголовке отдельно проговариваем,
        что это не «сегодня», а ближайший рабочий день — чтобы мастер не спутал.
    """
    chat_id = update.effective_user.id
    master = database.get_master_by_chat_id(chat_id)
    if not master:
        await update.message.reply_text(
            "Сначала привяжись командой `/bind ME-XXXXXX`",
            parse_mode="Markdown",
        )
        return

    today = date.today()
    horizon = today + timedelta(days=30)
    staff_id = master["yclients_staff_id"]

    # Записи на 30 дней вперёд
    try:
        records = yc.get_records_for_master(
            staff_id=staff_id,
            start_date=today.isoformat(),
            end_date=horizon.isoformat(),
        )
    except Exception as e:
        logger.error(f"Ошибка получения /today для {staff_id}: {e}")
        await update.message.reply_text("Не получилось получить записи 🙈 Попробуй позже.")
        return

    real_records = [r for r in records if not webhook_server._is_gift_cert_record(r)]

    # Группируем записи по дате
    by_date: dict[date, list[dict]] = {}
    for r in real_records:
        raw = (r.get("date") or r.get("datetime") or "")[:10]
        try:
            d = datetime.strptime(raw, "%Y-%m-%d").date()
        except Exception:
            continue
        if d < today or d > horizon:
            continue
        by_date.setdefault(d, []).append(r)

    # РЕАЛЬНЫЙ график: какие дни мастер работает (из YClients, не из записей!).
    # Это ключевое отличие: «работает, но клиентов нет» ≠ «выходной».
    working_hours: dict[date, str] = {}
    try:
        sched = yc.get_staff_schedule(staff_id, today.isoformat(), horizon.isoformat())
        for row in (sched or []):
            if not isinstance(row, dict) or not row.get("is_working") or not row.get("slots"):
                continue
            try:
                d = datetime.strptime(row["date"][:10], "%Y-%m-%d").date()
            except Exception:
                continue
            s = row["slots"][0]
            working_hours[d] = f"{s.get('from','')}-{s.get('to','')}"
    except Exception as e:
        logger.error(f"cmd_today: график staff_id={staff_id}: {e}")

    logger.info(
        f"cmd_today: staff_id={staff_id} | записей по дням: "
        f"{ {d.isoformat(): len(v) for d, v in sorted(by_date.items())} } | "
        f"сегодня работает: {today in working_hours}"
    )

    today_records = by_date.get(today, [])
    today_is_working = today in working_hours
    # Если график не отдался вообще (пусто) — считаем рабочим, если есть записи,
    # чтобы не сломать показ при сбое API графика.
    if not working_hours and today_records:
        today_is_working = True

    async def _send_day(records_list):
        for r in sorted(records_list, key=lambda x: x.get("datetime", "") or x.get("date", "")):
            await _send_today_record_card(context, chat_id, r)

    # ── 1) Сегодня РАБОЧИЙ день ────────────────────────────────────────
    if today_is_working:
        if today_records:
            n = len(today_records)
            plural = "ь" if n == 1 else "и" if 2 <= n <= 4 else "ей"
            await update.message.reply_text(
                f"📅 *Сегодня у тебя {n} запис{plural}*. Сейчас разверну с подсказками…",
                parse_mode="Markdown",
            )
            await _send_day(today_records)
        else:
            hours = working_hours.get(today, "")
            hint = f" ({hours})" if hours else ""
            await update.message.reply_text(
                f"📅 *Сегодня рабочий день{hint}, но записей пока нет.*\n\n"
                f"Как только кто-то запишется — пришлю карточку с подсказкой. "
                f"Хорошего дня 💈",
                parse_mode="Markdown",
            )
        return

    # ── 2) Сегодня ВЫХОДНОЙ (по графику) — ближайший рабочий день ───────
    future_working = sorted(d for d in working_hours if d > today)
    if not future_working:
        # График не знаем — fallback на ближайший день с записями
        future_with_recs = sorted(d for d in by_date if d > today)
        if not future_with_recs:
            await update.message.reply_text(
                "📅 Сегодня выходной, и в ближайшие 30 дней смен/записей нет. "
                "Наслаждайся отдыхом ✈️"
            )
            return
        future_working = future_with_recs

    next_day = future_working[0]
    next_records = by_date.get(next_day, [])
    weekday = _WEEKDAY_RU[next_day.weekday()]
    date_label = f"{weekday}, {next_day.day} {_MONTH_RU_GENITIVE[next_day.month - 1]}"
    delta = (next_day - today).days
    when_hint = "завтра" if delta == 1 else "послезавтра" if delta == 2 else f"через {delta} дн."
    hours = working_hours.get(next_day, "")
    hours_part = f" ({hours})" if hours else ""

    if next_records:
        n = len(next_records)
        plural = "ь" if n == 1 else "и" if 2 <= n <= 4 else "ей"
        await update.message.reply_text(
            f"📅 *Сегодня выходной.*\n\n"
            f"Ближайший рабочий день — *{date_label}*{hours_part} ({when_hint}), "
            f"*{n}* запис{plural}. Разворачиваю…",
            parse_mode="Markdown",
        )
        await _send_day(next_records)
    else:
        await update.message.reply_text(
            f"📅 *Сегодня выходной.*\n\n"
            f"Ближайший рабочий день — *{date_label}*{hours_part} ({when_hint}), "
            f"записей пока нет.",
            parse_mode="Markdown",
        )


async def _send_today_record_card(context: ContextTypes.DEFAULT_TYPE,
                                   chat_id: int, record: dict):
    """Шлёт одну карточку записи в чат мастера для команды /today."""
    record_id = record.get("id")
    if not record_id:
        return

    # Берём текст и совет — либо из ai_advice_log (если уже считали при webhook),
    # либо генерим заново. Так /today не «жжёт» лимит AI повторно.
    cached = database.get_ai_advice_for_record(int(record_id))
    if cached and cached.get("advice_text"):
        # Полный профиль клиента всё равно подгрузим — он нужен для заголовка
        await webhook_server.enrich_record_with_client(record)
        text = webhook_server._build_notification_text(
            record, advice=cached["advice_text"]
        )
    else:
        text, _ = await webhook_server.build_record_card(record)

    # Статус закрытия и кнопки
    reply_markup = None
    if cached and cached.get("button_pressed"):
        method = cached.get("payment_method") or cached.get("button_pressed")
        emoji = "💵" if method == "cash" else "💳"
        label = "наличными" if method == "cash" else "картой"
        total = cached.get("final_check_amount")
        total_part = f" — {total} ₽" if total else ""
        text += f"\n\n✅ {emoji} Закрыто {label}{total_part}"
    else:
        reply_markup = InlineKeyboardMarkup([[
            InlineKeyboardButton("💵 Наличные", callback_data=f"pay_cash_{record_id}"),
            InlineKeyboardButton("💳 Карта",    callback_data=f"pay_card_{record_id}"),
        ]])

    try:
        await context.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="Markdown",
            reply_markup=reply_markup,
        )
    except Exception as e:
        logger.error(f"/today: не отправили карточку записи {record_id}: {e}")


# ── Расписание мастера на месяц вперёд ───────────────────────────────────
# (_MONTH_RU_GENITIVE и _WEEKDAY_RU объявлены выше, перед cmd_today.)


def _format_month_record_line(r: dict) -> str:
    """Одна строка записи в месячном расписании: '10:00  Иван — стрижка, борода'.

    Без телефона и фамилии: мастер видит только имя клиента и список услуг.
    """
    raw_dt = r.get("datetime") or r.get("date") or ""
    # YClients отдаёт ISO вида '2026-05-29T10:00:00...' — время после 'T'
    t = ""
    if "T" in raw_dt:
        t = raw_dt.split("T", 1)[1][:5]
    elif len(raw_dt) >= 16:
        t = raw_dt[11:16]
    client = r.get("client") or {}
    name = (client.get("name") or "—").strip()
    first_name = name.split()[0] if name else "клиент"

    services = r.get("services") or []
    svc_titles: list[str] = []
    for s in services:
        if isinstance(s, dict) and s.get("title"):
            svc_titles.append(str(s["title"]))
    if not svc_titles:
        svc_part = "услуга"
    else:
        # Берём максимум 2 первых, остальные сворачиваем «и ещё N»
        head = ", ".join(svc_titles[:2])
        if len(svc_titles) > 2:
            head += f" и ещё {len(svc_titles) - 2}"
        svc_part = head

    return f"  · {t}  {first_name} — {svc_part}"


async def cmd_month(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /month — расписание мастера на ближайшие 30 дней.

    В отличие от /today (одна карточка на запись с AI-советами и кнопками
    оплаты) — здесь компактный список по дням: дата, кол-во записей,
    время + имя клиента + услуги. Без телефонов и фамилий — защита базы.
    """
    chat_id = update.effective_user.id
    master = database.get_master_by_chat_id(chat_id)
    if not master:
        await update.message.reply_text(
            "Сначала привяжись командой `/bind ME-XXXXXX`",
            parse_mode="Markdown",
        )
        return

    today = date.today()
    end = today + timedelta(days=30)

    try:
        records = yc.get_records_for_master(
            staff_id=master["yclients_staff_id"],
            start_date=today.isoformat(),
            end_date=end.isoformat(),
        )
    except Exception as e:
        logger.error(
            f"cmd_month: yc err for staff_id={master['yclients_staff_id']}: {e}"
        )
        await update.message.reply_text("Не получилось получить расписание 🙈 Попробуй позже.")
        return

    # Отсекаем продажи сертификатов
    real = [r for r in records if not webhook_server._is_gift_cert_record(r)]
    if not real:
        await update.message.reply_text(
            f"📆 На ближайшие 30 дней записей нет.\n"
            f"_{today.day} {_MONTH_RU_GENITIVE[today.month - 1]} — "
            f"{end.day} {_MONTH_RU_GENITIVE[end.month - 1]}_",
            parse_mode="Markdown",
        )
        return

    # Группируем по дате
    by_date: dict[date, list[dict]] = {}
    for r in real:
        raw = (r.get("date") or r.get("datetime") or "")[:10]
        try:
            d = datetime.strptime(raw, "%Y-%m-%d").date()
        except Exception:
            continue
        if d < today or d > end:
            continue
        by_date.setdefault(d, []).append(r)

    total = sum(len(v) for v in by_date.values())
    days_with_records = len(by_date)

    # Суммарная нагрузка в часах (сумма seance_length, который в секундах)
    total_seconds = 0
    for recs in by_date.values():
        for r in recs:
            try:
                total_seconds += int(r.get("seance_length") or 0)
            except Exception:
                continue
    workload_h = round(total_seconds / 3600) if total_seconds else 0

    # Заголовок
    header = (
        f"📆 *Расписание на 30 дней*\n"
        f"_{today.day} {_MONTH_RU_GENITIVE[today.month - 1]} — "
        f"{end.day} {_MONTH_RU_GENITIVE[end.month - 1]}_\n\n"
        f"Всего записей: *{total}*  ·  активных дней: *{days_with_records}*"
    )
    if workload_h:
        header += f"  ·  работы ≈ *{workload_h} ч*"

    # Строим блоки по дням (только дни с записями, пустые пропускаем)
    blocks: list[str] = []
    cur = today
    while cur <= end:
        recs = by_date.get(cur)
        if not recs:
            cur += timedelta(days=1)
            continue
        weekday = _WEEKDAY_RU[cur.weekday()]
        date_label = f"{weekday}, {cur.day} {_MONTH_RU_GENITIVE[cur.month - 1]}"
        # Сортируем по времени
        sorted_recs = sorted(
            recs,
            key=lambda x: (x.get("datetime", "") or x.get("date", "")),
        )
        lines = [f"\n*{date_label}*  ·  {len(sorted_recs)} зап."]
        for r in sorted_recs:
            lines.append(_format_month_record_line(r))
        blocks.append("\n".join(lines))
        cur += timedelta(days=1)

    # Telegram-лимит 4096 символов. Разбиваем на чанки по дням,
    # чтобы каждое сообщение влезало.
    MAX_LEN = 3800
    await update.message.reply_text(header, parse_mode="Markdown")
    chunk = ""
    for block in blocks:
        if not chunk:
            chunk = block
            continue
        if len(chunk) + len(block) + 1 > MAX_LEN:
            await update.message.reply_text(chunk, parse_mode="Markdown")
            chunk = block
        else:
            chunk += "\n" + block
    if chunk.strip():
        await update.message.reply_text(chunk, parse_mode="Markdown")


async def cmd_cycle_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/cycle_now — ручной запуск цикл-напоминания. Только для админов."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("🔁 Запускаю цикл-напоминание…")
    try:
        summary = await cycle_reminder.run_cycle_reminder_job(context.application)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Кандидатов: {summary['candidates']}\n"
            f"Отправлено: {summary['sent']}\n"
            f"Заблокировали: {summary['blocked']}\n"
            f"Ошибок: {summary['errors']}"
        )
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_birthday_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/birthday_now — ручной запуск ДР-рассылки (для админа). Тест/догон."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("🎂 Запускаю ДР-рассылку…")
    try:
        summary = await birthday.run_birthday_job(context.application)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Просканировано: {summary['candidates']}\n"
            f"Отправлено: {summary['sent']}\n"
            f"Пропущено (уже отправляли в этом году): {summary['skipped_already_sent']}\n"
            f"Ошибок: {summary['errors']}"
        )
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_subscriptions_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/subscriptions_now — ручной запуск job (sync + expire + renew push)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("🎟 Запускаю обновление абонементов…")
    try:
        summary = await subscriptions.run_subscriptions_job(context.application)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Sync обновлений: {summary['synced']}\n"
            f"Истекло: {summary['expired']}\n"
            f"Напоминания о продлении: {summary['renew_pushed']}\n"
            f"Ошибок: {summary['errors']}"
        )
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_subscriptions_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/subscriptions_stats — сводка по абонементам."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    s = database.subscriptions_summary()
    by_status = s.get("by_status", {})
    active_by_plan = s.get("active_by_plan", {})
    plan_titles = {p["code"]: f"{p['emoji']} {p['title']}" for p in subscriptions.PLANS}
    lines = [
        "🎟 *Абонементы*",
        "",
        f"• Активных: *{by_status.get('active', 0)}*",
        f"• Ожидают оплаты: {by_status.get('pending_payment', 0)}",
        f"• Истекло: {by_status.get('expired', 0)}",
        f"• Отказы: {by_status.get('refunded', 0)}",
        "",
        f"💰 Суммарный оборот: *{s.get('revenue_rub', 0)} ₽*",
        "",
    ]
    if active_by_plan:
        lines.append("*Активные по тарифам:*")
        for code, count in active_by_plan.items():
            lines.append(f"  {plan_titles.get(code, code)}: {count}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_referral_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/referral_now — запустить реферал-резолвер вручную (только админ)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("🤝 Запускаю резолвер рефералов…")
    try:
        summary = await referral.run_referral_resolver_job(context.application)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Pending проверено: {summary['pending']}\n"
            f"Выдано наград: {summary['granted']}\n"
            f"Заблокировано (self): {summary['self_blocked']}\n"
            f"Просрочено: {summary['expired']}\n"
            f"Ждут визита: {summary['skipped_no_visit_yet']}\n"
            f"Ошибок: {summary['errors']}"
        )
    except Exception as e:
        logger.error(f"Ручной реферал-резолвер: {e}")
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_referral_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/referral_stats — общая статистика по реферальной программе (админ)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    s = database.referral_summary()
    by_status = s.get("by_status", {})
    lines = [
        "📊 *Реферальная программа*",
        "",
        f"• Рефер-кодов выдано: *{s.get('codes_issued', 0)}*",
        f"• Привязок (друг → реферер):",
        f"  ◦ В ожидании визита: *{by_status.get('pending', 0)}*",
        f"  ◦ Награждено: *{by_status.get('granted', 0)}*",
        f"  ◦ Заблокировано (self): {by_status.get('self_block', 0)}",
        f"  ◦ Просрочено: {by_status.get('expired', 0)}",
        f"• Промокодов выдано: *{s.get('promos_issued', 0)}*",
    ]
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_freed_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /freed_test <staff_id> <YYYY-MM-DDTHH:MM> — симулирует освободившийся слот,
    чтобы посмотреть, кому полетят приглашения. Только для админов.

    Пример: /freed_test 1234567 2026-05-28T18:00
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    args = context.args or []
    if len(args) != 2:
        await update.message.reply_text(
            "Формат: `/freed_test <staff_id> <YYYY-MM-DDTHH:MM>`\n"
            "Пример: `/freed_test 1234567 2026-05-28T18:00`",
            parse_mode="Markdown",
        )
        return
    try:
        staff_id = int(args[0])
        slot_dt = datetime.strptime(args[1], "%Y-%m-%dT%H:%M")
    except ValueError as e:
        await update.message.reply_text(f"Не распарсил аргументы: {e}")
        return
    import freed_slot
    result = await freed_slot.offer_freed_slot(context.application, staff_id, slot_dt)
    await update.message.reply_text(
        f"Результат: `{result}`",
        parse_mode="Markdown",
    )


# ─── Админ-меню (inline-панель со всеми командами кнопками) ──────────────

ADMIN_MAIN_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("📊 Аналитика", callback_data="admin_cat_analytics")],
    [InlineKeyboardButton("⚡ Запустить рассылку вручную", callback_data="admin_cat_jobs")],
    [InlineKeyboardButton("📣 Маркетинг и анонсы", callback_data="admin_cat_marketing")],
    [InlineKeyboardButton("👥 Команда (кассиры, AI)", callback_data="admin_cat_team")],
    [InlineKeyboardButton("📋 Аудит и прочее", callback_data="admin_cat_audit")],
])

ADMIN_ANALYTICS_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("💰 Расход на ИИ", callback_data="admin_run_ai_cost")],
    [InlineKeyboardButton("🤖 AI-советы мастерам", callback_data="admin_run_stats_ai")],
    [InlineKeyboardButton("🪙 Программа лояльности", callback_data="admin_run_loyalty_stats")],
    [InlineKeyboardButton("🎟 Абонементы", callback_data="admin_run_sub_stats")],
    [InlineKeyboardButton("📨 Рефералы", callback_data="admin_run_ref_stats")],
    [InlineKeyboardButton("🧾 Список кассиров", callback_data="admin_run_cashiers")],
    [InlineKeyboardButton("← Назад", callback_data="admin_main")],
])

ADMIN_JOBS_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("💤 Реактивация уснувших", callback_data="admin_run_react")],
    [InlineKeyboardButton("🎂 ДР-промокоды", callback_data="admin_run_birthday")],
    [InlineKeyboardButton("🔁 Цикл-напоминания", callback_data="admin_run_cycle")],
    [InlineKeyboardButton("⭐ Запрос отзывов", callback_data="admin_run_reviews")],
    [InlineKeyboardButton("🎟 Sync абонементов", callback_data="admin_run_sub_now")],
    [InlineKeyboardButton("🪙 Начисление баллов", callback_data="admin_run_loy_now")],
    [InlineKeyboardButton("📨 Резолвер рефералов", callback_data="admin_run_ref_now")],
    [InlineKeyboardButton("← Назад", callback_data="admin_main")],
])

ADMIN_MARKETING_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("📣 Рассылка по базе", callback_data="admin_run_broadcast")],
    [InlineKeyboardButton("✨ Что нового (превью)", callback_data="admin_run_whatsnew")],
    [InlineKeyboardButton("← Назад", callback_data="admin_main")],
])

ADMIN_TEAM_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("🤖 AI-провайдер мастеров", callback_data="admin_run_ai_prov")],
    [InlineKeyboardButton("🧾 Кассиры (список)", callback_data="admin_run_cashiers")],
    [InlineKeyboardButton("← Назад", callback_data="admin_main")],
])

ADMIN_AUDIT_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("📋 Экспорт согласий (CSV)", callback_data="admin_run_export")],
    [InlineKeyboardButton("💰 Welcome-баллы (one-time)", callback_data="admin_run_backfill")],
    [InlineKeyboardButton("← Назад", callback_data="admin_main")],
])


class _QueryAsUpdate:
    """
    Адаптер: оборачивает callback-query так, чтобы он выглядел как Update
    для существующих cmd_* функций. Эти функции используют только
    update.effective_user.id и update.message.reply_text — и то и другое
    у нас есть в query без изменений.
    """
    def __init__(self, query):
        self.effective_user = query.from_user
        self.effective_chat = query.message.chat
        self.message = query.message


async def cmd_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/admin — открыть админ-панель с inline-кнопками всех команд."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text(
        "🎛 *Админ-панель*\n\nВыбери раздел:",
        parse_mode="Markdown",
        reply_markup=ADMIN_MAIN_KB,
    )


async def _admin_dispatch(context: ContextTypes.DEFAULT_TYPE, query, data: str):
    """
    Маршрутизация админских кнопок. Большинство действий просто вызывают
    существующие cmd_*-функции через адаптер _QueryAsUpdate.
    """
    chat_id = query.from_user.id
    if not database.is_admin(chat_id):
        await query.edit_message_text("Команда только для администраторов.")
        return

    # Навигация по подменю
    if data == "admin_main":
        await query.edit_message_text(
            "🎛 *Админ-панель*\n\nВыбери раздел:",
            parse_mode="Markdown", reply_markup=ADMIN_MAIN_KB,
        )
        return
    if data == "admin_cat_analytics":
        await query.edit_message_text(
            "📊 *Аналитика*", parse_mode="Markdown", reply_markup=ADMIN_ANALYTICS_KB,
        )
        return
    if data == "admin_cat_jobs":
        await query.edit_message_text(
            "⚡ *Запустить рассылку вручную*\n\n_Все эти рассылки и так "
            "запускаются автоматически по расписанию. Кнопки — для теста или "
            "внепланового запуска._",
            parse_mode="Markdown", reply_markup=ADMIN_JOBS_KB,
        )
        return
    if data == "admin_cat_marketing":
        await query.edit_message_text(
            "📣 *Маркетинг и анонсы*", parse_mode="Markdown", reply_markup=ADMIN_MARKETING_KB,
        )
        return
    if data == "admin_cat_team":
        await query.edit_message_text(
            "👥 *Команда*", parse_mode="Markdown", reply_markup=ADMIN_TEAM_KB,
        )
        return
    if data == "admin_cat_audit":
        await query.edit_message_text(
            "📋 *Аудит и прочее*", parse_mode="Markdown", reply_markup=ADMIN_AUDIT_KB,
        )
        return

    # Выполнение действий: оборачиваем query как Update и зовём cmd_*
    fake = _QueryAsUpdate(query)

    action_map = {
        # Аналитика (read-only)
        "admin_run_ai_cost":      cmd_ai_cost,
        "admin_run_stats_ai":     cmd_stats_ai,
        "admin_run_loyalty_stats": cmd_loyalty_stats,
        "admin_run_sub_stats":    cmd_subscriptions_stats,
        "admin_run_ref_stats":    cmd_referral_stats,
        "admin_run_cashiers":     cmd_cashiers,
        # Запуск джобов
        "admin_run_react":        cmd_reactivation_now,
        "admin_run_birthday":     cmd_birthday_now,
        "admin_run_cycle":        cmd_cycle_now,
        "admin_run_reviews":      cmd_reviews_now,
        "admin_run_sub_now":      cmd_subscriptions_now,
        "admin_run_loy_now":      cmd_loyalty_now,
        "admin_run_ref_now":      cmd_referral_now,
        # Маркетинг
        "admin_run_broadcast":    cmd_broadcast,
        "admin_run_whatsnew":     cmd_whats_new,
        # Команда
        "admin_run_ai_prov":      cmd_ai_provider,
        # Аудит
        "admin_run_export":       cmd_export_consents,
        "admin_run_backfill":     cmd_loyalty_backfill,
    }

    handler = action_map.get(data)
    if not handler:
        return  # неизвестная кнопка — игнор

    # context.args — пустой, так как кнопка не передаёт аргументов
    context.args = []
    try:
        await handler(fake, context)
    except Exception as e:
        logger.error(f"admin button {data}: {e}")
        await context.bot.send_message(chat_id, f"Ошибка действия: {e}")


async def cmd_ai_cost(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /ai_cost — показывает реальный расход на ИИ (за 7д, 30д, с 1-го числа).
    Считается из таблицы ai_usage_log, куда пишется каждый вызов Claude/OpenAI.
    Только для админов.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    try:
        report = ai_billing.build_cost_report()
    except Exception as e:
        logger.error(f"/ai_cost: {e}")
        await update.message.reply_text(f"Не получилось собрать отчёт: {e}")
        return
    await update.message.reply_text(report, parse_mode="Markdown")


async def cmd_export_consents(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /export_consents — выгрузить все согласия (ПД + фото для AI-стилиста)
    в CSV-файл. Файл приходит документом в Telegram. Только для админов.

    Нужно для аудита по 152-ФЗ — Роскомнадзор может запросить журнал
    согласий за период.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    try:
        csv_text = database.export_consents_csv()
    except Exception as e:
        logger.error(f"Ошибка экспорта согласий: {e}")
        await update.message.reply_text(f"Не получилось сформировать выгрузку: {e}")
        return
    # CSV → bytes для Telegram (с BOM, чтобы Excel сразу понял кириллицу)
    payload = ("﻿" + csv_text).encode("utf-8")
    fname = f"consents-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    bio = io.BytesIO(payload)
    bio.name = fname
    rows = csv_text.count("\n") - 1  # минус заголовок
    await update.message.reply_document(
        document=InputFile(bio, filename=fname),
        caption=(
            f"📋 Журнал согласий\n"
            f"Всего строк: {rows}\n"
            f"Открывай Excel'ем или Google Sheets — кириллица корректна."
        ),
    )


async def cmd_reactivation_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /reactivation_now — запустить реактивацию вручную (только для админов).
    Используется для теста или внеплановой кампании.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("🔄 Запускаю реактивацию вручную, секунду…")
    try:
        summary = await reactivation.run_reactivation_job(context.application)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Кандидатов найдено: {summary['candidates']}\n"
            f"Отправлено сообщений: {summary['sent']}\n"
            f"Заблокировали бот: {summary['blocked']}\n"
            f"Ошибок: {summary['errors']}"
        )
    except Exception as e:
        logger.error(f"Ручная реактивация: {e}")
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_ai_provider(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /ai_provider — показать текущий AI-провайдер для уведомлений мастерам.
    /ai_provider claude — переключить на Claude Haiku.
    /ai_provider openai — переключить на GPT-4o-mini.
    Команда доступна только админам (INITIAL_ADMIN_IDS + добавленные).
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text(
            "Команда доступна только администраторам барбершопа."
        )
        return

    current = masters_ai.get_current_provider()
    args = context.args or []

    if not args:
        # Просто показать текущее состояние
        await update.message.reply_text(
            f"🤖 Текущий AI для советов мастерам: *{current}*\n\n"
            f"Переключить:\n"
            f"`/ai_provider claude` — Claude Haiku\n"
            f"`/ai_provider openai` — GPT-4o-mini",
            parse_mode="Markdown",
        )
        return

    new_provider = args[0].lower().strip()
    if new_provider not in masters_ai.SUPPORTED_PROVIDERS:
        await update.message.reply_text(
            f"Неизвестный провайдер: `{new_provider}`\n"
            f"Допустимые: {', '.join(masters_ai.SUPPORTED_PROVIDERS)}",
            parse_mode="Markdown",
        )
        return

    if new_provider == current:
        await update.message.reply_text(
            f"AI уже работает через *{current}* — менять нечего.",
            parse_mode="Markdown",
        )
        return

    ok = masters_ai.set_current_provider(new_provider)
    if ok:
        logger.info(f"AI-провайдер изменён админом {user_id}: {current} → {new_provider}")
        await update.message.reply_text(
            f"✅ AI переключён на *{new_provider}*.\n"
            f"Следующие уведомления мастерам пойдут уже через него. "
            f"Рестарт бота не нужен.",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text("Не получилось сохранить настройку.")


async def _close_master_booking(
    record_id: int,
    payment_method: str,
    master: dict,
) -> tuple[bool, str, int | None]:
    """
    Помечает запись оплаченной в YClients + обновляет лог.
    Идемпотентно: повторное закрытие той же записи возвращает (False, "уже закрыто").

    Возвращает (success, human_message, final_amount).
    """
    log_row = database.get_ai_advice_for_record(record_id)
    if log_row and log_row.get("button_pressed"):
        return False, "Запись уже была закрыта", log_row.get("final_check_amount")

    # Достаём запись из YClients, чтобы взять реальную сумму
    record = yc.get_record(record_id)
    if not record:
        return False, "Запись не найдена в YClients", None
    services = record.get("services") or []
    total = sum(int(s.get("cost") or s.get("price") or 0) for s in services) or None

    # Закрываем в YClients
    result = yc.set_record_paid(
        record_id=record_id,
        paid_full=True,
        payment_method=payment_method,
    )
    if not result.get("success"):
        return False, f"YClients: {result.get('error')}", None

    # Дописываем в лог результат
    database.update_ai_advice_outcome(
        record_id=record_id,
        button_pressed=payment_method,
        payment_method=payment_method,
        final_check_amount=total,
    )
    # Финальный состав услуг — для анализа «зашёл совет / нет»
    try:
        final_services = [
            (s.get("title") or "").strip()
            for s in services if isinstance(s, dict) and s.get("title")
        ]
        database.update_ai_advice_final_services(record_id, final_services)
    except Exception as e:
        logger.error(f"_close_master_booking: final_services err: {e}")

    # Запрос отзыва через 3 ч (только клиенты с привязкой Telegram).
    # YClients-запись содержит client.phone — ищем по нему наш local id.
    try:
        yc_client = record.get("client") or {}
        phone = (yc_client.get("phone") or "").strip()
        local_client = (
            database.find_client_by_phone(phone) if phone else None
        )
        if local_client and local_client.get("telegram_chat_id"):
            reviews.schedule_after_close(
                client_id=local_client["id"],
                record_id=record_id,
                staff_id=master.get("yclients_staff_id"),
            )
    except Exception as e:
        logger.error(f"_close_master_booking: schedule review err: {e}")

    return True, "закрыто", total


# Регэкспы для распознавания голоса/текста мастера про оплату.
# Покрывают популярные варианты: «наличные», «налик», «кеш», «cash»,
# «карта», «карточкой», «card».
_RE_PAY_CASH = re.compile(
    r"\b(нали(?:чн|чк)\w*|нал(?:ик)?|кэш|кеш|cash)\b", re.IGNORECASE
)
_RE_PAY_CARD = re.compile(
    r"\b(карт(?:ой|очкой)?|карт\w*|card|кардом)\b", re.IGNORECASE
)


async def _try_handle_master_payment_text(update: Update, chat_id: int, text: str) -> bool:
    """
    Если пишет привязанный мастер и текст похож на «наличные»/«карта» —
    закрываем его последнюю незакрытую запись. Возвращает True, если
    запрос обработан и не нужно идти дальше в AI.
    """
    if not text or len(text) > 60:
        return False  # длинные тексты — точно не «наличные», в AI
    master = database.get_master_by_chat_id(chat_id)
    if not master:
        return False

    cash_match = bool(_RE_PAY_CASH.search(text))
    card_match = bool(_RE_PAY_CARD.search(text))
    if cash_match == card_match:
        return False  # либо ни одно, либо оба — неоднозначно, в AI

    pending = database.list_pending_payments_for_staff(
        master["yclients_staff_id"], limit=5
    )
    if not pending:
        await update.message.reply_text(
            "У тебя нет открытых записей для закрытия 🤷‍♂️"
        )
        return True
    if len(pending) > 1:
        # Несколько незакрытых — просим использовать кнопки, чтобы не закрыть не ту
        await update.message.reply_text(
            f"У тебя {len(pending)} открытых записей — голосом закрыть не получится, "
            f"открой Telegram и тапни кнопку под нужным уведомлением."
        )
        return True

    payment_method = "cash" if cash_match else "card"
    record_id = pending[0]["record_id"]
    ok, msg, total = await _close_master_booking(record_id, payment_method, master)

    if not ok:
        await update.message.reply_text(f"Не закрыл: {msg}")
        return True

    method_label = "наличными" if payment_method == "cash" else "картой"
    method_emoji = "💵" if payment_method == "cash" else "💳"
    total_part = f" — {total} ₽" if total else ""
    await update.message.reply_text(
        f"✅ {method_emoji} Запись закрыта {method_label}{total_part}",
    )
    return True


async def _handle_payment_callback(
    context: ContextTypes.DEFAULT_TYPE, query, callback_data: str
):
    """Мастер тапнул 💵 Наличные / 💳 Карта под уведомлением."""
    chat_id = query.from_user.id
    master = database.get_master_by_chat_id(chat_id)
    if not master:
        await query.answer("Эта кнопка только для мастеров", show_alert=True)
        return

    payment_method = "cash" if callback_data.startswith("pay_cash_") else "card"
    try:
        record_id = int(callback_data.rsplit("_", 1)[-1])
    except ValueError:
        await query.answer("Битая кнопка", show_alert=True)
        return

    ok, msg, total = await _close_master_booking(record_id, payment_method, master)
    if not ok:
        await query.answer(msg, show_alert=True)
        return

    # Меняем сообщение: убираем кнопки, добавляем итог
    method_label = "Наличными" if payment_method == "cash" else "Картой"
    method_emoji = "💵" if payment_method == "cash" else "💳"
    summary = f"\n\n✅ {method_emoji} Закрыто {method_label.lower()}"
    if total:
        summary += f" — {total} ₽"

    try:
        original = query.message.text_markdown or query.message.text or ""
        # Если в исходном тексте была разметка — оставляем её
        await query.edit_message_text(
            text=original + summary,
            parse_mode="Markdown",
            reply_markup=None,
        )
    except Exception as e:
        logger.error(f"edit_message_text не получился: {e}")
        # Хотя бы алерт мастеру, что закрыли
        await query.answer(f"{method_emoji} {method_label.lower()}", show_alert=False)


async def cmd_mute(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/mute 2h — заглушить уведомления на N часов (или /mute off — снять)."""
    chat_id = update.effective_user.id
    master = database.get_master_by_chat_id(chat_id)
    if not master:
        await update.message.reply_text("Сначала привяжись `/bind ME-XXXXXX`",
                                         parse_mode="Markdown")
        return

    args = context.args or []
    if args and args[0].lower() in ("off", "выкл", "снять"):
        database.unmute_master(chat_id)
        await update.message.reply_text("Mute снят, уведомления снова приходят.")
        return

    # Парсим длительность: "2h" / "30m" / просто число (часы)
    raw = (args[0] if args else "2h").strip().lower()
    try:
        if raw.endswith("m") or raw.endswith("м"):
            hours = float(raw[:-1]) / 60
        elif raw.endswith("h") or raw.endswith("ч"):
            hours = float(raw[:-1])
        else:
            hours = float(raw)
    except ValueError:
        await update.message.reply_text(
            "Формат: `/mute 2h` или `/mute 30m`. `/mute off` — снять.",
            parse_mode="Markdown",
        )
        return

    if hours <= 0 or hours > 24:
        await update.message.reply_text("От 1 минуты до 24 часов.")
        return
    database.mute_master(chat_id, hours)
    if hours >= 1:
        msg = f"🔕 Уведомления молчат {hours:g} ч. `/mute off` — снять раньше."
    else:
        msg = f"🔕 Уведомления молчат {int(hours*60)} мин. `/mute off` — снять раньше."
    await update.message.reply_text(msg, parse_mode="Markdown")


# ─── Кнопки (согласие и подтверждение записи) ──────────────────────────────

# ──────────────────────────────────────────────────────────────────────
#  Досье клиента для владельца: визиты из YClients + переписка с MAYA.
#  Зачем: по «зависшей заявке» сразу видно — наш клиент или новенький.
#  Owner-only. Текст шлём БЕЗ Markdown (в переписке клиента бывают * _ [ ]).
# ──────────────────────────────────────────────────────────────────────
def _dossier_date(dt_str) -> str:
    if not dt_str:
        return ""
    try:
        s = str(dt_str).replace("Z", "").split("+")[0].strip().replace("T", " ")
        return datetime.fromisoformat(s).strftime("%d.%m.%Y")
    except Exception:
        return str(dt_str)[:10]


def _last10(p) -> str:
    """Последние 10 цифр номера — для надёжного сравнения телефонов (+7/8/пробелы)."""
    return "".join(ch for ch in str(p or "") if ch.isdigit())[-10:]


async def _build_dossier(yc_id, name, phone, chat_id, convo_verified=False) -> str:
    name = name or "Клиент"
    lines = ["👤 " + name + " · " + (phone or "—")]
    history, noshow = [], 0
    if yc_id:
        try:
            history = await asyncio.to_thread(yc.get_client_history, yc_id, 30)
        except Exception:
            history = []
        try:
            noshow = await asyncio.to_thread(yc.get_client_noshow_count, yc_id)
        except Exception:
            noshow = 0
    if history:
        history = sorted(history, key=lambda r: str(r.get("date") or r.get("datetime") or ""), reverse=True)
        lines.append("📊 YClients: " + str(len(history)) + " визит(ов) · неявок " + str(noshow))
        lines.append("Последний визит: " + (_dossier_date(history[0].get("date") or history[0].get("datetime")) or "—"))
        lines.append("")
        for r in history[:5]:
            when = _dossier_date(r.get("date") or r.get("datetime"))
            svcs = r.get("services") or []
            svc = ", ".join((s.get("title") or "") for s in svcs)[:70] or "визит"
            try:
                cost = sum(int(s.get("cost") or 0) for s in svcs)
            except Exception:
                cost = 0
            lines.append("• " + when + " — " + svc + (" · " + str(cost) + "₽" if cost else ""))
    elif yc_id:
        lines.append("📊 YClients: визитов нет (записан, но ещё не приходил).")
    else:
        lines.append("📊 YClients: не найден — похоже, новый клиент.")
    lines.append("")
    convo = conversations.get(int(chat_id)) if chat_id else None
    if convo:
        lines.append("💬 Переписка с MAYA (последнее):" if convo_verified
                     else "💬 Переписка с MAYA — найдена по номеру, не подтверждена:")
        shown = 0
        for msg in convo[-16:]:
            content = (msg.get("content") or "").strip().replace("\n", " ")
            if not content or content.startswith("[Систем"):
                continue
            who = "🧑 Клиент" if msg.get("role") == "user" else "🤖 MAYA"
            lines.append(who + ": " + content[:200])
            shown += 1
        if not shown:
            lines.append("(значимых сообщений нет)")
    else:
        lines.append("💬 Переписки с MAYA нет — клиент ещё не писал в чат.")
    return "\n".join(lines)[:3900]


async def _dossier_chat_id(phone):
    if not phone:
        return None
    try:
        dbc = await asyncio.to_thread(database.find_client_by_phone, phone)
        return dbc.get("telegram_chat_id") if dbc else None
    except Exception:
        return None


async def cmd_client(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/client <телефон|имя> — досье клиента (визиты + переписка). Только владелец/админ."""
    user = update.effective_user
    if not database.is_admin(user.id):
        return
    q = " ".join(context.args or []).strip()
    if not q:
        await update.message.reply_text(
            "Кого показать? Пришлите телефон или имя:\n"
            "/client +79991234567\n/client Иван"
        )
        return
    try:
        await update.message.chat.send_action("typing")
    except Exception:
        pass
    matches = await asyncio.to_thread(yc.search_clients, q, 8)
    if not matches:
        await update.message.reply_text(
            "В YClients не нашла клиента по «" + q + "» — скорее всего новенький "
            "(истории визитов нет)."
        )
        return
    if len(matches) > 1:
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton((m.get("name") or "—") + " · " + (m.get("phone") or ""),
                                  callback_data="dossier_" + str(m["id"]))]
            for m in matches[:8]
        ])
        await update.message.reply_text("Несколько совпадений — выберите клиента:", reply_markup=kb)
        return
    m = matches[0]
    chat_id = await _dossier_chat_id(m.get("phone"))
    text = await _build_dossier(m["id"], m.get("name"), m.get("phone"), chat_id)
    await update.message.reply_text(text, disable_web_page_preview=True)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data

    # Сбор отзывов: rev_<rating>_<review_id>. Делегируем модулю reviews —
    # он сам сделает query.answer() и edit_message.
    if data and data.startswith("rev_"):
        if await reviews.handle_rating_callback(update, context):
            return

    await query.answer()
    chat_id = query.from_user.id

    # Досье клиента из лид-алерта (по нашему client_id): резолвим телефон → YClients.
    if data and data.startswith("dossierc_"):
        if not database.is_admin(chat_id):
            return
        try:
            cid = int(data[len("dossierc_"):])
        except Exception:
            return
        dbc = await asyncio.to_thread(database.get_client_by_id, cid)
        if not dbc:
            await query.message.reply_text("Клиент не найден в базе.")
            return
        ph, nm, cc = dbc.get("phone"), dbc.get("name"), dbc.get("telegram_chat_id")
        ycid = None
        if ph:
            ms = await asyncio.to_thread(yc.search_clients, ph, 5)
            for cand in (ms or []):  # только ТОЧНОЕ совпадение по номеру — не подтянуть чужую историю
                if _last10(cand.get("phone")) == _last10(ph):
                    ycid = cand["id"]
                    nm = nm or cand.get("name")
                    break
        # cc — это chat_id самого зависшего лида, поэтому переписка точно его (verified)
        await query.message.reply_text(await _build_dossier(ycid, nm, ph, cc, convo_verified=True), disable_web_page_preview=True)
        return

    # Досье клиента по выбранному совпадению (YClients id) из /client.
    if data and data.startswith("dossier_"):
        if not database.is_admin(chat_id):
            return
        try:
            ycid = int(data[len("dossier_"):])
        except Exception:
            return
        c = await asyncio.to_thread(yc.get_client, ycid) or {}
        ph = c.get("phone")
        cc = await _dossier_chat_id(ph)
        await query.message.reply_text(await _build_dossier(ycid, c.get("name"), ph, cc), disable_web_page_preview=True)
        return

    # Показать политику конфиденциальности
    if data == "pdn_policy":
        await query.message.reply_text(PRIVACY_TEXT, parse_mode="Markdown")
        return

    # Согласие на обработку ПД дано — спрашиваем второй шаг (маркетинг)
    if data == "pdn_accept":
        client_id = database.get_or_create_client(chat_id)
        database.save_consent(client_id, True, source="telegram")
        # Если было оформление записи — двигаем флоу на следующий этап
        flow = booking_flow.get(chat_id)
        if flow:
            flow["client_id"] = client_id
            flow["stage"] = "marketing_consent"
        await query.edit_message_text("Согласие на обработку ПД принято ✅")

        # Второй шаг — маркетинговое согласие. По 152-ФЗ и Закону о рекламе
        # рекламные рассылки требуют отдельного согласия.
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔔 Да, хочу получать", callback_data="mkt_accept")],
            [InlineKeyboardButton("✖️ Только запись, без рассылок", callback_data="mkt_decline")],
        ])
        await context.bot.send_message(
            chat_id,
            "🎁 *Хотите получать промокоды, акции и напоминания?*\n\n"
            "Это:\n"
            "• День рождения — промокод −20%\n"
            "• «Не были давно? Соскучились» — раз в 1-2 месяца\n"
            "• «У вашего мастера освободилось окно» — точечно\n"
            "• Сезонные акции и скидки\n\n"
            "_Согласие можно отозвать в любой момент командой /unsubscribe._\n"
            "_На напоминания о ваших записях согласие не нужно — они придут в любом случае._",
            parse_mode="Markdown",
            reply_markup=kb,
        )
        return

    # Маркетинговое согласие
    if data in ("mkt_accept", "mkt_decline"):
        agreed = data == "mkt_accept"
        flow = booking_flow.get(chat_id)
        client_id = (
            (flow or {}).get("client_id") or database.get_or_create_client(chat_id)
        )
        database.set_marketing_consent(client_id, agreed)

        if agreed:
            await query.edit_message_text(
                "Спасибо ✨ Промокоды и напоминания включены.",
            )
        else:
            await query.edit_message_text(
                "Окей, только запись 👌 Если передумаешь — команда /subscribe.",
            )

        if flow:
            # Согласия дошли из флоу записи — двигаем дальше: спросить имя
            flow["stage"] = "name"
            await context.bot.send_message(chat_id, "Как вас зовут?")
        elif chat_id in pending_linkphone:
            # Клиент пришёл из приложения «Поделитесь номером» ДО согласия —
            # теперь согласие есть, показываем кнопку-контакт (интент не теряем).
            pending_linkphone.discard(chat_id)
            _lc = database.get_client(chat_id)
            if _lc and _lc.get("phone"):
                await context.bot.send_message(
                    chat_id,
                    "Готово — номер уже привязан 🙂 Откройте «Личный кабинет» в "
                    "приложении: там ваши баллы и история визитов.",
                    reply_markup=_keyboard_for(chat_id),
                )
            else:
                _lkb = ReplyKeyboardMarkup(
                    [[KeyboardButton("📱 Поделиться номером", request_contact=True)]],
                    resize_keyboard=True, one_time_keyboard=True,
                )
                await context.bot.send_message(
                    chat_id,
                    "Остался последний шаг 👇\n\nПоделитесь номером — найду вас в "
                    "нашей базе и подтяну баллы и историю прямо в приложение.\n\n"
                    "_Жмите кнопку ниже. Номер нужен только чтобы вас узнать._",
                    parse_mode="Markdown",
                    reply_markup=_lkb,
                )
        else:
            # Согласия пришли из глобального гейта (не из записи) — пускаем
            # клиента в обычное общение с ботом.
            await context.bot.send_message(
                chat_id,
                "Готово ✅ Теперь можно пользоваться ботом. Чем помочь?",
                reply_markup=_keyboard_for(chat_id),
            )
        return

    # Подтверждение записи
    if data == "booking_confirm":
        await _finalize_booking(context, chat_id, query)
        return

    if data == "booking_cancel":
        booking_flow.pop(chat_id, None)
        await query.edit_message_text("Запись отменена. Обращайтесь, если что 🙂")
        return

    # Настроение визита: vmood_<red|blue>_<record_id>
    if data and data.startswith("vmood_"):
        await _handle_visit_mood_callback(query, chat_id, data)
        return

    # Выбор получателя записи: на себя или на другого человека
    if data == "contact_self":
        flow = booking_flow.get(chat_id)
        if not flow:
            await query.edit_message_text("Запись неактивна. Начните заново 🙂")
            return
        flow["name"] = flow.get("saved_name")
        flow["phone"] = flow.get("saved_phone")
        flow["for_other"] = False
        flow["stage"] = "confirm"
        await query.edit_message_text("Записываю на ваши данные ✅")
        await _show_confirm(context, chat_id)
        return

    if data == "contact_other":
        flow = booking_flow.get(chat_id)
        if not flow:
            await query.edit_message_text("Запись неактивна. Начните заново 🙂")
            return
        flow["for_other"] = True
        flow["name"] = None
        flow["phone"] = None
        flow["stage"] = "name"
        await query.edit_message_text("Записываем на другого человека 👥")
        await context.bot.send_message(chat_id, "Как зовут того, кого записываем?")
        return

    # Выбор способа покупки подарочного сертификата
    if data.startswith("gift_method_"):
        await _finalize_gift_cert(context, chat_id, query, data)
        return

    # Кнопки из сообщения реактивации уснувшего клиента
    if data == "react_decline":
        client_row = database.get_client(chat_id)
        if client_row:
            database.log_reactivation(client_row["id"], "declined")
        await query.edit_message_text(
            "Поняла 👌 Не буду беспокоить. Если что — всегда можно записаться "
            "через /start или кнопку «✂️ Записаться».",
        )
        return
    if data == "react_pick_other":
        client_row = database.get_client(chat_id)
        if client_row:
            database.log_reactivation(client_row["id"], "engaged")
        await query.edit_message_text("Окей, давай подберём 👇")
        # Прокидываем намерение через AI
        conversations[chat_id].append({
            "role": "user",
            "content": "Хочу записаться, помоги подобрать мастера и время",
        })
        if len(conversations[chat_id]) > 30:
            conversations[chat_id] = conversations[chat_id][-30:]
        try:
            response_text, contact_request, _ = await _get_ai_response_async(
                conversations[chat_id], chat_id, update
            )
        except Exception as e:
            logger.error(f"Реактивация react_pick_other AI: {e}")
            response_text = "Скажи, к какому мастеру и на какое время — найду слот."
        response_text = response_text or "Скажи, к какому мастеру и на какое время."
        conversations[chat_id].append({"role": "assistant", "content": response_text})
        save_conversations(conversations)
        await context.bot.send_message(chat_id, response_text, reply_markup=MAIN_KEYBOARD)
        if contact_request:
            await _start_contact_flow(context, chat_id, contact_request)
        return
    if data.startswith("react_book_"):
        client_row = database.get_client(chat_id)
        if client_row:
            database.log_reactivation(client_row["id"], "engaged")
        await query.edit_message_text("Окей, ищу свободное время 👇")
        try:
            staff_id = int(data.rsplit("_", 1)[-1]) or 0
        except ValueError:
            staff_id = 0
        # Находим имя мастера, если знаем staff_id
        master_label = ""
        if staff_id:
            for m in yc.get_masters():
                if m["id"] == staff_id:
                    master_label = m["name"]
                    break
        intent = (
            f"Хочу записаться к {master_label} на ближайшее свободное время на мужскую стрижку"
            if master_label
            else "Хочу записаться на ближайшее свободное время на мужскую стрижку"
        )
        conversations[chat_id].append({"role": "user", "content": intent})
        if len(conversations[chat_id]) > 30:
            conversations[chat_id] = conversations[chat_id][-30:]
        try:
            response_text, contact_request, _ = await _get_ai_response_async(
                conversations[chat_id], chat_id, update
            )
        except Exception as e:
            logger.error(f"Реактивация react_book AI: {e}")
            response_text = "Не получилось проверить расписание, попробуй ещё раз позже."
        response_text = response_text or "Уточни время — найду."
        conversations[chat_id].append({"role": "assistant", "content": response_text})
        save_conversations(conversations)
        await context.bot.send_message(chat_id, response_text, reply_markup=MAIN_KEYBOARD)
        if contact_request:
            await _start_contact_flow(context, chat_id, contact_request)
        return

    # Подтверждение «отмены записи» из reply-клавиатуры
    if data == "cancel_confirm_no":
        await query.edit_message_text("Окей, ничего не отменяю 👌")
        return
    if data == "cancel_confirm_yes":
        await query.edit_message_text("Окей, ищу твои записи…")
        # Сбрасываем любые активные флоу — клиент сменил тему
        booking_flow.pop(chat_id, None)
        gift_cert_flow.pop(chat_id, None)
        digital_cert_flow.pop(chat_id, None)
        # Прокидываем намерение через AI — он найдёт записи и предложит отменить
        conversations[chat_id].append({
            "role": "user",
            "content": "Хочу отменить свою запись",
        })
        if len(conversations[chat_id]) > 30:
            conversations[chat_id] = conversations[chat_id][-30:]
        try:
            response_text, _, _ = await _get_ai_response_async(
                conversations[chat_id], chat_id, update
            )
        except Exception as e:
            logger.error(f"Ошибка AI на cancel_confirm: {e}")
            response_text = "Не получилось проверить записи. Позвоните: 8-962-447-67-47"
        response_text = response_text or "Не нашла активных записей."
        conversations[chat_id].append({"role": "assistant", "content": response_text})
        save_conversations(conversations)
        await context.bot.send_message(chat_id, response_text, reply_markup=MAIN_KEYBOARD)
        return

    # Кнопки оплаты записи мастером (наличные / карта)
    if data.startswith("pay_cash_") or data.startswith("pay_card_"):
        await _handle_payment_callback(context, query, data)
        return

    # Освободившийся слот: клиент принял предложение
    if data.startswith("freed_book_"):
        await _handle_freed_slot_accept(context, query, data)
        return
    if data == "freed_decline":
        await _handle_freed_slot_decline(context, query)
        return

    # Отмена конкретной записи: первая стадия — подтверждение
    if data.startswith("cancel_rec_yes_"):
        try:
            record_id = int(data[len("cancel_rec_yes_"):])
        except ValueError:
            await query.edit_message_text("Не разобрала id записи.")
            return
        await _handle_cancel_record_confirm(context, query, record_id)
        return
    if data == "cancel_rec_no":
        # Возвращаем исходную кнопку «Отменить запись» — карточка не теряется
        # (нам нужен record_id, но он закодирован в кнопке исходного сообщения,
        # которой сейчас нет; поэтому просто убираем кнопки).
        try:
            await query.edit_message_reply_markup(reply_markup=None)
        except Exception:
            pass
        return
    if data.startswith("cancel_rec_"):
        try:
            record_id = int(data[len("cancel_rec_"):])
        except ValueError:
            await query.edit_message_text("Не разобрала id записи.")
            return
        await _handle_cancel_record_request(context, query, record_id)
        return

    # Абонементы: «🎟 Абонементы» → каталог → tap план → экран выбора уровня
    if data.startswith("sub_pick_"):
        plan_code = data[len("sub_pick_"):]
        card = subscriptions.build_tier_choice_card(plan_code)
        if not card:
            await query.edit_message_text("Тариф не найден 🙈")
            return
        text, kb = card
        await query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)
        return
    # Назад к каталогу
    if data == "sub_back_catalog":
        text, kb = subscriptions.build_catalog_card()
        await query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)
        return
    # Оплата выбранного уровня: sub_pay_<plan>_<tier>
    if data.startswith("sub_pay_"):
        rest = data[len("sub_pay_"):]
        try:
            plan_code, tier = rest.rsplit("_", 1)
        except ValueError:
            await query.edit_message_text("Не разобрала тариф. Откройте «🎟 Абонементы» заново.")
            return
        if tier not in ("senior", "top"):
            await query.edit_message_text("Неизвестный уровень.")
            return
        await _start_subscription_purchase(context, query, plan_code, tier=tier)
        return
    # «Не сейчас» — отказ от продления
    if data == "sub_renew_skip":
        await query.edit_message_text(
            "Окей, абонемент не продлеваю. Если передумаешь — кнопка «🎟 Абонементы» под рукой."
        )
        return

    # Админ-панель — все ветки маршрутизации (главное меню, подменю, действия)
    if data.startswith("admin_"):
        await _admin_dispatch(context, query, data)
        return

    # Подтверждение отвязки мастера через кнопку из мастерского меню
    if data == "master_unbind_no":
        await query.edit_message_text("Окей, остаёшься на связи 👌")
        return
    if data == "master_unbind_yes":
        if database.unbind_master(chat_id):
            await query.edit_message_text(
                "Отвязал. Уведомления больше приходить не будут.",
            )
            await context.bot.send_message(
                chat_id,
                "Чтобы вернуться — попроси у админа новый код и сделай "
                "`/bind ME-XXXXXX`.",
                parse_mode="Markdown",
                reply_markup=MAIN_KEYBOARD,
            )
        else:
            await query.edit_message_text("Ты и так не был привязан 🙂")
        return

    # «Что нового» — клиент посмотрел, отметим что больше не показывать
    if data == "whatsnew_dismiss":
        try:
            database.get_or_create_client(chat_id)
            database.mark_whats_new_seen(chat_id, WHATS_NEW_VERSION)
        except Exception as e:
            logger.error(f"whatsnew_dismiss err: {e}")
        try:
            await query.edit_message_reply_markup(reply_markup=None)
        except Exception:
            pass
        return

    # Админский broadcast — подтверждение/отмена
    if data == "broadcast_send":
        if not database.is_admin(chat_id):
            await query.edit_message_text("Команда только для администраторов.")
            return
        flow = broadcast_flow.get(chat_id)
        if not flow or flow.get("stage") != "awaiting_confirm":
            await query.edit_message_text("Превью устарело — запусти /broadcast заново.")
            return
        await query.edit_message_text(
            f"📤 Отправляю {flow.get('preview_count', '?')} получателям…"
        )
        try:
            res = await _broadcast_execute(context, chat_id)
            skipped_line = (
                f"Без согласия (исключены): {res.get('skipped_no_consent', 0)}\n"
                if res.get("skipped_no_consent") else ""
            )
            await context.bot.send_message(
                chat_id,
                f"✅ Рассылка завершена.\n\n"
                f"Отправлено: *{res['sent']}*\n"
                f"Заблокировали бот: {res['blocked']}\n"
                f"{skipped_line}"
                f"Ошибок: {res['errors']}",
                parse_mode="Markdown",
            )
        except Exception as e:
            logger.error(f"broadcast_send: {e}")
            await context.bot.send_message(chat_id, f"Ошибка рассылки: {e}")
        return
    if data == "broadcast_cancel":
        broadcast_flow.pop(chat_id, None)
        await query.edit_message_text("Рассылка отменена 👌")
        return

    # ── Подтверждение доступа сотрудника («я Стас Мосин») ──────────────
    if data.startswith("empauth_"):
        if not database.is_admin(chat_id):
            await query.edit_message_text("Только владелец может подтверждать сотрудников.")
            return
        if data.startswith("empauth_no_"):
            await query.edit_message_text("Окей, доступ не выдан 👌")
            return
        if data.startswith("empauth_yes_"):
            try:
                _, _, staff_id_s, emp_chat_s = data.split("_", 3)
                staff_id = int(staff_id_s)
                emp_chat = int(emp_chat_s)
            except Exception:
                await query.edit_message_text("Битая кнопка.")
                return
            full_name = "мастер"
            try:
                for m in (yc.get_masters() or []):
                    if int(m.get("id") or 0) == staff_id:
                        full_name = m.get("name") or full_name
                        break
            except Exception:
                pass
            if not database.get_master_by_staff_id(staff_id):
                database.reset_master_bind_code(staff_id, full_name)
            _bind_master_chat_direct(staff_id, emp_chat)
            await query.edit_message_text(
                f"✅ Готово. *{full_name}* теперь в режиме сотрудника.",
                parse_mode="Markdown",
            )
            # Уведомляем сотрудника
            try:
                first = full_name.split()[0]
                await context.bot.send_message(
                    emp_chat,
                    f"✅ Владелец подтвердил — режим мастера включён, {first}! 💈\n"
                    f"Снизу твоё рабочее меню.",
                    reply_markup=MASTER_KEYBOARD,
                )
            except Exception as e:
                logger.error(f"empauth notify employee {emp_chat}: {e}")
        return

    # ── Админ: подтверждение нового bind-кода для уже привязанного мастера
    if data == "bindnew_cancel":
        await query.edit_message_text("Окей, привязка не тронута 👌")
        return
    if data.startswith("bindnew_"):
        if not database.is_admin(chat_id):
            await query.edit_message_text("Только для администраторов.")
            return
        try:
            staff_id = int(data[len("bindnew_"):])
        except ValueError:
            await query.edit_message_text("Битая кнопка.")
            return
        # Имя мастера из YClients
        full_name = f"staff_{staff_id}"
        try:
            for m in (yc.get_masters() or []):
                if int(m.get("id") or 0) == staff_id:
                    full_name = m.get("name") or full_name
                    break
        except Exception:
            pass
        code = database.reset_master_bind_code(staff_id, full_name)
        await query.edit_message_text(
            f"🔑 Новый код для *{full_name}* выдан, старая привязка сброшена.",
            parse_mode="Markdown",
        )
        await _send_bind_code_card(
            lambda *a, **k: context.bot.send_message(chat_id, *a, **k), full_name, code,
        )
        return

    # ── Библиотека шаблонов рассылок ───────────────────────────────────
    if data == "bcast_close":
        broadcast_flow.pop(chat_id, None)
        await query.edit_message_text("Окей, в другой раз 🙂")
        return

    if data == "bcast_custom":
        # «Свой текст» — обычный awaiting_text-флоу
        if not database.is_admin(chat_id):
            await query.edit_message_text("Команда только для администраторов.")
            return
        broadcast_flow[chat_id] = {"stage": "awaiting_text"}
        _touch_flow(broadcast_flow[chat_id])
        await query.edit_message_text(
            "✏️ *Свой текст*\n\nПришлите следующим сообщением текст для рассылки.",
            parse_mode="Markdown",
        )
        return

    if data.startswith("bcast_cat_"):
        if not database.is_admin(chat_id):
            await query.edit_message_text("Команда только для администраторов.")
            return
        cat_code = data[len("bcast_cat_"):]
        templates = broadcast_templates.get_by_category(cat_code)
        if not templates:
            await query.edit_message_text("В этом разделе пока пусто.")
            return
        rows = [
            [InlineKeyboardButton(
                f"{t['emoji']} {t['title']}",
                callback_data=f"bcast_tpl_{t['code']}",
            )]
            for t in templates
        ]
        rows.append([InlineKeyboardButton("← Назад", callback_data="bcast_back")])
        await query.edit_message_text(
            f"📣 *{broadcast_templates.category_label(cat_code)}*\n\n"
            f"Выберите шаблон:",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(rows),
        )
        return

    if data == "bcast_back":
        # Назад в главное меню — заново показываем категории
        kb_rows = [
            [InlineKeyboardButton(label, callback_data=f"bcast_cat_{code}")]
            for code, label in broadcast_templates.CATEGORIES
        ]
        kb_rows.append([InlineKeyboardButton("✏️ Свой текст", callback_data="bcast_custom")])
        kb_rows.append([InlineKeyboardButton("✖️ Отменить", callback_data="bcast_close")])
        await query.edit_message_text(
            "📣 *Рассылка по базе*\n\n"
            "Выберите шаблон из библиотеки или напишите свой текст с нуля.",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(kb_rows),
        )
        return

    if data.startswith("bcast_tpl_"):
        if not database.is_admin(chat_id):
            await query.edit_message_text("Команда только для администраторов.")
            return
        code = data[len("bcast_tpl_"):]
        tpl = broadcast_templates.get_by_code(code)
        if not tpl:
            await query.edit_message_text("Шаблон не найден.")
            return
        # Превью шаблона + варианты «Использовать как есть» / «Отредактировать»
        body = tpl["body"]
        preview = body if len(body) <= 800 else body[:800] + "…"
        broadcast_flow[chat_id] = {
            "stage": "tpl_chosen",
            "template_code": code,
            "text": body,
        }
        _touch_flow(broadcast_flow[chat_id])
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("✅ Использовать", callback_data="bcast_tpl_use")],
            [InlineKeyboardButton("✏️ Отредактировать",  callback_data="bcast_tpl_edit")],
            [InlineKeyboardButton("← Назад",          callback_data=f"bcast_cat_{tpl['category']}")],
        ])
        await query.edit_message_text(
            f"{tpl['emoji']} *{tpl['title']}*\n\n"
            f"━━━ Текст ━━━\n"
            f"{preview}\n"
            f"━━━━━━━━━━━━\n\n"
            f"_Плейсхолдер {{name}} автоматически подставит имя клиента "
            f"(или «друг» если имени нет)._",
            parse_mode="Markdown",
            reply_markup=kb,
        )
        return

    if data == "bcast_tpl_use":
        flow = broadcast_flow.get(chat_id)
        if not flow or flow.get("stage") != "tpl_chosen" or not flow.get("text"):
            await query.edit_message_text("Шаблон устарел — запусти /broadcast заново.")
            return
        # Сразу в обычный превью-флоу
        await query.edit_message_text("📤 Готовлю превью…")
        await _broadcast_show_preview_from_callback(query, chat_id, flow["text"])
        return

    if data == "bcast_tpl_edit":
        flow = broadcast_flow.get(chat_id)
        if not flow or not flow.get("text"):
            await query.edit_message_text("Шаблон устарел — запусти /broadcast заново.")
            return
        broadcast_flow[chat_id] = {
            "stage": "awaiting_text",
            "prefill_text": flow["text"],
        }
        _touch_flow(broadcast_flow[chat_id])
        await query.edit_message_text(
            "✏️ Отправьте отредактированную версию следующим сообщением. "
            "Вот текущий текст для копирования:",
        )
        await context.bot.send_message(
            chat_id,
            flow["text"],
            parse_mode="Markdown",
        )
        return

    # Лояльность: клиент выбрал услугу-уход для списания баллов
    if data.startswith("loy_redeem_"):
        service_title = data[len("loy_redeem_"):]
        client_id = database.get_or_create_client(chat_id)
        result = loyalty.generate_redeem_code(client_id, service_title)
        if not result.get("ok"):
            await query.edit_message_text(
                f"Не получилось: {result.get('reason', 'неизвестная ошибка')}",
            )
            return
        code = result["code"]
        pts = result["points"]
        svc = result["service_title"]
        expires_h = datetime.fromisoformat(result["expires_at"]).strftime("%d.%m.%Y")

        # Заменяем текущее сообщение на статус + отправляем QR-картинку
        await query.edit_message_text(
            f"🪙 *Код для администратора:*\n\n"
            f"`{code}`\n\n"
            f"Услуга: *{svc}*\n"
            f"Списание: *{pts} баллов*\n"
            f"Действует до: *{expires_h}*\n\n"
            f"Покажи QR-код администратору — он отсканирует, подтвердит "
            f"списание, и услуга для тебя будет бесплатной.",
            parse_mode="Markdown",
        )

        # Генерируем QR с deep-link для админа
        import qrcode, io as _io
        deep_link = f"https://t.me/{BOT_USERNAME}?start=loy_{code}"
        qr_img = qrcode.make(deep_link)
        bio = _io.BytesIO()
        bio.name = f"{code}.png"
        qr_img.save(bio, format="PNG")
        bio.seek(0)
        await context.bot.send_photo(
            chat_id, photo=bio,
            caption=f"📲 QR-код для администратора\nКод: `{code}`",
            parse_mode="Markdown",
        )
        return

    if data == "loy_close_book":
        await query.edit_message_text(
            "Чтобы накопить — записывайся через «✂️ Записаться». Каждый "
            f"визит = +{loyalty.CASHBACK_PCT}% баллами 🪙"
        )
        return

    # Админ подтвердил списание баллов
    if data.startswith("loy_confirm_"):
        if data == "loy_confirm_cancel":
            await query.edit_message_text("Отменено.")
            return
        if not database.can_redeem_codes(chat_id):
            await query.edit_message_text("Гасить баллы могут только админы или кассиры 🔒")
            return
        code = data[len("loy_confirm_"):]
        result = loyalty.consume_redeem_code(code, admin_user_id=chat_id)
        if result.get("ok"):
            await query.edit_message_text(
                f"✅ Списано *{result['points']} баллов* за «{result['service_title']}».\n\n"
                f"Не забудь оформить услугу в YClients как «оплачено баллами».",
                parse_mode="Markdown",
            )
        else:
            await query.edit_message_text(
                f"Не получилось списать: {result.get('reason', 'неизвестная ошибка')}"
            )
        return

    # Погашение сертификата администратором
    if data.startswith("cert_redeem_"):
        if data == "cert_redeem_cancel":
            await query.edit_message_text("Отменено.")
            return
        code = data[len("cert_redeem_"):]
        if not database.can_redeem_codes(chat_id):
            await query.edit_message_text("Гасить сертификаты могут только админы или кассиры 🔒")
            return
        ok = database.mark_cert_used(code, admin_user_id=chat_id)
        cert = database.get_gift_certificate(code)
        if ok and cert:
            await query.edit_message_text(
                f"✅ Сертификат `{cert['code']}` на *{cert['amount']} ₽* погашен.\n\n"
                f"Не забудьте оформить услугу в YClients как оплаченную сертификатом.",
                parse_mode="Markdown",
            )
        else:
            await query.edit_message_text(
                "Не удалось погасить (возможно, уже погашен или не существует)."
            )
        return


# ─── Распознавание голоса ─────────────────────────────────────────────────

async def transcribe_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> str | None:
    try:
        voice_file = await update.message.voice.get_file()
        with tempfile.TemporaryDirectory() as tmpdir:
            ogg_path = os.path.join(tmpdir, "voice.ogg")
            await voice_file.download_to_drive(ogg_path)
            with open(ogg_path, "rb") as audio_file:
                raw = audio_file.read()
        return await asyncio.to_thread(webhook_server._transcribe_audio_bytes, raw)
    except Exception as e:
        logger.error(f"Ошибка распознавания голоса: {e}")
        return None


# ─── Обработка сообщений ──────────────────────────────────────────────────

async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_user.id
    _drop_expired_flows(chat_id)
    flow = booking_flow.get(chat_id)
    # На шаге сбора контактов голос не принимаем — имя/телефон только текстом,
    # чтобы аудио с персональными данными не уходило на распознавание.
    if flow and flow.get("stage") in ("consent", "name", "phone", "confirm"):
        await update.message.reply_text("На этом шаге напишите, пожалуйста, текстом 🙂")
        return
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    text = await transcribe_voice(update, context)
    if not text:
        await update.message.reply_text(
            "Не расслышала 😅 Попробуйте ещё раз или напишите текстом",
            reply_markup=MAIN_KEYBOARD,
        )
        return
    logger.info("Голос распознан (длина текста: %d)", len(text))
    await process_message(update, context, text)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Антон присылает расходы по салону (после /rashod или еженедельного напоминания)
    uid = update.effective_user.id if update.effective_user else 0
    if uid == ANTON_CHAT_ID and uid in _anton_expense_awaiting:
        _anton_expense_awaiting.discard(uid)
        await _save_anton_expenses(update, update.message.text or "")
        return
    await process_message(update, context, update.message.text)


async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Клиент поделился номером телефона (кнопка «📱 Подтянуть мои баллы»).
    Сохраняем телефон, ищем в YClients, начисляем welcome-баллы.
    """
    chat_id = update.effective_user.id
    contact = update.message.contact
    if not contact or not contact.phone_number:
        return

    # Безопасность: принимаем только СВОЙ контакт, не чужой.
    if contact.user_id and contact.user_id != chat_id:
        await update.message.reply_text(
            "Поделись, пожалуйста, своим номером — чужой не подойдёт 🙂",
            reply_markup=_keyboard_for(chat_id),
        )
        return

    # ── Контакт запрошен MAYA (инструмент request_client_contact) ──────────
    # Это НЕ флоу «Баллы»: сохраняем имя+телефон в карточку и бесшовно продолжаем
    # диалог — отвечаем на исходный вопрос клиента (теперь телефон в системе есть).
    if chat_id in pending_contact_share:
        pending_contact_share.discard(chat_id)
        phone = contact.phone_number
        client_id = database.get_or_create_client(chat_id)
        existing = database.get_client(chat_id) or {}
        name = existing.get("name") or (update.effective_user.first_name or "").strip()
        try:
            database.update_client(client_id, name=name or None, phone=phone)
        except Exception as e:
            logger.error(f"handle_contact (запрос MAYA) update_client: {e}")
        # Баллы за прошлые визиты — идемпотентно, раз уж узнали телефон
        try:
            loyalty.lazy_backfill_for_client(client_id, phone)
        except Exception as e:
            logger.error(f"handle_contact (запрос MAYA) backfill: {e}")
        try:
            await asyncio.to_thread(warm_client_history_cache_for_phone, client_id, phone)
        except Exception as e:
            logger.error(f"handle_contact (запрос MAYA) history warmup: {e}")
        # Продолжаем разговор: добавляем реплику клиента и снова спрашиваем MAYA —
        # теперь она найдёт записи/баллы по сохранённому телефону.
        conversations[chat_id].append({"role": "user", "content": "Поделился контактом ✅"})
        if len(conversations[chat_id]) > 30:
            conversations[chat_id] = conversations[chat_id][-30:]
        await context.bot.send_chat_action(chat_id=chat_id, action="typing")
        try:
            resp_text, c_req, _gc = await _get_ai_response_async(
                conversations[chat_id], chat_id, update
            )
        except Exception as e:
            logger.error(f"handle_contact (запрос MAYA) get_ai_response: {e}")
            resp_text, c_req = None, None
        resp_text = resp_text or f"Готово, {name or 'друг'}! Теперь я тебя узнаю 🙂 Чем помочь?"
        conversations[chat_id].append({"role": "assistant", "content": resp_text})
        save_conversations(conversations)
        await update.message.reply_text(resp_text, reply_markup=_keyboard_for(chat_id))
        # Если MAYA сразу повела к записи — запускаем оформление
        if c_req:
            await _start_contact_flow(context, chat_id, c_req)
        return

    phone = contact.phone_number
    client_id = database.get_or_create_client(chat_id)
    # Сохраняем телефон (имя берём из Telegram, если ещё не было)
    existing = database.get_client(chat_id) or {}
    name = existing.get("name") or (update.effective_user.first_name or "").strip()
    try:
        database.update_client(client_id, name=name or None, phone=phone)
    except Exception as e:
        logger.error(f"handle_contact update_client: {e}")

    # Подтягиваем welcome-баллы
    try:
        bf = loyalty.lazy_backfill_for_client(client_id, phone)
    except Exception as e:
        logger.error(f"handle_contact lazy_backfill: {e}")
        bf = None
    try:
        await asyncio.to_thread(warm_client_history_cache_for_phone, client_id, phone)
    except Exception as e:
        logger.error(f"handle_contact history warmup: {e}")

    if bf and bf.get("points"):
        await update.message.reply_text(
            f"🎁 Нашла тебя! Начислили *{bf['points']} welcome-баллов* "
            f"за историю визитов (5% от {bf['sold_amount']} ₽).",
            parse_mode="Markdown",
            reply_markup=_keyboard_for(chat_id),
        )
    else:
        # Либо уже начисляли, либо в YClients нет истории по этому номеру
        balance = database.loyalty_balance(client_id)
        if balance > 0:
            await update.message.reply_text(
                f"Спасибо! Твой баланс: *{balance} баллов*.",
                parse_mode="Markdown",
                reply_markup=_keyboard_for(chat_id),
            )
        else:
            await update.message.reply_text(
                "Спасибо! Пока баллов нет — они появятся после первого визита "
                "(5% кэшбэка с каждого). До встречи 💈",
                reply_markup=_keyboard_for(chat_id),
            )

    # Показываем актуальную карточку баллов
    loy_text, loy_kb = loyalty.build_balance_card(client_id)
    await update.message.reply_text(loy_text, parse_mode="Markdown", reply_markup=loy_kb)


# ─── Админ: выдать bind-код мастеру свободным текстом ─────────────────────

# Срабатывает на фразы вроде:
#   «выдай новый код доступа моему мастеру Алексею»
#   «новый код для Стаса»
#   «код привязки Илье»
#   «bind код Максиму»
_RE_BIND_REQUEST = re.compile(
    r"(код[\s\-]*доступ|код[\s\-]*привязк|bind[\s\-]*код|новый\s+код|"
    r"код[\s\-]*для\s+мастер|выдай\s+код|сгенер\w*\s+код)",
    re.IGNORECASE,
)

# Стоп-слова — токены, которые точно НЕ имя мастера (чтобы не ловить «доступа»).
_BIND_STOPWORDS = {
    "выдай", "выдать", "дай", "новый", "новая", "код", "кода", "коды", "доступа",
    "доступ", "привязки", "привязку", "bind", "для", "моему", "мой", "моего",
    "мастеру", "мастера", "мастер", "пожалуйста", "сгенерируй", "сгенерировать",
    "сделай", "сделать", "получи", "получить", "его", "ему", "и", "а", "ну",
}


def _looks_like_bind_request(text: str) -> bool:
    if not text or len(text) > 200:
        return False
    return bool(_RE_BIND_REQUEST.search(text))


def _extract_master_name_token(text: str) -> str | None:
    """Достаёт предполагаемое имя мастера из фразы — последнее «слово-имя»."""
    # Чистим пунктуацию, берём слова
    words = re.findall(r"[А-Яа-яЁёA-Za-z]+", text or "")
    # Идём с конца — имя обычно в конце фразы
    for w in reversed(words):
        if w.lower() not in _BIND_STOPWORDS and len(w) >= 2:
            return w
    return None


def _match_masters_by_spoken_name(spoken: str, masters: list[dict]) -> list[dict]:
    """
    Сопоставляет произнесённое имя (возможно в падеже — «Алексею», «Стасу»)
    с мастерами YClients по общему префиксу первого имени.
    Возвращает список совпадений (обычно 0 или 1).
    """
    s = (spoken or "").strip().lower()
    if not s:
        return []
    out = []
    for m in masters:
        full = (m.get("name") or "").strip()
        if not full:
            continue
        first = full.split()[0].lower()
        # Длина общего префикса
        n = 0
        while n < len(first) and n < len(s) and first[n] == s[n]:
            n += 1
        # Считаем совпадением, если общий префикс >= 3 символов и покрывает
        # почти всё имя мастера (различие только в окончании-падеже).
        if n >= 3 and n >= len(first) - 2:
            out.append((n, m))
    if not out:
        return []
    # Берём только мастеров с МАКСИМАЛЬНОЙ длиной совпадения — иначе «Александру»
    # ложно цепляет и «Алексей» (общий префикс «алекс»).
    max_n = max(n for n, _ in out)
    return [m for n, m in out if n == max_n]


# ─── Самопредставление сотрудника: «привет, я Стас Мосин» ────────────────

# Дешёвый предварительный фильтр — похоже ли на представление
_RE_SELF_INTRO_HINT = re.compile(
    r"\b(я|это|меня\s+зовут|зовут)\b|^\s*привет",
    re.IGNORECASE,
)


def _detect_master_self_intro(text: str) -> dict | None:
    """
    Если текст похож на «привет, я <Имя>» и имя совпадает с мастером —
    возвращает запись мастера YClients {id, name}. Иначе None.
    Имя НЕ мастера → None (обычный клиент, не трогаем).
    """
    if not text or len(text) > 120:
        return None
    t = text.strip()
    if not _RE_SELF_INTRO_HINT.search(t):
        return None
    # Кандидат-имя: после «я / это / зовут» — слово(а) С ЗАГЛАВНОЙ.
    # БЕЗ re.IGNORECASE: [А-ЯЁ] должно быть строго заглавным (это имя собственное),
    # иначе «я хочу постричься» ложно ловится как имя «хочу».
    cand = None
    m = re.search(
        r"\b(?:[яЯ]|[эЭ]то|[зЗ]овут)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)",
        t,
    )
    if m:
        cand = m.group(1)
    if not cand:
        caps = re.findall(r"[А-ЯЁ][а-яё]{2,}", t)
        if caps:
            cand = caps[-1]
    if not cand:
        return None
    try:
        masters = yc.get_masters()
    except Exception as e:
        logger.error(f"_detect_master_self_intro masters: {e}")
        return None
    matches = _match_masters_by_spoken_name(cand.split()[0], masters or [])
    chosen = matches[0] if len(matches) == 1 else None
    if not chosen:
        return None
    # 🔴 НЕ дёргаем владельца «принять сотрудника», если этот мастер УЖЕ привязан к
    # Telegram (его узнают по chat_id — приветствие выше). Иначе обычный КЛИЕНТ с
    # именем как у мастера (Александр/Максим/Илья/Алексей — частые имена!) ложно
    # триггерит запрос доступа сотрудника владельцу. Самопредставление имеет смысл
    # только для ЕЩЁ НЕ привязанного мастера.
    try:
        bound = database.get_master_by_staff_id(int(chosen.get("id")))
        if bound and bound.get("telegram_chat_id"):
            return None
    except Exception:
        pass
    return chosen


async def _handle_master_self_intro(
    update: Update, context: ContextTypes.DEFAULT_TYPE, chat_id: int, master: dict
):
    """
    Включает режим сотрудника:
      • уже привязан к этому мастеру → просто показываем меню мастера
      • админ (владелец/совладелец) → доверяем по chat_id, привязываем сразу
      • остальные → запрос подтверждения владельцу одной кнопкой
    """
    staff_id = int(master["id"])
    full_name = master.get("name") or "мастер"
    first = full_name.split()[0]

    # Уже привязан как мастер?
    existing = database.get_master_by_chat_id(chat_id)
    if existing and int(existing.get("yclients_staff_id") or 0) == staff_id:
        await update.message.reply_text(
            f"С возвращением, {first}! 💈 Режим мастера активен.",
            reply_markup=MASTER_KEYBOARD,
        )
        return

    # Админ — доверяем сразу
    if database.is_admin(chat_id):
        # Создаём запись мастера, если её ещё нет, затем привязываем chat_id
        if not database.get_master_by_staff_id(staff_id):
            database.reset_master_bind_code(staff_id, full_name)
        _bind_master_chat_direct(staff_id, chat_id)
        await update.message.reply_text(
            f"Привет, {first}! 💈 Узнал тебя — включаю режим мастера.\n"
            f"Снизу твоё рабочее меню.",
            reply_markup=MASTER_KEYBOARD,
        )
        return

    # Остальные — подтверждение владельца
    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Да, наш сотрудник",
                             callback_data=f"empauth_yes_{staff_id}_{chat_id}"),
        InlineKeyboardButton("✖️ Нет", callback_data=f"empauth_no_{chat_id}"),
    ]])
    sender_name = (update.effective_user.first_name or "").strip()
    # 🔎 Диагностика «принять/не принять владельцу»: кого бот принял за мастера.
    logger.info("[EMPAUTH] approval-request → admins: requester chat_id=%s name=%r matched_master=%r staff_id=%s",
                chat_id, sender_name, full_name, staff_id)
    for admin_id in database.list_admins():
        try:
            await context.bot.send_message(
                admin_id,
                f"👤 *Запрос доступа сотрудника*\n\n"
                f"Пользователь {('@'+update.effective_user.username) if update.effective_user.username else sender_name} "
                f"(id `{chat_id}`) представился как мастер *{full_name}*.\n\n"
                f"Включить ему режим сотрудника?",
                parse_mode="Markdown",
                reply_markup=kb,
            )
        except Exception as e:
            logger.error(f"empauth notify admin {admin_id}: {e}")
    await update.message.reply_text(
        f"Привет, {first}! Передал владельцу на подтверждение. "
        f"Как подтвердит — включу тебе режим мастера 💈",
    )


def _bind_master_chat_direct(staff_id: int, chat_id: int):
    """Привязывает chat_id к мастеру напрямую (без bind-кода)."""
    with database._db() as conn:
        row = conn.execute(
            "SELECT id FROM masters_telegram WHERE yclients_staff_id = ?",
            (staff_id,),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE masters_telegram SET telegram_chat_id = ?, bound_at = ?, "
                "is_active = 1 WHERE yclients_staff_id = ?",
                (chat_id, database._now(), staff_id),
            )


async def _handle_admin_bind_request(
    update: Update, context: ContextTypes.DEFAULT_TYPE, chat_id: int, text: str
) -> bool:
    """
    Обрабатывает админский запрос «выдай код мастеру X».
    Возвращает True если запрос распознан и обработан.
    """
    name_token = _extract_master_name_token(text)
    if not name_token:
        await update.message.reply_text(
            "Я поняла, что нужен код доступа для мастера, но не разобрала имя. "
            "Напиши, например: «выдай новый код мастеру Алексею».",
        )
        return True

    # Тянем мастеров из YClients (полный список с именами)
    try:
        masters = await asyncio.to_thread(yc.get_masters)
    except Exception as e:
        logger.error(f"bind-request: yc.get_masters: {e}")
        await update.message.reply_text("Не получилось получить список мастеров. Попробуй позже.")
        return True

    matches = _match_masters_by_spoken_name(name_token, masters or [])
    if not matches:
        names = ", ".join(sorted({(m.get("name") or "").split()[0] for m in (masters or []) if m.get("name")}))
        await update.message.reply_text(
            f"Не нашла мастера «{name_token}». Есть такие: {names}.\n"
            f"Напиши имя точнее.",
        )
        return True
    if len(matches) > 1:
        names = ", ".join((m.get("name") or "?") for m in matches)
        await update.message.reply_text(
            f"Под «{name_token}» подходят несколько: {names}. Уточни, кого именно.",
        )
        return True

    master = matches[0]
    staff_id = int(master["id"])
    full_name = master.get("name") or f"staff_{staff_id}"

    # Текущее состояние привязки
    existing = database.get_master_by_staff_id(staff_id)
    if existing and existing.get("telegram_chat_id"):
        # Уже привязан — генерация нового кода сбросит привязку. Спросим.
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Да, новый код", callback_data=f"bindnew_{staff_id}"),
            InlineKeyboardButton("✖️ Отмена",        callback_data="bindnew_cancel"),
        ]])
        await update.message.reply_text(
            f"⚠️ *{full_name}* уже привязан к Telegram.\n\n"
            f"Если выдать новый код — текущая привязка слетит, и мастеру "
            f"придётся привязаться заново. Выдать новый код?",
            parse_mode="Markdown",
            reply_markup=kb,
        )
        return True

    # Не привязан — сразу выдаём свежий код
    code = database.reset_master_bind_code(staff_id, full_name)
    await _send_bind_code_card(update.message.reply_text, full_name, code)
    return True


async def _send_bind_code_card(reply_func, full_name: str, code: str):
    """Готовая карточка с кодом + инструкция для пересылки мастеру."""
    first = full_name.split()[0] if full_name else "мастер"
    await reply_func(
        f"🔑 *Код доступа для {full_name}*\n\n"
        f"`{code}`\n\n"
        f"Перешли мастеру сообщение ниже 👇",
        parse_mode="Markdown",
    )
    # Отдельным сообщением — готовый текст для пересылки (чистый, без разметки)
    await reply_func(
        f"Привет, {first}! Чтобы получать уведомления о записях с подсказками "
        f"по апсейлу — открой @malesthetic_bot и отправь команду:\n\n"
        f"/bind {code}",
    )


# ─── Админский NLU-роутер: простой текст → команда ───────────────────────

def _admin_busy_in_flow(chat_id: int) -> bool:
    """True, если админ сейчас в активном флоу (рассылка, запись, сертификат) —
    тогда не перехватываем его текст как команду."""
    bf = broadcast_flow.get(chat_id)
    if bf and bf.get("stage") in ("awaiting_text", "awaiting_confirm", "tpl_chosen"):
        return True
    if booking_flow.get(chat_id) or gift_cert_flow.get(chat_id) or digital_cert_flow.get(chat_id):
        return True
    return False


async def _dispatch_admin_nlu(update: Update, context: ContextTypes.DEFAULT_TYPE,
                              chat_id: int, routed: dict):
    """Выполняет команду, распознанную из простого текста админа."""
    key = routed["key"]
    args = list(routed.get("args") or [])

    # Справка
    if key == "help":
        await _show_admin_help(update)
        return
    if key == "admin_pdf":
        await cmd_admin_pdf(update, context)
        return

    # Имя кассира в падеже («Илью») → приводим к именительному через мастеров
    if key in ("cashier_grant", "cashier_revoke"):
        if args:
            try:
                masters = await asyncio.to_thread(yc.get_masters)
                m = _match_masters_by_spoken_name(args[0], masters or [])
                if len(m) == 1:
                    args = [(m[0].get("name") or "").split()[0]]
            except Exception as e:
                logger.error(f"admin_nlu cashier name resolve: {e}")
        if not args:
            await update.message.reply_text(
                "Уточни имя мастера, например: «сделай Илью кассиром».",
            )
            return

    # Таблица: ключ интента → cmd-функция (резолвится в рантайме)
    table = {
        "dashboard": cmd_dashboard,
        "ai_cost": cmd_ai_cost,
        "stats_ai": cmd_stats_ai,
        "sources_stats": cmd_sources_stats,
        "reviews_stats": cmd_reviews_stats,
        "reviews_now": cmd_reviews_now,
        "leads_stats": cmd_leads_stats,
        "leads_now": cmd_leads_now,
        "reactivation_now": cmd_reactivation_now,
        "birthday_now": cmd_birthday_now,
        "cycle_now": cmd_cycle_now,
        "loyalty_now": cmd_loyalty_now,
        "loyalty_stats": cmd_loyalty_stats,
        "loyalty_backfill": cmd_loyalty_backfill,
        "subscriptions_now": cmd_subscriptions_now,
        "subscriptions_stats": cmd_subscriptions_stats,
        "referral_now": cmd_referral_now,
        "referral_stats": cmd_referral_stats,
        "broadcast": cmd_broadcast,
        "migrate_help": cmd_migrate_help,
        "migrate_qr": cmd_migrate_qr,
        "export_consents": cmd_export_consents,
        "ai_provider": cmd_ai_provider,
        "cashiers": cmd_cashiers,
        "cashier_grant": cmd_cashier_grant,
        "cashier_revoke": cmd_cashier_revoke,
        "admin": cmd_admin,
    }
    fn = table.get(key)
    if not fn:
        return
    # Подсовываем аргументы как будто это была слэш-команда
    context.args = args
    try:
        await fn(update, context)
    except Exception as e:
        logger.error(f"admin_nlu dispatch {key}: {e}")
        await update.message.reply_text("Не получилось выполнить — посмотри логи.")


async def _show_admin_help(update: Update):
    """Список админ-команд с примерами фраз, сгруппированный по разделам."""
    by_cat: dict[str, list] = {}
    for it in admin_nlu.INTENTS:
        by_cat.setdefault(it["category"], []).append(it)

    chunks: list[str] = []
    header = (
        "🛠 *Команды админа и владельца*\n\n"
        "Можно писать *простым текстом* или слэш-командой. "
        "Примеры — курсивом.\n"
    )
    cur = header
    for cat in admin_nlu.categories_for_pdf():
        block = f"\n*{cat}*\n"
        for it in by_cat.get(cat, []):
            ex = it["examples"][0] if it.get("examples") else ""
            block += f"• {it['title']} — `{it['command']}`\n"
            if ex:
                block += f"   _«{ex}»_\n"
        if len(cur) + len(block) > 3800:
            chunks.append(cur)
            cur = block
        else:
            cur += block
    cur += "\n📄 PDF-справочник: /admin_pdf"
    chunks.append(cur)

    for ch in chunks:
        await update.message.reply_text(ch, parse_mode="Markdown")


# ─── Список команд по фразе «список команд» — разный для каждой роли ─────────

CLIENT_COMMANDS_TEXT = (
    "🧭 *Что я умею*\n\n"
    "Нажми кнопку внизу или просто напиши словами:\n\n"
    "✂️ *Записаться* — подберу услугу, мастера и время\n"
    "📅 *Мои записи* — посмотреть или отменить запись\n"
    "🎟 *Абонементы* — купить или открыть свой абонемент\n"
    "🪙 *Баллы* — баланс баллов и как их потратить\n"
    "📨 *Пригласить друга* — твоя ссылка и скидка вам обоим\n"
    "📺 *Наш канал* · ℹ️ *О барбершопе* — адрес, часы, контакты\n\n"
    "Команды:\n"
    "`/clear` — начать диалог заново\n"
    "`/whats_new` — что нового в боте\n"
    "`/unsubscribe` — отписаться от акций и промокодов\n"
    "`/subscribe` — вернуть рассылки\n"
    "`/privacy` — политика конфиденциальности\n\n"
    "А ещё можно просто написать или сказать голосом, что нужно — я пойму 💬"
)

MASTER_COMMANDS_TEXT = (
    "🧰 *Команды мастера*\n\n"
    "Кнопки внизу:\n"
    "📅 *Записи на сегодня* — карточки дня + закрыть оплатой\n"
    "📆 *На месяц* — расписание на 30 дней вперёд\n"
    "🔕 *Пауза уведомлений* — заглушить на 2 часа\n"
    "🔔 *Включить уведомления* — снять паузу\n"
    "ℹ️ *Помощь мастеру* — подсказка по меню\n"
    "🚪 *Отвязать Telegram* — отключить уведомления\n\n"
    "Команды:\n"
    "`/today` — записи на сегодня\n"
    "`/month` — расписание на месяц\n"
    "`/mute 2h` · `/mute 30m` — пауза на время · `/mute off` — включить\n"
    "`/bind ME-XXXXXX` — привязать Telegram (код берёшь у владельца)\n"
    "`/unbind` — отвязать\n\n"
    "💵/💳 Закрыть запись — кнопками «Наличные»/«Карта» под карточкой, "
    "или просто напиши/скажи «наличные» либо «карта»."
)

# Фразы-триггеры (нормализованные): все содержат «команд» — без перехвата обычного чата.
_COMMANDS_REQUEST_PHRASES = {
    "список команд", "команды", "список команд бота", "меню команд",
    "покажи команды", "покажи список команд", "все команды",
    "какие есть команды", "какие команды", "список всех команд",
}


def _is_commands_request(text: str) -> bool:
    """True, если сообщение — просьба показать список команд (строгий матч фраз)."""
    if not text:
        return False
    t = " ".join(text.lower().replace("ё", "е").split()).strip(" .,!?/")
    return t in _COMMANDS_REQUEST_PHRASES


async def _show_commands_for_role(update: Update, chat_id: int):
    """Список команд по роли: админ → полный каталог (тот же, что /help_admin),
    мастер → мастерские, клиент → клиентские. Приоритет — у админа."""
    if database.is_admin(chat_id):
        await _show_admin_help(update)
        return
    if database.get_master_by_chat_id(chat_id):
        await update.message.reply_text(
            MASTER_COMMANDS_TEXT, parse_mode="Markdown", reply_markup=MASTER_KEYBOARD
        )
        return
    await update.message.reply_text(
        CLIENT_COMMANDS_TEXT, parse_mode="Markdown", reply_markup=MAIN_KEYBOARD
    )


async def process_message(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str):
    chat_id = update.effective_user.id

    # Сначала чистим зависшие флоу — они могут попасть в нас от старого
    # незавершённого диалога (как было 26.05 с цифровым сертификатом).
    _drop_expired_flows(chat_id)

    # Если клиент только что поставил 1-3 ⭐ и бот попросил описать что не так —
    # это сообщение и есть комментарий. Перехватываем ДО любых других флоу
    # и AI, чтобы не дёрнуть MAYA на текст вроде «мастер был грубый».
    if await reviews.handle_negative_comment(update, context):
        return

    # Самопредставление сотрудника: «привет, я Стас Мосин» → режим мастера.
    # Только если имя совпадает с реальным мастером. Не в активном флоу.
    if not _admin_busy_in_flow(chat_id):
        _intro_master = _detect_master_self_intro(text)
        if _intro_master:
            await _handle_master_self_intro(update, context, chat_id, _intro_master)
            return

    # «Список команд» — единообразно для любой роли (клиент/мастер/админ), РАНЬШЕ
    # admin_nlu и кнопок, чтобы фраза распознавалась и у не-админов тоже. Голос
    # тоже идёт сюда. Не перехватываем, если админ в активном флоу (ввод рассылки).
    if _is_commands_request(text) and not (
        database.is_admin(chat_id) and _admin_busy_in_flow(chat_id)
    ):
        await _show_commands_for_role(update, chat_id)
        return

    # Админ свободным текстом управляет ботом: «выдай код мастеру Алексею»,
    # «покажи дашборд за неделю», «сделай рассылку» и т.д. Перехватываем ДО AI.
    # НО не трогаем, если админ в активном флоу (например, вводит текст рассылки),
    # иначе слова из текста рассылки могут случайно сработать как команда.
    if database.is_admin(chat_id) and not _admin_busy_in_flow(chat_id):
        if _looks_like_bind_request(text):
            if await _handle_admin_bind_request(update, context, chat_id, text):
                return
        _routed = admin_nlu.match(text)
        if _routed:
            await _dispatch_admin_nlu(update, context, chat_id, _routed)
            return

    # Кнопки мастерского меню — обрабатываем сразу, до клиентских флоу
    if text in MASTER_MENU_BUTTONS:
        await _handle_master_menu_button(update, context, chat_id, text)
        return

    # «📅 Мои записи» — показываем список будущих записей с кнопкой «Отменить»
    # под каждой. Перехватываем ДО AI — чтобы не дёргать токены лишний раз.
    if text == "📅 Мои записи":
        await _show_my_bookings(update, context, chat_id)
        return

    # Абонементы — если есть активный, показываем «моя подписка», иначе — каталог
    if text == "🎟 Абонементы":
        client_id = database.get_or_create_client(chat_id)
        active = database.get_active_subscription_for_client(client_id)
        if active:
            my_text, my_kb = subscriptions.build_my_subscription_card(client_id)
            await update.message.reply_text(
                my_text, parse_mode="Markdown",
                reply_markup=my_kb if my_kb else MAIN_KEYBOARD,
            )
            # Если показали карточку «моя подписка» — отдельным сообщением даём
            # каталог на случай, если хочется ещё один абонемент (например, борода
            # вдогонку к стрижке).
            cat_text, cat_kb = subscriptions.build_catalog_card()
            await update.message.reply_text(
                cat_text, parse_mode="Markdown", reply_markup=cat_kb,
            )
        else:
            cat_text, cat_kb = subscriptions.build_catalog_card()
            await update.message.reply_text(
                cat_text, parse_mode="Markdown", reply_markup=cat_kb,
            )
        return

    # Баллы лояльности — показываем карточку с балансом и услугами-уходами
    if text == "🪙 Баллы":
        client_id = database.get_or_create_client(chat_id)
        client = database.get_client(chat_id)
        phone = (client or {}).get("phone")
        if phone:
            # Телефон знаем — подтянем welcome-баллы за прошлые визиты
            # (идемпотентно: второй раз не начислит).
            try:
                bf = loyalty.lazy_backfill_for_client(client_id, phone)
                if bf and bf.get("points"):
                    await update.message.reply_text(
                        f"🎁 Начислили *{bf['points']} welcome-баллов* за твою "
                        f"историю визитов (5% от {bf['sold_amount']} ₽)!",
                        parse_mode="Markdown",
                    )
            except Exception as e:
                logger.error(f"Баллы: lazy_backfill для {client_id}: {e}")
            loy_text, loy_kb = loyalty.build_balance_card(client_id)
            await update.message.reply_text(
                loy_text, parse_mode="Markdown", reply_markup=loy_kb,
            )
        else:
            # Телефона нет — не можем сматчить с историей YClients.
            # Предлагаем поделиться контактом одной кнопкой.
            kb = ReplyKeyboardMarkup(
                [[KeyboardButton("📱 Подтянуть мои баллы", request_contact=True)]],
                resize_keyboard=True, one_time_keyboard=True,
            )
            await update.message.reply_text(
                "🪙 *Баллы лояльности*\n\n"
                "Чтобы подтянуть баллы за твои прошлые визиты, поделись номером — "
                "найду тебя в нашей базе и начислю *5% кэшбэка* со всей истории.\n\n"
                "_Жми кнопку ниже. Номер нужен только чтобы тебя узнать._",
                parse_mode="Markdown",
                reply_markup=kb,
            )
        return

    # Реферальная программа — показываем карточку с ссылкой и статистикой
    if text == "📨 Пригласить друга":
        client_id = database.get_or_create_client(chat_id)
        # Имя/телефон в этом флоу не нужны — get_or_create создаёт пустой
        # клиентский ряд если ещё нет. Это нормально: рефер-код может быть
        # сгенерирован даже у того, кто ещё ни разу не записывался.
        try:
            ref_text, ref_kb = referral.build_referral_card(client_id, BOT_USERNAME)
            await update.message.reply_text(
                ref_text, parse_mode="Markdown", reply_markup=ref_kb,
                disable_web_page_preview=True,
            )
        except Exception as e:
            logger.error(f"referral card: {e}")
            await update.message.reply_text(
                "Не получилось сформировать ссылку. Попробуй ещё раз через пару минут.",
                reply_markup=MAIN_KEYBOARD,
            )
        return

    # Старая кнопка «❌ Отменить запись» — могла остаться на клавиатуре у тех,
    # кто давно не перезаходил. Показываем подтверждение, как и раньше.
    if text == "❌ Отменить запись":
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Да, отменить", callback_data="cancel_confirm_yes"),
            InlineKeyboardButton("✖️ Не отменять", callback_data="cancel_confirm_no"),
        ]])
        await update.message.reply_text(
            "Точно хотите отменить запись?\n\n"
            "_Если тапнули случайно — нажмите «Не отменять»._",
            parse_mode="Markdown",
            reply_markup=kb,
        )
        return

    # 🍎 Apple Watch / голос — если привязанный мастер написал «наличные» / «карта»,
    # закрываем его последнюю незакрытую запись. До роутинга в AI, чтобы Claude
    # не успел ответить «здравствуйте, чем помочь».
    if await _try_handle_master_payment_text(update, chat_id, text):
        return

    # Если идёт пошаговый сбор контактов — обрабатываем его, минуя AI
    flow = booking_flow.get(chat_id)
    _touch_flow(flow)
    if flow and text not in MENU_BUTTONS:
        stage = flow.get("stage")
        if stage in ("name", "phone"):
            await _handle_contact_input(update, context, chat_id, text, flow)
            return
        if stage in ("consent", "confirm", "choose_recipient"):
            # Клиент написал текст вместо нажатия кнопки. Различаем два случая:
            #  • короткое «да/нет/ок» → подсказываем нажать кнопку
            #  • что-то осмысленное → это намерение ИЗМЕНИТЬ запись (добавить
            #    услугу, поменять время и т.п.). Прерываем сбор контактов,
            #    кидаем фразу обратно MAYA с системной меткой — она
            #    переоформит как обычно.
            short = text.strip().lower()
            if short in ("да", "ок", "+", "ага", "угу", "yes", "нет", "no", "."):
                await update.message.reply_text("Нажмите, пожалуйста, кнопку выше 👆")
                return
            # Это изменение — отменяем flow и пробрасываем в AI
            booking_flow.pop(chat_id, None)
            conversations[chat_id].append({
                "role": "user",
                "content": (
                    "[Система: клиент прервал подтверждение предыдущей записи "
                    "и пишет ниже. Пойми, что он хочет изменить — добавить "
                    "услуги, поменять мастера, перенести время — и переоформи "
                    "запись с учётом нового намерения. НЕ говори «записей нет» "
                    "— записи ещё не создавали. НЕ вызывай get_my_bookings.]"
                ),
            })
            conversations[chat_id].append({"role": "user", "content": text})
            if len(conversations[chat_id]) > 30:
                conversations[chat_id] = conversations[chat_id][-30:]
            await context.bot.send_chat_action(
                chat_id=update.effective_chat.id, action="typing",
            )
            try:
                response_text, contact_request, _ = await _get_ai_response_async(
                    conversations[chat_id], chat_id, update
                )
            except Exception as e:
                logger.error(f"Ошибка AI при перехвате confirm: {e}")
                response_text = "Что-то пошло не так, попробуйте ещё раз 🙈"
                contact_request = None
            response_text = response_text or "Уточни, что хочешь поменять — добавлю."
            conversations[chat_id].append({"role": "assistant", "content": response_text})
            save_conversations(conversations)
            await update.message.reply_text(response_text, reply_markup=MAIN_KEYBOARD)
            if contact_request:
                await _start_contact_flow(context, chat_id, contact_request)
            return
    elif flow and text in MENU_BUTTONS:
        # Клиент сменил тему — прерываем сбор контактов
        booking_flow.pop(chat_id, None)

    # Флоу подарочного сертификата: распознаём номинал → показываем кнопки выбора способа
    gift = gift_cert_flow.get(chat_id)
    _touch_flow(gift)
    if gift and text not in MENU_BUTTONS and gift.get("stage") == "awaiting_amount":
        amount = _parse_gift_amount(text)
        if amount in GIFT_CERT_AMOUNTS:
            gift["amount"] = amount
            gift["stage"] = "awaiting_method"
            await update.message.reply_text(
                f"Отлично, сертификат на {amount} ₽! Как вам будет удобно приобрести?",
                reply_markup=GIFT_CERT_METHOD_KB,
            )
            # В историю AI — на случай, если клиент не нажмёт кнопку, а напишет что-то
            conversations[chat_id].append({"role": "user", "content": text})
            conversations[chat_id].append({
                "role": "assistant",
                "content": f"Уточнила: сертификат на {amount} ₽. Показала клиенту кнопки выбора способа покупки.",
            })
            conversations[chat_id] = conversations[chat_id][-30:]
            save_conversations(conversations)
            return
        # Не похоже на номинал — возможно вопрос; пропускаем в AI, контекст уже в истории
    elif gift and text in MENU_BUTTONS:
        gift_cert_flow.pop(chat_id, None)

    # Флоу покупки цифрового сертификата: телефон → имя получателя → инвойс
    dgift = digital_cert_flow.get(chat_id)
    _touch_flow(dgift)
    if dgift and text not in MENU_BUTTONS and dgift.get("stage") in ("awaiting_recipient_phone", "awaiting_recipient_name"):
        await _handle_digital_cert_input(update, context, chat_id, text, dgift)
        return
    elif dgift and text in MENU_BUTTONS:
        digital_cert_flow.pop(chat_id, None)

    # Админский broadcast — этап «жду текст»: всё что админ напишет
    # (не команда меню) — становится текстом рассылки в превью.
    bflow = broadcast_flow.get(chat_id)
    _touch_flow(bflow)
    if bflow and bflow.get("stage") in ("awaiting_text", "awaiting_confirm") and text not in MENU_BUTTONS:
        await _broadcast_show_preview(update, chat_id, text)
        return
    elif bflow and text in MENU_BUTTONS:
        broadcast_flow.pop(chat_id, None)

    # Telegram-канал «МУЖСКАЯ ЭСТЕТИКА» — статичный ответ с inline-ссылкой
    if text == "📺 Наш канал":
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton(
                "📺 Открыть канал",
                url="https://t.me/malesthetic_tv",
            )],
        ])
        await update.message.reply_text(
            "📺 *Наш Telegram-канал — @malesthetic_tv*\n\n"
            "Образы клиентов, бэкстейдж из шопа, гайды по уходу за волосами "
            "и бородой. Подпишись — там много полезного и красивого.",
            parse_mode="Markdown",
            reply_markup=kb,
        )
        return

    # Статичный ответ «О барбершопе» — без обращения к AI, токены не тратим
    if text == "ℹ️ О барбершопе":
        await update.message.reply_text(
            ABOUT_TEXT, parse_mode="Markdown",
            reply_markup=ABOUT_KEYBOARD,
            disable_web_page_preview=True,
        )
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    # Обезличиваем сообщение перед сохранением и отправкой в AI
    safe_text = anonymizer.redact_pii(text)
    conversations[chat_id].append({"role": "user", "content": safe_text})
    if len(conversations[chat_id]) > 30:
        conversations[chat_id] = conversations[chat_id][-30:]

    # Lead-alert: фиксируем «эпизод диалога» клиента + детектируем явный отказ.
    # Только для клиентов (мастера/админы не считаются «заявкой»).
    if not _is_staff_chat_id(chat_id):
        try:
            client_id_for_alert = database.get_or_create_client(chat_id)
            lead_alerts.on_client_message(client_id_for_alert, text)
        except Exception as e:
            logger.error(f"lead_alerts hook on_client_message: {e}")

    try:
        response_text, contact_request, gift_cert_action = await _get_ai_response_async(
            conversations[chat_id], chat_id, update
        )
    except Exception as e:
        logger.error(f"Ошибка AI: {e}")
        response_text = "Что-то пошло не так, попробуйте ещё раз 🙈"
        contact_request = None
        gift_cert_action = None

    response_text = response_text or "Секунду 🙂"
    conversations[chat_id].append({"role": "assistant", "content": response_text})
    save_conversations(conversations)

    # «Дешёвый голос»: если клиент написал ГОЛОСОМ и фича включена — отвечаем
    # голосом (+caption-текст, чтобы можно было и прочитать). Любая ошибка или
    # выключенный флаг → обычный текст. Текстовый ввод всегда получает текст.
    sent_voice = False
    try:
        if getattr(update.message, "voice", None) and voice.is_enabled():
            audio = await voice.synthesize(response_text)
            if audio:
                import io
                await update.message.reply_voice(
                    voice=io.BytesIO(audio),
                    caption=response_text[:1024],
                    reply_markup=MAIN_KEYBOARD,
                )
                sent_voice = True
    except Exception as e:
        logger.error(f"voice reply: {e}")
    if not sent_voice:
        await update.message.reply_text(response_text, reply_markup=MAIN_KEYBOARD)

    # Lead-alert: запоминаем последний ответ MAYA для контекста в алерте.
    if not _is_staff_chat_id(chat_id):
        try:
            lead_alerts.on_ai_reply(client_id_for_alert, response_text)
        except Exception as e:
            logger.error(f"lead_alerts hook on_ai_reply: {e}")

    # AI передал запись на оформление — запускаем сбор контактов на backend
    if contact_request:
        await _start_contact_flow(context, chat_id, contact_request)

    # AI запустил покупку — сертификат или абонемент (общий слот, разделяем по kind)
    if gift_cert_action:
        if gift_cert_action.get("kind") == "subscription":
            # Абонемент — показываем тот же каталог, что и кнопка «🎟 Абонементы»
            client_id_sub = database.get_or_create_client(chat_id)
            active_sub = database.get_active_subscription_for_client(client_id_sub)
            if active_sub:
                my_text, my_kb = subscriptions.build_my_subscription_card(client_id_sub)
                await context.bot.send_message(
                    chat_id, my_text, parse_mode="Markdown",
                    reply_markup=my_kb if my_kb else MAIN_KEYBOARD,
                )
            cat_text, cat_kb = subscriptions.build_catalog_card()
            await context.bot.send_message(
                chat_id, cat_text, parse_mode="Markdown", reply_markup=cat_kb,
            )
        elif gift_cert_action.get("kind") == "contact":
            # MAYA попросила узнать клиента — показываем защищённую кнопку
            # «Поделиться контактом» вместо отправки к администратору.
            await _request_contact_share(context, chat_id)
        elif gift_cert_action.get("kind") == "run_job":
            cb = _owner_job_callback(gift_cert_action.get("job"))
            rows = []
            if cb:
                rows.append([InlineKeyboardButton(
                    gift_cert_action.get("label") or "Запустить",
                    callback_data=cb,
                )])
            rows.append([InlineKeyboardButton("📊 Открыть кабинет", url="https://malesthetic.pro/app/?panel=report")])
            text = _owner_action_text(gift_cert_action) or (
                "MAYA подготовила действие для владельца."
            )
            await context.bot.send_message(
                chat_id,
                text,
                reply_markup=InlineKeyboardMarkup(rows),
            )
        else:
            amount = gift_cert_action["amount"]
            gift_cert_flow[chat_id] = {"stage": "awaiting_method", "amount": amount}
            await context.bot.send_message(
                chat_id,
                f"Сертификат на {amount} ₽. Как удобнее приобрести?",
                reply_markup=GIFT_CERT_METHOD_KB,
            )


# ─── Пошаговый сбор контактов (вне AI) ─────────────────────────────────────

async def _request_contact_share(context: ContextTypes.DEFAULT_TYPE, chat_id: int):
    """Показывает клиенту защищённую кнопку «Поделиться контактом».

    MAYA вызвала инструмент request_client_contact: ей нужно узнать клиента
    (имя+телефон), чтобы найти его записи/баллы или дозаполнить карточку — вместо
    того чтобы отправлять к администратору. handle_contact увидит chat_id в
    pending_contact_share, сохранит ПД и бесшовно продолжит диалог.
    """
    pending_contact_share.add(chat_id)
    kb = ReplyKeyboardMarkup(
        [[KeyboardButton("📱 Поделиться контактом", request_contact=True)]],
        resize_keyboard=True, one_time_keyboard=True,
    )
    await context.bot.send_message(
        chat_id,
        "Чтобы я тебя узнала и нашла всё по твоей истории — поделись контактом "
        "кнопкой ниже 👇\n\n_Имя и номер придут через Telegram, в защищённом виде. "
        "Звонить администратору не нужно._",
        parse_mode="Markdown",
        reply_markup=kb,
    )


async def _start_contact_flow(context: ContextTypes.DEFAULT_TYPE, chat_id: int, contact_request: dict):
    """Начинает оформление: согласие → имя → телефон → подтверждение."""
    client_id = database.get_or_create_client(chat_id)
    booking_flow[chat_id] = {
        "contact_request": contact_request,
        "client_id": client_id,
        "name": None,
        "phone": None,
    }
    flow = booking_flow[chat_id]

    if not database.has_valid_consent(client_id):
        flow["stage"] = "consent"
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("✅ Продолжить", callback_data="pdn_accept")],
            [InlineKeyboardButton("📋 Политика конфиденциальности", callback_data="pdn_policy")],
        ])
        await context.bot.send_message(chat_id, CONSENT_TEXT, reply_markup=keyboard)
        return

    # Согласие уже есть. Если у клиента сохранены свои имя и телефон —
    # СПРАШИВАЕМ кого записываем: его самого или другого человека (друга,
    # родственника, коллегу). Без этого вопроса бот бы тихо записал всех
    # «друзей» на телефон владельца аккаунта.
    client = database.get_client(chat_id)
    if client and client.get("name") and client.get("phone"):
        flow["stage"] = "choose_recipient"
        flow["saved_name"] = client["name"]
        flow["saved_phone"] = client["phone"]
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton(
                f"✅ На меня — {client['name']}",
                callback_data="contact_self",
            )],
            [InlineKeyboardButton(
                "👥 На другого человека",
                callback_data="contact_other",
            )],
        ])
        await context.bot.send_message(
            chat_id,
            "Запись на ваши данные?\n\n"
            f"👤 {client['name']}\n"
            f"📱 {client['phone']}",
            reply_markup=kb,
        )
        return

    # Имя есть, телефона нет — попросим подтвердить телефон
    if client and client.get("name"):
        flow["name"] = client["name"]
        flow["stage"] = "phone"
        await context.bot.send_message(chat_id, "Подтвердите номер телефона для записи 📱")
        return

    flow["stage"] = "name"
    await context.bot.send_message(chat_id, "Как вас зовут?")


async def _handle_contact_input(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                 chat_id: int, text: str, flow: dict):
    """Принимает имя и телефон. Эти сообщения в AI НЕ передаются."""
    stage = flow["stage"]
    for_other = flow.get("for_other", False)

    if stage == "name":
        name = text.strip()
        if not (2 <= len(name) <= 50):
            prompt = "Напишите имя того, кого записываем." if for_other else "Напишите, пожалуйста, ваше имя."
            await update.message.reply_text(prompt)
            return
        flow["name"] = name
        flow["stage"] = "phone"
        phone_prompt = (
            "Спасибо! Теперь его телефон 📱"
            if for_other
            else "Спасибо! Теперь номер телефона 📱"
        )
        await update.message.reply_text(phone_prompt)
        return

    if stage == "phone":
        if not anonymizer.is_valid_phone(text):
            await update.message.reply_text(
                "Не похоже на номер. Напишите телефон цифрами, например +7 999 123-45-67."
            )
            return
        flow["phone"] = text.strip()
        flow["stage"] = "confirm"
        await _show_confirm(context, chat_id)
        return


async def _show_confirm(context: ContextTypes.DEFAULT_TYPE, chat_id: int):
    """Показывает итог записи с кнопкой подтверждения."""
    flow = booking_flow[chat_id]
    cr = flow["contact_request"]
    services = ", ".join(cr["service_names"])
    recipient_label = "👥 Для:" if flow.get("for_other") else "👤"
    text = (
        "Проверьте запись:\n\n"
        f"✂️ {services}\n"
        f"💈 {cr['staff_name']}\n"
        f"📅 {_format_dt(cr['datetime_str'])}\n"
        f"{recipient_label} {flow['name']}\n"
        f"📱 {flow['phone']}\n\n"
        "Всё верно?"
    )
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Подтвердить запись", callback_data="booking_confirm")],
        [InlineKeyboardButton("✖️ Отменить", callback_data="booking_cancel")],
    ])
    await context.bot.send_message(chat_id, text, reply_markup=keyboard)


# ─── Настроение визита (пилюли «как в Матрице»: 🔴 тишина / 🔵 общение) ───
# Спрашиваем кнопками СРАЗУ ПОСЛЕ подтверждения записи. Выбор сохраняется
# на конкретный record_id и показывается барберу (журнал + комментарий YClients).
_VISIT_MOOD_LABELS = {
    "red":  "🔴 Тишина (без разговоров)",
    "blue": "🔵 Настроен общаться",
}
_VISIT_MOOD_COMMENT = {
    "red":  "🔴 Просит тишину",
    "blue": "🔵 Настроен общаться",
}


def _visit_mood_keyboard(record_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("🔴 Хочу тишину", callback_data=f"vmood_red_{record_id}"),
        InlineKeyboardButton("🔵 Готов общаться", callback_data=f"vmood_blue_{record_id}"),
    ]])


async def _send_visit_mood_prompt(context: ContextTypes.DEFAULT_TYPE, chat_id: int, record_id: int):
    """Финальный вопрос о настроении визита (необязательный, кнопками)."""
    await context.bot.send_message(
        chat_id,
        "И последнее 🎬 Выбери настроение визита — прям как в «Матрице»:\n\n"
        "🔴 *Красная пилюля* — хочу помолчать, отдохнуть в тишине.\n"
        "🔵 *Синяя пилюля* — в хорошем настроении, не прочь поболтать.\n\n"
        "Мастер увидит твой выбор и подстроится 👌 Если что — можно просто пропустить.",
        parse_mode="Markdown",
        reply_markup=_visit_mood_keyboard(record_id),
    )


async def _handle_visit_mood_callback(query, chat_id: int, data: str):
    """Обрабатывает выбор пилюли: сохраняет в БД + дописывает в комментарий
    записи YClients (барбер видит в своём приложении). Идемпотентно."""
    try:
        _, mood, rid = data.split("_", 2)
        record_id = int(rid)
    except Exception:
        return
    if mood not in ("red", "blue"):
        return
    client_id = None
    try:
        dbc = await asyncio.to_thread(database.get_client, chat_id)
        client_id = dbc.get("id") if dbc else None
    except Exception:
        client_id = None
    await asyncio.to_thread(database.set_visit_mood, record_id, mood, "bot", client_id)
    try:
        await asyncio.to_thread(
            yc.append_record_comment, record_id, _VISIT_MOOD_COMMENT[mood],
            list(_VISIT_MOOD_COMMENT.values()),
        )
    except Exception as e:
        logger.error(f"append visit-mood comment record_id={record_id}: {e}")
    try:
        await query.edit_message_text(
            f"Принял ✅ Настроение визита: {_VISIT_MOOD_LABELS[mood]}.\n"
            f"Передал мастеру — он учтёт. До встречи! 💈"
        )
    except Exception:
        pass


async def _finalize_booking(context: ContextTypes.DEFAULT_TYPE, chat_id: int, query):
    """Создаёт запись в YClients, сохраняет в БД, ставит напоминание."""
    flow = booking_flow.get(chat_id)
    if not flow or not flow.get("name") or not flow.get("phone"):
        await query.edit_message_text("Запись неактивна. Начните заново 🙂")
        booking_flow.pop(chat_id, None)
        return

    cr = flow["contact_request"]
    await query.edit_message_text("Оформляю запись... ⏳")

    # YClients SMS/WhatsApp-напоминание — по персональной настройке клиента
    try:
        _np = database.get_notify_prefs_by_chat_id(chat_id)
        _nbs = int(_np.get("reminder_hours") or 0) if _np.get("reminder") else 0
    except Exception:
        _nbs = 3
    result = yc.create_booking(
        staff_id=cr["staff_id"],
        service_ids=cr["service_ids"],
        datetime_str=cr["datetime_str"],
        client_name=flow["name"],
        client_phone=flow["phone"],
        notify_by_sms=_nbs,
    )

    if result.get("success"):
        client_id = flow["client_id"]
        # ВАЖНО: если записываем ДРУГОГО человека — НЕ обновляем профиль
        # владельца аккаунта. Его «своя» запись с именем и телефоном
        # остаётся без изменений.
        backfill_result = None
        if not flow.get("for_other"):
            database.update_client(client_id, name=flow["name"], phone=flow["phone"])
            # Ленивый backfill — клиент впервые сообщил телефон, проверим
            # его историю в YClients и начислим welcome-баллы (только если
            # ещё не начисляли). Безопасно при повторных записях.
            try:
                backfill_result = loyalty.lazy_backfill_for_client(client_id, flow["phone"])
            except Exception as e:
                logger.error(f"lazy backfill для client_id={client_id}: {e}")
        database.save_booking(
            client_id,
            service=", ".join(cr["service_names"]),
            master=cr["staff_name"],
            datetime_str=cr["datetime_str"],
            yclients_record_id=result.get("record_id"),
        )
        # Lead-alert: запись оформлена — закрываем «эпизод» диалога
        try:
            lead_alerts.on_booking_confirmed(client_id)
        except Exception as e:
            logger.error(f"lead_alerts on_booking_confirmed: {e}")
        dt_human = _format_dt(cr["datetime_str"])
        # Списание баллов лояльности: если MAYA договорилась с клиентом
        # оплатить уход баллами — спишем сразу, привязав к record_id.
        # При отмене записи через webhook вернём баллы автоматически.
        loyalty_redemption_info = None
        pay_with_points = cr.get("pay_with_points") or []
        record_id = result.get("record_id")
        if pay_with_points and record_id and not flow.get("for_other"):
            try:
                loyalty_redemption_info = loyalty.apply_redemption_for_booking(
                    client_id=client_id,
                    record_id=int(record_id),
                    service_titles=pay_with_points,
                    service_quotes=cr.get("pay_with_points_quotes") or None,
                )
            except Exception as e:
                logger.error(f"loyalty redemption для record_id={record_id}: {e}")

        await context.bot.send_message(
            chat_id,
            f"Готово! Записала вас:\n\n"
            f"✂️ {', '.join(cr['service_names'])}\n"
            f"💈 {cr['staff_name']}\n"
            f"📅 {dt_human}\n\n"
            f"Ждём вас в «{BARBERSHOP_NAME}»! 💈",
            reply_markup=MAIN_KEYBOARD,
        )
        # Подтверждение списания баллов отдельным сообщением
        if loyalty_redemption_info and loyalty_redemption_info.get("total_points", 0) > 0:
            items_str = ", ".join(
                f"{i['service']} ({i['points']}б)"
                for i in loyalty_redemption_info["items"]
            )
            await context.bot.send_message(
                chat_id,
                (
                    f"🪙 Списал *{loyalty_redemption_info['total_points']} баллов* "
                    f"за {items_str}. На визите за эту услугу платить не нужно.\n\n"
                    f"Остаток баланса: *{loyalty_redemption_info['remaining']} баллов*."
                ),
                parse_mode="Markdown",
            )
        # Welcome-сообщение про начисленные баллы — только если backfill реально
        # сработал в первый раз. Отправляем ОТДЕЛЬНЫМ сообщением, чтобы оно
        # выделялось и не сливалось с подтверждением записи.
        if backfill_result and backfill_result.get("points", 0) > 0:
            pts = backfill_result["points"]
            spent = backfill_result["sold_amount"]
            await context.bot.send_message(
                chat_id,
                (
                    f"🎁 *Кстати, мы тебя узнали!*\n\n"
                    f"Ты уже был у нас неоднократно — спасибо, что возвращаешься. "
                    f"За твою историю визитов я начислил welcome-бонус:\n\n"
                    f"🪙 *{pts} баллов* (5% от {spent} ₽ твоей истории)\n\n"
                    f"Их можно потратить на услуги ухода — Spa для лица, "
                    f"массаж, скраб+маска, патчи, восковая эпиляция, уход "
                    f"за кожей головы.\n\n"
                    f"Жми «🪙 Баллы» в меню — там баланс и кнопки списания."
                ),
                parse_mode="Markdown",
                reply_markup=MAIN_KEYBOARD,
            )
        _schedule_reminder(context.application, chat_id, {
            "datetime": cr["datetime_str"],
            "record_id": result.get("record_id"),
            "master_name": cr.get("staff_name") or "",
        })
        # Настроение визита (🔴 тишина / 🔵 общение) — финальный вопрос кнопками.
        # Только когда клиент записывает СЕБЯ (для другого человека выбор не его).
        if record_id and not flow.get("for_other"):
            try:
                await _send_visit_mood_prompt(context, chat_id, int(record_id))
            except Exception as e:
                logger.error(f"visit mood prompt record_id={record_id}: {e}")
        # Обезличенная отметка в историю AI — без персональных данных
        conversations[chat_id].append({
            "role": "user",
            "content": f"[Система: запись оформлена — {', '.join(cr['service_names'])}, "
                       f"мастер {cr['staff_name']}, {dt_human}]",
        })
        conversations[chat_id].append({"role": "assistant", "content": "Запись оформлена ✅"})
        conversations[chat_id] = conversations[chat_id][-30:]
        save_conversations(conversations)
    else:
        def _booking_failure_reply(result: dict) -> str:
            """Короткое понятное объяснение клиенту, почему запись не дошла до YClients."""
            code = (result or {}).get("code") or ""
            if code == "slot_taken":
                return (
                    "Это время уже заняли или оно стало недоступно. "
                    "Давайте выберем другой ближайший слот."
                )
            if code == "bad_phone":
                return (
                    "Не получилось записать из-за номера телефона. "
                    "Проверьте номер в профиле или отправьте его заново."
                )
            if code == "bad_name":
                return "Не получилось записать из-за имени. Напишите, пожалуйста, как вас записать."
            if code == "bad_service":
                return "Эта услуга сейчас недоступна для онлайн-записи. Давайте выберем услугу заново."
            if code == "bad_staff":
                return "Этот мастер сейчас недоступен для онлайн-записи. Давайте выберем другого мастера или время."
            if code == "yclients_unavailable":
                return (
                    "Сервер записи сейчас отвечает нестабильно, поэтому я не буду повторять заявку, "
                    "чтобы случайно не создать дубль. Проверьте «Мои записи» через минуту или напишите ещё раз."
                )
            return (
                "Не получилось оформить запись автоматически. "
                "Попробуйте выбрать другое время или напишите ещё раз."
            )

        logger.error(
            "Ошибка создания записи: code=%s status=%s error=%s",
            result.get("code"),
            result.get("http_status"),
            result.get("error"),
        )
        await context.bot.send_message(
            chat_id,
            _booking_failure_reply(result),
            reply_markup=MAIN_KEYBOARD,
        )

    booking_flow.pop(chat_id, None)


async def _finalize_gift_cert(context: ContextTypes.DEFAULT_TYPE, chat_id: int, query, callback_data: str):
    """Завершает флоу сертификата по нажатой кнопке (физический / цифровой)."""
    gift = gift_cert_flow.get(chat_id)
    if not gift or "amount" not in gift:
        await query.edit_message_text("Сертификат не выбран — перейдите снова по ссылке с сайта 🎁")
        return
    amount = gift["amount"]
    gift_cert_flow.pop(chat_id, None)

    if callback_data == "gift_method_physical":
        method_label = "приехать в шоп"
        response = (
            f"Отлично! Ждём вас по адресу ул. Лермонтова, 343 "
            f"(Пн–Вс, 10:00–21:00). Сертификат на {amount} ₽ оформим за минуту "
            f"прямо в шопе. Если будут вопросы — пишите 👇"
        )
    elif callback_data == "gift_method_digital":
        await query.edit_message_text("Выбран: цифровой сертификат ✅")
        await _start_digital_cert_flow(context, chat_id, amount)
        conversations[chat_id].append({
            "role": "user",
            "content": f"[Система: клиент выбрал цифровой сертификат на {amount} ₽, идёт сбор данных получателя]",
        })
        conversations[chat_id] = conversations[chat_id][-30:]
        save_conversations(conversations)
        return
    else:
        return

    await query.edit_message_text(f"Выбран: {method_label} ✅")
    await context.bot.send_message(chat_id, response, reply_markup=MAIN_KEYBOARD)
    # Метка в истории AI — чтобы он понимал, что произошло
    conversations[chat_id].append({
        "role": "user",
        "content": f"[Система: клиент выбрал способ покупки сертификата — {method_label}, номинал {amount} ₽]",
    })
    conversations[chat_id].append({"role": "assistant", "content": response})
    conversations[chat_id] = conversations[chat_id][-30:]
    save_conversations(conversations)


# ─── Покупка цифрового сертификата (ЮKassa) ────────────────────────────────

async def _start_digital_cert_flow(context: ContextTypes.DEFAULT_TYPE, chat_id: int, amount: int):
    """Запускает сбор данных получателя для цифрового сертификата."""
    digital_cert_flow[chat_id] = {"amount": amount, "stage": "awaiting_recipient_phone"}
    await context.bot.send_message(
        chat_id,
        f"Оформляем цифровой сертификат на {amount} ₽.\n\n"
        "Шаг 1/2: введите *номер телефона получателя* 📱\n"
        "Сертификат привяжется к этому номеру — погасить его сможет только владелец телефона.",
        parse_mode="Markdown",
    )


# Слова, которые ясно говорят «я не про сертификат, я про что-то другое»
_RE_NOT_CERT_INTENT = re.compile(
    r"\b(запиш[иуе]\w*|записа\w*|подстри\w*|стрижк\w*|"
    r"стри[чш]\w*|к\s+(мастер|стасу?|лёх\w*|санёк\w*|илю\w*|максу?|"
    r"саш\w+|шурик\w*)|"
    r"перенес\w*|отмен\w*|расписани\w*|сегодня|завтра)\b",
    re.IGNORECASE,
)


async def _handle_digital_cert_input(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                       chat_id: int, text: str, flow: dict):
    """Принимает телефон → имя → шлёт инвойс."""
    stage = flow["stage"]

    # Если клиент случайно говорит про запись/мастеров — выводим из флоу серта
    if _RE_NOT_CERT_INTENT.search(text or ""):
        digital_cert_flow.pop(chat_id, None)
        await update.message.reply_text(
            "Похоже, ты не про сертификат, а про запись 🙂 Отменил оформление "
            "сертификата. Сейчас обработаю как обычный запрос.",
            reply_markup=MAIN_KEYBOARD,
        )
        # Перенаправляем сообщение в основной обработчик
        await process_message(update, context, text)
        return

    if stage == "awaiting_recipient_phone":
        if not anonymizer.is_valid_phone(text):
            await update.message.reply_text(
                "Не похоже на номер 🤔 Введите телефон цифрами, например +7 999 123-45-67.\n\n"
                "_Если ты не про сертификат — отправь_ `/cancel`",
                parse_mode="Markdown",
            )
            return
        flow["recipient_phone"] = text.strip()
        flow["stage"] = "awaiting_recipient_name"
        await update.message.reply_text(
            "Шаг 2/2: введите *имя получателя* (как к нему обращаться) 👤",
            parse_mode="Markdown",
        )
        return
    if stage == "awaiting_recipient_name":
        name = text.strip()
        if not (2 <= len(name) <= 50):
            await update.message.reply_text("Напишите имя получателя.")
            return
        flow["recipient_name"] = name
        flow["stage"] = "awaiting_payment"
        await _send_cert_invoice(context, chat_id, flow)
        return


async def _send_cert_invoice(context: ContextTypes.DEFAULT_TYPE, chat_id: int, flow: dict):
    """
    Создаёт сертификат в БД (pending) и платёж в ЮKassa, отправляет
    клиенту кнопку «Оплатить» со ссылкой на страницу ЮKassa.

    На странице ЮKassa клиент увидит все подключённые способы оплаты:
    банковскую карту, СБП, T-Pay, ЮMoney, SberPay. После оплаты ЮKassa
    редиректит клиента обратно в чат бота, а фоновая задача _poll_payment
    параллельно фиксирует факт оплаты и выдаёт PDF-сертификат.
    """
    amount = flow["amount"]
    code = database.new_cert_code(amount)
    expires_at = (datetime.now() + timedelta(days=365)).isoformat(timespec="seconds")
    database.save_gift_certificate(
        code=code,
        amount=amount,
        recipient_phone=flow["recipient_phone"],
        recipient_name=flow["recipient_name"],
        buyer_chat_id=chat_id,
        expires_at=expires_at,
        payment_status="pending",
    )
    flow["code"] = code
    flow["expires_at"] = expires_at

    description = (
        f"Подарочный сертификат {amount} ₽ — «{BARBERSHOP_NAME}». "
        f"Получатель: {flow['recipient_name']}. Срок действия 12 месяцев."
    )
    return_url = f"https://t.me/{BOT_USERNAME}"

    try:
        payment = await yukassa_api.create_payment(
            amount_rub=amount,
            description=description,
            return_url=return_url,
            metadata={"cert_code": code, "buyer_chat_id": chat_id},
            customer_phone=flow["recipient_phone"],
            idempotence_key=f"cert-{code}",
        )
    except Exception as e:
        logger.error(f"Ошибка создания платежа ЮKassa для {code}: {e}")
        await context.bot.send_message(
            chat_id,
            "Не получилось создать платёж 🙈 Попробуйте позже или свяжитесь с нами: "
            "8-962-447-67-47",
            reply_markup=MAIN_KEYBOARD,
        )
        digital_cert_flow.pop(chat_id, None)
        return

    database.set_cert_payment_id(code, payment["id"])
    flow["payment_id"] = payment["id"]

    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton(f"💳 Оплатить {amount} ₽", url=payment["confirmation_url"])
    ]])
    await context.bot.send_message(
        chat_id,
        f"Сертификат на *{amount} ₽* для {flow['recipient_name']} готов к оплате 🎁\n\n"
        f"Нажмите кнопку ниже — откроется страница ЮKassa со всеми способами оплаты "
        f"(карта, СБП, T-Pay, ЮMoney, SberPay).\n\n"
        f"После оплаты PDF-сертификат с QR-кодом придёт сюда автоматически.",
        parse_mode="Markdown",
        reply_markup=kb,
    )

    # Запускаем фоновый опрос — без него мы не узнаем, что клиент оплатил.
    # ЮKassa не звонит обратно через Telegram, как это делал sendInvoice.
    asyncio.create_task(_poll_payment(context.application, code, payment["id"]))


async def _poll_payment(app: Application, code: str, payment_id: str):
    """
    Периодически опрашивает статус платежа ЮKassa. При успешной оплате
    помечает сертификат paid и отправляет PDF покупателю.

    Опрос идёт ~30 минут с шагом 7 секунд (≈260 запросов на платёж).
    Этого достаточно, чтобы клиент успел оплатить — большинство платит
    в течение пары минут. Если за 30 мин нет оплаты — прекращаем опрос,
    сертификат остаётся в pending (можно проверить вручную позже).
    """
    deadline = datetime.now() + timedelta(minutes=30)
    interval = 7
    logger.info(f"Запуск опроса платежа {payment_id} для сертификата {code}")

    while datetime.now() < deadline:
        await asyncio.sleep(interval)
        try:
            data = await yukassa_api.get_payment_status(payment_id)
        except Exception as e:
            logger.error(f"Ошибка опроса платежа {payment_id}: {e}")
            continue

        status = data.get("status")
        if status == "succeeded":
            cert = database.get_gift_certificate(code)
            if not cert:
                logger.error(f"Сертификат {code} не найден в БД при succeeded")
                return
            if cert["payment_status"] == "paid":
                logger.info(f"Сертификат {code} уже помечен paid — выходим")
                return
            database.mark_cert_paid(code, yukassa_payment_id=payment_id)
            await _deliver_paid_cert(app, code)
            return

        if status == "canceled":
            logger.info(f"Платёж {payment_id} отменён (cert {code})")
            database.mark_cert_canceled(code)
            cert = database.get_gift_certificate(code)
            if cert and cert.get("buyer_chat_id"):
                try:
                    await app.bot.send_message(
                        cert["buyer_chat_id"],
                        "Оплата сертификата не прошла или была отменена 🙈\n"
                        "Если это произошло случайно — напишите «сертификат», начнём заново.",
                        reply_markup=MAIN_KEYBOARD,
                    )
                except Exception as e:
                    logger.error(f"Не удалось уведомить о canceled: {e}")
            return

        # status in ('pending', 'waiting_for_capture') → продолжаем ждать

    logger.warning(
        f"Платёж {payment_id} не подтверждён за 30 мин — опрос прекращён, "
        f"сертификат {code} остался pending"
    )


async def _deliver_paid_cert(app: Application, code: str):
    """Генерирует PDF-сертификат и отправляет его покупателю в чат."""
    cert = database.get_gift_certificate(code)
    if not cert:
        logger.error(f"Сертификат {code} не найден при выдаче")
        return
    chat_id = cert.get("buyer_chat_id")
    if not chat_id:
        logger.error(f"У сертификата {code} нет buyer_chat_id")
        return

    try:
        pdf_bytes = cert_pdf.generate_cert_pdf(
            code=cert["code"],
            amount=cert["amount"],
            expires_at=cert["expires_at"],
            recipient_name=cert["recipient_name"],
        )
    except Exception as e:
        logger.error(f"Ошибка генерации PDF сертификата {code}: {e}")
        try:
            await app.bot.send_message(
                chat_id,
                "Оплата прошла ✅, но сгенерировать PDF не получилось. "
                "Свяжитесь с нами: 8-962-447-67-47 — выдадим вручную.",
                reply_markup=MAIN_KEYBOARD,
            )
        except Exception as e2:
            logger.error(f"Не удалось уведомить покупателя об ошибке PDF: {e2}")
        return

    expires_h = cert_pdf._format_expires(cert["expires_at"])
    try:
        await app.bot.send_document(
            chat_id=chat_id,
            document=InputFile(io.BytesIO(pdf_bytes), filename=f"{cert['code']}.pdf"),
            caption=(
                f"✅ Сертификат на *{cert['amount']} ₽* оплачен!\n\n"
                f"Код: `{cert['code']}`\n"
                f"Получатель: {cert['recipient_name']} ({cert['recipient_phone']})\n"
                f"Действует до: {expires_h}\n\n"
                f"Перешлите PDF получателю любым способом. Сертификат активируется "
                f"в шопе — администратор отсканирует QR-код."
            ),
            parse_mode="Markdown",
            reply_markup=MAIN_KEYBOARD,
        )
    except Exception as e:
        logger.error(f"Не удалось отправить PDF покупателю {chat_id}: {e}")
        return

    digital_cert_flow.pop(chat_id, None)
    logger.info(f"Сертификат {code} выдан покупателю {chat_id}")


# ─── Погашение сертификата администратором (через QR / deep-link) ────────────

async def _handle_redeem(update: Update, context: ContextTypes.DEFAULT_TYPE, code: str):
    """Обработка скана QR-кода админом/кассиром — показывает данные сертификата и кнопку «Погасить»."""
    user = update.effective_user
    if not database.can_redeem_codes(user.id):
        await update.message.reply_text(
            "Гасить сертификаты могут только админы или кассиры 🔒"
        )
        return
    cert = database.get_gift_certificate(code)
    if not cert:
        await update.message.reply_text(
            f"Сертификат с кодом `{code}` не найден.",
            parse_mode="Markdown",
        )
        return
    if cert["payment_status"] != "paid":
        await update.message.reply_text(
            f"Сертификат `{cert['code']}` ещё не оплачен.",
            parse_mode="Markdown",
        )
        return
    if cert["used_at"]:
        await update.message.reply_text(
            f"Сертификат `{cert['code']}` уже погашен ({cert['used_at'][:10]}).",
            parse_mode="Markdown",
        )
        return
    # Проверяем срок действия
    try:
        if datetime.fromisoformat(cert["expires_at"]) < datetime.now():
            await update.message.reply_text(
                f"Сертификат `{cert['code']}` истёк {cert_pdf._format_expires(cert['expires_at'])}.",
                parse_mode="Markdown",
            )
            return
    except Exception:
        pass
    info = (
        f"🎁 *Сертификат* `{cert['code']}`\n\n"
        f"Номинал: *{cert['amount']} ₽*\n"
        f"Получатель: *{cert['recipient_name']}* ({cert['recipient_phone']})\n"
        f"Выпущен: {cert['issued_at'][:10]}\n"
        f"Действует до: {cert_pdf._format_expires(cert['expires_at'])}\n\n"
        f"⚠️ *Сверьте телефон получателя* с предъявителем перед погашением."
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Погасить", callback_data=f"cert_redeem_{cert['code']}")],
        [InlineKeyboardButton("✖️ Отмена", callback_data="cert_redeem_cancel")],
    ])
    await update.message.reply_text(info, parse_mode="Markdown", reply_markup=kb)


# ─── «📅 Мои записи» с инлайн-кнопкой отмены ──────────────────────────

async def _show_my_bookings(update: Update, context: ContextTypes.DEFAULT_TYPE, chat_id: int):
    """Показывает будущие записи клиента с инлайн-кнопкой «Отменить» под каждой."""
    client_row = database.get_client(chat_id)
    if not client_row or not client_row.get("phone"):
        await update.message.reply_text(
            "Записей не нашла. Если ты записывался по телефону или на сайте — "
            "позвони: 8-962-447-67-47",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    try:
        bookings = yc.get_client_bookings(client_row["phone"]) or []
    except Exception as e:
        logger.error(f"_show_my_bookings yc err: {e}")
        await update.message.reply_text(
            "Не получилось получить записи. Попробуй ещё раз через минуту.",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    today_str = datetime.now().strftime("%Y-%m-%d")
    future_active = []
    for b in bookings:
        if not isinstance(b, dict) or not b.get("record_id"):
            continue
        dt = (b.get("datetime") or b.get("date") or "")[:10]
        if dt < today_str:
            continue
        if b.get("attendance") == 1:
            continue
        future_active.append(b)

    if not future_active:
        await update.message.reply_text(
            "У тебя нет активных записей 📅\n\n"
            "Хочешь записаться? Жми «✂️ Записаться».",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    # Заголовок отдельным коротким сообщением
    await update.message.reply_text(
        f"📅 *Твои записи ({len(future_active)}):*",
        parse_mode="Markdown",
        reply_markup=MAIN_KEYBOARD,
    )

    # Каждая запись — отдельным сообщением, чтобы кнопка относилась
    # именно к ней (Telegram не привязывает inline-кнопку к части текста).
    for b in future_active:
        record_id = b.get("record_id")
        master = b.get("master") or "—"
        dt_human = _format_dt(b.get("datetime") or "")
        titles = b.get("service_titles") or [
            (s.get("title") if isinstance(s, dict) else str(s))
            for s in (b.get("services") or [])
        ]
        services_str = ", ".join(t for t in titles if t) or "—"
        text = (
            f"💈 *{master}*\n"
            f"📅 {dt_human}\n"
            f"✂️ {services_str}"
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton(
                "❌ Отменить запись",
                callback_data=f"cancel_rec_{record_id}",
            )],
        ])
        await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)


async def _handle_cancel_record_request(context: ContextTypes.DEFAULT_TYPE, query, record_id: int):
    """Клиент нажал «❌ Отменить запись» — показываем подтверждение через replace inline-кнопок."""
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            "✅ Да, отменить",
            callback_data=f"cancel_rec_yes_{record_id}",
        )],
        [InlineKeyboardButton(
            "✖️ Передумал",
            callback_data="cancel_rec_no",
        )],
    ])
    # Меняем только кнопки — текст карточки остаётся видим
    try:
        await query.edit_message_reply_markup(reply_markup=kb)
    except Exception as e:
        logger.error(f"cancel_rec ask: edit failed: {e}")
        await query.message.reply_text("Точно отменить эту запись?", reply_markup=kb)


async def _handle_cancel_record_confirm(context: ContextTypes.DEFAULT_TYPE, query, record_id: int):
    """Клиент подтвердил отмену — проверяем ownership и отменяем в YClients."""
    chat_id = query.from_user.id
    client_row = database.get_client(chat_id)
    if not client_row or not client_row.get("phone"):
        await query.edit_message_text(
            "Не получилось проверить, что запись твоя. Позвони: 8-962-447-67-47"
        )
        return

    # Проверка ownership — запись на этот же телефон
    try:
        record = yc.get_record(record_id)
    except Exception as e:
        logger.error(f"cancel_rec: get_record err: {e}")
        record = None
    if not record:
        await query.edit_message_text(
            "Запись не найдена. Возможно, уже отменена."
        )
        return

    record_phone = (record.get("client") or {}).get("phone") or ""

    def _digits10(p: str) -> str:
        d = "".join(c for c in (p or "") if c.isdigit())
        return d[-10:]

    if _digits10(record_phone) != _digits10(client_row["phone"]):
        await query.edit_message_text(
            "Эта запись оформлена на другой номер телефона. Отменить её "
            "может только владелец того номера. Если нужно — позвони: "
            "8-962-447-67-47"
        )
        return

    # Отменяем
    try:
        result = yc.cancel_booking(record_id)
    except Exception as e:
        logger.error(f"cancel_rec: cancel_booking err: {e}")
        result = {"success": False, "error": str(e)}

    if result.get("success"):
        # Помечаем, что отменил САМ клиент → webhook record.delete напишет мастеру
        # «Запись отменена клиентом» (а не обезличенное «Запись отменена»).
        try:
            database.mark_cancel_actor(record_id, "client")
        except Exception:
            pass
        await query.edit_message_text(
            "✅ Запись отменена.\n\n_Если что — записывайся снова через «✂️ Записаться»._",
            parse_mode="Markdown",
        )
        # Добавляем системную пометку в историю переписки — чтобы MAYA
        # не «помнил» отменённую запись и не говорил «у вас уже есть запись».
        # Прошлые user/assistant сообщения остаются, но эта метка явно
        # пере-уведомляет AI о новом состоянии.
        conversations[chat_id].append({
            "role": "user",
            "content": (
                f"[Система: клиент только что отменил запись record_id={record_id}. "
                f"Этой записи у него БОЛЬШЕ НЕТ. Если он попросит записаться "
                f"снова — оформи как новую запись с нуля, не ссылайся на старую. "
                f"Если будут вопросы про «мои записи» — обязательно вызови "
                f"get_my_bookings, не полагайся на память.]"
            ),
        })
        if len(conversations[chat_id]) > 30:
            conversations[chat_id] = conversations[chat_id][-30:]
        save_conversations(conversations)

        # Loyalty refund — если за эту запись списывали баллы, они вернутся
        # автоматически (тот же путь, что у webhook record.delete)
        try:
            import loyalty
            refund = loyalty.refund_for_cancelled_record(record_id)
            if refund.get("refunded"):
                await context.bot.send_message(
                    chat_id,
                    f"🪙 На баланс вернулось {refund['refunded']} баллов "
                    f"(были списаны за эту запись).",
                )
        except Exception as e:
            logger.error(f"cancel_rec: loyalty refund err: {e}")
    else:
        await query.edit_message_text(
            f"Не получилось отменить: {result.get('error', 'неизвестная ошибка')}\n\n"
            f"Позвони: 8-962-447-67-47"
        )


# ─── Освободившийся слот ───────────────────────────────────────────────
#
# Кнопки приходят из freed_slot.offer_freed_slot — формат:
#   freed_book_<staff_id>_<YYYYMMDDHHMM>
#   freed_decline
# Принятие → проброс в MAYA с готовым intent'ом, она проверит слот
# через get_available_slots / find_nearest_slots и оформит запись.

async def _handle_freed_slot_accept(context: ContextTypes.DEFAULT_TYPE, query, callback_data: str):
    chat_id = query.from_user.id
    try:
        _, _, staff_id_str, slot_code = callback_data.split("_")
        staff_id = int(staff_id_str)
        slot_dt = datetime.strptime(slot_code, "%Y%m%d%H%M")
    except (ValueError, IndexError) as e:
        logger.error(f"freed_book: некорректный callback_data={callback_data!r}: {e}")
        await query.edit_message_text("Что-то пошло не так — позвоните, пожалуйста: 8-962-447-67-47")
        return

    # Логируем «принял»
    client_row = database.get_client(chat_id)
    if client_row:
        database.log_freed_slot_offer(
            client_id=client_row["id"], staff_id=staff_id,
            slot_datetime=slot_dt.isoformat(timespec="minutes"),
            action="accepted",
        )

    # Имя мастера — для intent'а MAYA
    master_label = ""
    for m in yc.get_masters():
        if m["id"] == staff_id:
            master_label = m["name"]
            break

    await query.edit_message_text("Окей, секунду — оформляю 👇")

    # Сбрасываем активные флоу — клиент явно сменил тему
    booking_flow.pop(chat_id, None)
    gift_cert_flow.pop(chat_id, None)
    digital_cert_flow.pop(chat_id, None)
    ai_stylist_flow.pop(chat_id, None)

    when_human = slot_dt.strftime("%d.%m в %H:%M")
    intent = (
        f"Хочу записаться к {master_label} на {when_human} — этот слот сейчас "
        f"освободился, давай его и возьмём. На мужскую стрижку."
        if master_label else
        f"Хочу записаться на {when_human} — этот слот сейчас освободился."
    )

    conversations[chat_id].append({"role": "user", "content": intent})
    if len(conversations[chat_id]) > 30:
        conversations[chat_id] = conversations[chat_id][-30:]

    try:
        response_text, contact_request, _ = await _get_ai_response_async(
            conversations[chat_id], chat_id
        )
    except Exception as e:
        logger.error(f"freed_book AI: {e}")
        response_text = "Не получилось забронировать — позвоните: 8-962-447-67-47"
        contact_request = None

    response_text = response_text or "Уточни детали — оформлю."
    conversations[chat_id].append({"role": "assistant", "content": response_text})
    save_conversations(conversations)
    await context.bot.send_message(chat_id, response_text, reply_markup=MAIN_KEYBOARD)
    if contact_request:
        await _start_contact_flow(context, chat_id, contact_request)


async def _handle_freed_slot_decline(context: ContextTypes.DEFAULT_TYPE, query):
    chat_id = query.from_user.id
    client_row = database.get_client(chat_id)
    if client_row:
        # Лог-отметка отказа — но в антиспам это попадает через was_recently_declined
        database.log_freed_slot_offer(
            client_id=client_row["id"], staff_id=0,
            slot_datetime="", action="declined",
        )
    await query.edit_message_text(
        "Поняла 👌 Не буду беспокоить. Когда захочешь — кнопка «✂️ Записаться» всегда под рукой."
    )


# ─── Абонементы: покупка через ЮKassa ──────────────────────────────────

async def _start_subscription_purchase(
    context: ContextTypes.DEFAULT_TYPE, query, plan_code: str, tier: str,
):
    """
    Создаёт pending-подписку с выбранным уровнем, открывает инвойс ЮKassa.
    tier: 'senior' / 'top'.
    """
    chat_id = query.from_user.id
    plan = subscriptions.get_plan(plan_code)
    if not plan:
        await query.edit_message_text("Тариф не найден 🙈 Обновлю меню.")
        return

    client_id = database.get_or_create_client(chat_id)
    price = subscriptions.get_plan_price(plan, tier)
    tier_label = subscriptions.TIER_LABELS.get(tier, "")

    # Нужен телефон клиента для чека 54-ФЗ в ЮKassa. Берём из БД (он там
    # появляется после первой записи через бот).
    client_row = database.get_client(chat_id)
    customer_phone = (client_row or {}).get("phone")
    if not customer_phone:
        await query.edit_message_text(
            "Чтобы оформить абонемент, мне нужен твой телефон — для электронного "
            "чека по закону.\n\n"
            "Самый простой способ: оформи у нас сначала любую запись через "
            "«✂️ Записаться» — при оформлении система соберёт телефон, и потом "
            "ты сможешь спокойно купить абонемент.\n\n"
            "Либо позвони администратору: 8-962-447-67-47",
        )
        return

    # Активная подписка уже есть — отдельную не плодим
    active = database.get_active_subscription_for_client(client_id)
    if active:
        days_left = (
            datetime.fromisoformat(active["expires_at"]).date() - datetime.now().date()
        ).days
        # Покупка новой допускается только за RENEW_PUSH_DAYS_BEFORE до конца
        if days_left > subscriptions.RENEW_PUSH_DAYS_BEFORE:
            expires = datetime.fromisoformat(active["expires_at"]).strftime("%d.%m")
            await query.edit_message_text(
                f"У тебя уже активный абонемент до *{expires}*. Когда останется "
                f"≤ {subscriptions.RENEW_PUSH_DAYS_BEFORE} дней, предложу продлить. "
                f"До тех пор второй абонемент покупать смысла нет 🙂",
                parse_mode="Markdown",
            )
            return

    started_at = datetime.now().isoformat(timespec="seconds")
    expires_at = (datetime.now() + timedelta(
        days=subscriptions.SUBSCRIPTION_DURATION_DAYS
    )).isoformat(timespec="seconds")

    sub_id = database.create_subscription(
        client_id=client_id, plan_code=plan_code, tier=tier,
        price_rub=price, visits_included=plan["visits_per_month"],
        started_at=started_at, expires_at=expires_at,
    )

    description = (
        f"Абонемент «{plan['title']} ({tier_label})» — «{BARBERSHOP_NAME}». "
        f"{plan['visits_per_month']} визита: {', '.join(plan['services_included'])}. "
        f"Срок действия 30 дней."
    )
    return_url = f"https://t.me/{BOT_USERNAME}"

    try:
        payment = await yukassa_api.create_payment(
            amount_rub=price,
            description=description,
            return_url=return_url,
            metadata={"subscription_id": sub_id, "plan_code": plan_code, "tier": tier},
            customer_phone=customer_phone,
            idempotence_key=f"sub-{sub_id}",
        )
    except Exception as e:
        logger.error(f"sub purchase: ЮKassa err для sub#{sub_id}: {e}")
        database.update_subscription_status(sub_id, "refunded")
        await query.edit_message_text(
            "Не получилось создать платёж 🙈 Попробуй позже или позвони: 8-962-447-67-47"
        )
        return

    database.set_subscription_payment_id(sub_id, payment["id"])

    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            f"💳 Оплатить {price} ₽",
            url=payment["confirmation_url"],
        )
    ]])
    await query.edit_message_text(
        f"{plan['emoji']} *Абонемент «{plan['title']}» — {tier_label}*\n"
        f"Стоимость: *{price} ₽* за {plan['visits_per_month']} визита/мес\n\n"
        f"Нажми «Оплатить» — откроется страница ЮKassa со всеми способами "
        f"(карта, СБП, T-Pay, ЮMoney, SberPay).\n\n"
        f"После оплаты вернёшься сюда, и я подтвержу активацию.",
        parse_mode="Markdown",
        reply_markup=kb,
    )

    # Фоновый поллинг — без него не узнаем, что клиент оплатил
    asyncio.create_task(_poll_subscription_payment(
        context.application, sub_id, payment["id"]
    ))


async def _poll_subscription_payment(app: Application, sub_id: int, payment_id: str):
    """
    Опрашивает статус платежа ЮKassa ~30 минут. При успехе активирует
    подписку и шлёт клиенту подтверждение.
    """
    deadline = datetime.now() + timedelta(minutes=30)
    interval = 7
    logger.info(f"Запуск опроса платежа подписки {payment_id} для sub#{sub_id}")

    while datetime.now() < deadline:
        await asyncio.sleep(interval)
        try:
            data = await yukassa_api.get_payment_status(payment_id)
        except Exception as e:
            logger.error(f"Ошибка опроса платежа подписки {payment_id}: {e}")
            continue

        status = data.get("status")
        if status == "succeeded":
            await _activate_paid_subscription(app, sub_id)
            return
        if status in ("canceled", "expired"):
            logger.info(f"Платёж подписки {payment_id} отменён ({status})")
            database.update_subscription_status(sub_id, "refunded")
            return

    logger.info(f"Опрос платежа подписки {payment_id} вышел за дедлайн")


async def _activate_paid_subscription(app: Application, sub_id: int):
    """После succeeded — активируем подписку и шлём клиенту приветствие."""
    sub = database.get_subscription(sub_id)
    if not sub:
        return
    if sub["status"] == "active":
        return  # idempotent
    database.activate_subscription(sub_id)
    plan = subscriptions.get_plan(sub["plan_code"])
    if not plan:
        return
    client = database.get_client_by_id(sub["client_id"])
    if not client or not client.get("telegram_chat_id"):
        return
    expires = datetime.fromisoformat(sub["expires_at"]).strftime("%d.%m.%Y")
    tier_label = subscriptions.TIER_LABELS.get((sub.get("tier") or "top").lower(), "")
    text = (
        f"✅ *Абонемент «{plan['title']}» ({tier_label}) активирован!*\n\n"
        f"Включает: *{plan['visits_per_month']} визита* "
        f"({', '.join(plan['services_included'])}).\n"
        f"Действует до: *{expires}*\n\n"
        f"Записывайся через «✂️ Записаться» как обычно. При визите скажи "
        f"администратору, что у тебя абонемент — он учтёт оплату."
    )
    try:
        await app.bot.send_message(
            client["telegram_chat_id"], text, parse_mode="Markdown",
            reply_markup=MAIN_KEYBOARD,
        )
    except Exception as e:
        logger.error(f"sub activate: не отправили клиенту {client['telegram_chat_id']}: {e}")


async def _handle_loyalty_redeem(update: Update, context: ContextTypes.DEFAULT_TYPE, code: str):
    """Админ или кассир открыл deep-link с LOY-кодом — показываем детали и кнопку «Погасить»."""
    user = update.effective_user
    if not database.can_redeem_codes(user.id):
        await update.message.reply_text(
            "Гасить баллы могут только админы или кассиры 🔒"
        )
        return
    row = database.get_loyalty_code(code)
    if not row:
        await update.message.reply_text(
            f"Код `{code}` не найден.", parse_mode="Markdown",
        )
        return
    if row.get("used_at"):
        await update.message.reply_text(
            f"Код `{code}` уже погашен ({row['used_at'][:10]}).",
            parse_mode="Markdown",
        )
        return
    try:
        if datetime.fromisoformat(row["expires_at"]) < datetime.now():
            await update.message.reply_text(
                f"Код `{code}` истёк {row['expires_at'][:10]}.",
                parse_mode="Markdown",
            )
            return
    except Exception:
        pass
    client = database.get_client_by_id(row["client_id"])
    client_name = (client or {}).get("name") or "клиент"
    balance = database.loyalty_balance(row["client_id"])
    info = (
        f"🪙 *Списание баллов* `{code}`\n\n"
        f"Клиент: *{client_name}*\n"
        f"Услуга: *{row['service_title']}*\n"
        f"Списать: *{row['points']} баллов*\n"
        f"Текущий баланс: {balance} баллов\n\n"
        f"⚠️ После подтверждения баллы будут списаны окончательно."
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Списать", callback_data=f"loy_confirm_{code}")],
        [InlineKeyboardButton("✖️ Отмена", callback_data="loy_confirm_cancel")],
    ])
    await update.message.reply_text(info, parse_mode="Markdown", reply_markup=kb)


async def cmd_loyalty_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/loyalty_now — ручной запуск начисления + сгорания (админ)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("🪙 Запускаю обновление лояльности…")
    try:
        result = await loyalty.run_loyalty_job(context.application)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Начисление: проверено клиентов {result['earn']['clients']}, "
            f"начислено *{result['earn']['earned_points']}* баллов, "
            f"пропущено по абонементу {result['earn']['skipped_sub']}, "
            f"ошибок {result['earn']['errors']}.\n\n"
            f"Сгорание: сгорело у {result['expire']['expired_clients']} клиентов "
            f"({result['expire']['expired_points']} баллов).",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_cashiers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/cashiers — показать список мастеров с правом гасить коды."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    cashiers = database.list_cashiers()
    if not cashiers:
        await update.message.reply_text(
            "Кассиров пока нет. Выдай право командой:\n"
            "`/cashier_grant <имя или часть>`\n\n"
            "Например: `/cashier_grant Илья`",
            parse_mode="Markdown",
        )
        return
    lines = ["🧾 *Кассиры* (могут гасить баллы и сертификаты):", ""]
    for c in cashiers:
        bound = "🟢" if c.get("telegram_chat_id") else "⚪"
        lines.append(f"  {bound} {c.get('full_name')}")
    lines.append("")
    lines.append("Команды: `/cashier_grant <имя>`, `/cashier_revoke <имя>`")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_cashier_grant(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/cashier_grant <имя> — выдать мастеру право гасить коды."""
    await _cmd_cashier_toggle(update, context, can_redeem=True)


async def cmd_cashier_revoke(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/cashier_revoke <имя> — отозвать право кассира."""
    await _cmd_cashier_toggle(update, context, can_redeem=False)


async def _cmd_cashier_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                can_redeem: bool):
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    args = context.args or []
    if not args:
        await update.message.reply_text(
            "Укажи имя мастера или его часть. Пример: `/cashier_grant Илья`",
            parse_mode="Markdown",
        )
        return
    query = " ".join(args).strip()
    master = database.find_master_by_partial_name(query)
    if not master:
        await update.message.reply_text(
            f"Не нашла мастера по запросу «{query}» либо нашлось больше одного. "
            f"Уточни имя точнее. Список мастеров можно посмотреть: `/cashiers`",
            parse_mode="Markdown",
        )
        return
    ok = database.set_cashier_role(master["yclients_staff_id"], can_redeem)
    if not ok:
        await update.message.reply_text("Не получилось обновить — обратись к разработчику.")
        return
    verb = "выдал" if can_redeem else "снял"
    await update.message.reply_text(
        f"✅ {verb.capitalize()} роль кассира для *{master['full_name']}*.",
        parse_mode="Markdown",
    )


async def cmd_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /broadcast — рассылка по клиентам с привязанным Telegram.

    Без аргументов показывает меню: «Из шаблонов» / «Свой текст».
    С аргументом «/broadcast <текст>» сразу идёт в превью.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return

    # Если текст подан сразу в команде — переходим в превью
    text_arg = (update.message.text or "").split(maxsplit=1)
    if len(text_arg) > 1 and text_arg[1].strip():
        await _broadcast_show_preview(update, user_id, text_arg[1].strip())
        return

    # Иначе — показываем меню «шаблоны / свой текст»
    kb_rows = [
        [InlineKeyboardButton(label, callback_data=f"bcast_cat_{code}")]
        for code, label in broadcast_templates.CATEGORIES
    ]
    kb_rows.append([InlineKeyboardButton("✏️ Свой текст", callback_data="bcast_custom")])
    kb_rows.append([InlineKeyboardButton("✖️ Отменить", callback_data="bcast_close")])
    kb = InlineKeyboardMarkup(kb_rows)
    await update.message.reply_text(
        "📣 *Рассылка по базе*\n\n"
        "Выберите шаблон из библиотеки или напишите свой текст с нуля.\n\n"
        "_В шаблонах есть плейсхолдер {name} — заменится на имя каждого "
        "клиента при отправке._",
        parse_mode="Markdown",
        reply_markup=kb,
    )


async def _broadcast_show_preview_from_callback(query, admin_id: int, text: str):
    """Тот же превью, что и _broadcast_show_preview, но из callback-контекста."""
    all_clients = [c for c in database.list_telegram_clients() if c.get("telegram_chat_id")]
    recipients = [c for c in all_clients if database.has_marketing_consent(c["id"])]
    n = len(recipients)
    total = len(all_clients)
    excluded = total - n
    broadcast_flow[admin_id] = {
        "stage": "awaiting_confirm",
        "text": text,
        "preview_count": n,
    }
    _touch_flow(broadcast_flow[admin_id])
    preview = text if len(text) <= 800 else text[:800] + "…"
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Разослать всем", callback_data="broadcast_send")],
        [InlineKeyboardButton("✖️ Отменить",     callback_data="broadcast_cancel")],
    ])
    excl_line = (
        f"\n_Исключено {excluded} клиентов: отказались от рассылок (или не давали согласия)._"
        if excluded else ""
    )
    await query.message.reply_text(
        f"📣 *Превью рассылки*\n\n"
        f"Получателей: *{n}* (только согласившиеся на рассылки){excl_line}\n\n"
        f"━━━ Текст ━━━\n"
        f"{preview}\n"
        f"━━━━━━━━━━━━",
        parse_mode="Markdown",
        reply_markup=kb,
    )


async def _broadcast_show_preview(update: Update, admin_id: int, text: str):
    """Показывает превью рассылки + аудиторию + кнопку подтверждения."""
    # Только клиенты с маркетинговым согласием — иначе Закон о рекламе ст.18
    all_clients = [c for c in database.list_telegram_clients() if c.get("telegram_chat_id")]
    recipients = [c for c in all_clients if database.has_marketing_consent(c["id"])]
    n = len(recipients)
    total = len(all_clients)
    excluded = total - n
    broadcast_flow[admin_id] = {
        "stage": "awaiting_confirm",
        "text": text,
        "preview_count": n,
    }
    _touch_flow(broadcast_flow[admin_id])

    preview = text if len(text) <= 800 else text[:800] + "…"
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Разослать всем", callback_data="broadcast_send")],
        [InlineKeyboardButton("✖️ Отменить",     callback_data="broadcast_cancel")],
    ])
    excl_line = (
        f"\n_Исключено {excluded} клиентов: отказались от рассылок (или не давали согласия)._"
        if excluded else ""
    )
    await update.message.reply_text(
        f"📣 *Превью рассылки*\n\n"
        f"Получателей: *{n}* (только согласившиеся на рассылки){excl_line}\n\n"
        f"━━━ Текст ━━━\n"
        f"{preview}\n"
        f"━━━━━━━━━━━━",
        parse_mode="Markdown",
        reply_markup=kb,
    )


async def _broadcast_execute(context: ContextTypes.DEFAULT_TYPE, admin_id: int) -> dict:
    """Шлёт сообщение всем клиентам с привязанным Telegram. Антиспам: 30 сообщений/сек."""
    flow = broadcast_flow.get(admin_id) or {}
    text = flow.get("text") or ""
    if not text:
        return {"sent": 0, "blocked": 0, "errors": 0}

    # Цикл отправки вынесен в webhook_server.broadcast_send_to_base — единый
    # источник истины и для бота, и для панели управления (рассылки).
    res = await webhook_server.broadcast_send_to_base(context.bot, text)
    broadcast_flow.pop(admin_id, None)
    return res


async def cmd_stats_ai(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /stats_ai — статистика по AI-советам мастерам.

    Без аргументов — за всё время. `/stats_ai 30` — за последние 30 дней.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    args = context.args or []
    since_iso = None
    period_label = "за всё время"
    if args:
        try:
            days = int(args[0])
            since_iso = (datetime.now() - timedelta(days=days)).isoformat(timespec="seconds")
            period_label = f"за последние {days} дн."
        except ValueError:
            await update.message.reply_text(
                "Не поняла число дней. Пример: `/stats_ai 30`",
                parse_mode="Markdown",
            )
            return

    s = database.ai_advice_stats(since_iso=since_iso)
    by_provider = s["by_provider"]
    provider_str = ", ".join(f"{k}: {v}" for k, v in by_provider.items()) or "—"

    # Имена мастеров для красивого вывода
    staff_names = {}
    for m in yc.get_masters() or []:
        if isinstance(m, dict) and m.get("id"):
            staff_names[m["id"]] = m.get("name") or f"#{m['id']}"
    by_staff_lines = []
    for row in s["by_staff"]:
        name = staff_names.get(row["staff_id"], f"#{row['staff_id']}")
        by_staff_lines.append(f"  • {name}: {row['count']}")

    lines = [
        f"🤖 *Статистика AI-советов мастерам* ({period_label})",
        "",
        f"Всего советов выдано: *{s['total']}*",
        f"По моделям: {provider_str}",
        "",
        f"Записей закрыто кнопкой: *{s['closed']}*",
        f"Средний чек закрытых: *{s['avg_check_closed']} ₽*",
        "",
        f"Состав услуг ВЫРОС после совета: *{s['upsell_grew']}* / "
        f"{s['with_final_services']}  → конверсия *{s['upsell_rate_pct']}%*",
    ]
    if by_staff_lines:
        lines.append("")
        lines.append("*По мастерам:*")
        lines.extend(by_staff_lines)

    if s["total"] < 30:
        lines.append("")
        lines.append(
            f"_⚠️ Данных пока мало ({s['total']} советов). Доверять цифрам "
            f"можно от 100+. Пока работает только сбор._"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_loyalty_backfill(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /loyalty_backfill — одноразовое начисление welcome-бонусов из истории
    YClients (5% от sold_amount каждого клиента). Идемпотентно.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text(
        "🪙 Запускаю backfill из YClients… Это может занять минуту."
    )
    try:
        s = await loyalty.run_backfill_job()
        launch = loyalty.get_launch_date()
        grace_until = launch + timedelta(days=loyalty.EXPIRY_MONTHS_NO_VISITS * 30)
        await update.message.reply_text(
            f"Готово.\n\n"
            f"Клиентов проверено: {s['clients_total']}\n"
            f"Начислено welcome-баллов: *{s['backfilled']}* "
            f"({s['total_points']} баллов всего)\n"
            f"Уже получали backfill: {s['already_done']}\n"
            f"Без телефона: {s['no_phone']}\n"
            f"Без данных в YClients: {s['no_data_yc']}\n"
            f"С нулевой историей: {s['zero_spent']}\n"
            f"Ошибок: {s['errors']}\n\n"
            f"Программа запущена: *{launch.strftime('%d.%m.%Y')}*\n"
            f"Сгорание баллов начнётся не раньше: *{grace_until.strftime('%d.%m.%Y')}*",
            parse_mode="Markdown",
        )
    except Exception as e:
        logger.error(f"loyalty_backfill: {e}")
        await update.message.reply_text(f"Ошибка: {e}")


async def cmd_loyalty_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/loyalty_stats — общая статистика по программе лояльности (админ)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    s = database.loyalty_summary()
    launch = loyalty.get_launch_date()
    grace_until = launch + timedelta(days=loyalty.EXPIRY_MONTHS_NO_VISITS * 30)
    today_d = date.today()
    in_grace = today_d < grace_until
    lines = [
        "🪙 *Программа лояльности*",
        "",
        f"Запущена: *{launch.strftime('%d.%m.%Y')}*",
        (
            f"🛡 Grace period активен до *{grace_until.strftime('%d.%m.%Y')}* "
            f"— сгорание выключено"
            if in_grace else
            f"Сгорание баллов работает по обычным правилам "
            f"(12 мес без визитов)"
        ),
        "",
        f"Активных участников: *{s['active_clients']}*",
        "",
        f"Начислено всего: *{s['earned']} баллов*",
        f"Погашено: {s['redeemed']} баллов",
        f"Сгорело: {s['expired']} баллов",
        f"Остаток в обороте: *{s['outstanding']} баллов*",
        "",
        f"Кодов на списание выпущено: {s['codes_issued']}",
        f"Кодов погашено: {s['codes_used']}",
    ]
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_reviews_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/reviews_stats — сводка по сбору отзывов за 30 дней (админ).

    /reviews_stats 7 — за 7 дней.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    days = 30
    args = context.args or []
    if args:
        try:
            days = max(1, min(365, int(args[0])))
        except ValueError:
            pass

    s = database.review_stats(days=days)
    by_status = s["by_status"]
    by_rating = s["by_rating"]

    lines = [
        f"⭐ *Сбор отзывов — последние {days} дн.*",
        "",
        f"Всего запросов: *{s['total_requested']}*",
        f"Отвечено: *{s['total_rated']}*",
    ]
    if s["avg_rating"] is not None:
        lines.append(f"Средняя оценка: *{s['avg_rating']:.2f} ⭐*")

    if by_rating:
        lines.append("")
        lines.append("Распределение:")
        for r in (5, 4, 3, 2, 1):
            n = by_rating.get(r, 0)
            if n:
                bar = "█" * min(n, 20)
                lines.append(f"  {r}⭐ {bar} {n}")

    if by_status:
        lines.append("")
        lines.append("По статусам:")
        for k in ("pending", "sent", "responded", "expired",
                  "blocked", "no_marketing_consent", "no_chat_id",
                  "send_error"):
            if by_status.get(k):
                lines.append(f"  {k}: {by_status[k]}")

    if s["total_requested"] == 0:
        lines.append("")
        lines.append("_Пока нет данных — функция включается после "
                     "закрытых визитов клиентов с привязкой Telegram._")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_reviews_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/reviews_now — ручной тик сбора отзывов (админ)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    summary = await reviews.send_pending_review_requests(context.application)
    await update.message.reply_text(
        f"⭐ Тик сбора отзывов завершён:\n"
        f"проверено: {summary['checked']}\n"
        f"отправлено: {summary['sent']}\n"
        f"заблокировали бот: {summary['blocked']}\n"
        f"без согласия: {summary['skipped_no_consent']}\n"
        f"просрочено: {summary['expired']}\n"
        f"ошибок: {summary['errors']}",
    )


async def cmd_leads_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/leads_stats — сводка по lost-lead алертам за 30 дней (админ).

    /leads_stats 7 — за 7 дней.
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    days = 30
    args = context.args or []
    if args:
        try:
            days = max(1, min(365, int(args[0])))
        except ValueError:
            pass
    s = database.lead_alert_stats(days=days)
    by_reason = s["by_reason"]
    lines = [
        f"⚠️ *Зависшие заявки — последние {days} дн.*",
        "",
        f"Алертов отправлено: *{s['alerts_sent']}*",
        f"Из них «спасены» (записались после алерта): *{s['rescued_after_alert']}*",
    ]
    if by_reason:
        lines.append("")
        lines.append("Чем заканчивались эпизоды:")
        labels = {
            "booked": "записались",
            "declined": "явно отказались",
            "alerted": "только пинг (без явной развязки)",
        }
        for k, n in by_reason.items():
            lines.append(f"  {labels.get(k, k)}: {n}")
    if not s["alerts_sent"] and not by_reason:
        lines.append("")
        lines.append("_Пока нет данных — собираем активность с момента деплоя._")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_leads_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/leads_now — ручной тик scan_and_alert (админ, для отладки)."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    summary = await lead_alerts.scan_and_alert(context.application)
    await update.message.reply_text(
        f"⚠️ Тик lead-alerts завершён:\n"
        f"проверено: {summary['checked']}\n"
        f"отправлено алертов: {summary['alerted']}",
    )


async def cmd_sources_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/sources_stats — атрибуция привлечения клиентов за период (админ).

    /sources_stats        → 30 дней
    /sources_stats 7      → 7 дней
    /sources_stats 90     → 90 дней
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return

    days = 30
    args = context.args or []
    if args:
        try:
            days = max(1, min(365, int(args[0])))
        except ValueError:
            pass

    s = database.sources_stats(days=days)
    total = s["total"]
    by_source = s["by_source"]

    if total == 0:
        await update.message.reply_text(
            f"📊 *Источники привлечения за {days} дн.*\n\n"
            f"Пока нет данных. Атрибуция начала записываться с момента деплоя — "
            f"следующие новые клиенты будут учтены.",
            parse_mode="Markdown",
        )
        return

    # Группируем источники по категориям для красивого вывода
    grouped: dict[str, list[tuple[str, dict]]] = {}
    for src, data in by_source.items():
        cat_key, cat_label = sources.categorize_source(src)
        grouped.setdefault(cat_label, []).append((src, data))

    lines = [
        f"📊 *Источники привлечения за {days} дн.*",
        "",
        f"Всего новых клиентов: *{total}*",
        "",
    ]

    # Сортируем категории по фиксированному порядку
    def _cat_idx(label):
        for key, lbl in sources._CATEGORY_ORDER:
            if lbl == label:
                return sources.category_order_index(key)
        return 99

    for label in sorted(grouped.keys(), key=_cat_idx):
        items = grouped[label]
        sub_total = sum(d["clients"] for _, d in items)
        sub_booked = sum(d.get("booked", 0) for _, d in items)
        conv = round(sub_booked / sub_total * 100, 1) if sub_total else 0.0
        lines.append(f"*{label}* — {sub_total} клиент(а), {sub_booked} с записью ({conv} %)")
        # Сортируем внутри по убыванию числа клиентов
        items.sort(key=lambda kv: -kv[1]["clients"])
        for src, data in items[:8]:  # топ-8 в каждой категории
            tail = src.split(":", 1)[-1] if ":" in src else src
            lines.append(
                f"  · `{tail}` — {data['clients']} клиент(а), "
                f"запись у {data.get('booked', 0)}"
            )
        if len(items) > 8:
            lines.append(f"  · _… ещё {len(items) - 8} мелких источников_")
        lines.append("")

    lines.append(
        "_Атрибуция по first-touch: фиксируем источник на первом /start клиента._"
    )
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_migrate_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/migrate_help — топ клиентов YClients, у которых нет привязки к боту.

    Отсортировано по LTV убыванию. Полезно для целенаправленной миграции:
    сначала уговариваете самых ценных, потом всех остальных.

    /migrate_help        → топ-30
    /migrate_help 50     → топ-50 (макс 100)
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return

    limit = 30
    args = context.args or []
    if args:
        try:
            limit = max(1, min(100, int(args[0])))
        except ValueError:
            pass

    await update.message.reply_text("Подождите, тяну клиентов из YClients…")
    try:
        unbound = await asyncio.to_thread(
            migration.find_unbound_clients, yc, limit,
        )
    except Exception as e:
        logger.error(f"cmd_migrate_help: {e}")
        await update.message.reply_text("Не удалось получить список — посмотрите логи.")
        return

    if not unbound:
        await update.message.reply_text(
            "🎉 Все клиенты YClients с номерами уже в боте — мигрировать некого."
        )
        return

    total_ltv = sum(c["sold_amount"] for c in unbound)
    lines = [
        f"🔄 *Кандидаты на миграцию — топ {len(unbound)}*",
        "",
        f"Это клиенты YClients, у которых ещё нет привязки к нашему боту.",
        f"Суммарный LTV списка: *{total_ltv:,}* ₽".replace(",", " "),
        "",
        "_Сортировка по убыванию LTV. Чем выше — тем выгоднее перевести._",
        "",
    ]
    for i, c in enumerate(unbound, 1):
        last = c["last_visit_date"] or "—"
        lines.append(
            f"*{i}.* {c['name']}\n"
            f"   `{c['phone_masked']}` · "
            f"{c['visits_count']} визит(ов) · "
            f"LTV {c['sold_amount']:,} ₽ · "
            f"посл. {last}".replace(",", " ")
        )

    text = "\n".join(lines)
    # Telegram-лимит 4096 — режем на чанки если надо
    if len(text) <= 3800:
        await update.message.reply_text(text, parse_mode="Markdown")
    else:
        chunk = ""
        for line in lines:
            if len(chunk) + len(line) + 1 > 3500:
                await update.message.reply_text(chunk, parse_mode="Markdown")
                chunk = line
            else:
                chunk = (chunk + "\n" + line) if chunk else line
        if chunk.strip():
            await update.message.reply_text(chunk, parse_mode="Markdown")

    await update.message.reply_text(
        "💡 *Что делать дальше:*\n"
        "• Лично связаться с топ-5 и попросить подключиться к боту\n"
        "• Дать мастерам инструкцию подсовывать QR при следующем визите\n"
        "• Команда /migrate_qr — соберу PDF с QR-кодами для шопа",
        parse_mode="Markdown",
    )


async def cmd_migrate_qr(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/migrate_qr — собирает PDF с QR-кодами для шопа и шлёт админу."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return

    await update.message.reply_text("Собираю PDF с QR-кодами…")
    try:
        # Кладём во временный файл — удалим после отправки
        import tempfile, os as _os
        tmp = tempfile.NamedTemporaryFile(
            mode="wb", suffix=".pdf", delete=False,
        )
        tmp.close()
        out_path = await asyncio.to_thread(migration.build_qr_pdf, tmp.name)
        with open(out_path, "rb") as f:
            await context.bot.send_document(
                chat_id=user_id,
                document=f,
                filename="qr_codes_for_shop.pdf",
                caption=(
                    "📄 *QR-коды для шопа*\n\n"
                    "Внутри 4 листа A4 — по одному на каждое место:\n"
                    "• `qr_mirror` — у зеркала мастера\n"
                    "• `qr_check` — на чек\n"
                    "• `qr_reception` — на ресепшен\n"
                    "• `migration` — для перевода текущих клиентов\n\n"
                    "Каждое касание попадает в /sources_stats — будете "
                    "видеть, какое размещение работает лучше."
                ),
                parse_mode="Markdown",
            )
        try:
            _os.unlink(out_path)
        except Exception:
            pass
    except Exception as e:
        logger.error(f"cmd_migrate_qr: {e}")
        await update.message.reply_text(f"Не получилось собрать PDF: {e}")


def _ru_number(n: int | float) -> str:
    """123456 → '123 456'. Для красоты в дашборде."""
    try:
        return f"{int(n):,}".replace(",", " ")
    except Exception:
        return str(n)


async def cmd_dashboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/dashboard — все ключевые метрики бизнеса в одном сообщении.

    /dashboard       → 30 дней (по умолчанию)
    /dashboard 7     → 7 дней
    /dashboard 90    → 90 дней
    """
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return

    days = 30
    args = context.args or []
    if args:
        try:
            days = max(1, min(365, int(args[0])))
        except ValueError:
            pass

    try:
        m = database.dashboard_metrics(days=days)
    except Exception as e:
        logger.error(f"cmd_dashboard: {e}")
        await update.message.reply_text("Не получилось собрать дашборд — посмотрите логи.")
        return

    from_dt = datetime.fromisoformat(m["period"]["from_iso"])
    to_dt   = datetime.fromisoformat(m["period"]["to_iso"])
    period_label = f"{from_dt.strftime('%d.%m')} — {to_dt.strftime('%d.%m.%Y')}"

    # ── Привлечение ────────────────────────────────────────────
    acq = m["acquisition"]
    by_source_grouped: dict[str, int] = {}
    for src, n in acq["by_source"].items():
        cat_key, cat_label = sources.categorize_source(src)
        by_source_grouped[cat_label] = by_source_grouped.get(cat_label, 0) + n

    # Топ-3 группы (для краткости)
    top_categories = sorted(by_source_grouped.items(), key=lambda x: -x[1])

    # ── Выручка ───────────────────────────────────────────────
    subs_rev = m["subscriptions"]["new_revenue_rub"]
    cert_rev = m["gift_certs"]["revenue_rub"]
    total_yk_rev = subs_rev + cert_rev

    # ── Сборка текста ─────────────────────────────────────────
    lines = [
        f"📊 *Дашборд · {days} дн.*",
        f"_{period_label}_",
        "",
        "📈 *Привлечение*",
        f"  Новых клиентов: *{acq['total_new']}*",
    ]
    if top_categories:
        for label, n in top_categories[:5]:
            lines.append(f"  · {label} — {n}")
    else:
        lines.append("  · (новых клиентов с атрибуцией пока нет)")

    lines.extend([
        "",
        "💰 *Выручка (ЮKassa)*",
        f"  Абонементы (новых {m['subscriptions']['new_in_period']}): *{_ru_number(subs_rev)}* ₽",
        f"  Сертификаты (продано {m['gift_certs']['count']}): *{_ru_number(cert_rev)}* ₽",
        f"  Итого: *{_ru_number(total_yk_rev)}* ₽",
        "",
        "✂️ *Записи через бот*",
        f"  Создано: *{m['bookings']['created']}*",
        f"  С YClients-id: {m['bookings']['with_record_id']}",
        "",
        "🎟 *Абонементы*",
        f"  Активных сейчас: *{m['subscriptions']['active']}*",
        f"  Новых за период: {m['subscriptions']['new_in_period']}",
        f"  Истекают на след. неделе: {m['subscriptions']['expiring_soon']}",
        "",
        "🪙 *Лояльность*",
        f"  Активных с историей: *{m['loyalty']['active_total']}*",
        f"  Начислено за период: {_ru_number(m['loyalty']['earned'])} баллов",
        f"  Погашено за период: {_ru_number(m['loyalty']['redeemed'])} баллов",
    ])
    if m["loyalty"]["expired"]:
        lines.append(f"  Сгорело: {_ru_number(m['loyalty']['expired'])} баллов")

    rev = m["reviews"]
    avg = f"{rev['avg_rating']:.2f} ⭐" if rev['avg_rating'] is not None else "—"
    lines.extend([
        "",
        "⭐ *Отзывы*",
        f"  Запросов: *{rev['requested']}*",
        f"  Отвечено: {rev['responded']}",
        f"  Средняя оценка: *{avg}*",
        f"  Спасённых негативов: {rev['rescued_negatives']}",
    ])

    la = m["lead_alerts"]
    lines.extend([
        "",
        "⚠️ *Зависшие заявки*",
        f"  Алертов отправлено: {la['alerts_sent']}",
        f"  Из них «спасено» (записались после): *{la['rescued']}*",
    ])

    ai = m["ai"]
    lines.extend([
        "",
        "💸 *AI-расход*",
        f"  Вызовов: {ai['calls']}",
        f"  ${ai['cost_usd']:.2f} (~{_ru_number(ai['cost_rub'])} ₽)",
        "",
        "_/dashboard 7 — за неделю, /dashboard 90 — за квартал._",
    ])

    text = "\n".join(lines)
    if len(text) <= 4000:
        await update.message.reply_text(text, parse_mode="Markdown")
    else:
        # Тех-страховка от очень длинных дашбордов в больших окнах
        await update.message.reply_text(text[:4000], parse_mode="Markdown")
        await update.message.reply_text(text[4000:], parse_mode="Markdown")


async def cmd_help_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/help_admin — список админ-команд с примерами фраз простым языком."""
    if not database.is_admin(update.effective_user.id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await _show_admin_help(update)


async def cmd_admin_pdf(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/admin_pdf — собрать и прислать PDF-справочник команд."""
    user_id = update.effective_user.id
    if not database.is_admin(user_id):
        await update.message.reply_text("Команда только для администраторов.")
        return
    await update.message.reply_text("Собираю PDF-справочник…")
    try:
        import generate_admin_pdf, tempfile, os as _os
        tmp = tempfile.NamedTemporaryFile(mode="wb", suffix=".pdf", delete=False)
        tmp.close()
        out = await asyncio.to_thread(generate_admin_pdf.build_pdf, tmp.name)
        with open(out, "rb") as f:
            await context.bot.send_document(
                chat_id=user_id,
                document=f,
                filename="malesthetic_admin_commands.pdf",
                caption=(
                    "📄 *Команды админа и владельца*\n\n"
                    "Каждую можно вызвать слэшем или простым текстом. "
                    "Примеры фраз — в справочнике."
                ),
                parse_mode="Markdown",
            )
        try:
            _os.unlink(out)
        except Exception:
            pass
    except Exception as e:
        logger.error(f"cmd_admin_pdf: {e}")
        await update.message.reply_text(f"Не получилось собрать PDF: {e}")


def _format_dt(iso_str: str) -> str:
    """'2026-05-23T15:00:00' → '23.05 в 15:00'."""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%d.%m в %H:%M")
    except Exception:
        return iso_str


# ─── Напоминания ──────────────────────────────────────────────────────────

def _schedule_reminder(app: Application, user_id: int, booking_data: dict):
    try:
        dt_str = booking_data["datetime"]
        visit_dt = None
        for fmt in ("%Y-%m-%dT%H:%M:%S+03:00", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                visit_dt = datetime.strptime(dt_str[:19], fmt[:19])
                break
            except ValueError:
                continue
        if not visit_dt:
            return

        # Персональная настройка: user_id = Telegram chat_id. Клиент мог выключить
        # напоминания (тогда job не ставим вовсе) или выбрать своё время (reminder_hours).
        try:
            _p = database.get_notify_prefs_by_chat_id(user_id)
            if _p.get("reminder") is False:
                return
            _hrs = _p.get("reminder_hours")
            _mins = int(_hrs) * 60 if _hrs not in (None, "", 0) else REMINDER_MINUTES_BEFORE
        except Exception:
            _mins = REMINDER_MINUTES_BEFORE
        remind_at = visit_dt - timedelta(minutes=_mins)
        if remind_at <= datetime.now():
            return

        job_id = f"reminder_{user_id}_{booking_data.get('record_id', '')}"
        scheduler.add_job(
            _send_reminder, "date",
            run_date=remind_at,
            args=[
                app,
                user_id,
                visit_dt,
                _mins,
                booking_data.get("record_id"),
                booking_data.get("master_name") or "",
            ],
            id=job_id, replace_existing=True,
        )
        logger.info(f"Напоминание запланировано: {remind_at} для user {user_id}")
    except Exception as e:
        logger.error(f"Ошибка планирования напоминания: {e}")


async def _send_reminder(
    app,
    user_id,
    visit_dt,
    lead_mins=REMINDER_MINUTES_BEFORE,
    record_id=None,
    master_name="",
):
    # Защита: клиент мог выключить напоминания уже ПОСЛЕ постановки job.
    try:
        if database.get_notify_prefs_by_chat_id(user_id).get("reminder") is False:
            return
    except Exception:
        pass
    # Динамический «через сколько» — по фактическому времени до записи (не хардкод «2 часа»).
    _lead = ""
    try:
        _m = int(lead_mins)
        if _m >= 1440 and _m % 1440 == 0:
            _lead = " — завтра" if _m == 1440 else ""
        elif _m >= 60 and _m % 60 == 0:
            _lead = f" — через {_m // 60} ч"
        elif _m > 0:
            _lead = f" — через {_m} мин"
    except Exception:
        pass
    reminder_text = (
        f"⏰ Напоминаем о записи{_lead}!\n\n"
        f"📅 {visit_dt.strftime('%d.%m')} в {visit_dt.strftime('%H:%M')}\n"
        f"Барбершоп «{BARBERSHOP_NAME}»\n\n"
        f"Если нужно перенести — откройте ваши записи 👇"
    )
    try:
        await app.bot.send_message(
            chat_id=user_id,
            text=reminder_text,
        )
    except Exception as e:
        logger.error(f"Ошибка отправки напоминания: {e}")
    try:
        master_suffix = f" у {master_name}" if master_name else ""
        await webhook_server._send_client_push(
            user_id,
            "Напоминание о записи",
            f"{visit_dt.strftime('%d.%m в %H:%M')}{master_suffix}",
            url="/app/?chat=1&widget=mybookings",
            tag=f"appointment-reminder-{record_id or user_id}",
            data={"event": "appointment_reminder", "record_id": record_id},
            persist_in_chat=True,
            chat_text=reminder_text,
            chat_action={
                "type": "open_cabinet",
                "label": "Мои записи",
                "screen": "cabinet",
            },
            chat_widget="mybookings",
            chat_dedupe_key=f"appointment-reminder:{record_id or visit_dt.isoformat()}",
        )
    except Exception as e:
        logger.error(f"Ошибка PWA-напоминания: {e}")


# ─── Запуск ───────────────────────────────────────────────────────────────

async def post_init(app: Application):
    database.init_db()
    webhook_server.install_staff_telegram_chat_mirror(app.bot)
    # Заводим первых админов (идемпотентно — повторные запуски не дублируют)
    for admin_id in INITIAL_ADMIN_IDS:
        database.add_admin(admin_id)
    scheduler.start()
    # Прогреваем кэш при старте — первый клиент не будет ждать
    yc.get_masters()
    yc.get_services()

    # Кнопка-меню в Telegram, открывающая приложение как Mini App.
    # Так владелец/мастер/клиент открывают приложение прямо из чата с ботом,
    # и Telegram автоматически передаёт их аккаунт (initData) — роль (владелец/
    # управляющий/мастер) определяется сама, без ввода номера и Login Widget.
    try:
        from telegram import MenuButtonWebApp, WebAppInfo
        await app.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Приложение",
                web_app=WebAppInfo(url="https://malesthetic.pro/app/index.html?v=2"),
            )
        )
        logger.info("Mini App menu button set ✓")
    except Exception as e:
        logger.error(f"set menu button: {e}")

    # Возобновляем опрос платежей, по которым клиент мог оплатить, пока
    # бот был перезапущен. Без этого PDF после рестарта не уйдёт автоматически.
    pending = database.list_pending_certs()
    for cert in pending:
        pid = cert.get("yukassa_payment_id")
        if pid:
            asyncio.create_task(_poll_payment(app, cert["code"], pid))
    if pending:
        logger.info(f"Возобновлён опрос {len(pending)} pending-платежей сертификатов")

    # То же самое для абонементов: pending_payment с payment_id → возобновляем поллинг
    with database._db() as conn:
        rows = conn.execute(
            "SELECT id, yukassa_payment_id FROM subscriptions "
            "WHERE status = 'pending_payment' AND yukassa_payment_id IS NOT NULL"
        ).fetchall()
    pending_subs = [dict(r) for r in rows]
    for sub in pending_subs:
        asyncio.create_task(_poll_subscription_payment(
            app, sub["id"], sub["yukassa_payment_id"]
        ))
    if pending_subs:
        logger.info(f"Возобновлён опрос {len(pending_subs)} pending-платежей абонементов")

    # Внедряем _poll_payment в webhook_server, чтобы покупка сертификата картой
    # в приложении переиспользовала ту же доставку PDF в Telegram, что и бот.
    webhook_server.register_payment_poller(_poll_payment)
    # То же для абонементов — опрос платежа + активация подписки из приложения.
    webhook_server.register_subscription_poller(_poll_subscription_payment)

    # Webhook-приёмник для уведомлений мастерам (YClients → Beget → сюда)
    await webhook_server.start_webhook_server(app)

    # Один быстрый self-check сразу после старта, чтобы не ждать ближайший cron-тик.
    asyncio.create_task(_dual_role_guard_job(app))

    # Ежедневная ротация ПД в 03:00 МСК — обезличивает клиентов без активности
    # PII_RETENTION_MONTHS месяцев и просроченные сертификаты.
    scheduler.add_job(
        _pii_rotation_job,
        trigger="cron",
        hour=3,
        minute=0,
        id="pii_rotation",
        replace_existing=True,
    )

    # Реактивация уснувших клиентов в 10:00 МСК — клиент с утра видит,
    # планирует визит на ближайшие дни.
    scheduler.add_job(
        _reactivation_job,
        trigger="cron",
        hour=10,
        minute=0,
        id="reactivation",
        replace_existing=True,
        args=[app],
    )

    # Поздравления с ДР в 10:30 МСК — на полчаса позже реактивации, чтобы
    # не было пиковой нагрузки на YClients API.
    scheduler.add_job(
        _birthday_job,
        trigger="cron",
        hour=10,
        minute=30,
        id="birthday",
        replace_existing=True,
        args=[app],
    )

    # Анализ индивидуального цикла в 11:00 МСК. Он формирует owner-очередь;
    # отправка клиентам запускается отдельно после подтверждения владельца.
    # «обычное время постричься» подходит сегодня ± 3 дня.
    scheduler.add_job(
        _cycle_reminder_job,
        trigger="cron",
        hour=11,
        minute=0,
        id="cycle_reminder",
        replace_existing=True,
        args=[app],
    )

    # Резолвер рефералов в 11:30 МСК — проверяем pending-привязки на наличие
    # первого посещённого визита, выдаём промокоды обоим участникам.
    scheduler.add_job(
        _referral_resolver_job,
        trigger="cron",
        hour=11,
        minute=30,
        id="referral_resolver",
        replace_existing=True,
        args=[app],
    )

    # Абонементы в 12:00 МСК: sync visits_used, отметка expired,
    # push «продлить?» за 3 дня до конца.
    scheduler.add_job(
        _subscriptions_job,
        trigger="cron",
        hour=12,
        minute=0,
        id="subscriptions",
        replace_existing=True,
        args=[app],
    )

    # Программа лояльности в 12:30 МСК: начисление + сгорание баллов
    scheduler.add_job(
        _loyalty_job,
        trigger="cron",
        hour=12,
        minute=30,
        id="loyalty",
        replace_existing=True,
        args=[app],
    )

    # Сбор отзывов: каждые 5 минут — рассылка «созревших» pending-запросов.
    # Тик мелкий, потому что клиенты могут закрываться весь день, и хочется
    # отправлять им через ~3 ч после визита достаточно точно.
    scheduler.add_job(
        _reviews_job,
        trigger="cron",
        minute="*/5",
        id="reviews",
        replace_existing=True,
        args=[app],
    )

    # Алерт о зависшей заявке: каждые 5 минут проверяем,
    # есть ли клиенты, кому MAYA ответила, а они так и не записались.
    scheduler.add_job(
        _lead_alerts_job,
        trigger="cron",
        minute="*/5",
        id="lead_alerts",
        replace_existing=True,
        args=[app],
    )

    # Guard dual-role аккаунтов (мастер + клиент): каждые 3 часа тихо
    # прогреваем клиентский контекст заново и тревожим только если не починилось.
    scheduler.add_job(
        _dual_role_guard_job,
        trigger="cron",
        hour="*/3",
        minute=17,
        id="dual_role_guard",
        replace_existing=True,
        args=[app],
    )

    # Дневной отчёт владельцу в 21:00 МСК: ЗП барберов смены + нал/карта.
    scheduler.add_job(
        _daily_report_job,
        trigger="cron",
        hour=21,
        minute=0,
        id="daily_report",
        replace_existing=True,
        args=[app],
    )

    # Напоминание Антону прислать расходы по салону — раз в неделю, вс 20:00 МСК.
    scheduler.add_job(
        _anton_expense_reminder_job,
        trigger="cron",
        day_of_week="sun",
        hour=20,
        minute=0,
        id="anton_expense_reminder",
        replace_existing=True,
        args=[app],
    )

    # GOD-режим: MAYA сама проверяет систему и оплаты — каждый день 09:00 МСК.
    scheduler.add_job(
        _god_watch_job,
        trigger="cron",
        hour=9,
        minute=0,
        id="god_watch",
        replace_existing=True,
        args=[app],
    )

    # AI-директор: утренний брифинг владельцу (деньги-возможности + приоритет) —
    # Майя сама пишет владельцу каждый день в 10:00 МСК + пуш в PWA.
    scheduler.add_job(
        _director_briefing_job,
        trigger="cron",
        hour=10,
        minute=0,
        id="director_briefing",
        replace_existing=True,
        args=[app],
    )

    logger.info(
        f"Бот MAYA запущен 🚀 | БД готова | Админов: {len(database.list_admins())} "
        f"| Ротация ПД: каждый день 03:00 МСК (>{PII_RETENTION_MONTHS} мес)"
    )


def _pii_rotation_job():
    """Ежедневная задача обезличивания старых ПД."""
    try:
        counts = database.rotate_old_pii(PII_RETENTION_MONTHS)
        if counts["clients"] or counts["gift_certs"]:
            logger.info(
                f"🔒 Ротация ПД: обезличено клиентов {counts['clients']}, "
                f"сертификатов {counts['gift_certs']}"
            )
    except Exception as e:
        logger.error(f"Ошибка ротации ПД: {e}")


async def _reactivation_job(app: Application):
    """Ежедневная реактивация уснувших клиентов."""
    try:
        await reactivation.run_reactivation_job(app)
    except Exception as e:
        logger.error(f"Ошибка реактивации: {e}")


async def _birthday_job(app: Application):
    """Ежедневная отправка ДР-промокодов."""
    try:
        await birthday.run_birthday_job(app)
    except Exception as e:
        logger.error(f"Ошибка ДР-рассылки: {e}")


async def _cycle_reminder_job(app: Application):
    """Ежедневно формирует очередь; ничего клиентам сам не отправляет."""
    try:
        snapshot = await asyncio.to_thread(cycle_reminder.scan_cycle_candidates)
        alert = (snapshot or {}).get("owner_alert") or {}
        if alert.get("notify_required"):
            delivery = await webhook_server.notify_owner_cycle_candidates(snapshot)
            await asyncio.to_thread(
                cycle_reminder.mark_owner_alert_notified,
                str(alert.get("event_id") or ""),
                delivery,
            )
            logger.info(
                "Цикл-сигнал владельцу: candidates=%s push=%s",
                alert.get("candidate_count"),
                delivery.get("push"),
            )
    except Exception as e:
        logger.error(f"Ошибка анализа личного цикла: {e}")


async def _referral_resolver_job(app: Application):
    """Ежедневный резолвер pending-рефералов → выдача промокодов."""
    try:
        await referral.run_referral_resolver_job(app)
    except Exception as e:
        logger.error(f"Ошибка реферал-резолвера: {e}")


async def _subscriptions_job(app: Application):
    """
    Ежедневный таск по абонементам: sync visits_used, expire, push «продлить?».
    """
    try:
        await subscriptions.run_subscriptions_job(app)
    except Exception as e:
        logger.error(f"Ошибка subscriptions job: {e}")


def _fmt_rub(n) -> str:
    """1800 → '1 800'. Разделитель тысяч — неразрывный пробел не нужен (Telegram plain)."""
    try:
        return f"{int(round(float(n))):,}".replace(",", " ")
    except Exception:
        return str(n)


# ─── Расходы по салону от ассистента Антона ───────────────────────────────
def _bot_anton_chat_id() -> int:
    try:
        v = database.get_setting("anton_chat_id")
        if v and str(v).lstrip("-").isdigit():
            return int(v)
    except Exception:
        pass
    return 339683535

ANTON_CHAT_ID = _bot_anton_chat_id()
_anton_expense_awaiting: set = set()   # chat_id Антона, от кого ждём список расходов


def _parse_anton_expenses(text: str) -> list:
    """Извлекает расходы [{item, amount}] из свободного текста (ИИ + регэксп-фолбэк)."""
    text = (text or "").strip()
    if not text:
        return []
    # 1) ИИ-разбор — надёжно для естественного языка
    try:
        import claude_ai
        import json as _json
        prompt = (
            "Извлеки расходы салона из сообщения администратора. Верни СТРОГО JSON-массив "
            "объектов {\"item\": краткое название, \"amount\": целое число рублей}. Бери только то, "
            "что явно названо как расход с суммой. Никакого текста кроме JSON.\n\nСообщение:\n"
            + text[:1500]
        )
        raw = claude_ai.complete_text(prompt, model=claude_ai.OPENAI_FAST_MODEL, max_tokens=600)
        m = re.search(r"\[.*\]", raw, re.S)
        if m:
            arr = _json.loads(m.group(0))
            out = []
            for x in arr:
                if not isinstance(x, dict):
                    continue
                it = str(x.get("item") or "").strip()
                try:
                    amt = int(round(float(x.get("amount"))))
                except Exception:
                    continue
                if it and amt > 0:
                    out.append({"item": it[:120], "amount": amt})
            if out:
                return out
    except Exception as e:
        logger.error(f"anton expense AI parse: {e}")
    # 2) фолбэк — простой разбор «… <число>» по строкам/пунктам
    out = []
    for chunk in re.split(r"[\n;•]+|,(?=\s*\D)", text):
        chunk = chunk.strip(" -—\t")
        if not chunk:
            continue
        nums = re.findall(r"\d[\d  .]*\d|\d", chunk)
        if not nums:
            continue
        amt_raw = re.sub(r"[  .]", "", nums[-1])
        try:
            amount = int(amt_raw)
        except Exception:
            continue
        if amount <= 0:
            continue
        idx = chunk.rfind(nums[-1])
        item = re.sub(r"(руб(лей|ля|\.)?|₽|р\.)\s*$", "", chunk[:idx], flags=re.I).strip(" -—:,.")
        out.append({"item": (item or "Расход")[:120], "amount": amount})
    return out


def _fmt_rub_spaces(n) -> str:
    try:
        return f"{int(round(n)):,}".replace(",", " ")
    except Exception:
        return str(n)


async def _save_anton_expenses(update: Update, text: str) -> bool:
    """Парсит и сохраняет расходы Антона за СЕГОДНЯ. True, если что-то сохранили."""
    items = await asyncio.to_thread(_parse_anton_expenses, text)
    if not items:
        await update.message.reply_text(
            "Не разобрала суммы 🤔 Напишите списком, например:\n"
            "• кофе — 500\n• уборщица — 2000\n• касс. лента и средства — 800"
        )
        return False
    today = date.today().isoformat()
    total = 0
    for it in items:
        try:
            database.add_salon_expense(today, it["item"], it["amount"], source="anton")
            total += it["amount"]
        except Exception as e:
            logger.error(f"add_salon_expense: {e}")
    lines = "\n".join(f"• {it['item']} — {_fmt_rub_spaces(it['amount'])} ₽" for it in items)
    await update.message.reply_text(
        f"Записала расходы за сегодня ✓\n{lines}\nИтого: {_fmt_rub_spaces(total)} ₽"
        "\n\nОни уже в отчёте владельца. Если ошибся — пришли /rashod и список заново (перезапишу день)."
    )
    return True


async def cmd_rashod(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Антон вносит расходы по салону. /rashod [список] — или команда, затем список."""
    uid = update.effective_user.id if update.effective_user else 0
    if uid != ANTON_CHAT_ID:
        return  # команда только для Антона
    try:
        database.clear_salon_expenses(date.today().isoformat())  # команда перезаписывает день
    except Exception:
        pass
    parts = (update.message.text or "").split(maxsplit=1)
    if len(parts) > 1 and parts[1].strip():
        _anton_expense_awaiting.discard(uid)
        await _save_anton_expenses(update, parts[1])
        return
    _anton_expense_awaiting.add(uid)
    await update.message.reply_text(
        "Пришли расходы по салону за сегодня списком (кофе, уборщица, касс. лента и т.п.) "
        "с суммами — добавлю их в отчёт владельцу. Например:\n"
        "• кофе — 500\n• уборщица — 2000\n• касс. лента и средства — 800"
    )


async def cmd_kassa(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Антон вносит кассу за день: /kassa <всего налички> <наличкой за день>.
    Пишется в cash_log → в отчёте владельца сверяется с расчётной наличкой YClients."""
    uid = update.effective_user.id if update.effective_user else 0
    # Кассу вносит Антон ИЛИ владелец (Стас сам 2 дня в неделю). is_admin = Стас+Антон.
    try:
        _allowed = (uid == ANTON_CHAT_ID) or database.is_admin(uid)
    except Exception:
        _allowed = (uid == ANTON_CHAT_ID)
    if not _allowed:
        return
    txt = update.message.text or ""
    arg = txt.split(maxsplit=1)[1] if len(txt.split(maxsplit=1)) > 1 else ""
    toks = [int(x) for x in arg.replace(",", " ").split() if x.isdigit()]
    if len(toks) < 2:
        await update.message.reply_text(
            "Пришли кассу за сегодня ДВУМЯ числами (без пробелов внутри числа):\n"
            "сколько ВСЕГО налички в кассе и сколько налички получено ЗА СЕГОДНЯ.\n"
            "Например: /kassa 45000 18500\n"
            "(первое — вся наличка в кассе сейчас, второе — наличка за этот день)"
        )
        return
    total_till, day_cash = toks[0], toks[1]
    try:
        database.set_cash_log(date.today().isoformat(), total_till, day_cash, entered_by=uid)
    except Exception as e:
        logger.error(f"cmd_kassa: {e}")
        await update.message.reply_text("Не удалось сохранить кассу — попробуй ещё раз.")
        return
    fmt = lambda n: f"{n:,}".replace(",", " ")
    await update.message.reply_text(
        f"Записала кассу за сегодня:\n• Всего налички в кассе: {fmt(total_till)} ₽\n"
        f"• Наличкой за день: {fmt(day_cash)} ₽\n"
        "Это уйдёт в отчёт владельцу со сверкой. Ошибся — пришли /kassa заново (перезапишу день)."
    )


async def _anton_expense_reminder_job(app: Application):
    """Раз в неделю (вс вечером) — напоминаем Антону прислать расходы по салону."""
    try:
        await app.bot.send_message(
            chat_id=ANTON_CHAT_ID,
            text=("Привет! 👋 Напиши, какие расходы по салону были на этой неделе — кофе, "
                  "уборщица, касс. лента, средства и т.п. Просто списком с суммами, я добавлю "
                  "их в отчёт владельцу.\n\nМожно прямо ответить на это сообщение."),
        )
        _anton_expense_awaiting.add(ANTON_CHAT_ID)
    except Exception as e:
        logger.error(f"anton expense reminder: {e}")


# ── AI-директор: Майя сама пишет владельцу + пуш ────────────────────────────
def _m(n) -> str:
    """35037 → «35 037» (разряды тонким пробелом)."""
    try:
        return f"{int(round(float(n or 0))):,}".replace(",", " ")
    except Exception:
        return "0"


def _owner_job_callback(job: str | None) -> str | None:
    return {
        "reactivation": "admin_run_react",
        "birthday": "admin_run_birthday",
        "cycle": "admin_run_cycle",
        "reviews": "admin_run_reviews",
        "subscriptions": "admin_run_sub_now",
    }.get((job or "").strip().lower())


def _owner_action_text(action: dict | None) -> str:
    if not isinstance(action, dict):
        return ""
    lines = []
    if action.get("title"):
        lines.append(str(action.get("title")))
    if action.get("problem"):
        lines.append("Что важно: " + str(action.get("problem")))
    if action.get("reason"):
        lines.append("Почему сейчас: " + str(action.get("reason")))
    if action.get("potential_rub"):
        lines.append("Потенциал: ~" + _m(action.get("potential_rub")) + " ₽")
    if action.get("client_message"):
        lines.append("Сообщение клиенту:\n" + str(action.get("client_message")))
    return "\n\n".join(lines).strip()


def _owner_recipient_ids() -> list[int]:
    """Получатели AI-директора: только owner/founder, не все админы."""
    out: set[int] = set()
    for value in FOUNDER_IDS or []:
        try:
            out.add(int(value))
        except Exception:
            pass
    return sorted(out)


async def notify_owner(app: Application, text: str, push_title: str = "MAYA",
                       push_body: str = "", tag: str = "maya_owner",
                       url: str = "/app/?panel=report",
                       button_label: str = "📊 Открыть кабинет",
                       button_url: str = "https://malesthetic.pro/app/?panel=report",
                       chat_action: dict | None = None) -> int:
    """Единая точка проактивных сообщений AI-директора владельцу: Telegram + Web Push
    в PWA. Майя может писать владельцу сама (брифинг, риск, возможность). Возвращает
    число адресатов, которым доставлено в Telegram."""
    owner_ids = _owner_recipient_ids()
    if not owner_ids:
        logger.warning("notify_owner: нет настроенных owner/founder получателей")
        return 0
    import webhook_server
    # Сохраняем карточку и при недоступном Telegram. Глобальное зеркало после
    # успешной Telegram-доставки увидит тот же dedupe_key и не создаст дубль.
    try:
        for owner_id in owner_ids:
            webhook_server._store_assistant_message_in_chat(
                owner_id,
                text,
                mode="staff",
                action=chat_action if isinstance(chat_action, dict) else None,
                dedupe_key=webhook_server._telegram_chat_mirror_dedupe_key(owner_id, text),
                protect_content=True,
            )
    except Exception as e:
        logger.error(f"notify_owner in-app chat: {e}")

    kb = None
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        rows = []
        _cb = _owner_job_callback(chat_action.get("job")) if isinstance(chat_action, dict) else None
        _cb_label = (chat_action.get("label") or "Запустить") if isinstance(chat_action, dict) else None
        if _cb:
            rows.append([InlineKeyboardButton(_cb_label, callback_data=_cb)])
        if button_label and button_url:
            rows.append([InlineKeyboardButton(button_label, url=button_url)])
        if rows:
            kb = InlineKeyboardMarkup(rows)
    except Exception:
            kb = None
    sent = 0
    for owner_id in owner_ids:
        try:
            await app.bot.send_message(chat_id=owner_id, text=text, reply_markup=kb)
            sent += 1
        except Exception as e:
            logger.error(f"notify_owner tg → {owner_id}: {e}")
        try:
            await webhook_server._send_client_push(
                owner_id, push_title, push_body or text[:120],
                url=url, tag=tag,
            )
        except Exception as e:
            logger.error(f"notify_owner push → {owner_id}: {e}")
    return sent


def _format_director_briefing(brief: dict) -> tuple[str, str, str]:
    """(telegram_text, push_title, push_body) в голосе Майи-директора из
    owner_ai.daily_briefing(). Детерминированно — не зависит от LLM-мозга."""
    t = brief.get("today") or {}
    booked = t.get("booked") or 0
    exp = t.get("expected_revenue_rub") or 0
    avg = t.get("avg_check_rub") or 0
    lines = ["Доброе утро! Посмотрела салон на сегодня 👇", "",
             f"📅 Сегодня: {booked} записей, ожидаемо ~{_m(exp)} ₽ (средний чек {_m(avg)} ₽)."]
    who = ", ".join((t.get("idle_masters") or []) + (t.get("underused_masters") or []))
    if who:
        lines.append(f"🪑 Недозагружены: {who} — ≈{t.get('free_capacity_today') or 0} свободных окон.")

    tr = brief.get("week_trend") or {}
    parts = []
    for key, lbl in (("visits", "визиты"), ("avg_check", "средний чек")):
        d = (tr.get(key) or {}).get("delta_pct")
        if d:
            parts.append(f"{lbl} {'+' if d >= 0 else ''}{d}%")
    if parts:
        lines.append(f"📈 За неделю: {', '.join(parts)}.")

    advisor = brief.get("owner_advisor") or {}
    advisor_items = advisor.get("top_advice") or []
    if advisor_items:
        lines += ["", "Совет владельцу по цифрам:"]
        for i, item in enumerate(advisor_items[:3], 1):
            evidence = str(item.get("evidence") or "").strip()
            recommendation = str(item.get("recommendation") or "").strip()
            money = f" Потенциал: ~{_m(item['potential_rub'])} ₽." if item.get("potential_rub") else ""
            lines.append(
                f"{i}. {item.get('title')}: {evidence} {recommendation}{money}".strip()
            )

    execution = brief.get("execution_plan") or {}
    execution_steps = execution.get("steps") or []
    if execution_steps:
        lines += ["", f"🧭 План действий: {execution.get('headline') or 'что сделать сегодня'}"]
        for i, step in enumerate(execution_steps[:3], 1):
            money = f" — ~{_m(step['potential_rub'])} ₽" if step.get("potential_rub") else ""
            next_step = step.get("owner_next_step") or step.get("detail") or ""
            lines.append(f"{i}. {step.get('title')}{money}" + (f". {next_step}" if next_step else ""))

    tasks = brief.get("task_center") or {}
    task_sm = tasks.get("summary") or {}
    if task_sm.get("overdue_count") or task_sm.get("effect_check_count") or task_sm.get("running_count"):
        bits = []
        if task_sm.get("overdue_count"):
            bits.append(f"просрочено {task_sm.get('overdue_count')}")
        if task_sm.get("effect_check_count"):
            bits.append(f"проверить эффект {task_sm.get('effect_check_count')}")
        if task_sm.get("running_count"):
            bits.append(f"MAYA выполняет {task_sm.get('running_count')}")
        lines.append(f"📌 Задачи: {', '.join(bits)}.")

    focus = brief.get("control_focus") or {}
    focus_items = focus.get("items") or []
    if focus_items and not execution_steps:
        lines += ["", f"🎯 Фокус контроля: {focus.get('headline') or 'что закрыть сегодня'}"]
        for i, item in enumerate(focus_items[:3], 1):
            label = item.get("focus_label") or item.get("status") or ""
            money = f" — ~{_m(item['potential_rub'])} ₽" if item.get("potential_rub") else ""
            step = item.get("owner_next_step") or item.get("detail") or ""
            lines.append(f"{i}. {item.get('title')}{money}" + (f" · {label}" if label else "") + (f". {step}" if step else ""))

    opps = brief.get("opportunities") or []
    if opps:
        lines += ["", "💰 Где деньги сегодня:"]
        for i, o in enumerate(opps[:3], 1):
            money = f" — ~{_m(o['potential_rub'])} ₽" if o.get("potential_rub") else ""
            lines.append(f"{i}. {o.get('title')}{money}. {o.get('detail', '')}")
        lines += ["", "Скажи — запущу рассылку (уснувшим / по сертификатам) или помогу заполнить окна."]
    else:
        lines += ["", "Пока всё ровно — держу руку на пульсе, замечу что-то важное — напишу."]

    text = "\n".join(lines).strip()
    top = brief.get("top_priority") or {}
    if advisor_items and advisor.get("status") in ("risk", "warn"):
        first = advisor_items[0]
        push_body = f"{booked} записей сегодня. Совет: {first.get('title')} — {first.get('recommendation')}"
        if len(push_body) > 180:
            push_body = push_body[:179].rstrip() + "…"
    elif execution_steps and execution.get("status") in ("risk", "warn"):
        push_body = f"{booked} записей сегодня. План: {execution_steps[0].get('title') or execution.get('headline')}."
    elif focus_items and focus.get("status") in ("risk", "warn"):
        push_body = f"{booked} записей сегодня. Фокус: {focus.get('headline') or focus_items[0].get('title')}."
    elif top:
        money = f" (~{_m(top['potential_rub'])} ₽)" if top.get("potential_rub") else ""
        push_body = f"{booked} записей сегодня. Приоритет: {top.get('title')}{money}."
    else:
        push_body = f"{booked} записей сегодня, ожидаемо ~{_m(exp)} ₽."
    return text, "Брифинг директора 📊", push_body


async def _director_briefing_job(app: Application):
    """Утренний брифинг AI-директора владельцу: деньги-возможности + приоритет + пуш.
    Майя сама пишет владельцу раз в день (проактивный директор)."""
    try:
        import owner_ai
        brief = await asyncio.to_thread(owner_ai.daily_briefing)
        text, push_title, push_body = _format_director_briefing(brief)
        top_action = brief.get("top_action")
    except Exception as e:
        logger.error(f"director_briefing build: {e}")
        return
    if not text:
        return
    # Анти-дубль: один брифинг в день.
    try:
        import hashlib as _hl
        from datetime import date as _d
        sig = _d.today().isoformat() + ":" + _hl.md5(text.encode("utf-8")).hexdigest()[:10]
        if database.get_setting("director_briefing_last") == sig:
            logger.info("director_briefing: уже отправлен сегодня")
            return
        database.set_setting("director_briefing_last", sig)
    except Exception:
        pass
    if isinstance(top_action, dict):
        try:
            pretty = _owner_action_text(top_action)
            if pretty:
                text = text + "\n\n" + pretty
        except Exception:
            pass
    n = await notify_owner(app, text, push_title=push_title, push_body=push_body,
                           tag="director_briefing", url="/app/?panel=report",
                           chat_action=top_action if isinstance(top_action, dict) else None)
    logger.info(f"📊 Брифинг AI-директора отправлен: {n} адресат(ов)")


async def _daily_report_job(app: Application):
    """21:00 МСК — собираем дневной отчёт и уведомляем владельца: Telegram + PWA-пуш.
    Зарплаты барберов смены (выручка × реальный %) + сколько визитов нал/карта."""
    try:
        import webhook_server
        from datetime import date as _date
        d = _date.today().isoformat()
        rep = await asyncio.to_thread(webhook_server._daily_report, d)
    except Exception as e:
        logger.error(f"daily_report job build: {e}")
        return
    # Отметка для самодиагностики GOD-режима: дневной отчёт сегодня отработал.
    try:
        from datetime import datetime as _dtnow
        database.set_setting("last_daily_report_at", _dtnow.now().isoformat())
    except Exception:
        pass

    dd = (d[8:10] + "." + d[5:7]) if len(d) >= 10 else d
    masters = rep.get("masters") or []
    cash = rep.get("cash") or {}
    card = rep.get("card") or {}

    lines = [f"📊 Отчёт за {dd} готов", ""]
    barber_lines = []
    for m in masters:
        if m.get("is_owner"):
            continue
        barber_lines.append(
            f"• {m.get('name')}: {_fmt_rub(m.get('gross', 0))} ₽ × {m.get('percent', 0)}% = "
            f"{_fmt_rub(m.get('salary', 0))} ₽"
        )
    if barber_lines:
        lines.append("Зарплаты барберов (смена):")
        lines.extend(barber_lines)
        lines.append(f"Итого к выплате: {_fmt_rub(rep.get('salary_total', 0))} ₽")
    else:
        lines.append("Сегодня барберов в смене с выручкой нет.")

    # Антон (ассистент)
    anton = rep.get("anton") or {}
    if anton:
        lines.append("")
        if anton.get("day_off"):
            lines.append(f"Антон (выходной): {_fmt_rub(anton.get('total', 0))} ₽")
        else:
            lines.append(
                f"Антон: {_fmt_rub(anton.get('base', 0))} ₽ + {anton.get('pct', 0)}% выручки "
                f"({_fmt_rub(anton.get('pct_amount', 0))} ₽) = {_fmt_rub(anton.get('total', 0))} ₽"
            )

    # Дополнительные расходы (каждый день)
    extra = rep.get("extra_expenses") or {}
    eitems = extra.get("items") or []
    if eitems:
        lines.append(
            "Доп. расходы: "
            + " + ".join(f"{_fmt_rub(x.get('amount', 0))} ₽" for x in eitems)
            + f" = {_fmt_rub(extra.get('total', 0))} ₽"
        )
    # Расходы по салону от Антона (кофе, уборщица, лента…)
    salon = rep.get("salon_expenses") or {}
    sitems = salon.get("items") or []
    if sitems:
        lines.append("Расходы по салону (Антон): "
                     + " + ".join(f"{_fmt_rub(x.get('amount', 0))} ₽" for x in sitems)
                     + f" = {_fmt_rub(salon.get('total', 0))} ₽")
    if rep.get("expenses_total") is not None:
        lines.append(f"Расходы за день всего: {_fmt_rub(rep.get('expenses_total', 0))} ₽")

    # Предварительная выплата за неделю (Чт→Ср до сегодня) — все, кроме Стаса (#11)
    prelim = rep.get("prelim_payout") or {}
    if prelim and (prelim.get("masters") or (prelim.get("anton") or {}).get("salary")):
        wk = prelim.get("week") or {}
        ws = wk.get("start") or ""
        ws_d = (ws[8:10] + "." + ws[5:7]) if len(ws) >= 10 else ws
        lines.append("")
        lines.append(f"💸 Предв. выплата за неделю (с {ws_d} по сегодня), кроме Стаса:")
        for m in (prelim.get("masters") or []):
            lines.append(f"• {m.get('name')}: {_fmt_rub(m.get('salary', 0))} ₽")
        an = prelim.get("anton") or {}
        if an.get("salary"):
            lines.append(f"• Антон: {_fmt_rub(an.get('salary', 0))} ₽")
        lines.append(f"Итого к выплате: {_fmt_rub(prelim.get('total', 0))} ₽")

    lines.append("")
    lines.append("Оплаты за день:")
    lines.append(f"💵 Наличные: {cash.get('count', 0)} виз. — {_fmt_rub(cash.get('sum', 0))} ₽")
    lines.append(f"💳 Карта: {card.get('count', 0)} виз. — {_fmt_rub(card.get('sum', 0))} ₽")
    lines.append(f"Выручка за день: {_fmt_rub(rep.get('total_gross', 0))} ₽")
    if rep.get("note"):
        lines.append("")
        lines.append(f"⚠️ {rep.get('note')}")
    text = "\n".join(lines)

    # Тело PWA-пуша владельцу — компактная выжимка отчёта (а не «откройте»):
    _visits = (cash.get("count", 0) or 0) + (card.get("count", 0) or 0)
    _push_lines = [
        f"Выручка {_fmt_rub(rep.get('total_gross', 0))} ₽ · {_visits} виз.",
        f"💵 {_fmt_rub(cash.get('sum', 0))} нал · 💳 {_fmt_rub(card.get('sum', 0))} карта",
    ]
    if rep.get("salary_total"):
        _push_lines.append(f"Барберам к выплате: {_fmt_rub(rep.get('salary_total', 0))} ₽")
    if rep.get("expenses_total") is not None:
        _push_lines.append(f"Расходы за день: {_fmt_rub(rep.get('expenses_total', 0))} ₽")
    push_body = "\n".join(_push_lines)

    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        kb = InlineKeyboardMarkup(
            [[InlineKeyboardButton("📊 Открыть отчёт", url="https://malesthetic.pro/app/?panel=report")]]
        )
    except Exception:
        kb = None

    import webhook_server
    for admin_id in database.list_admins():
        try:
            await app.bot.send_message(chat_id=admin_id, text=text, reply_markup=kb)
        except Exception as e:
            logger.error(f"daily_report tg → {admin_id}: {e}")
        try:
            await webhook_server._send_client_push(
                admin_id, f"Отчёт за {dd} 📊", push_body,
                url="/app/?panel=report", tag="daily_report",
            )
        except Exception as e:
            logger.error(f"daily_report push → {admin_id}: {e}")


async def _god_watch_job(app: Application):
    """09:00 МСК — MAYA сама проверяет систему и оплаты и шлёт ОСНОВАТЕЛЮ дайджест,
    если есть проблемы или подходят оплаты (Telegram + PWA-пуш). Если всё хорошо —
    молчит. Это часть GOD-режима: «MAYA предупреждает сама»."""
    try:
        import webhook_server
        from config import FOUNDER_IDS
    except Exception as e:
        logger.error(f"god_watch import: {e}")
        return
    try:
        health = await asyncio.to_thread(webhook_server._god_health_checks)
        renewals = webhook_server._god_renewals_view()
    except Exception as e:
        logger.error(f"god_watch build: {e}")
        return

    problems = [c for c in health.get("checks", []) if c.get("status") in ("warn", "fail")]
    due = [r for r in renewals if r.get("status") in ("soon", "overdue")]
    if not problems and not due:
        return  # всё спокойно — не беспокоим

    lines = ["🛡️ MAYA · проверка системы", ""]
    if due:
        lines.append("💳 Оплаты на подходе:")
        for r in due:
            when = "просрочено" if r["status"] == "overdue" else f"через {r['days_left']} дн."
            amt = f" · {_fmt_rub(r['amount'])} ₽" if r.get("amount") else ""
            lines.append(f"• {r['label']}: {when}{amt}")
        lines.append("")
    fails = [c for c in problems if c["status"] == "fail"]
    warns = [c for c in problems if c["status"] == "warn"]
    if fails:
        lines.append("🔴 Проблемы:")
        for c in fails:
            lines.append(f"• {c['label']}: {c.get('detail') or 'ошибка'}")
        lines.append("")
    if warns:
        lines.append("🟡 Внимание:")
        for c in warns:
            lines.append(f"• {c['label']}: {c.get('detail') or ''}".rstrip(": "))
    text = "\n".join(lines).strip()

    # Анти-спам: один и тот же дайджест шлём не чаще раза в день.
    try:
        import hashlib
        from datetime import date as _d
        sig = _d.today().isoformat() + ":" + hashlib.md5(text.encode("utf-8")).hexdigest()[:12]
        if (database.get_setting("god_last_alert") or "") == sig:
            return
        database.set_setting("god_last_alert", sig)
    except Exception:
        pass

    for fid in FOUNDER_IDS:
        try:
            await app.bot.send_message(chat_id=fid, text=text)
        except Exception as e:
            logger.error(f"god_watch tg → {fid}: {e}")
        try:
            await webhook_server._send_client_push(
                fid, "MAYA: нужно внимание 🛡️",
                "Есть проблемы или оплаты на подходе — откройте Центр управления.",
                url="/app/?god=1", tag="god_watch",
            )
        except Exception as e:
            logger.error(f"god_watch push → {fid}: {e}")


async def _dual_role_guard_job(app: Application):
    """Тихий guard для аккаунтов «мастер + клиент»: сам чинит кеш истории,
    а если не удалось — шлёт основателю сигнал."""
    try:
        import hashlib
        import webhook_server
        from config import FOUNDER_IDS
        from memory import audit_dual_role_client_context
    except Exception as e:
        logger.error(f"dual_role_guard import: {e}")
        return

    try:
        audit = await asyncio.to_thread(audit_dual_role_client_context, yc, True, 20)
    except Exception as e:
        logger.error(f"dual_role_guard run: {e}")
        return

    repaired = audit.get("repaired") or []
    issues = audit.get("issues") or []
    if repaired:
        logger.warning(
            "dual_role_guard auto-repaired %s account(s): %s",
            len(repaired),
            ", ".join(it.get("name") or str(it.get("chat_id")) for it in repaired),
        )
    if not issues:
        return

    fails = [it for it in issues if it.get("severity") == "fail"]
    warns = [it for it in issues if it.get("severity") != "fail"]
    lines = ["🛡️ MAYA · dual-role guard", ""]
    if repaired:
        lines.append(
            "Автопочинка сработала: "
            + ", ".join(
                f"{it.get('name') or it.get('chat_id')} ({it.get('visits', 0)} виз.)"
                for it in repaired
            )
        )
        lines.append("")
    if fails:
        lines.append("🔴 Не удалось восстановить:")
        for it in fails:
            lines.append(f"• {it['name']}: {it.get('detail') or it.get('reason') or 'ошибка'}")
        lines.append("")
    if warns:
        lines.append("🟡 Требует внимания:")
        for it in warns:
            lines.append(f"• {it['name']}: {it.get('detail') or it.get('reason') or 'проверьте'}")
    text = "\n".join(lines).strip()

    try:
        sig_base = "|".join(f"{it.get('chat_id')}:{it.get('reason')}" for it in issues)
        sig = date.today().isoformat() + ":" + hashlib.md5(sig_base.encode("utf-8")).hexdigest()[:12]
        if (database.get_setting("dual_role_guard_last_alert") or "") == sig:
            return
        database.set_setting("dual_role_guard_last_alert", sig)
    except Exception:
        pass

    for fid in FOUNDER_IDS:
        try:
            await app.bot.send_message(chat_id=fid, text=text)
        except Exception as e:
            logger.error(f"dual_role_guard tg → {fid}: {e}")
        try:
            await webhook_server._send_client_push(
                fid,
                "MAYA: dual-role guard 🛡️",
                "Есть рассинхрон между ролями мастер/клиент — откройте Центр управления.",
                url="/app/?god=1",
                tag="dual_role_guard",
            )
        except Exception as e:
            logger.error(f"dual_role_guard push → {fid}: {e}")


async def _loyalty_job(app: Application):
    """Ежедневный таск по баллам: начисление + сгорание."""
    try:
        await loyalty.run_loyalty_job(app)
    except Exception as e:
        logger.error(f"Ошибка loyalty job: {e}")


async def _reviews_job(app: Application):
    """Тик сбора отзывов — раз в 5 мин шлёт «созревшие» запросы."""
    try:
        await reviews.send_pending_review_requests(app)
    except Exception as e:
        logger.error(f"Ошибка reviews job: {e}")


async def _lead_alerts_job(app: Application):
    """Тик lead-alerts — раз в 5 мин шлёт «зависшие заявки» админу."""
    try:
        await lead_alerts.scan_and_alert(app)
    except Exception as e:
        logger.error(f"Ошибка lead_alerts job: {e}")


def _telegram_reachable(timeout: float = 8.0, attempts: int = 3) -> bool:
    """Быстрая проба доступности Telegram через прокси на старте.
    Fail-OPEN: при любом успехе или неожиданной ошибке → True (идём обычным путём);
    в degraded-режим уходим ТОЛЬКО когда ВСЕ попытки явно упали по сети (прокси мёртв)."""
    if not PROXY_URL:
        return True
    import time as _t
    try:
        import requests
    except Exception:
        return True
    proxies = {"https": PROXY_URL, "http": PROXY_URL}
    # Корень api.telegram.org может подвисать на отдельных прокси/маршрутах, даже когда
    # сам Bot API жив. Проверяем реальный bot-метод getMe тем же путём, которым стартует бот.
    probe_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getMe"
    for i in range(max(1, attempts)):
        try:
            r = requests.get(probe_url, proxies=proxies, timeout=timeout)
            if r.status_code < 500:
                return True
            raise requests.exceptions.RequestException(f"telegram probe HTTP {r.status_code}")
        except requests.exceptions.RequestException:
            if i < attempts - 1:
                _t.sleep(3)
        except Exception:
            return True
    return False


def _telegram_httpx_request(*, for_updates: bool = False) -> HTTPXRequest:
    """Единый request для Telegram через прокси.

    На проде маршрут до Telegram иногда отвечает медленно через внешний HTTP-proxy:
    requests/getMe проходит, а дефолтный httpx-таймаут PTB не дожидается ответа на
    initialize()/get_me(). Даём более мягкие таймауты, а для getUpdates оставляем
    длинное чтение под long-polling.
    """
    kwargs = {
        "connect_timeout": 20.0,
        "read_timeout": 70.0 if for_updates else 20.0,
        "write_timeout": 20.0,
        "pool_timeout": 20.0,
    }
    if PROXY_URL:
        kwargs["proxy"] = PROXY_URL
    return HTTPXRequest(**kwargs)


async def _initialize_bot_with_retry(bot, attempts: int = 6, delay: float = 2.0) -> None:
    """Дожидается успешного Bot.initialize() на флапающем прокси.

    На этой VPS proxy-route до Telegram иногда отвечает серией 502/timeout, а затем
    оживает через несколько секунд. PTB падает ещё до post_init(), из-за чего не
    поднимаются webhook/REST. Здесь даём несколько попыток на том же httpx-стеке,
    а после успеха дальнейший Application.initialize() уже не делает второй get_me().
    """
    last_error = None
    for i in range(max(1, attempts)):
        try:
            await bot.initialize()
            if i:
                logger.info(f"Telegram bootstrap восстановился на попытке {i + 1}/{attempts}")
            return
        except Exception as e:
            last_error = e
            logger.warning(f"Telegram bootstrap {i + 1}/{attempts} не удался: {e!r}")
            try:
                await bot.shutdown()
            except Exception:
                pass
            if i < attempts - 1:
                await asyncio.sleep(delay)
    raise last_error or RuntimeError("telegram bootstrap failed")


async def _run_polling_resilient(app: Application) -> None:
    """Запуск PTB без падения до post_init() из-за случайного proxy-flap."""
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _request_stop() -> None:
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGABRT):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except (NotImplementedError, RuntimeError, ValueError):
            pass

    # REST/webhook-контур приложения должен оживать сразу после старта процесса, даже
    # если Telegram bootstrap временно буксует на флапающем proxy-route.
    await webhook_server.start_webhook_server(app)
    await _initialize_bot_with_retry(app.bot, attempts=8 if PROXY_URL else 1, delay=2.0)
    await app.initialize()  # bot.initialize() уже успешен и идемпотентно пропустится
    await post_init(app)

    def error_callback(exc) -> None:
        app.create_task(app.process_error(error=exc, update=None))

    try:
        await app.updater.start_polling(
            poll_interval=0.0,
            timeout=10,
            bootstrap_retries=-1,
            drop_pending_updates=True,
            error_callback=error_callback,
        )
        await app.start()
        await stop_event.wait()
    finally:
        try:
            if app.updater:
                await app.updater.stop()
        finally:
            try:
                await app.stop()
            finally:
                await app.shutdown()


async def _serve_webhook_only_until_telegram_back():
    """DEGRADED-режим (Telegram-прокси мёртв на старте): поднимаем ТОЛЬКО webhook/REST
    (:8080 — кабинет клиента, владельческая панель, приём YClients-вебхуков), чтобы они
    НЕ лежали вместе с Telegram-ботом. Ждём, пока прокси оживёт, и возвращаемся — main()
    выйдет с ненулевым кодом, и systemd перезапустит процесс в обычном режиме с ботом."""
    database.init_db()
    app = (Application.builder()
           .token(TELEGRAM_TOKEN)
           .request(_telegram_httpx_request())
           .get_updates_request(_telegram_httpx_request(for_updates=True))
           .build())  # без initialize/get_me
    await webhook_server.start_webhook_server(app)
    logger.warning("DEGRADED: webhook/REST :8080 поднят БЕЗ Telegram — кабинет/панель работают. Жду восстановления прокси…")
    while not await asyncio.to_thread(_telegram_reachable, 8.0, 1):
        await asyncio.sleep(30)
    logger.info("✅ Telegram-прокси снова доступен — выходим для рестарта в обычном режиме")


def main():
    # ── Устойчивость к падению Telegram-прокси (урок аварии 2026-06-26) ──────
    # Если на старте Telegram недоступен через прокси (авария ЦОДа/прокси), НЕ уходим
    # в крэш-луп, который роняет ВЕСЬ процесс — а с ним кабинет клиента и владельческую
    # панель. Вместо этого поднимаем только webhook/REST и ждём прокси; затем выходим с
    # ненулевым кодом → systemd перезапустит в обычном режиме. Рабочий путь (прокси жив)
    # не меняется: проба проходит за один быстрый запрос, и дальше всё как раньше.
    if PROXY_URL and not _telegram_reachable():
        logger.error("⚠️ Telegram недоступен через прокси на старте — поднимаю кабинет/панель в degraded-режиме (бот ждёт прокси)")
        try:
            asyncio.run(_serve_webhook_only_until_telegram_back())
        except Exception as _e:
            logger.error(f"degraded webhook-режим упал: {_e!r}")
        finally:
            import sys
            sys.exit(75)  # ненулевой код → systemd рестартит в обычном режиме

    builder = (Application.builder()
               .token(TELEGRAM_TOKEN)
               .request(_telegram_httpx_request())
               .get_updates_request(_telegram_httpx_request(for_updates=True))
               .post_init(post_init))
    # На сервере в РФ Telegram доступен только через прокси
    if PROXY_URL:
        logger.info("Подключение к Telegram через прокси")
    app = builder.build()

    # ── Глобальный гейт согласий ─────────────────────────────────────────
    # Срабатывает РАНЬШЕ всех остальных хендлеров (group=-1). Если у клиента
    # не подписано согласие на ПД или не сделан выбор по маркетингу — гейт
    # покажет нужный экран и остановит обработку апдейта.
    # Мастера, админы, /start, /privacy и кнопки самих согласий проходят без
    # проверки.
    app.add_handler(TypeHandler(Update, consent_gate), group=-1)

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("clear", cmd_clear))
    app.add_handler(CommandHandler("cancel", cmd_cancel))
    app.add_handler(CommandHandler("privacy", cmd_privacy))
    app.add_handler(CommandHandler("whats_new", cmd_whats_new))
    # Согласие на маркетинговые рассылки — отозвать / вернуть
    app.add_handler(CommandHandler("unsubscribe", cmd_unsubscribe))
    app.add_handler(CommandHandler("subscribe", cmd_subscribe))
    # Админ-панель с inline-кнопками всех команд
    app.add_handler(CommandHandler("admin", cmd_admin))
    # Команды мастеров (привязка к уведомлениям о новых записях)
    app.add_handler(CommandHandler("bind", cmd_bind))
    app.add_handler(CommandHandler("unbind", cmd_unbind))
    app.add_handler(CommandHandler("client", cmd_client))
    app.add_handler(CommandHandler("today", cmd_today))
    app.add_handler(CommandHandler("month", cmd_month))
    app.add_handler(CommandHandler("rashod", cmd_rashod))
    app.add_handler(CommandHandler("kassa", cmd_kassa))
    app.add_handler(CommandHandler("mute", cmd_mute))
    # Админская: переключение AI-провайдера на лету
    app.add_handler(CommandHandler("ai_provider", cmd_ai_provider))
    # Админская: запустить реактивацию вручную
    app.add_handler(CommandHandler("reactivation_now", cmd_reactivation_now))
    # Админская: запустить ДР-рассылку вручную
    app.add_handler(CommandHandler("birthday_now", cmd_birthday_now))
    # Админская: запустить цикл-напоминание вручную
    app.add_handler(CommandHandler("cycle_now", cmd_cycle_now))
    # Админская: выгрузка журнала согласий (ПД + фото) в CSV
    app.add_handler(CommandHandler("export_consents", cmd_export_consents))
    # Админская: сводка расхода на ИИ + аналитика советов
    app.add_handler(CommandHandler("ai_cost", cmd_ai_cost))
    app.add_handler(CommandHandler("stats_ai", cmd_stats_ai))
    # Админская: рассылка по клиентской базе
    app.add_handler(CommandHandler("broadcast", cmd_broadcast))
    # Админская: абонементы — статистика и ручной запуск sync/expire/renew
    app.add_handler(CommandHandler("subscriptions_now", cmd_subscriptions_now))
    app.add_handler(CommandHandler("subscriptions_stats", cmd_subscriptions_stats))
    # Админская: программа лояльности — статистика и ручной запуск начисления
    app.add_handler(CommandHandler("loyalty_now", cmd_loyalty_now))
    app.add_handler(CommandHandler("loyalty_stats", cmd_loyalty_stats))
    app.add_handler(CommandHandler("loyalty_backfill", cmd_loyalty_backfill))
    # Админская: статистика и ручной тик модуля сбора отзывов
    app.add_handler(CommandHandler("reviews_stats", cmd_reviews_stats))
    app.add_handler(CommandHandler("reviews_now", cmd_reviews_now))
    # Админская: lead-alerts (зависшие заявки)
    app.add_handler(CommandHandler("leads_stats", cmd_leads_stats))
    app.add_handler(CommandHandler("leads_now", cmd_leads_now))
    # Админская: атрибуция источников привлечения клиентов
    app.add_handler(CommandHandler("sources_stats", cmd_sources_stats))
    # Админская: миграция клиентов из YClients в бот
    app.add_handler(CommandHandler("migrate_help", cmd_migrate_help))
    app.add_handler(CommandHandler("migrate_qr",   cmd_migrate_qr))
    # Админская: дашборд владельца — все ключевые цифры за период
    app.add_handler(CommandHandler("dashboard", cmd_dashboard))
    # Админская: справочник команд (текст + PDF)
    app.add_handler(CommandHandler("help_admin", cmd_help_admin))
    app.add_handler(CommandHandler("admin_pdf", cmd_admin_pdf))
    # Админская: управление ролью «кассир» (право гасить баллы/сертификаты)
    app.add_handler(CommandHandler("cashiers", cmd_cashiers))
    app.add_handler(CommandHandler("cashier_grant", cmd_cashier_grant))
    app.add_handler(CommandHandler("cashier_revoke", cmd_cashier_revoke))
    # Админская: реферальная программа — статистика и ручной запуск резолвера
    app.add_handler(CommandHandler("referral_now", cmd_referral_now))
    app.add_handler(CommandHandler("referral_stats", cmd_referral_stats))
    # Админская: симуляция освободившегося слота для отладки
    app.add_handler(CommandHandler("freed_test", cmd_freed_test))
    app.add_handler(CallbackQueryHandler(handle_callback, pattern="^(pdn_|mkt_|booking_|contact_|gift_method_|cert_redeem_|pay_cash_|pay_card_|cancel_confirm_|cancel_rec_|react_|freed_|sub_|loy_|broadcast_|bcast_|bindnew_|empauth_|whatsnew_|master_unbind_|admin_|rev_|dossier_|dossierc_|vmood_)"))
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    asyncio.run(_run_polling_resilient(app))


if __name__ == "__main__":
    main()
