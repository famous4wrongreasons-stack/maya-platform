"""
Абонементы: ежемесячная подписка на пакет визитов.

3 продукта:
  • haircut  — 2 × Мужская стрижка, 3700 ₽/мес
  • complex  — 2 × (Мужская стрижка + Моделирование бороды), 6000 ₽/мес
  • beard    — 2 × Моделирование бороды, 2100 ₽/мес

Логика:
  • Покупка через ЮKassa-инвойс. После succeeded — статус active,
    started_at = сегодня, expires_at = через 30 дней.
  • Визиты НЕ списываются «при бронировании». Списание идёт по факту
    посещения: ежедневный sync смотрит attendance=1 визиты YClients
    клиента в окне started_at..expires_at, считает совпадения с
    включёнными в план услугами → это и есть visits_used.
  • Неиспользованные сгорают: 30 дней прошло — статус expired.
  • За 3 дня до конца — push «Продлить?», 1 раз.
  • Никаких автосписаний с карты. Продление = новый инвойс.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, BadRequest
from telegram.ext import Application

import database
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

_yc = YClientsAPI()

SUBSCRIPTION_DURATION_DAYS = 30
RENEW_PUSH_DAYS_BEFORE = 3


# Фиксированный каталог. У каждого тарифа 2 уровня: «старший мастер» и «топ».
# services_included — точные названия из YClients-прайса.
PLANS: list[dict] = [
    {
        "code": "haircut",
        "title": "Стрижка",
        "emoji": "✂️",
        "visits_per_month": 2,
        "services_included": ["Мужская стрижка"],
        "description": (
            "2 мужские стрижки в месяц. Удобно для тех, кто стрижётся "
            "каждые 2 недели."
        ),
        "prices": {"senior": 3300, "top": 3700},
    },
    {
        "code": "complex",
        "title": "Комплекс",
        "emoji": "🎯",
        "visits_per_month": 2,
        "services_included": ["Мужская стрижка", "Моделирование бороды"],
        "description": (
            "2 раза в месяц: стрижка + моделирование бороды. "
            "Полный уход в одном пакете."
        ),
        "prices": {"senior": 5200, "top": 6000},
    },
    {
        "code": "beard",
        "title": "Борода",
        "emoji": "🧔",
        "visits_per_month": 2,
        "services_included": ["Моделирование бороды"],
        "description": (
            "2 раза в месяц — моделирование бороды. Для тех, кто отращивает "
            "и держит форму."
        ),
        "prices": {"senior": 1700, "top": 2100},
    },
]

# Уровни мастера определяются по полю specialization в YClients.
# «Руководитель» (Стас) приравнен к «Топ барберу» — по решению владельца.
TIER_TOP_KEYWORDS = ("топ", "руководитель")
TIER_SENIOR_KEYWORDS = ("старший",)

TIER_LABELS = {"senior": "Старший мастер", "top": "Топ-мастер"}


def get_plan(code: str) -> dict | None:
    for p in PLANS:
        if p["code"] == code:
            return p
    return None


def get_plan_price(plan: dict, tier: str) -> int:
    """Цена тарифа для конкретного уровня. По умолчанию top, если tier неизвестен."""
    return plan["prices"].get(tier, plan["prices"]["top"])


def detect_master_tier(specialization: str | None) -> str:
    """
    Определяет уровень мастера по строке specialization из YClients.
    «Старший барбер» → senior, «Топ барбер» / «Руководитель» → top.
    Если не распознали — defensive default 'top' (засчитываем визит щедрее
    для клиента, иначе будем спорить из-за нашей конфигурации).
    """
    s = (specialization or "").lower()
    if any(k in s for k in TIER_SENIOR_KEYWORDS):
        return "senior"
    if any(k in s for k in TIER_TOP_KEYWORDS):
        return "top"
    return "top"


def _master_tier_by_id(staff_id: int) -> str:
    """Кэширующий лукап тира мастера через yc.get_masters() (кэш 30 мин)."""
    if not staff_id:
        return "top"
    for m in (_yc.get_masters() or []):
        if m.get("id") == staff_id:
            return detect_master_tier(m.get("specialization"))
    return "top"


def get_regular_monthly_cost(plan: dict, tier: str) -> int | None:
    """
    Считает розничную цену пакета (без абонемента) у мастера выбранного тира:
    sum(прайс каждой услуги) × visits_per_month.

    Цены берём из YClients у первого мастера, чей specialization соответствует
    тиру. Возвращает None, если не нашли мастера или цены.
    """
    sample_master = None
    for m in (_yc.get_masters() or []):
        if detect_master_tier(m.get("specialization")) == tier:
            sample_master = m
            break
    if not sample_master:
        return None
    services = _yc.get_services(staff_id=sample_master["id"]) or []
    by_title = {
        s.get("title", "").lower().strip(): s
        for s in services if isinstance(s, dict) and s.get("title")
    }
    per_visit = 0
    for svc in plan.get("services_included", []):
        s = by_title.get(svc.lower().strip())
        if not s:
            return None
        price = s.get("price_min") or s.get("price")
        if not price:
            return None
        per_visit += int(price)
    return per_visit * plan["visits_per_month"]


def get_plan_savings(plan: dict, tier: str) -> dict | None:
    """
    Возвращает {regular, subscription, savings_rub, savings_pct} или None,
    если посчитать не удалось. savings отрицательным быть не должен (если есть —
    значит абонемент дороже розницы, и его показ как «выгоды» вообще не имеет
    смысла; возвращаем None в этом случае).
    """
    regular = get_regular_monthly_cost(plan, tier)
    if regular is None:
        return None
    price = get_plan_price(plan, tier)
    savings = regular - price
    if savings <= 0:
        return None
    pct = round(savings / regular * 100)
    return {
        "regular": regular,
        "subscription": price,
        "savings_rub": savings,
        "savings_pct": pct,
    }


def visit_counts_for_tier(visit_master_tier: str, subscription_tier: str) -> bool:
    """
    Визит к мастеру какого-то тира — засчитывается ли он в абонемент?

    • Абонемент Top:    зачитываются визиты к любым мастерам (top И senior).
    • Абонемент Senior: только к Senior. Визит к топ-мастеру не списывает
      визит абонемента — клиент платит ту запись полную цену сам.
    """
    if subscription_tier == "top":
        return True
    # subscription_tier == 'senior'
    return visit_master_tier == "senior"


# ─── Sync визитов: считаем фактическое использование ─────────────────────

def _parse_date_safe(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _count_visits_in_plan(bookings: list[dict], plan: dict, subscription_tier: str,
                          started_at: date, expires_at: date) -> int:
    """
    Считает реально посещённые визиты клиента, попадающие в окно действия
    подписки, содержащие хотя бы одну услугу из плана И соответствующие
    уровню подписки (subscription_tier).
    """
    included_lower = {s.lower().strip() for s in plan.get("services_included", [])}
    count = 0
    for b in (bookings or []):
        if not isinstance(b, dict):
            continue
        if not (b.get("attendance") == 1 or b.get("visit_attendance") == 1):
            continue
        v_date = _parse_date_safe(b.get("date") or b.get("datetime"))
        if not v_date or not (started_at <= v_date <= expires_at):
            continue
        # услуги в букинге — есть ли хотя бы одна нужная
        svc_titles = []
        for s in (b.get("services") or []):
            if isinstance(s, dict) and s.get("title"):
                svc_titles.append(s["title"].lower().strip())
        if not any(t in included_lower for t in svc_titles):
            continue
        # Tier-чек: засчитываем только то, что по уровню подходит
        staff = b.get("staff") or {}
        master_tier = _master_tier_by_id(staff.get("id"))
        if not visit_counts_for_tier(master_tier, subscription_tier):
            continue
        count += 1
    return count


async def sync_subscription_usage(sub: dict) -> tuple[int, int]:
    """
    Синхронизирует visits_used для одной подписки. Возвращает
    (previous_used, new_used). Если изменилось — обновляет БД.
    """
    client = database.get_client_by_id(sub["client_id"])
    if not client or not client.get("phone"):
        return sub.get("visits_used", 0), sub.get("visits_used", 0)
    plan = get_plan(sub["plan_code"])
    if not plan:
        return sub.get("visits_used", 0), sub.get("visits_used", 0)
    try:
        bookings = _yc.get_client_bookings(client["phone"])
    except Exception as e:
        logger.error(f"subscriptions sync: yc err for sub#{sub['id']}: {e}")
        return sub.get("visits_used", 0), sub.get("visits_used", 0)

    started = datetime.fromisoformat(sub["started_at"]).date()
    expires = datetime.fromisoformat(sub["expires_at"]).date()
    tier = (sub.get("tier") or "top").lower()
    new_used = _count_visits_in_plan(bookings, plan, tier, started, expires)
    new_used = min(new_used, sub["visits_included"])  # не перевыполняем план
    prev = sub.get("visits_used", 0)
    if new_used != prev:
        database.update_subscription_usage(sub["id"], new_used)
    return prev, new_used


# ─── Daily job: sync + expire + renew-push ───────────────────────────────

async def _send_renew_push(app: Application, sub: dict, client: dict, plan: dict):
    name = (client.get("name") or "").split()[0] if client.get("name") else "друг"
    chat_id = client.get("telegram_chat_id")
    if not chat_id:
        return
    visits_left = max(0, sub["visits_included"] - sub.get("visits_used", 0))
    expires_h = datetime.fromisoformat(sub["expires_at"]).strftime("%d.%m")
    tier = (sub.get("tier") or "top").lower()
    price = get_plan_price(plan, tier)
    tier_label = TIER_LABELS.get(tier, "")
    used_part = (
        f"Из {sub['visits_included']} визитов ты использовал {sub.get('visits_used', 0)} "
        f"(осталось {visits_left})."
        if visits_left > 0 else
        f"Все {sub['visits_included']} визитов уже использованы — отличный месяц 👏"
    )
    text = (
        f"{name}, абонемент *{plan['title']} ({tier_label})* истекает *{expires_h}* "
        f"(через {RENEW_PUSH_DAYS_BEFORE} дня).\n\n"
        f"{used_part}\n\n"
        f"Продлим ещё на месяц за {price} ₽?"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            f"💳 Продлить — {price} ₽",
            callback_data=f"sub_pay_{plan['code']}_{tier}",
        )],
        [InlineKeyboardButton("Не сейчас", callback_data="sub_renew_skip")],
    ])
    try:
        await app.bot.send_message(chat_id, text, parse_mode="Markdown", reply_markup=kb)
        database.mark_subscription_renew_pushed(sub["id"])
    except (Forbidden, BadRequest) as e:
        logger.info(f"sub renew push → {chat_id}: {e}")
    except Exception as e:
        logger.error(f"sub renew push → {chat_id}: {e}")


async def run_subscriptions_job(app: Application) -> dict:
    """
    Ежедневный таск:
      1. Sync visits_used для всех active.
      2. Push «продлить» для тех, у кого до конца ≤ RENEW_PUSH_DAYS_BEFORE
         и push ещё не отправляли.
      3. Mark expired для тех, у кого срок прошёл.
    """
    today = date.today()
    summary = {"synced": 0, "expired": 0, "renew_pushed": 0, "errors": 0}

    for sub in database.list_active_subscriptions():
        try:
            # Sync использований
            prev, new = await sync_subscription_usage(sub)
            if new != prev:
                summary["synced"] += 1

            expires = datetime.fromisoformat(sub["expires_at"]).date()

            # Истекла?
            if expires < today:
                database.update_subscription_status(sub["id"], "expired")
                summary["expired"] += 1
                continue

            # До конца ≤ 3 дня и push ещё не слали — пнуть
            days_left = (expires - today).days
            if days_left <= RENEW_PUSH_DAYS_BEFORE and not sub.get("renew_reminder_sent_at"):
                plan = get_plan(sub["plan_code"])
                client = database.get_client_by_id(sub["client_id"])
                if plan and client:
                    await _send_renew_push(app, sub, client, plan)
                    summary["renew_pushed"] += 1
        except Exception as e:
            summary["errors"] += 1
            logger.error(f"subscriptions job: sub#{sub.get('id')} err: {e}")

    logger.info(f"🎟 Subscriptions job: {summary}")
    return summary


# ─── UI: карточки и кнопки ──────────────────────────────────────────────

def build_catalog_card() -> tuple[str, InlineKeyboardMarkup]:
    """Каталог из 3 планов. Кнопка → экран выбора уровня (Старший / Топ)."""
    lines = [
        "🎟 *Абонементы*",
        "",
        "Один платёж — два визита в месяц. Удобно и предсказуемо.",
        "",
    ]
    buttons = []
    for p in PLANS:
        services = ", ".join(p["services_included"])
        pr = p["prices"]
        # Для каждого уровня показываем: «X ₽ вместо Y ₽ — экономия Z ₽ (W%)»
        savings_lines: list[str] = []
        for tier in ("senior", "top"):
            sv = get_plan_savings(p, tier)
            tier_lbl = TIER_LABELS[tier].lower()
            if sv:
                savings_lines.append(
                    f"  • _{tier_lbl}_: *{pr[tier]} ₽/мес* вместо "
                    f"{sv['regular']} ₽ — экономия *{sv['savings_rub']} ₽* "
                    f"({sv['savings_pct']}%)"
                )
            else:
                savings_lines.append(f"  • _{tier_lbl}_: *{pr[tier]} ₽/мес*")

        lines.append(f"{p['emoji']} *{p['title']}*")
        lines.append(f"  {p['description']}")
        lines.append(f"  _Состав: {services}_")
        lines.extend(savings_lines)
        lines.append("")
        buttons.append([InlineKeyboardButton(
            f"{p['emoji']} {p['title']}",
            callback_data=f"sub_pick_{p['code']}",
        )])
    lines.append(
        "_«Вместо X ₽» — это сколько ты обычно платишь за те же визиты по "
        "разовому ценнику. Неиспользованные визиты в конце месяца сгорают. "
        "Продление — по желанию, бот напомнит за 3 дня до конца._"
    )
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def build_tier_choice_card(plan_code: str) -> tuple[str, InlineKeyboardMarkup] | None:
    """Экран выбора уровня мастера для тарифа: «Старший» / «Топ»."""
    plan = get_plan(plan_code)
    if not plan:
        return None
    pr = plan["prices"]

    def _block(tier: str, masters_line: str) -> str:
        sv = get_plan_savings(plan, tier)
        label = TIER_LABELS[tier]
        if sv:
            saving = (
                f"  Цена: *{pr[tier]} ₽/мес* (вместо {sv['regular']} ₽ — "
                f"экономия *{sv['savings_rub']} ₽*, {sv['savings_pct']}%)"
            )
        else:
            saving = f"  Цена: *{pr[tier]} ₽/мес*"
        return f"• *{label}*\n  {masters_line}\n{saving}"

    text = (
        f"{plan['emoji']} *Абонемент «{plan['title']}»*\n\n"
        f"Выбери уровень мастера, на которого хочешь подписку:\n\n"
        + _block("senior", "Александр, Алексей, Максим") + "\n\n"
        + _block("top",    "Илья, Стас") + "\n\n"
        f"_В абонементе «Топ» зачитываются визиты к любому мастеру. "
        f"В «Старшем» — только к старшим (визит к топ-мастеру нужно оплачивать отдельно)._"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            f"Старший — {pr['senior']} ₽",
            callback_data=f"sub_pay_{plan_code}_senior",
        )],
        [InlineKeyboardButton(
            f"Топ — {pr['top']} ₽",
            callback_data=f"sub_pay_{plan_code}_top",
        )],
        [InlineKeyboardButton("← Назад к каталогу", callback_data="sub_back_catalog")],
    ])
    return text, kb


def build_my_subscription_card(client_id: int) -> tuple[str, InlineKeyboardMarkup | None]:
    """Карточка «моя подписка» — если активная, показываем статус."""
    active = database.get_active_subscription_for_client(client_id)
    if not active:
        text = (
            "У тебя пока нет активного абонемента.\n\n"
            "Тапни кнопку «🎟 Абонементы» в меню, чтобы посмотреть варианты."
        )
        return text, None
    plan = get_plan(active["plan_code"])
    if not plan:
        return "Не нашёл план — позвоните: 8-962-447-67-47", None

    expires = datetime.fromisoformat(active["expires_at"]).date()
    used = active.get("visits_used", 0)
    total = active["visits_included"]
    left = max(0, total - used)
    days_left = (expires - date.today()).days
    expires_h = expires.strftime("%d.%m.%Y")
    tier = (active.get("tier") or "top").lower()
    tier_label = TIER_LABELS.get(tier, "")
    price = get_plan_price(plan, tier)

    bar = "🟢" * used + "⚪" * left

    # Сколько клиент сэкономил по факту использованных визитов в этом месяце
    sv = get_plan_savings(plan, tier)
    saved_so_far_line = ""
    if sv and total > 0 and used > 0:
        # Розничная стоимость одного визита у этого тира
        per_visit_regular = sv["regular"] // total
        saved_so_far = max(0, per_visit_regular * used - int(price * used / total))
        if saved_so_far > 0:
            saved_so_far_line = (
                f"\n💰 За этот месяц ты уже сэкономил *{saved_so_far} ₽*"
            )

    text = (
        f"{plan['emoji']} *Абонемент «{plan['title']}» — {tier_label}*\n\n"
        f"Использовано: *{used} из {total}* визитов\n"
        f"{bar}\n\n"
        f"Действует до: *{expires_h}* (ещё {days_left} дн.)\n"
        f"Включает: _{', '.join(plan['services_included'])}_"
        f"{saved_so_far_line}\n\n"
        f"_При визите скажи администратору, что у тебя абонемент — он "
        f"учтёт это при оплате._"
    )
    kb = None
    if days_left <= RENEW_PUSH_DAYS_BEFORE:
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton(
                f"💳 Продлить — {price} ₽",
                callback_data=f"sub_pay_{plan['code']}_{tier}",
            )],
        ])
    return text, kb
