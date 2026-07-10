"""
Программа лояльности — баллы за визиты.

Параметры (зашиты тут):
  • Кэшбэк: 5% от суммы услуг визита (после фактических скидок).
  • 1 балл = 1 рубль скидки.
  • Тратить можно ТОЛЬКО на услуги-уходы (CARE_SERVICES).
  • Сгорают: через 12 месяцев с момента последнего визита (если клиент не
    приходил год — баланс обнуляется при следующей ротации).
  • НЕ начисляем за визиты, которые целиком покрыты активным абонементом
    — иначе двойная выгода.

Списание сделано по аналогии с подарочными сертификатами:
  • Клиент в боте: «🪙 Баллы» → «Использовать на услугу» → выбирает услугу-уход.
  • Бот генерирует одноразовый код LOY-XXXXXX, действует 14 дней.
  • Мастер/админ открывает deep-link /start loy_LOY-XXXXXX → подтверждает
    погашение → баллы списываются окончательно, услуга оформляется как
    «оплачено баллами» в кассе.

Идемпотентность: начисление за один и тот же визит дважды не делаем
(уникальный индекс (client_id, visit_record_id, type='earn') в БД).
"""
from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, BadRequest
from telegram.ext import Application

import requests

import database
import subscriptions
from config import YCLIENTS_COMPANY_ID, YCLIENTS_PARTNER_TOKEN, YCLIENTS_USER_TOKEN
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

_yc = YClientsAPI()

CASHBACK_PCT = 5
# Welcome-бонус из истории трат (LTV backfill) ОТКЛЮЧЁН (решение Стаса 10.07):
# новым клиентам баллы копятся только с НОВЫХ визитов вперёд. Флаг оставлен для
# явности и на случай возврата. WELCOME_CAP — потолок, применён и ретроактивно.
BACKFILL_ENABLED = False
WELCOME_CAP = 1000
EXPIRY_MONTHS_NO_VISITS = 12
REDEEM_CODE_TTL_DAYS = 14

# Услуги-уходы, на которые можно тратить баллы. Сверка по lowercase title.
CARE_SERVICES: list[dict] = [
    {"title": "Spa для лица",                    "price": 1200, "emoji": "💆"},
    {"title": "Скраб+Черная маска",              "price": 800,  "emoji": "🧖"},
    {"title": "Уход за кожей головы",            "price": 500,  "emoji": "🧴"},
    {"title": "Восковая эпиляция (нос + уши)",   "price": 500,  "emoji": "👃"},
    {"title": "Массаж",                          "price": 400,  "emoji": "💪"},
    {"title": "Патчи",                           "price": 100,  "emoji": "👁"},
]
CARE_TITLES_LOWER = {s["title"].lower().strip() for s in CARE_SERVICES}


# ─── Утилиты ────────────────────────────────────────────────────────────

def _gen_token(length: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _parse_date_safe(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _visit_amount(booking: dict) -> int:
    """
    Сумма по визиту = ∑ реально оплаченная цена каждой услуги.
    Приоритет полей: cost (реально уплачено) > price > price_min.
    Если cost явно 0 (услуга оплачена баллами лояльности) — она НЕ
    участвует в кэшбэке. Это защищает от двойного начисления.
    """
    total = 0
    for s in (booking.get("services") or []):
        if not isinstance(s, dict):
            continue
        cost = s.get("cost")
        if cost is not None:
            # cost явно задан (включая 0 — значит оплачено баллами/скидкой)
            try:
                total += int(cost)
            except (TypeError, ValueError):
                pass
            continue
        # cost не задан — fallback на прайсовую
        p = s.get("price") or s.get("price_min") or 0
        try:
            total += int(p)
        except (TypeError, ValueError):
            pass
    return total


def _visit_covered_by_subscription(
    booking: dict, subs: list[dict],
) -> bool:
    """
    True если визит «оплачен» абонементом: попадает в окно действия,
    содержит услугу из плана, и тир мастера совместим с тиром подписки.
    """
    v_date = _parse_date_safe(booking.get("date") or booking.get("datetime"))
    if not v_date:
        return False
    titles = [
        s["title"].lower().strip()
        for s in (booking.get("services") or [])
        if isinstance(s, dict) and s.get("title")
    ]
    staff = booking.get("staff") or {}
    master_tier = subscriptions._master_tier_by_id(staff.get("id"))
    for sub in subs:
        try:
            started = datetime.fromisoformat(sub["started_at"]).date()
            expires = datetime.fromisoformat(sub["expires_at"]).date()
        except Exception:
            continue
        if not (started <= v_date <= expires):
            continue
        plan = subscriptions.get_plan(sub["plan_code"])
        if not plan:
            continue
        included_lower = {s.lower().strip() for s in plan.get("services_included", [])}
        if not any(t in included_lower for t in titles):
            continue
        sub_tier = (sub.get("tier") or "top").lower()
        if subscriptions.visit_counts_for_tier(master_tier, sub_tier):
            return True
    return False


# ─── Начисление ─────────────────────────────────────────────────────────

async def run_earning_job(app: Application | None = None) -> dict:
    """
    Раз в день: проходит по клиентам с привязанным Telegram, забирает
    их визиты за последние 90 дней (для устойчивости к запоздавшему
    подтверждению), начисляет 5% за каждый attended визит, ещё не
    зачисленный, кроме покрытых абонементом.
    """
    today = date.today()
    cutoff = today - timedelta(days=90)
    summary = {"clients": 0, "earned_points": 0, "skipped_sub": 0, "errors": 0}

    for client in database.list_telegram_clients():
        try:
            phone = client.get("phone")
            client_id = client["id"]
            if not phone:
                continue
            summary["clients"] += 1

            bookings = _yc.get_client_bookings(phone) or []
            # Все активные/expired подписки клиента — для проверки покрытия
            client_subs = database.list_subscriptions_for_client_ever(client_id)

            for b in bookings:
                if not isinstance(b, dict):
                    continue
                if not (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
                    continue
                v_date = _parse_date_safe(b.get("date") or b.get("datetime"))
                if not v_date or v_date < cutoff:
                    continue
                record_id = b.get("id") or b.get("record_id")
                if not record_id:
                    continue
                # Идемпотентность: уже начисляли за этот визит?
                if database.loyalty_already_earned_for_record(client_id, int(record_id)):
                    continue
                # Покрыт абонементом? — баллы не начисляем
                if _visit_covered_by_subscription(b, client_subs):
                    summary["skipped_sub"] += 1
                    continue
                amount = _visit_amount(b)
                if amount <= 0:
                    continue
                points = round(amount * CASHBACK_PCT / 100)
                if points <= 0:
                    continue
                database.add_loyalty_transaction(
                    client_id=client_id, type_="earn",
                    points=points, visit_record_id=int(record_id),
                    note=f"+{points} за визит {v_date.isoformat()} (сумма {amount} ₽)",
                )
                summary["earned_points"] += points
        except Exception as e:
            summary["errors"] += 1
            logger.error(f"loyalty earn for client_id={client.get('id')}: {e}")

    logger.info(f"🪙 Loyalty earn: {summary}")
    return summary


# ─── Сгорание ──────────────────────────────────────────────────────────

def get_launch_date() -> date:
    """
    Дата запуска программы лояльности. Сохраняется в settings в момент
    первого вызова — раньше неё ничего сгореть не может (grace period).
    """
    raw = database.get_setting("loyalty_launched_at")
    if not raw:
        now_iso = datetime.now().isoformat(timespec="seconds")
        database.set_setting("loyalty_launched_at", now_iso)
        return datetime.now().date()
    try:
        return datetime.fromisoformat(raw).date()
    except Exception:
        return date.today()


async def run_expiry_job(app: Application | None = None) -> dict:
    """
    Сгорание: если у клиента не было ни одного посещённого визита за
    последние 12 месяцев — обнуляем его положительный баланс
    «expire»-транзакцией.

    Защита от «сгорания на старте»: пока с момента launch_date не прошло
    EXPIRY_MONTHS_NO_VISITS, ничего не сгораем. Это даёт grace period
    клиентам, которым мы зачислили welcome-баллы за прошлую историю.
    """
    today = date.today()
    launch = get_launch_date()
    grace_until = launch + timedelta(days=EXPIRY_MONTHS_NO_VISITS * 30)
    if today < grace_until:
        logger.info(
            f"🪙 Loyalty expiry: grace period активен до {grace_until} — "
            f"ничего не сгораем"
        )
        return {"checked": 0, "expired_clients": 0, "expired_points": 0,
                "errors": 0, "in_grace_period": True}

    cutoff = today - timedelta(days=EXPIRY_MONTHS_NO_VISITS * 30)
    summary = {"checked": 0, "expired_clients": 0, "expired_points": 0, "errors": 0}

    for client in database.list_telegram_clients():
        try:
            client_id = client["id"]
            balance = database.loyalty_balance(client_id)
            if balance <= 0:
                continue
            summary["checked"] += 1

            phone = client.get("phone")
            if not phone:
                continue
            bookings = _yc.get_client_bookings(phone) or []
            last_visit = None
            for b in bookings:
                if not isinstance(b, dict):
                    continue
                if not (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
                    continue
                d = _parse_date_safe(b.get("date") or b.get("datetime"))
                if d and (last_visit is None or d > last_visit):
                    last_visit = d
            if last_visit and last_visit >= cutoff:
                continue  # был визит в последние 12 мес — не сгораем
            # Списываем весь баланс expire-транзакцией
            database.add_loyalty_transaction(
                client_id=client_id, type_="expire",
                points=-balance, visit_record_id=None,
                note=f"-{balance} (12 мес без визитов)",
            )
            summary["expired_clients"] += 1
            summary["expired_points"] += balance
        except Exception as e:
            summary["errors"] += 1
            logger.error(f"loyalty expire for client_id={client.get('id')}: {e}")

    logger.info(f"🪙 Loyalty expiry: {summary}")
    return summary


async def run_loyalty_job(app: Application | None = None) -> dict:
    """Совмещённый daily job — начисление + сгорание."""
    earn = await run_earning_job(app)
    exp = await run_expiry_job(app)
    return {"earn": earn, "expire": exp}


# ─── Backfill: welcome-баллы из истории клиентов YClients ─────────────────

def _yc_search_sold_amount(phone: str) -> int | None:
    """
    Спрашивает у YClients суммарную выручку (sold_amount) по клиенту с этим
    телефоном. Возвращает int рубли или None.
    """
    url = (
        f"https://api.yclients.com/api/v1/company/"
        f"{YCLIENTS_COMPANY_ID}/clients/search"
    )
    headers = {
        "Accept": "application/vnd.api.v2+json",
        "Content-Type": "application/json",
        "Authorization": (
            f"Bearer {YCLIENTS_PARTNER_TOKEN}, User {YCLIENTS_USER_TOKEN}"
        ),
    }
    body = {
        "fields": ["id", "name", "phone", "sold_amount", "visits_count"],
        "filters": [{"type": "quick_search", "state": {"value": phone}}],
    }
    try:
        r = requests.post(url, json=body, headers=headers, timeout=15)
        if r.status_code != 200:
            return None
        data = r.json() or {}
        items = data.get("data") or []
        if not items:
            return None
        # quick_search нечёткий и при пустом/коротком значении вернёт ЧУЖИХ
        # клиентов. Берём ТОЛЬКО клиента с точным совпадением номера (последние
        # 10 цифр) — иначе начислили бы welcome-баллы с чужого LTV.
        want = "".join(ch for ch in (phone or "") if ch.isdigit())
        if len(want) < 10:
            return None
        for it in items:
            got = "".join(ch for ch in (it.get("phone") or "") if ch.isdigit())
            if got and got[-10:] == want[-10:]:
                return int(it.get("sold_amount") or 0)
        return None
    except Exception as e:
        logger.error(f"_yc_search_sold_amount {phone[-4:]}: {e}")
        return None


def apply_redemption_for_booking(*, client_id: int, record_id: int,
                                   service_titles: list[str]) -> dict:
    """
    Списывает баллы по списку услуг-уходов, прицепляя транзакции к record_id.
    Дополнительно отмечает в YClients-записи: обнуляет стоимость услуги +
    дописывает комментарий «🪙 <услуга> оплачено баллами».

    При отмене записи (webhook record.delete) → возвращаем через refund_for_record.
    Идемпотентно: если для (client_id, record_id, service) уже есть redeem —
    повторно не списываем.
    """
    care_lookup = {c["title"].lower(): c for c in CARE_SERVICES}
    items: list[dict] = []
    total = 0
    for title in service_titles:
        c = care_lookup.get((title or "").lower().strip())
        if not c:
            continue
        if database.loyalty_redemption_exists(client_id, record_id, c["title"]):
            continue
        # 1) Списание в нашей БД
        database.add_loyalty_transaction(
            client_id=client_id, type_="redeem", points=-c["price"],
            visit_record_id=record_id,
            note=f"-{c['price']} списано за {c['title']} в записи {record_id}",
        )
        # 2) Пометка в YClients — обнуляем cost + дописываем comment. Если
        # не получится (сетевая ошибка) — не откатываем списание; админ
        # увидит баллы в нашем боте, а в YClients поправит руками.
        try:
            yc_result = _yc.mark_record_loyalty_redemption(
                record_id=record_id,
                service_title=c["title"],
                points=c["price"],
            )
            if not yc_result.get("success"):
                logger.warning(
                    f"🪙 redemption: списали баллы, но YClients-метка не "
                    f"проставилась для record_id={record_id} ({c['title']}): "
                    f"{yc_result.get('error')}"
                )
            elif not yc_result.get("matched_service"):
                logger.info(
                    f"🪙 redemption: услуга {c['title']!r} не найдена в записи "
                    f"{record_id}, добавил только комментарий"
                )
        except Exception as e:
            logger.error(f"YClients-метка для record_id={record_id}: {e}")
        items.append({"service": c["title"], "points": c["price"]})
        total += c["price"]
    remaining = database.loyalty_balance(client_id)
    logger.info(
        f"🪙 redemption: client_id={client_id} record_id={record_id} "
        f"items={items} total={total} remaining={remaining}"
    )
    return {"items": items, "total_points": total, "remaining": remaining}


def refund_for_cancelled_record(record_id: int) -> dict:
    """
    Возвращает баллы по отменённой записи: ищет все redeem-транзакции с
    этим visit_record_id и компенсирует положительными refund-транзакциями.
    Идемпотентно (если уже рефанд был — больше не делаем).
    """
    rows = database.loyalty_redemptions_for_record(record_id)
    refunded = 0
    for r in rows:
        # r["points"] отрицательное (списание). Возвращаем тот же модуль.
        pts = abs(int(r["points"]))
        if pts <= 0:
            continue
        if database.loyalty_refund_exists(r["client_id"], record_id):
            continue
        database.add_loyalty_transaction(
            client_id=r["client_id"], type_="refund", points=pts,
            visit_record_id=record_id,
            note=f"+{pts} возврат за отменённую запись {record_id}",
        )
        refunded += pts
    if refunded:
        logger.info(f"🪙 refund: record_id={record_id} возвращено {refunded} баллов")
    return {"refunded": refunded}


def lazy_backfill_for_client(client_id: int, phone: str) -> dict | None:
    """
    «Ленивый» backfill для одного клиента — вызывается, когда клиент
    впервые сообщает свой телефон через бот (после оформления первой
    записи). Возвращает {"points": N, "sold_amount": X} если что-то
    начислили, или None если backfill уже был / нечего начислять.

    Идемпотентно: повторные вызовы не дают второй порции.
    """
    if not BACKFILL_ENABLED:
        return None  # welcome из истории отключён — только новые визиты
    if not phone:
        return None
    if database.client_has_loyalty_backfill(client_id):
        return None
    # тот же человек под другим client_id (второй способ входа) — не дублируем
    if database.loyalty_backfill_exists_for_phone(phone):
        logger.info(f"🪙 Lazy backfill пропущен: по номеру *{phone[-4:]} welcome уже выдан (другой client_id={client_id})")
        return None
    # Фиксируем launch_date если ещё не зафиксирована
    get_launch_date()

    spent = _yc_search_sold_amount(phone)
    if spent is None or spent <= 0:
        return None
    points = round(spent * CASHBACK_PCT / 100)
    if points <= 0:
        return None
    database.add_loyalty_transaction(
        client_id=client_id, type_="backfill",
        points=points, visit_record_id=None,
        note=f"+{points} welcome-бонус: 5% от LTV {spent} ₽ (ленивый backfill)",
    )
    logger.info(
        f"🪙 Lazy backfill: client_id={client_id} получил {points} баллов "
        f"(LTV {spent} ₽)"
    )
    return {"points": points, "sold_amount": spent}


async def run_backfill_job() -> dict:
    """
    Одноразовое начисление welcome-баллов всем существующим клиентам:
    5% от суммы их трат в YClients (sold_amount). Идемпотентно: повторный
    запуск не выдаёт второй раз тем, у кого уже есть backfill-транзакция.

    Также фиксирует дату запуска программы (если ещё не зафиксирована).
    """
    if not BACKFILL_ENABLED:
        logger.info("run_backfill_job пропущен: BACKFILL_ENABLED=False")
        return {"skipped": True, "reason": "backfill_disabled"}
    # Зафиксируем launch_date — после backfill clock «сгорания» начнёт идти
    get_launch_date()

    summary = {
        "clients_total": 0, "backfilled": 0, "already_done": 0,
        "no_phone": 0, "no_data_yc": 0, "zero_spent": 0,
        "total_points": 0, "errors": 0,
    }

    for client in database.list_telegram_clients():
        try:
            client_id = client["id"]
            phone = client.get("phone")
            summary["clients_total"] += 1

            if not phone:
                summary["no_phone"] += 1
                continue
            if database.client_has_loyalty_backfill(client_id):
                summary["already_done"] += 1
                continue

            spent = _yc_search_sold_amount(phone)
            if spent is None:
                summary["no_data_yc"] += 1
                continue
            if spent <= 0:
                summary["zero_spent"] += 1
                continue

            points = round(spent * CASHBACK_PCT / 100)
            if points <= 0:
                summary["zero_spent"] += 1
                continue

            database.add_loyalty_transaction(
                client_id=client_id, type_="backfill",
                points=points, visit_record_id=None,
                note=f"+{points} welcome-бонус: 5% от LTV {spent} ₽",
            )
            summary["backfilled"] += 1
            summary["total_points"] += points
        except Exception as e:
            summary["errors"] += 1
            logger.error(f"loyalty backfill client_id={client.get('id')}: {e}")

    logger.info(f"🪙 Loyalty backfill: {summary}")
    return summary


# ─── UI: карточка с балансом и услугами ─────────────────────────────────

def build_balance_card(client_id: int) -> tuple[str, InlineKeyboardMarkup]:
    balance = database.loyalty_balance(client_id)

    lines = [
        "🪙 *Баллы лояльности*",
        "",
        f"Твой баланс: *{balance} баллов* (1 балл = 1 ₽)",
        "",
        f"С каждого визита — *{CASHBACK_PCT}%* кэшбэка. Баллы не "
        f"начисляются на визиты по абонементу (защита от двойной выгоды).",
        "",
        "*Тратятся на любой уход:*",
    ]
    for c in CARE_SERVICES:
        mark = "✅" if balance >= c["price"] else "🔒"
        line = f"  {mark} {c['emoji']} {c['title']} — _{c['price']} ₽_"
        if balance < c["price"]:
            need = c["price"] - balance
            line += f"  _(не хватает {need})_"
        lines.append(line)
    lines.append("")
    lines.append(
        "🤝 *Как потратить:* при записи через «✂️ Записаться» MAYA сама "
        "предложит оплатить уход баллами — просто скажи «да». Если "
        "пришёл в салон без записи через бот — жми кнопку ниже, получишь "
        "разовый код для администратора."
    )
    lines.append(
        "_За один визит баллами можно списать только одну услугу — "
        "выбирай самую ценную для тебя._"
    )

    # Кнопки списания через код — fallback, если клиент уже в салоне
    buttons: list[list[InlineKeyboardButton]] = []
    for c in CARE_SERVICES:
        if balance >= c["price"]:
            buttons.append([InlineKeyboardButton(
                f"📟 Код на {c['emoji']} {c['title']}",
                callback_data=f"loy_redeem_{c['title']}"[:64],
            )])
    if not buttons:
        return "\n".join(lines), InlineKeyboardMarkup([
            [InlineKeyboardButton(
                "✂️ Записаться (накопить баллы)",
                callback_data="loy_close_book",
            )],
        ])
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


# ─── Генерация и погашение кодов ────────────────────────────────────────

def generate_redeem_code(client_id: int, service_title: str) -> dict:
    """
    Создаёт одноразовый код погашения. Проверяет баланс и срок:
    баллы холдируются (НЕ списываются) до момента подтверждения админом.
    """
    care = next(
        (c for c in CARE_SERVICES if c["title"].lower() == service_title.lower()),
        None,
    )
    if not care:
        return {"ok": False, "reason": "не уход"}
    balance = database.loyalty_balance(client_id)
    if balance < care["price"]:
        return {"ok": False, "reason": f"не хватает баллов: нужно {care['price']}, есть {balance}"}

    # Уникальный код
    for _ in range(8):
        code = "LOY-" + _gen_token(6)
        if database.loyalty_code_is_free(code):
            break
    else:
        return {"ok": False, "reason": "не сгенерили уникальный код"}

    expires_at = (datetime.now() + timedelta(days=REDEEM_CODE_TTL_DAYS)).isoformat(
        timespec="seconds"
    )
    database.create_loyalty_code(
        code=code, client_id=client_id,
        service_title=care["title"], points=care["price"],
        expires_at=expires_at,
    )
    return {"ok": True, "code": code, "expires_at": expires_at,
            "service_title": care["title"], "points": care["price"]}


def consume_redeem_code(code: str, admin_user_id: int) -> dict:
    """
    Погашение кода админом/кассиром. Списывает баллы с клиента, помечает код
    как использованный. Если у клиента есть актуальная запись с этой услугой
    — дополнительно отметит её в YClients (cost=0 + comment).
    Идемпотентно.
    """
    row = database.get_loyalty_code(code)
    if not row:
        return {"ok": False, "reason": "код не найден"}
    if row.get("used_at"):
        return {"ok": False, "reason": "код уже погашен", "used_at": row["used_at"]}
    try:
        if datetime.fromisoformat(row["expires_at"]) < datetime.now():
            return {"ok": False, "reason": "срок действия истёк"}
    except Exception:
        pass
    client_id = row["client_id"]
    points = row["points"]
    service_title = row["service_title"]
    balance = database.loyalty_balance(client_id)
    if balance < points:
        return {"ok": False, "reason": f"у клиента не хватает баллов: нужно {points}, есть {balance}"}

    # Попробуем найти актуальную запись клиента с этой услугой и пометить её
    # в YClients. Если не получится — просто спишем баллы без YClients-метки
    # (админ увидит, кассир оформит вручную).
    yc_record_id: int | None = None
    yc_marked = False
    try:
        client = database.get_client_by_id(client_id)
        phone = client.get("phone") if client else None
        if phone:
            bookings = _yc.get_client_bookings(phone) or []
            today_str = date.today().isoformat()
            target_lower = service_title.lower().strip()
            # ищем ближайшую запись «сегодня или будущее, не посещена», содержит услугу
            for b in sorted(bookings, key=lambda b: (b or {}).get("datetime") or ""):
                if not isinstance(b, dict):
                    continue
                if b.get("attendance") == 1:
                    continue
                dt = (b.get("date") or b.get("datetime") or "")[:10]
                if dt < today_str:
                    continue
                titles_lower = [
                    (s.get("title") or "").lower().strip()
                    for s in (b.get("services") or []) if isinstance(s, dict)
                ]
                if target_lower in titles_lower:
                    yc_record_id = b.get("id") or b.get("record_id")
                    break
    except Exception as e:
        logger.error(f"consume_redeem_code: поиск записи: {e}")

    # Атомарно застолбить код ДО списания баллов — два параллельных погашения
    # одного кода (двойной тап кассира / два кассира) не должны списать дважды.
    # claim_loyalty_code сам помечает used_at; отдельный mark_*_used не нужен.
    if not database.claim_loyalty_code(code, admin_user_id):
        return {"ok": False, "reason": "код уже погашен"}

    database.add_loyalty_transaction(
        client_id=client_id, type_="redeem", points=-points,
        visit_record_id=yc_record_id,
        note=f"-{points} погашение кода {code} ({service_title})",
    )

    if yc_record_id:
        try:
            yc_res = _yc.mark_record_loyalty_redemption(
                record_id=yc_record_id,
                service_title=service_title,
                points=points,
            )
            yc_marked = bool(yc_res.get("success"))
        except Exception as e:
            logger.error(f"consume_redeem_code: YClients-метка: {e}")

    return {
        "ok": True, "client_id": client_id, "points": points,
        "service_title": service_title,
        "yc_record_id": yc_record_id,
        "yc_marked": yc_marked,
    }
