"""
Клиент ЮKassa REST API.

Используется для создания платежей за подарочные сертификаты и проверки их
статуса. В отличие от Telegram Payments через Provider Token, REST API даёт
доступ ко ВСЕМ способам оплаты, подключённым в магазине: банковская карта,
СБП, T-Pay, ЮMoney, SberPay и др.

Сценарий:
  1. create_payment() → возвращает payment_id и confirmation_url.
  2. Шлём клиенту кнопку с confirmation_url. Клиент жмёт → видит страницу
     ЮKassa со всеми способами оплаты → выбирает любой → платит.
  3. После успешной оплаты ЮKassa редиректит клиента на return_url.
  4. Параллельно фоновая задача в боте каждые несколько секунд проверяет
     get_payment_status() — как только статус "succeeded", выдаём сертификат.

Документация: https://yookassa.ru/developers/api
"""
from __future__ import annotations

import base64
import logging
import uuid

import httpx

from config import YUKASSA_SHOP_ID, YUKASSA_SECRET_KEY

logger = logging.getLogger(__name__)

API_URL = "https://api.yookassa.ru/v3"

# Код НДС для чека 54-ФЗ. 1 = «без НДС» (подходит для ИП на УСН и патенте,
# а у нас ИП Мосин С.Е.). Если магазин перейдёт на другую систему — поменять.
DEFAULT_VAT_CODE = 1


def _auth_header() -> str:
    """Basic auth: shop_id:secret_key в base64."""
    raw = f"{YUKASSA_SHOP_ID}:{YUKASSA_SECRET_KEY}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def _normalize_phone(phone: str) -> str:
    """+7 (999) 123-45-67 → 79991234567 (требование ЮKassa для чека)."""
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if digits.startswith("8"):
        digits = "7" + digits[1:]
    if not digits.startswith("7"):
        digits = "7" + digits
    return digits


async def create_payment(
    amount_rub: int,
    description: str,
    return_url: str,
    metadata: dict,
    customer_phone: str,
    idempotence_key: str | None = None,
    include_receipt: bool = True,
) -> dict:
    """
    Создаёт платёж в ЮKassa.

    Параметры:
      amount_rub   — сумма в рублях (целое число).
      description  — описание для клиента (видно на странице оплаты).
      return_url   — куда ЮKassa вернёт клиента после оплаты.
      metadata     — словарь любых служебных полей (cert_code, buyer_chat_id…).
      customer_phone — телефон плательщика (для чека 54-ФЗ).
      idempotence_key — ключ идемпотентности; если None — сгенерируем uuid4.
      include_receipt — слать ли чек 54-ФЗ. Должно быть True, если у магазина
                        включена услуга «Чеки от ЮKassa» (или подключена своя ОФД).
                        Если на магазине нет фискализации — выставить False
                        (но это нарушение 54-ФЗ для онлайн-продаж в РФ).

    Возвращает dict с ключами 'id', 'confirmation_url', 'status'.
    Поднимает httpx.HTTPStatusError при ошибке API.
    """
    if idempotence_key is None:
        idempotence_key = str(uuid.uuid4())

    payload: dict = {
        "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": description[:128],  # ЮKassa лимит 128 символов
        "metadata": {k: str(v) for k, v in metadata.items()},  # metadata только строки
    }

    if include_receipt:
        # Подарочный сертификат — это аванс под будущие услуги, поэтому
        # payment_subject = "payment" (аванс), payment_mode = "advance".
        # При фактическом оказании услуги в шопе будет пробит зачётный чек.
        payload["receipt"] = {
            "customer": {"phone": _normalize_phone(customer_phone)},
            "items": [{
                "description": description[:128],
                "quantity": "1.00",
                "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
                "vat_code": DEFAULT_VAT_CODE,
                "payment_subject": "payment",
                "payment_mode": "advance",
            }],
        }

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{API_URL}/payments",
            json=payload,
            headers={
                "Authorization": _auth_header(),
                "Idempotence-Key": idempotence_key,
                "Content-Type": "application/json",
            },
        )
    if r.status_code >= 400:
        logger.error(f"ЮKassa create_payment {r.status_code}: {r.text}")
    r.raise_for_status()
    data = r.json()
    return {
        "id": data["id"],
        "confirmation_url": data.get("confirmation", {}).get("confirmation_url"),
        "status": data["status"],
    }


async def get_payment_status(payment_id: str) -> dict:
    """
    Возвращает текущий статус платежа целиком (как dict из API).
    Главное поле — 'status': 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{API_URL}/payments/{payment_id}",
            headers={"Authorization": _auth_header()},
        )
    if r.status_code >= 400:
        logger.error(f"ЮKassa get_payment {payment_id} → {r.status_code}: {r.text}")
    r.raise_for_status()
    return r.json()
