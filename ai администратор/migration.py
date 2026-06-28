"""
Помощь владельцу в переводе клиентов из YClients в наш Telegram-бот.

Два инструмента:

1. find_unbound_clients() — список «топ-клиентов YClients, у которых нет
   привязки к боту». Сортируется по LTV (sold_amount). Владелец видит,
   кого первым стоит уговорить переключиться.

2. build_qr_pdf() — PDF-листовка с QR-кодами для шопа:
      • для зеркал мастеров (по одному per мастеру)
      • для ресепшена
      • для печати на чеках
   QR ведёт на t.me/<bot>?start=qr_<метка>, метка попадает в /sources_stats.
"""
from __future__ import annotations

import io
import logging
from typing import Iterable

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import database
import pii_crypto
from config import BOT_USERNAME

logger = logging.getLogger(__name__)


# ─── Поиск клиентов, которых нет в боте ──────────────────────────────────

def _normalize_phone(phone: str | None) -> str:
    """Чистим телефон до цифр + ведущая 7. Нужно для HMAC-хеша."""
    if not phone:
        return ""
    digits = "".join(c for c in str(phone) if c.isdigit())
    if not digits:
        return ""
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    elif not digits.startswith("7") and len(digits) == 10:
        digits = "7" + digits
    return digits


def find_unbound_clients(yc, limit: int = 50) -> list[dict]:
    """
    Возвращает топ-N клиентов YClients, у которых нет привязки к нашему боту.
    Сортировка — по LTV (sold_amount) убыванию.

    Каждая запись: {
      "yc_id", "name", "phone", "visits_count", "sold_amount",
      "last_visit_date", "phone_masked"
    }
    """
    try:
        all_clients = yc.list_all_clients()
    except Exception as e:
        logger.error(f"migration.find_unbound_clients: yc err: {e}")
        return []

    if not all_clients:
        return []

    # Достаём из локальной БД множество phone_hash'ей клиентов, у которых уже
    # есть привязка к Telegram. Сравнение через HMAC-хеш — без расшифровки.
    bound_hashes = set()
    with database._db() as conn:
        rows = conn.execute(
            "SELECT phone_hash FROM clients "
            "WHERE telegram_chat_id IS NOT NULL AND phone_hash IS NOT NULL"
        ).fetchall()
        bound_hashes = {r["phone_hash"] for r in rows if r["phone_hash"]}

    unbound: list[dict] = []
    for c in all_clients:
        phone_norm = _normalize_phone(c.get("phone"))
        if not phone_norm:
            continue
        ph_hash = pii_crypto.hash_phone(phone_norm)
        if ph_hash in bound_hashes:
            continue
        # Маскируем телефон для безопасного показа в чате админа:
        # +7 (962) ⋯-67-47 — открываем код и последние 4 цифры
        if len(phone_norm) == 11:
            masked = f"+7 ({phone_norm[1:4]}) ⋯-{phone_norm[7:9]}-{phone_norm[9:11]}"
        else:
            masked = phone_norm
        unbound.append({
            "yc_id":           c.get("id"),
            "name":            (c.get("name") or "").strip() or "—",
            "phone":           phone_norm,
            "phone_masked":    masked,
            "visits_count":    int(c.get("visits_count") or 0),
            "sold_amount":     int(c.get("sold_amount") or 0),
            "last_visit_date": (c.get("last_visit_date") or "")[:10],
        })

    # Сортировка по убыванию LTV, потом по visits_count
    unbound.sort(key=lambda x: (-x["sold_amount"], -x["visits_count"]))
    return unbound[:limit]


# ─── PDF с QR-кодами для шопа ────────────────────────────────────────────

import os

_FONT_PATHS = {
    "Cormorant":         "/Library/Fonts/CormorantGaramond-Light.ttf",
    "Cormorant-Italic":  "/Library/Fonts/CormorantGaramond-LightItalic.ttf",
    "Cormorant-Reg":     "/Library/Fonts/CormorantGaramond-Regular.ttf",
    "Mont-Light":        os.path.expanduser("~/Library/Fonts/Montserrat-Light.otf"),
    "Mont-Med":          os.path.expanduser("~/Library/Fonts/Montserrat-Medium.otf"),
}
# Если CormorantGaramond / Montserrat не найдены (например, на сервере Linux),
# подцепляем DejaVu Sans и используем его для всех ключей.
_FALLBACKS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]

_FONTS_REGISTERED = False
_FONT_NAME_MAP: dict[str, str] = {}


def _register_fonts():
    """Регистрирует наши шрифты в reportlab + раздаёт fallback'и для ключей."""
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    # Сначала пробуем зашитые
    for key, path in _FONT_PATHS.items():
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(key, path))
                _FONT_NAME_MAP[key] = key
            except Exception:
                pass
    # Фоллбэк один на всех
    fallback_name = None
    for p in _FALLBACKS:
        if os.path.exists(p):
            try:
                pdfmetrics.registerFont(TTFont("Fallback", p))
                fallback_name = "Fallback"
                break
            except Exception:
                continue
    if fallback_name is None:
        fallback_name = "Helvetica"
    # Для тех ключей, у которых не получилось зарегистрировать настоящий
    # шрифт — назначаем фоллбэк, чтобы _fontname возвращал что-то рабочее.
    for key in _FONT_PATHS:
        _FONT_NAME_MAP.setdefault(key, fallback_name)
    _FONTS_REGISTERED = True


# Палитра — как в bot_commands.pdf / bot_features.pdf
C_BG       = HexColor("#F5F0EB")
C_INK      = HexColor("#1A1714")
C_INK_DIM  = HexColor("#5A5550")
C_INK_FAINT= HexColor("#9A938A")
C_LINE     = HexColor("#C9C1B5")


def _fontname(key: str, default: str = "Helvetica") -> str:
    """Возвращает имя зарегистрированного шрифта или fallback по карте."""
    return _FONT_NAME_MAP.get(key, default)


def _make_qr_png(data: str, size_px: int = 600) -> bytes:
    """Чёрный QR на белом, ECC=H (можно повредить часть — всё равно считается)."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1A1714", back_color="#F5F0EB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


def _bot_link(payload: str) -> str:
    return f"https://t.me/{BOT_USERNAME}?start={payload}"


def _label(c, x, y, text, size=8, color=C_INK_DIM, tracking=0.28):
    """Маленький uppercase-ярлык в стиле сайта."""
    c.setFillColor(color)
    f = _fontname("Mont-Med")
    c.setFont(f, size)
    extra = size * tracking
    cursor = x
    for ch in text.upper():
        c.drawString(cursor, y, ch)
        cursor += c.stringWidth(ch, f, size) + extra


def _draw_qr_card(c, x, y, w, h, *, payload: str, title: str, subtitle: str,
                  hint: str):
    """Карточка с QR-кодом, заголовком, инструкцией. (x,y) = bottom-left."""
    # Рамка
    c.setStrokeColor(C_LINE)
    c.setLineWidth(0.6)
    c.roundRect(x, y, w, h, 5 * mm, fill=0, stroke=1)

    # QR — слева, крупный
    qr_size = min(h - 16 * mm, 55 * mm)
    qr_x = x + 8 * mm
    qr_y = y + (h - qr_size) / 2
    png = _make_qr_png(_bot_link(payload))
    c.drawImage(
        ImageReader(io.BytesIO(png)), qr_x, qr_y, qr_size, qr_size,
        mask="auto",
    )

    # Текст — справа
    text_x = qr_x + qr_size + 6 * mm
    text_w = w - (text_x - x) - 6 * mm

    _label(c, text_x, y + h - 10 * mm, subtitle, size=7,
           color=C_INK_FAINT, tracking=0.3)

    # Большой заголовок Cormorant Italic
    c.setFillColor(C_INK)
    c.setFont(_fontname("Cormorant-Italic"), 22)
    c.drawString(text_x, y + h - 18 * mm, title)

    # Инструкция Montserrat Light
    c.setFillColor(C_INK_DIM)
    c.setFont(_fontname("Mont-Light"), 9.5)
    text_y = y + h - 28 * mm
    for line in _wrap(c, hint, _fontname("Mont-Light"), 9.5, text_w):
        c.drawString(text_x, text_y, line)
        text_y -= 4.6 * mm


def _wrap(c, text, font, size, max_w):
    c.setFont(font, size)
    words = text.split()
    if not words:
        return [""]
    lines, cur = [], words[0]
    for w in words[1:]:
        test = cur + " " + w
        if c.stringWidth(test, font, size) <= max_w:
            cur = test
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


# ─── Главная точка входа ─────────────────────────────────────────────────

# Каждая карточка — отдельный QR со своей меткой источника.
# payload — то, что окажется в /start payload и попадёт в /sources_stats.
QR_PRESETS = [
    {
        "payload":  "qr_mirror",
        "title":    "Запишись через бот",
        "subtitle": "У зеркала мастера",
        "hint": (
            "Сосканируй камерой телефона. "
            "MAYA поможет выбрать время, мастера и услугу — "
            "не нужно звонить, всё в Telegram."
        ),
    },
    {
        "payload":  "qr_check",
        "title":    "Записаться повторно",
        "subtitle": "Печать на чеке",
        "hint": (
            "Спасибо за визит. Подпишись на бота — будем напоминать "
            "о следующей стрижке и начислять кэшбэк баллами."
        ),
    },
    {
        "payload":  "qr_reception",
        "title":    "Наш AI-администратор",
        "subtitle": "Ресепшен",
        "hint": (
            "MAYA в Telegram запишет тебя на стрижку быстрее, чем по телефону. "
            "Сосканируй — попробуй."
        ),
    },
    {
        "payload":  "migration",
        "title":    "Перейти в бот",
        "subtitle": "Для текущих клиентов",
        "hint": (
            "Если вы уже наш клиент — перевяжите ваши визиты к боту. "
            "После сканирования бот узнает вас по номеру телефона."
        ),
    },
]


def build_qr_pdf(out_path: str = "qr_codes_for_shop.pdf") -> str:
    """
    Собирает PDF на A4 с N карточек по одной на странице.
    Каждая карточка содержит QR + заголовок + инструкцию.
    Возвращает путь к собранному файлу.
    """
    _register_fonts()
    page_w, page_h = A4
    c = canvas.Canvas(out_path, pagesize=A4)
    c.setTitle("Мужская Эстетика — QR-коды для шопа")
    c.setAuthor("Мужская Эстетика")

    for preset in QR_PRESETS:
        # Кремовый фон
        c.setFillColor(C_BG)
        c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

        # Верхний ярлычок
        _label(c, 20 * mm, page_h - 22 * mm, "Мужская Эстетика", size=7,
               color=C_INK_FAINT)
        c.setStrokeColor(C_LINE)
        c.setLineWidth(0.4)
        c.line(20 * mm, page_h - 25 * mm, page_w - 20 * mm, page_h - 25 * mm)

        # Карточка по центру страницы
        card_w = 170 * mm
        card_h = 80 * mm
        card_x = (page_w - card_w) / 2
        card_y = (page_h - card_h) / 2
        _draw_qr_card(
            c, card_x, card_y, card_w, card_h,
            payload=preset["payload"],
            title=preset["title"],
            subtitle=preset["subtitle"],
            hint=preset["hint"],
        )

        # Подпись внизу — link на бота + payload
        c.setFillColor(C_INK_FAINT)
        c.setFont(_fontname("Mont-Light"), 8)
        c.drawCentredString(
            page_w / 2, 20 * mm,
            f"t.me/{BOT_USERNAME}?start={preset['payload']}",
        )
        # Иконка нижняя — метка источника, чтобы вы понимали, какой это лист
        _label(
            c, 20 * mm, 15 * mm,
            f"Источник: {preset['payload']}",
            size=7, color=C_INK_FAINT,
        )

        c.showPage()

    c.save()
    return out_path
