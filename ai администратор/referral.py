"""
Реферальная программа.

Логика:
  1. У каждого клиента есть свой реферальный код REF-XXXXXX (генерится лениво
     при первом запросе ссылки «Пригласить друга»).
  2. Друг переходит по t.me/malesthetic_bot?start=ref_REF-XXXXXX, бот ловит
     payload, сохраняет привязку в таблице referrals (статус pending).
  3. Ежедневный фоновый job дёргает YClients и смотрит, был ли у каждого
     pending-реферала визит со статусом attendance=1 ПОСЛЕ joined_at. Если был —
     выдаём 2 промокода (рефереру и приведённому), оба −15% на 30 дней,
     присылаем пуш обоим.
  4. Антифрод:
       • Нельзя пригласить себя (один Telegram-аккаунт, один телефон).
       • Один реферал = одна награда. Повторные клики того же друга
         игнорируются. Один и тот же друг не приносит вторую награду.
       • Pending старше 60 дней → expired (закрываем, не блокируем будущие).

Что НЕ делаем (намеренно):
  • Не пытаемся проставить промокод в YClients-записи автоматически —
    клиент показывает код мастеру/админу, они его применяют. (Так же как
    с ДР-кодом сейчас.)
  • Не проверяем «не складывается с другими скидками» программно —
    это правило коммуницируем клиенту словами, дальше дисциплина админа.
"""
from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta
from urllib.parse import quote

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, BadRequest
from telegram.ext import Application

import database
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

_yc = YClientsAPI()

REFERRAL_DISCOUNT_PERCENT = 15
REFERRAL_CODE_TTL_DAYS = 30
REFERRAL_PENDING_TTL_DAYS = 60   # pending старше — переводим в expired


# ─── Генерация реферальных кодов ────────────────────────────────────────

def _gen_short_token(length: int = 6) -> str:
    """Короткий уникальный буквенно-цифровой токен (без похожих символов 0/O/I/1)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def get_or_create_ref_code(client_id: int) -> str:
    """Возвращает реферальный код клиента, создаёт при первом вызове."""
    existing = database.get_referral_code(client_id)
    if existing:
        return existing
    # Уникальный код. Пытаемся несколько раз на случай коллизии.
    for _ in range(10):
        token = "REF-" + _gen_short_token(6)
        if database.is_ref_code_free(token):
            database.create_ref_code(client_id, token)
            return token
    raise RuntimeError("Не получилось сгенерировать уникальный реферальный код")


def build_ref_link(code: str, bot_username: str) -> str:
    """t.me/<bot>?start=ref_REF-XXXXXX"""
    safe_bot = bot_username.lstrip("@")
    return f"https://t.me/{safe_bot}?start=ref_{code}"


def _first_name(full: str | None) -> str:
    if not full:
        return "друг"
    return full.strip().split()[0]


# ─── Обработка перехода по реферальной ссылке ───────────────────────────

def handle_referral_visit(referee_chat_id: int, code: str) -> dict:
    """
    Вызывается из cmd_start, когда payload начинается с 'ref_'.
    Возвращает {"status": "...", "referrer_name": "Сергей"} или {"status": "..."}.
    """
    code = code.strip().upper()
    if not code.startswith("REF-"):
        return {"status": "bad_code"}

    referrer_client = database.get_client_by_ref_code(code)
    if not referrer_client:
        return {"status": "code_not_found"}

    # Антифрод: переходящий по ссылке — это сам же реферер
    if referrer_client.get("telegram_chat_id") == referee_chat_id:
        return {"status": "self_referral_blocked"}

    # Если у friend'a уже есть pending/granted referral — игнорируем повторный заход
    existing = database.get_referral_for_referee(referee_chat_id)
    if existing:
        # Если он уже привязан к ТОМУ ЖЕ рефереру — просто молчим
        if existing.get("referrer_client_id") == referrer_client["id"]:
            return {"status": "already_attached"}
        # Если к другому — оставляем первоначального (кто первый встал, того и тапки)
        return {"status": "already_attached_to_other"}

    # Создаём pending referral
    database.create_referral(
        referrer_client_id=referrer_client["id"],
        referee_chat_id=referee_chat_id,
        code_used=code,
    )
    name = _first_name(referrer_client.get("name"))
    logger.info(
        f"referral: новая привязка — referee={referee_chat_id} → "
        f"referrer={referrer_client['id']} ({name}) по коду {code}"
    )
    return {"status": "ok", "referrer_name": name}


# ─── Резолвинг pending → granted (ежедневный фоновый job) ──────────────

async def _send_referral_rewards(
    app: Application,
    referrer: dict,
    referee: dict,
    referrer_code: str,
    referee_code: str,
) -> None:
    """Шлёт уведомления обоим участникам."""
    expires_h = (date.today() + timedelta(days=REFERRAL_CODE_TTL_DAYS)).strftime("%d.%m.%Y")

    # Сообщение рефереру
    referrer_name = _first_name(referrer.get("name"))
    referee_name = _first_name(referee.get("name")) if referee.get("name") else "твой друг"
    referrer_text = (
        f"🎉 *{referrer_name}, твоя реферальная награда!*\n\n"
        f"{referee_name} только что подстригся у нас — спасибо что привёл!\n\n"
        f"Твой промокод: `{referrer_code}`\n"
        f"Скидка: *−{REFERRAL_DISCOUNT_PERCENT}%* на следующий визит\n"
        f"Действует до: *{expires_h}*\n\n"
        f"_Промокод не складывается с другими акциями. Скажи его администратору при оплате._"
    )

    # Сообщение приведённому другу
    referee_text = (
        f"🎁 *Подарок от нас за первый визит!*\n\n"
        f"Промокод: `{referee_code}`\n"
        f"Скидка: *−{REFERRAL_DISCOUNT_PERCENT}%* на следующий визит\n"
        f"Действует до: *{expires_h}*\n\n"
        f"_Не складывается с другими акциями. Скажи код администратору при оплате._\n\n"
        f"Кстати, у тебя теперь тоже есть реферальная ссылка — приведи кого-нибудь "
        f"и оба получите бонус ✨"
    )

    for chat_id, text in (
        (referrer.get("telegram_chat_id"), referrer_text),
        (referee.get("telegram_chat_id"), referee_text),
    ):
        if not chat_id:
            continue
        try:
            await app.bot.send_message(chat_id, text, parse_mode="Markdown")
        except (Forbidden, BadRequest) as e:
            logger.info(f"referral reward → {chat_id}: {e}")
        except Exception as e:
            logger.error(f"referral reward → {chat_id}: {e}")


async def _check_referee_visited(referee_client: dict, joined_at: datetime) -> bool:
    """True, если у приведённого друга был ПОСЕЩЁННЫЙ визит после joined_at."""
    phone = referee_client.get("phone")
    if not phone:
        return False
    try:
        bookings = _yc.get_client_bookings(phone)
    except Exception as e:
        logger.error(f"referral: yc error for client_id={referee_client.get('id')}: {e}")
        return False
    joined_date = joined_at.date()
    for b in (bookings or []):
        if not isinstance(b, dict):
            continue
        if not (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
            continue
        raw = b.get("date") or b.get("datetime") or ""
        try:
            visit_date = datetime.strptime(raw[:10], "%Y-%m-%d").date()
        except Exception:
            continue
        if visit_date >= joined_date:
            return True
    return False


async def run_referral_resolver_job(app: Application) -> dict:
    """
    Ежедневный фоновый таск: проходит по pending-рефералам и проверяет,
    был ли первый визит. Если был — выдаём награды, если pending слишком
    старый — переводим в expired.
    """
    pending = database.list_pending_referrals()
    logger.info(f"🤝 Реферал-резолвер: {len(pending)} pending в очереди")

    granted = 0
    expired = 0
    self_blocked = 0
    skipped = 0
    errors = 0

    for ref in pending:
        try:
            ref_id = ref["id"]
            joined_at_str = ref.get("joined_at") or ""
            try:
                joined_at = datetime.fromisoformat(joined_at_str)
            except Exception:
                joined_at = datetime.now()

            # Pending старше N дней — закрываем
            if datetime.now() - joined_at > timedelta(days=REFERRAL_PENDING_TTL_DAYS):
                database.update_referral_status(ref_id, "expired")
                expired += 1
                continue

            # Резолвим referee_client_id, если ещё не привязан
            referee_chat_id = ref["referee_chat_id"]
            referee_client_id = ref.get("referee_client_id")
            if not referee_client_id:
                rec = database.get_client(referee_chat_id)
                if not rec:
                    skipped += 1
                    continue
                referee_client_id = rec["id"]
                database.set_referral_referee_client(ref_id, referee_client_id)

            # Достаём расшифрованные клиента
            referrer_client = database.get_client_by_id(ref["referrer_client_id"])
            referee_client = database.get_client_by_id(referee_client_id)
            if not referrer_client or not referee_client:
                skipped += 1
                continue

            # Антифрод по номеру телефона: реферер == приведённый
            if (referrer_client.get("phone") and
                    referrer_client.get("phone") == referee_client.get("phone")):
                database.update_referral_status(ref_id, "self_block")
                self_blocked += 1
                logger.info(
                    f"referral #{ref_id}: self-block (одинаковый телефон) — "
                    f"referrer_client_id={referrer_client['id']}"
                )
                continue

            # Проверяем визит
            visited = await _check_referee_visited(referee_client, joined_at)
            if not visited:
                skipped += 1
                continue

            # Готовим промокоды
            expires_at = (datetime.now() + timedelta(days=REFERRAL_CODE_TTL_DAYS)).isoformat(
                timespec="seconds"
            )
            referrer_code = "REF-R-" + _gen_short_token(5)
            referee_code = "REF-N-" + _gen_short_token(5)
            database.save_referral_promo(
                referral_id=ref_id, client_id=referrer_client["id"],
                code=referrer_code, kind="referrer",
                percent=REFERRAL_DISCOUNT_PERCENT, expires_at=expires_at,
            )
            database.save_referral_promo(
                referral_id=ref_id, client_id=referee_client["id"],
                code=referee_code, kind="referee",
                percent=REFERRAL_DISCOUNT_PERCENT, expires_at=expires_at,
            )
            database.update_referral_status(ref_id, "granted")
            await _send_referral_rewards(
                app, referrer_client, referee_client, referrer_code, referee_code
            )
            granted += 1
            logger.info(
                f"referral #{ref_id} granted: {referrer_client['id']} ← "
                f"{referee_client['id']}, коды {referrer_code} / {referee_code}"
            )
        except Exception as e:
            errors += 1
            logger.error(f"referral resolver error on row {ref.get('id')}: {e}")

    summary = {
        "pending": len(pending),
        "granted": granted,
        "self_blocked": self_blocked,
        "expired": expired,
        "skipped_no_visit_yet": skipped,
        "errors": errors,
    }
    logger.info(f"🤝 Реферал-резолвер завершён: {summary}")
    return summary


# ─── Вспомогательное для UI (вызывается из bot.py) ────────────────────

def build_referral_card(client_id: int, bot_username: str) -> tuple[str, InlineKeyboardMarkup]:
    """
    Готовит сообщение «вот твоя ссылка + статистика приглашений» для клиента.
    """
    code = get_or_create_ref_code(client_id)
    link = build_ref_link(code, bot_username)
    stats = database.referral_stats_for_client(client_id)

    text = (
        f"📨 *Пригласи друга — оба получите −{REFERRAL_DISCOUNT_PERCENT}%*\n\n"
        f"Перешли эту ссылку другу:\n`{link}`\n\n"
        f"Как это работает:\n"
        f"• Друг переходит по ссылке и записывается в боте\n"
        f"• После его первого визита тебе и ему придёт промокод\n"
        f"• Каждый промокод − {REFERRAL_DISCOUNT_PERCENT}% на следующий визит, "
        f"действует 30 дней\n\n"
    )
    if stats.get("granted") or stats.get("pending"):
        text += "📊 *Твоя статистика:*\n"
        if stats.get("granted"):
            text += f"• Приведено друзей: *{stats['granted']}* ✨\n"
        if stats.get("pending"):
            text += f"• Ждут первого визита: {stats['pending']}\n"
    else:
        text += "_Ты ещё никого не приглашал. Поделись ссылкой — у нас будет повод сказать спасибо ✨_"

    # Кнопка для нативного шаринга в Telegram. URL И text должны быть
    # URL-encoded — Telegram отвергает кнопки с сырой кириллицей/пробелами.
    share_text = (
        f"Постригись в «Мужской Эстетике» (Ставрополь) — "
        f"оба получим −{REFERRAL_DISCOUNT_PERCENT}% по моей ссылке ✂️"
    )
    share_url = (
        f"https://t.me/share/url?url={quote(link, safe='')}"
        f"&text={quote(share_text, safe='')}"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("📲 Поделиться ссылкой", url=share_url)],
    ])
    return text, kb
