"""
Генерация двусторонних PDF подарочных сертификатов с премиум-дизайном.

Структура PDF:
  Страница 1 — ЛИЦЕВАЯ сторона (cert_assets/cert_{amount}_front.png)
               Статичная подложка с логотипом и номиналом — ничего не накладываем.
  Страница 2 — ОБРАТНАЯ сторона (cert_assets/cert_{amount}_back.png)
               Подложка + поверх программно накладываем:
                 • QR-код (deep-link `t.me/<bot>?start=redeem_<код>`) — в большой
                   квадрат-плейсхолдер справа.
                 • Код активации (MEC-NNNN-XXXXXX) — в бокс «КОД АКТИВАЦИИ» слева.
                 • Порядковый номер «№ NNNN · XXXX» — справа внизу.

Если PNG-подложек нет (например, dev-режим без cert_assets/) — fallback на
минималистичный текстовый дизайн, который раньше был основным.

Координаты QR/кода/номера заданы как доли от размеров карты, поэтому работают
при любом размере страницы. Дизайнерские PNG имеют формат 4800×2880 (соотношение
5:3), под него выбран и формат PDF-страницы 100×60 мм — достаточно для
просмотра на телефоне и для печати.
"""
from __future__ import annotations

import io
import os
from datetime import datetime

import qrcode
from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A6
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ── Конфигурация ──────────────────────────────────────────────────────────

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "cert_assets")

# Размер карты для премиум-дизайна (PNG 4800×2880 → 5:3)
CARD_WIDTH = 100 * mm
CARD_HEIGHT = 60 * mm

# Координаты накладываемых элементов на ОБРАТНОЙ стороне.
# Все значения — доли от ширины/высоты страницы. Y отсчитывается СНИЗУ
# (как принято в PDF/reportlab). Калиброваны под PNG-подложки 4800×2880.
QR_CX_FRAC = 0.770      # x-центр QR — центр плейсхолдера (плейсхолдер: x=0.62..0.92)
QR_CY_FRAC = 0.415      # y-центр QR от низа (плейсхолдер: y_top=0.33..0.84 → центр y_bot=0.415)
QR_SIZE_FRAC = 0.335    # сторона QR — точно покрывает плейсхолдер с лёгким перекрытием рамок

CODE_TEXT_CX_FRAC = 0.275  # x-центр строки кода (центр бокса: (0.05+0.50)/2)
CODE_TEXT_Y_FRAC = 0.305   # y базовой линии — внутри пустого бокса под надписью «КОД АКТИВАЦИИ»
CODE_TEXT_FONT_SIZE = 11   # моноширинный шрифт; 11pt даёт ~40мм, бокс ~45мм — с отступами

# Имя получателя на ЛИЦЕВОЙ стороне (стиль эмбоссинга кредитки).
# Печатается в нижней левой части — там, где на кредитной карте обычно
# выдавлено имя владельца. Всё в верхнем регистре, моноширинный шрифт —
# даёт тот самый «банковский» tabular-look.
NAME_X_FRAC = 0.075       # x левого края имени
NAME_Y_FRAC = 0.115       # y базовой линии (от низа) — чуть ниже, ближе к краю
NAME_FONT_SIZE = 8        # размер — компактнее, как на кредитной карте
NAME_CHAR_SPACE = 0.6     # лёгкая разрядка (mono уже даёт визуальные отступы)
NAME_MAX_CHARS = 26       # лимит длины — длиннее обрезаем

# Логотип |M| — позиции на лицевой и обратной сторонах. В исходных подложках
# логотип нарисован с искажёнными пропорциями (M вытянут вертикально), поэтому
# поверх него рисуем векторный, корректно пропорциональный (см. _draw_m_logo).
# Координаты — нижний-левый угол квадратного логотипа в долях карты.
# Размер квадрата — в долях ширины карты (равен размеру по высоте в мм).
LOGO_FRONT_X_FRAC = 0.060   # x нижнего-левого угла лицевого лого
LOGO_FRONT_Y_FRAC = 0.784   # y нижнего-левого угла лого = 1 - 0.216 (где низ в image coords)
LOGO_FRONT_SIZE_FRAC = 0.075  # размер в долях ширины карты (~7.5мм)

LOGO_BACK_X_FRAC = 0.873    # x нижнего-левого угла обратного лого
LOGO_BACK_Y_FRAC = 0.815    # y нижнего-левого угла = 1 - 0.185
LOGO_BACK_SIZE_FRAC = 0.0675  # размер в долях ширины карты (~6.75мм)

# Чтобы не раздувать итоговый PDF, исходные 4800×2880 PNG пережимаются до
# этой ширины (высота пересчитывается пропорционально). 1800px достаточно
# для чёткого отображения на retina-экране телефона.
TARGET_PNG_WIDTH = 1800

# Кэш пережатых подложек: amount -> (front_jpg_bytes, back_jpg_bytes)
_BG_CACHE: dict[int, tuple[bytes, bytes]] = {}


# ── Шрифты ────────────────────────────────────────────────────────────────

_FONT_CANDIDATES_REGULAR = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]
_FONT_CANDIDATES_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]
_FONT_CANDIDATES_MONO = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Courier.ttc",
]


def _register_fonts() -> tuple[str, str, str]:
    """Регистрирует шрифты. Возвращает (regular, bold, mono)."""
    regular = "Helvetica"
    bold = "Helvetica-Bold"
    mono = "Courier-Bold"
    for path in _FONT_CANDIDATES_REGULAR:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("CertBody", path))
                regular = "CertBody"
                break
            except Exception:
                continue
    for path in _FONT_CANDIDATES_BOLD:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("CertBody-Bold", path))
                bold = "CertBody-Bold"
                break
            except Exception:
                continue
    for path in _FONT_CANDIDATES_MONO:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("CertMono", path))
                mono = "CertMono"
                break
            except Exception:
                continue
    return regular, bold, mono


FONT_REGULAR, FONT_BOLD, FONT_MONO = _register_fonts()


# ── Утилиты ──────────────────────────────────────────────────────────────

_LOGO_IMG_PATH = os.path.join(ASSETS_DIR, "m_logo.png")
_LOGO_IMG_CACHE: ImageReader | None = None


def _get_logo_image() -> ImageReader | None:
    """Возвращает кешированный ImageReader логотипа |M|, либо None если файла нет."""
    global _LOGO_IMG_CACHE
    if _LOGO_IMG_CACHE is None and os.path.exists(_LOGO_IMG_PATH):
        _LOGO_IMG_CACHE = ImageReader(_LOGO_IMG_PATH)
    return _LOGO_IMG_CACHE


def _draw_m_logo(c, x: float, y: float, size: float):
    """
    Размещает эталонный логотип |M| (квадратный PNG) поверх искажённого
    логотипа из подложки.

    x, y — НИЖНИЙ-ЛЕВЫЙ угол квадрата (user units = points).
    size — сторона квадрата.

    Использует cert_assets/m_logo.png — это эталонный логотип 1:1, который
    закроет вытянутый M в исходных PNG-подложках.
    """
    logo = _get_logo_image()
    if logo is None:
        return  # файла нет — просто не накладываем (старый M останется виден)
    c.drawImage(logo, x, y, size, size, preserveAspectRatio=True, mask="auto")


def _qr_image(payload: str) -> ImageReader:
    """QR-код высокой надёжности (ERROR_CORRECT_H) — переживёт логотип в центре."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _format_amount(amount: int) -> str:
    """1234567 → '1 234 567'."""
    return f"{amount:,}".replace(",", " ")


def _format_expires(iso_str: str) -> str:
    try:
        return datetime.fromisoformat(iso_str).strftime("%d.%m.%Y")
    except Exception:
        return iso_str


def _load_background(amount: int) -> tuple[ImageReader, ImageReader] | None:
    """
    Загружает и пережимает PNG-подложки для указанного номинала.
    Кэширует результат — пережатие тяжёлое (~14 МБ → ~200 КБ на JPEG).
    Возвращает (front_reader, back_reader) либо None, если файлов нет.
    """
    if amount in _BG_CACHE:
        front_bytes, back_bytes = _BG_CACHE[amount]
        return ImageReader(io.BytesIO(front_bytes)), ImageReader(io.BytesIO(back_bytes))

    front_path = os.path.join(ASSETS_DIR, f"cert_{amount}_front.png")
    back_path = os.path.join(ASSETS_DIR, f"cert_{amount}_back.png")
    if not (os.path.exists(front_path) and os.path.exists(back_path)):
        return None

    def _shrink(path: str) -> bytes:
        im = Image.open(path).convert("RGB")
        w, h = im.size
        if w > TARGET_PNG_WIDTH:
            new_w = TARGET_PNG_WIDTH
            new_h = int(h * (new_w / w))
            im = im.resize((new_w, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=88, optimize=True)
        return buf.getvalue()

    front_bytes = _shrink(front_path)
    back_bytes = _shrink(back_path)
    _BG_CACHE[amount] = (front_bytes, back_bytes)
    return ImageReader(io.BytesIO(front_bytes)), ImageReader(io.BytesIO(back_bytes))


def _cert_serial(code: str, amount: int) -> str:
    """
    Из 'MEC-2000-X7K9P2' формируем '№ 2000 · X7K9P2' — короткий
    идентификатор, который читается на сертификате.
    """
    parts = code.split("-")
    suffix = parts[-1] if len(parts) >= 3 else code
    return f"№ {amount} · {suffix}"


# ── Главная функция ──────────────────────────────────────────────────────

def generate_cert_pdf(
    code: str,
    amount: int,
    expires_at: str,
    recipient_name: str | None = None,
    bot_username: str = "malesthetic_bot",
) -> bytes:
    """
    Создаёт PDF подарочного сертификата.
      • Если в cert_assets/ есть PNG-подложки на нужный номинал — собирает
        двусторонний премиум-дизайн.
      • Иначе — fallback на минималистичный однопейджовый шаблон.
    """
    bg = _load_background(amount)
    if bg is not None:
        return _generate_premium_pdf(bg, code, amount, expires_at,
                                     recipient_name, bot_username)
    return _generate_fallback_pdf(code, amount, expires_at,
                                  recipient_name, bot_username)


def _generate_premium_pdf(
    bg: tuple[ImageReader, ImageReader],
    code: str,
    amount: int,
    expires_at: str,
    recipient_name: str | None,
    bot_username: str,
) -> bytes:
    """Двусторонний дизайн на основе кастомных PNG."""
    front_bg, back_bg = bg
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(CARD_WIDTH, CARD_HEIGHT))

    # ─── Страница 1: ЛИЦЕВАЯ ───
    c.drawImage(front_bg, 0, 0, CARD_WIDTH, CARD_HEIGHT,
                preserveAspectRatio=False, mask="auto")

    # Поверх старого, искажённого M в подложке — рисуем правильный логотип
    # (в подложке M вытянут вертикально, у нашего — мат. правильные пропорции).
    _draw_m_logo(
        c,
        LOGO_FRONT_X_FRAC * CARD_WIDTH,
        LOGO_FRONT_Y_FRAC * CARD_HEIGHT,
        LOGO_FRONT_SIZE_FRAC * CARD_WIDTH,
    )

    # Имя получателя в стиле эмбоссинга банковской карты — внизу слева.
    # В верхнем регистре, с разрядкой букв (как «JOHN DOE» на кредитке).
    # setCharSpace доступен только через textObject, не напрямую на canvas.
    if recipient_name:
        name = recipient_name.strip().upper()
        if len(name) > NAME_MAX_CHARS:
            name = name[:NAME_MAX_CHARS - 1] + "…"
        text = c.beginText(NAME_X_FRAC * CARD_WIDTH, NAME_Y_FRAC * CARD_HEIGHT)
        text.setFillColor(HexColor("#1C1C1E"))
        text.setFont(FONT_MONO, NAME_FONT_SIZE)
        text.setCharSpace(NAME_CHAR_SPACE)
        text.textOut(name)
        c.drawText(text)
    c.showPage()

    # ─── Страница 2: ОБРАТНАЯ ───
    c.drawImage(back_bg, 0, 0, CARD_WIDTH, CARD_HEIGHT,
                preserveAspectRatio=False, mask="auto")

    # Правильный логотип поверх искажённого
    _draw_m_logo(
        c,
        LOGO_BACK_X_FRAC * CARD_WIDTH,
        LOGO_BACK_Y_FRAC * CARD_HEIGHT,
        LOGO_BACK_SIZE_FRAC * CARD_WIDTH,
    )

    # QR-код в правой части
    qr_size = QR_SIZE_FRAC * CARD_WIDTH
    qr_x = QR_CX_FRAC * CARD_WIDTH - qr_size / 2
    qr_y = QR_CY_FRAC * CARD_HEIGHT - qr_size / 2
    qr_payload = f"https://t.me/{bot_username}?start=redeem_{code}"
    c.drawImage(_qr_image(qr_payload), qr_x, qr_y, qr_size, qr_size,
                preserveAspectRatio=True, mask="auto")

    # Код активации (моноширинный, центрируем в пустом боксе на подложке).
    # Серийный номер «№ NNNN · XXXX» уже зашит в дизайн подложки — поэтому
    # отдельно его НЕ накладываем. Имя получателя и срок действия клиент
    # видит в подписи к Telegram-сообщению с сертификатом — на самой карте
    # их не дублируем, чтобы не нагромождать дизайн.
    c.setFillColor(HexColor("#1C1C1E"))
    c.setFont(FONT_MONO, CODE_TEXT_FONT_SIZE)
    c.drawCentredString(
        CODE_TEXT_CX_FRAC * CARD_WIDTH,
        CODE_TEXT_Y_FRAC * CARD_HEIGHT,
        code,
    )

    c.showPage()
    c.save()
    return buf.getvalue()


def _generate_fallback_pdf(
    code: str,
    amount: int,
    expires_at: str,
    recipient_name: str | None,
    bot_username: str,
) -> bytes:
    """
    Простой однопейджовый сертификат A6 — используется, если PNG-подложки
    не найдены. Сохранён для dev-окружения и на случай проблем с assets.
    """
    width, height = A6
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A6)

    c.setFillColor(HexColor("#F5F3F0"))
    c.rect(0, 0, width, height, fill=1, stroke=0)

    c.setFillColor(HexColor("#1C1C1E"))
    c.rect(0, height - 22 * mm, width, 22 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#F5F3F0"))
    c.setFont(FONT_BOLD, 13)
    c.drawCentredString(width / 2, height - 11 * mm, "МУЖСКАЯ ЭСТЕТИКА")
    c.setFont(FONT_REGULAR, 7)
    c.drawCentredString(width / 2, height - 17 * mm, "Барбершоп  ·  Ставрополь")

    c.setFillColor(HexColor("#1C1C1E"))
    c.setFont(FONT_BOLD, 15)
    c.drawCentredString(width / 2, height - 36 * mm, "Подарочный сертификат")

    c.setFont(FONT_BOLD, 34)
    c.setFillColor(HexColor("#0A7D2C"))
    c.drawCentredString(width / 2, height - 60 * mm, f"{_format_amount(amount)} ₽")

    if recipient_name:
        c.setFillColor(HexColor("#3A3A3C"))
        c.setFont(FONT_REGULAR, 10)
        c.drawCentredString(width / 2, height - 72 * mm, f"Кому: {recipient_name}")

    c.setFillColor(HexColor("#3A3A3C"))
    c.setFont(FONT_REGULAR, 9)
    c.drawCentredString(width / 2, height - 82 * mm,
                        f"Действителен до: {_format_expires(expires_at)}")

    c.setFont(FONT_REGULAR, 7)
    c.setFillColor(HexColor("#8A8A8E"))
    c.drawString(8 * mm, 12 * mm, "Код:")
    c.setFont(FONT_BOLD, 8)
    c.setFillColor(HexColor("#3A3A3C"))
    c.drawString(8 * mm, 8 * mm, code)

    qr_size = 30 * mm
    qr_x = width - qr_size - 8 * mm
    qr_y = 6 * mm
    c.drawImage(_qr_image(f"https://t.me/{bot_username}?start=redeem_{code}"),
                qr_x, qr_y, qr_size, qr_size)
    c.setFont(FONT_REGULAR, 6)
    c.setFillColor(HexColor("#8A8A8E"))
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 3 * mm,
                        "Покажите QR администратору")

    c.showPage()
    c.save()
    return buf.getvalue()
