"""
Поздравление клиентов с днём рождения + промокод -20%.

Запускается ежедневно в 10:30 МСК. Сканирует всех клиентов, у которых
есть telegram_chat_id в нашей БД. По телефону достаёт `birth_date` из
YClients. Если у клиента сегодня ДР и промокод за этот год ещё не
отправляли — генерирует уникальный код BDAY-XXXXXX, действующий 7 дней,
и шлёт поздравление.

Применение промокода — пока ручное: клиент называет код мастеру, мастер
применяет скидку 20% в YClients. AI при записи проверяет активный код
клиента и напоминает: «У тебя ещё действует BDAY-X7K9P2, не забудь сказать».
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from telegram.error import Forbidden, BadRequest
from telegram.ext import Application

import database
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

# Сколько дней действует промокод
PROMO_VALID_DAYS = 7
PROMO_PERCENT = 20

_yc = YClientsAPI()


def _client_yclients_id(phone: str) -> int | None:
    """Находим YClients-client_id по телефону через историю записей."""
    try:
        bookings = _yc.get_client_bookings(phone)
    except Exception as e:
        logger.error(f"birthday: yc.get_client_bookings({phone}): {e}")
        return None
    for b in (bookings or []):
        if isinstance(b, dict):
            cid = (b.get("client") or {}).get("id")
            if cid:
                return int(cid)
    return None


def _is_today_birthday(birth_date_raw: str | None) -> bool:
    """birth_date в YClients — обычно 'YYYY-MM-DD' или 'DD.MM.YYYY'."""
    if not birth_date_raw:
        return False
    today = date.today()
    # Пробуем несколько форматов
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            d = datetime.strptime(birth_date_raw[:10], fmt).date()
            return d.month == today.month and d.day == today.day
        except Exception:
            continue
    return False


def _first_name(full: str | None) -> str:
    if not full:
        return "друг"
    return full.strip().split()[0]


async def run_birthday_job(app: Application) -> dict:
    """Главный entry. Запускается scheduler'ом."""
    today = date.today()
    year = today.year
    sent, errors, skipped = 0, 0, 0

    candidates = database.list_telegram_clients()
    logger.info(f"🎂 День рождения: сканирую {len(candidates)} клиентов")

    for client in candidates:
        chat_id = client.get("telegram_chat_id")
        phone = client.get("phone")
        if not chat_id or not phone:
            continue

        # 152-ФЗ + Закон о рекламе: только клиенты с маркетинговым согласием
        if not database.has_marketing_consent(client["id"]):
            skipped += 1
            continue

        # Защита от двойной отправки в один год
        if database.already_sent_birthday_this_year(client["id"], year):
            skipped += 1
            continue

        # Персональные настройки: ДР-промо выключаем только при явном False (дефолт ON).
        # Проверяем ДО YClients-вызовов и генерации промокода, чтобы не «сжечь» код года.
        if database.get_notify_prefs(client["id"]).get("birthday") is False:
            skipped += 1
            continue

        # Узнаём YClients-id клиента → достаём profile → birth_date
        yc_id = _client_yclients_id(phone)
        if not yc_id:
            continue
        try:
            yc_client = _yc.get_client(yc_id)
        except Exception as e:
            logger.error(f"birthday: get_client({yc_id}): {e}")
            errors += 1
            continue
        if not yc_client:
            continue

        if not _is_today_birthday(yc_client.get("birth_date")):
            continue

        # Генерим уникальный код (защита от коллизии)
        for _ in range(5):
            code = database.new_birthday_promo_code()
            try:
                expires_at = (today + timedelta(days=PROMO_VALID_DAYS)).isoformat()
                database.save_birthday_promo(
                    client_id=client["id"],
                    code=code,
                    percent=PROMO_PERCENT,
                    year=year,
                    expires_at=expires_at,
                )
                break
            except Exception as e:
                # UNIQUE collision — генерим заново
                if "UNIQUE" in str(e):
                    continue
                logger.error(f"birthday: save_promo: {e}")
                errors += 1
                code = None
                break
        if not code:
            errors += 1
            continue

        # Сообщение
        name = _first_name(client.get("name"))
        text = (
            f"🎂 *С днём рождения, {name}!*\n\n"
            f"От «Мужской Эстетики» — *скидка 20% на любую услугу* "
            f"в течение {PROMO_VALID_DAYS} дней.\n\n"
            f"Промокод: `{code}`\n"
            f"Действует до: {(today + timedelta(days=PROMO_VALID_DAYS)).strftime('%d.%m.%Y')}\n\n"
            f"Назови код мастеру при оплате, чтобы получить скидку. "
            f"Или запишись прямо сейчас — я напомню тебе про код, когда будем "
            f"оформлять.\n\n"
            f"Хорошего тебе дня и приходи постричься 💈"
        )

        try:
            await app.bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode="Markdown",
            )
            sent += 1
            logger.info(f"🎂 Поздравил {name} (chat_id={chat_id}, код={code})")
        except (Forbidden, BadRequest) as e:
            logger.info(f"🎂 Не доставлено {name} (chat_id={chat_id}): {e}")
            errors += 1
        except Exception as e:
            logger.error(f"🎂 Ошибка отправки {name}: {e}")
            errors += 1

    summary = {
        "candidates": len(candidates),
        "sent": sent,
        "skipped_already_sent": skipped,
        "errors": errors,
    }
    logger.info(f"🎂 День рождения завершено: {summary}")
    return summary
