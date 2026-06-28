"""
Атрибуция источника привлечения клиентов.

Идея:
  • Каждый /start с payload или без — это touchpoint.
  • Первый /start клиента (когда у него ещё нет first_source в БД) фиксирует
    source attribution по «first touch». Дальнейшие /start не меняют.
  • Источник определяется по payload (context.args[0] в Telegram):
      пусто           → "direct"           (клиент сам нашёл бота)
      ad_<метка>      → "ad:<метка>"       (Я.Директ, ВК-ads, любая реклама)
      qr_<метка>      → "qr:<метка>"       (QR в шопе, на чеке, листовке)
      ref_REF-XXXXXX  → "ref:REF-XXXXXX"   (реферал от другого клиента)
      gift_cert       → "site:gift_cert"   (с раздела сайта)
      book            → "app:book"         (с кнопки в Mini App)
      cabinet         → "app:cabinet"
      subscriptions   → "app:subscriptions"
      invite          → "app:invite"
      sub_*           → "app:subscriptions"
      migration       → "migration"        (перевод существующего клиента)
      redeem_*        → "service:redeem"   (админ погасил сертификат)
      loy_*           → "service:loyalty"  (админ списал баллы)
      другое          → "other:<payload>"

Use case для админа:
  /sources_stats — сводка за 30 дней по источникам с конверсией в запись.
"""
from __future__ import annotations

import logging

import database

logger = logging.getLogger(__name__)


# Кастомные mapping'и: ключ — точное совпадение payload-а или префикс.
# Сначала проверяем точные совпадения, потом префиксы.
_EXACT_MAP = {
    "":              "direct",
    "migration":     "migration",
    "gift_cert":     "site:gift_cert",
    "book":          "app:book",
    "cabinet":       "app:cabinet",
    "subscriptions": "app:subscriptions",
    "invite":        "app:invite",
    "cabinet_link":  "app:cabinet",
}

# Префикс → шаблон. {tail} = всё после префикса.
_PREFIX_MAP = [
    ("ad_",       "ad:{tail}"),
    ("qr_",       "qr:{tail}"),
    ("ref_",      "ref:{tail}"),
    ("sub_",      "app:subscriptions"),
    ("redeem_",   "service:redeem"),
    ("loy_",      "service:loyalty"),
]


def parse_payload_to_source(payload: str | None) -> str:
    """Превращает payload из /start в нормализованный source-код."""
    p = (payload or "").strip()
    if p in _EXACT_MAP:
        return _EXACT_MAP[p]
    for prefix, template in _PREFIX_MAP:
        if p.startswith(prefix):
            tail = p[len(prefix):]
            return template.format(tail=tail) if "{tail}" in template else template
    # Не распознали — оставляем как есть с префиксом other:
    return f"other:{p[:50]}"


def record_first_touch(client_id: int, payload: str | None) -> str | None:
    """
    Записывает источник в БД, если это первое касание клиента.
    Возвращает записанный source или None, если уже было записано раньше.
    """
    if not client_id:
        return None
    source = parse_payload_to_source(payload)
    try:
        recorded = database.record_first_source(client_id, source)
        if recorded:
            logger.info(
                f"sources: first_touch client_id={client_id} → {source}"
                + (f" (payload={payload!r})" if payload else "")
            )
            return source
    except Exception as e:
        logger.error(f"sources: record_first_source({client_id}): {e}")
    return None


# ─── Группировка для отчёта ──────────────────────────────────────────────

# Категория для display в /sources_stats — группируем сырые source-коды
# в человекочитаемые группы для аналитики.

_CATEGORY_ORDER = [
    ("ad",      "📣 Реклама"),
    ("qr",      "📱 QR-коды"),
    ("site",    "🌐 С сайта"),
    ("app",     "📲 Mini App"),
    ("ref",     "📨 Рефералы"),
    ("migration","🔄 Миграция из YClients"),
    ("direct",  "✨ Прямые /start"),
    ("service", "🛠 Служебные"),
    ("other",   "❓ Прочее"),
    ("unknown", "❔ Не указан"),
]


def categorize_source(source: str | None) -> tuple[str, str]:
    """Возвращает (category_key, category_label) для source-кода."""
    s = source or "unknown"
    if s == "direct":
        return "direct", "✨ Прямые /start"
    if s == "migration":
        return "migration", "🔄 Миграция из YClients"
    if s == "unknown":
        return "unknown", "❔ Не указан"
    if ":" in s:
        head = s.split(":", 1)[0]
        for key, label in _CATEGORY_ORDER:
            if key == head:
                return key, label
    return "other", "❓ Прочее"


def category_order_index(category_key: str) -> int:
    for i, (key, _) in enumerate(_CATEGORY_ORDER):
        if key == category_key:
            return i
    return len(_CATEGORY_ORDER)
