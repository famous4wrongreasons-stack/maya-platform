# =============================================================================
#  config.example.py — БЕЗОПАСНЫЙ ШАБЛОН (создан 2026-06-17 при санации секретов)
# =============================================================================
#  Секреты больше НЕ в коде — читаются из переменных окружения (файл .env).
#  Этот файл МОЖНО коммитить (значений секретов в нём нет).
#
#  Как ввести в строй (после ротации ключей):
#    1) cp .env.example .env   &&  chmod 600 .env
#    2) впиши в .env НОВЫЕ (ротированные) ключи
#    3) на VPS: в systemd-юните бота добавь  EnvironmentFile=/home/botadmin/barbershop-bot/.env
#       (локально хватит python-dotenv — он подхватит .env автоматически, см. ниже)
#    4) замени рабочий config.py этим файлом:  mv config.example.py config.py
#    5) перезапусти сервисы и проверь, что бот/вебхук поднялись
#  Бизнес-константы (ID касс, мастера, тарифы) — НЕ секреты, оставлены в коде.
# =============================================================================

import os
from pathlib import Path

# Локально подхватываем .env рядом с этим файлом. На VPS переменные обычно
# приходят из systemd EnvironmentFile, поэтому dotenv не обязателен.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass


def _req(name: str) -> str:
    """Обязательный секрет: падаем сразу, если не задан (лучше, чем тихо работать без ключа)."""
    val = os.environ.get(name, "")
    if not val:
        raise RuntimeError(f"Не задана переменная окружения {name} — см. .env.example")
    return val


def _opt(name: str, default: str = "") -> str:
    """Необязательный секрет (например, выключённый канал)."""
    return os.environ.get(name, default)


# ── Telegram ──────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = _req("TELEGRAM_TOKEN")

# Прокси для Telegram и Claude (РФ их блокирует). "http://user:pass@host:port".
# Пусто — напрямую. Может содержать логин/пароль, поэтому тоже из окружения.
PROXY_URL = _opt("PROXY_URL", "")

# ── OpenAI — основной мозг MAYA/Telegram-бота ───────────────────────────────
OPENAI_API_KEY = _req("OPENAI_API_KEY")
OPENAI_BASE_URL = _opt("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_CHAT_MODEL = _opt("OPENAI_CHAT_MODEL", "gpt-5.5")
OPENAI_FAST_MODEL = _opt("OPENAI_FAST_MODEL", "gpt-5.4-mini")
# Голос клиентов: быстрый средний тир (латентность важнее максимальности на
# задаче записи). Владелец в голосе идёт на флагман (маршрутизация по роли).
OPENAI_VOICE_CHAT_MODEL = _opt("OPENAI_VOICE_CHAT_MODEL", "gpt-5.4")
REALTIME_VAD_EAGERNESS = _opt("REALTIME_VAD_EAGERNESS", "medium")

# ── Голос MAYA: OpenAI TTS по умолчанию, Yandex SpeechKit как внешний TTS ─────
VOICE_REPLIES_ENABLED = _opt("VOICE_REPLIES_ENABLED", "False").lower() in ("1", "true", "yes", "on", "y", "да")
VOICE_TTS_PROVIDER = _opt("VOICE_TTS_PROVIDER", "openai")  # "openai" | "yandex"
VOICE_TTS_FALLBACK_OPENAI = _opt("VOICE_TTS_FALLBACK_OPENAI", "False").lower() in ("1", "true", "yes", "on", "y", "да")
VOICE_TTS_MODEL = _opt("VOICE_TTS_MODEL", "gpt-4o-mini-tts")
VOICE_TTS_VOICE = _opt("VOICE_TTS_VOICE", "marin")
VOICE_TTS_SPEED = float(_opt("VOICE_TTS_SPEED", "1.0") or "1.0")
VOICE_TTS_PITCH = float(_opt("VOICE_TTS_PITCH", "1.0") or "1.0")
VOICE_TTS_INSTRUCTIONS = _opt(
    "VOICE_TTS_INSTRUCTIONS",
    "Говори по-русски естественно и спокойно, светлым женским голосом чуть выше среднего. "
    "Без иностранного акцента, без театральности, темп средний, дикция чёткая."
)
YANDEX_SPEECHKIT_API_KEY = _opt("YANDEX_SPEECHKIT_API_KEY", "")
YANDEX_SPEECHKIT_IAM_TOKEN = _opt("YANDEX_SPEECHKIT_IAM_TOKEN", "")
YANDEX_CLOUD_FOLDER_ID = _opt("YANDEX_CLOUD_FOLDER_ID", "")
YANDEX_SPEECHKIT_VOICE = _opt("YANDEX_SPEECHKIT_VOICE", "lera")
YANDEX_SPEECHKIT_ROLE = _opt("YANDEX_SPEECHKIT_ROLE", "friendly")
YANDEX_SPEECHKIT_SPEED = float(_opt("YANDEX_SPEECHKIT_SPEED", "1.0") or "1.0")
YANDEX_SPEECHKIT_PITCH_SHIFT = float(_opt("YANDEX_SPEECHKIT_PITCH_SHIFT", "0") or "0")
YANDEX_SPEECHKIT_MAX_CHARS = int(float(_opt("YANDEX_SPEECHKIT_MAX_CHARS", "240") or "240"))

# ── Claude (Anthropic) — альтернативный мозг MAYA (голос + чат) ──────────────
# AI_PROVIDER выбирает мозг для get_ai_response / get_ai_response_stream:
#   "openai" (по умолчанию) — тир gpt-5.x, текущий рабочий;
#   "claude" — Anthropic Sonnet (живее/человечнее, точный tool-use, как было ДО
#              миграции на OpenAI), НО требует АКТИВНОЙ Anthropic-организации на
#              CLAUDE_API_KEY. При отключённой организации Claude отвечает 400
#              «This organization has been disabled» на КАЖДЫЙ вызов — ставить
#              "claude" только с рабочим ключом Anthropic.
AI_PROVIDER = _opt("AI_PROVIDER", "openai")
CLAUDE_API_KEY = _opt("CLAUDE_API_KEY", "")
CLAUDE_MODEL = _opt("CLAUDE_MODEL", "claude-sonnet-4-5-20250929")
# Модель Claude для голоса (пусто = та же, что CLAUDE_MODEL).
CLAUDE_VOICE_MODEL = _opt("CLAUDE_VOICE_MODEL", "")

# ── YClients ────────────────────────────────────────────────────────────────
YCLIENTS_PARTNER_TOKEN = _req("YCLIENTS_PARTNER_TOKEN")
YCLIENTS_USER_TOKEN = _req("YCLIENTS_USER_TOKEN")
YCLIENTS_COMPANY_ID = 503759
YCLIENTS_BASE_URL = "https://api.yclients.com/api/v1"

# Активные мастера (ID из YClients) — не секрет
ACTIVE_MASTER_IDS = [1461615, 1461621, 3278920, 1461618, 1460233]

# ID касс YClients (GET /accounts/{company_id}) — не секрет
YCLIENTS_CASH_ACCOUNT_ID = 1016537      # «Основная касса»
YCLIENTS_CASHLESS_ACCOUNT_ID = 1016538  # «Расчётный счёт»

# ── Барбершоп (публичные данные) ─────────────────────────────────────────────
BARBERSHOP_NAME = "Мужская Эстетика"
BARBERSHOP_CITY = "Ставрополь"
BARBERSHOP_ADDRESS = "г. Ставрополь, ул. Лермонтова, 343"
BARBERSHOP_2GIS = "https://2gis.ru/stavropol/geo/70000001038177627"
BARBERSHOP_YANDEX = "https://yandex.com/maps/org/cuts_shaves/20695024342/"
BARBERSHOP_PHONE = "8-962-447-67-47"
BARBERSHOP_HOURS = "Пн–Вс: 10:00–21:00"

# Сайт и приложение (Punycode-домен для Telegram-кнопок) — не секрет
SITE_URL = "https://www.xn--80aaocmjdk0cclbf8l3a.xn--p1ai"        # www.мужскаяэстетика.рф
APP_URL  = "https://www.xn--80aaocmjdk0cclbf8l3a.xn--p1ai/app"    # www.мужскаяэстетика.рф/app

# ── VK ID (вход через ВКонтакте) ──────────────────────────────────────────────
VK_APP_ID = 54620400                       # публичный id приложения — не секрет
VK_SECURE_KEY = _opt("VK_SECURE_KEY", "")  # «Защищённый ключ» (client_secret) — СЕКРЕТ
VK_REDIRECT_URI = "https://malesthetic.pro/app/"
VK_LOGIN_ENABLED = False

# ── Yandex ID (вход через Яндекс) ─────────────────────────────────────────────
YANDEX_CLIENT_ID = _opt("YANDEX_CLIENT_ID", "")
YANDEX_CLIENT_SECRET = _opt("YANDEX_CLIENT_SECRET", "")
YANDEX_REDIRECT_URI = _opt("YANDEX_REDIRECT_URI", "https://malesthetic.pro/app/")
YANDEX_LOGIN_ENABLED = _opt("YANDEX_LOGIN_ENABLED", "False").lower() in ("1", "true", "yes", "on")
YANDEX_STAFF_CHAT_MAP = {}  # {"yandex_user_id": telegram_chat_id, "email@yandex.ru": telegram_chat_id}

# ── Расход: серверы и fal.ai (для /ai_cost и панели) — не секрет ───
SERVER_COSTS_RUB = {
    "Yandex Cloud (бот)": 2737,
    "Timeweb (прокси)":   1800,
    "Beget (сайт)":       1360,
}
FAL_COST_PER_IMAGE_USD = 0.15

# ── SMS.ru — вход по телефону (пусто = отключён) ──────────────────────────────
SMSRU_API_ID = _opt("SMSRU_API_ID", "")

# ── Админы и основатели (Telegram user_id) — не секрет ────────────────────────
INITIAL_ADMIN_IDS = [948205934, 339683535]
FOUNDER_IDS = [948205934]   # Стас

# Дефолтные «оплаты к продлению» для GOD-режима
GOD_DEFAULT_RENEWALS = [
    {"key": "srv_yandex",  "label": "Yandex Cloud (бот)",  "amount": 2737, "due_date": ""},
    {"key": "srv_timeweb", "label": "Timeweb (прокси)",    "amount": 1800, "due_date": ""},
    {"key": "srv_beget",   "label": "Beget (сайт)",        "amount": 1360, "due_date": ""},
    {"key": "domain",      "label": "Домен malesthetic.pro", "amount": 0,  "due_date": ""},
    {"key": "yclients",    "label": "Лицензия YClients",   "amount": 0,    "due_date": ""},
    {"key": "ai_topup",    "label": "Пополнение ИИ (Anthropic/OpenAI/fal)", "amount": 0, "due_date": ""},
]
GOD_RENEWAL_WARN_DAYS = 7
GOD_AI_BUDGET_USD = 50.0

# ── ЮKassa ────────────────────────────────────────────────────────────────────
YUKASSA_PROVIDER_TOKEN = _opt("YUKASSA_PROVIDER_TOKEN", "")  # Telegram Payments (legacy) — СЕКРЕТ
YUKASSA_SHOP_ID = "1365230"                                  # идентификатор магазина — не секрет
YUKASSA_SECRET_KEY = _opt("YUKASSA_SECRET_KEY", "")          # 'live_...' из ЛК ЮKassa — СЕКРЕТ (деньги!)

BOT_USERNAME = "malesthetic_bot"
REMINDER_MINUTES_BEFORE = 120

# Рейтинг салона на картах — Майя называет эти цифры, если спрашивают про
# рейтинг/отзывы. Оставь пустым, если не хочешь озвучивать конкретные числа
# (тогда Майя просто скажет «высокие оценки» и даст ссылки). Формат — как удобно
# произнести: "4.9 (более 300 отзывов)".
SALON_RATING_YANDEX = _opt("SALON_RATING_YANDEX", "")
SALON_RATING_2GIS = _opt("SALON_RATING_2GIS", "")

# ── Шифрование ПД (152-ФЗ, Fernet) ────────────────────────────────────────────
# ВНИМАНИЕ: смена этого ключа делает уже зашифрованные ПД нечитаемыми.
# Ротировать ТОЛЬКО с миграцией (перешифровать данные старым→новым ключом).
PII_ENCRYPTION_KEY = _req("PII_ENCRYPTION_KEY")
PII_RETENTION_MONTHS = 18

# ── Webhook от YClients ───────────────────────────────────────────────────────
WEBHOOK_SECRET = _req("WEBHOOK_SECRET")  # должен совпадать с PHP-прокси на Beget
WEBHOOK_PORT = 8080
# Адрес привязки HTTP-сервера. "0.0.0.0" — как сейчас; после HTTPS-реверс-прокси
# (nginx) на VPS поставь WEBHOOK_BIND="127.0.0.1" в .env и закрой 8080 фаерволом.
WEBHOOK_BIND = _opt("WEBHOOK_BIND", "0.0.0.0")

# ── AI-советы мастерам ────────────────────────────────────────────────────────
MASTERS_AI_PROVIDER = "openai"              # "claude" | "openai"
MASTERS_CLAUDE_MODEL = "claude-haiku-4-5"   # legacy/fallback
MASTERS_OPENAI_MODEL = _opt("MASTERS_OPENAI_MODEL", "gpt-5.4")
MASTERS_AI_TIMEOUT = 5.0
