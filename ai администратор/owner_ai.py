"""owner_ai.py — «мозг AI-директора» салона.

В основном read-only. Собирает уже существующие подсистемы (analytics,
database.dashboard_metrics, reactivation, yclients) в операционный брифинг
владельца и приоритизированный ПО ДЕНЬГАМ список возможностей. Единственная
нейтральная запись в этом модуле — ручная контрольная задача владельца.

Не трогает кассу, записи и рассылки. Все write-возможности гейтятся owner-only
в claude_ai (_execute_tool проверяет database.is_admin).

Денежные величины: средний чек (avg_check) — РЕАЛЬНЫЙ за 30 дней; всё
«потенциальное» (возврат уснувших, продление абонементов, пустые окна) —
ОЦЕНКА «если сделать», помечена note-полями. Maya обязана подавать это как
оценку, а не факт (см. промпт «Режим AI-директора»).
"""
from datetime import date, datetime, timedelta
import logging
import re
import time

logger = logging.getLogger(__name__)

# Консервативные допущения для оценки ПОТЕНЦИАЛА (не факт; помечаются в ответах).
_RETURN_RATE = 0.25          # доля уснувших, что вернётся при персональном касании
# Грубая ёмкость смены: сколько визитов помещается в рабочий день мастера —
# для оценки недозагрузки. Реальная длительность услуг разная → это оценка.
_VISITS_PER_SHIFT = 8

# Кэш среднего чека (30д) на процесс: избегаем повторных тяжёлых выгрузок
# внутри одного брифинга.
_avg_cache = {"val": None, "ts": 0.0}
_AVG_TTL = 600.0
_summary30_cache = {"val": None, "ts": 0.0}

_ACTION_LIBRARY = {
    "reactivation": {
        "label": "Запустить рассылку уснувшим",
        "title": "Вернуть уснувших клиентов",
        "problem": "Часть клиентов давно не возвращалась и может уйти насовсем.",
        "reason": "MAYA нашла уснувших клиентов с маркетинг-согласием и готовый повод для касания.",
        "client_message": (
            "Здравствуйте! Давно не виделись в «Мужской Эстетике». "
            "Если хотите, подберу удобное окно и помогу вернуться в график."
        ),
        "priority": "high",
    },
    "cycle": {
        "label": "Напомнить тем, кому пора подстричься",
        "title": "Подогреть спрос на свободные окна",
        "problem": "На расписании есть свободные окна, которые можно быстро монетизировать.",
        "reason": "Есть клиенты с привычным циклом визитов, которым уместно напомнить про запись.",
        "client_message": (
            "Здравствуйте! Похоже, уже подходит время обновить стрижку. "
            "Если удобно, подберу ближайшее окно в «Мужской Эстетике»."
        ),
        "priority": "medium",
    },
    "birthday": {
        "label": "Запустить поздравления именинников",
        "title": "Поздравить клиентов с днём рождения",
        "problem": "Тёплый повод для контакта может пройти мимо и не превратиться в визит.",
        "reason": "День рождения даёт высокий шанс на возврат без агрессивной продажи.",
        "client_message": (
            "С днём рождения! Команда «Мужской Эстетики» поздравляет вас и "
            "приглашает воспользоваться приятным предложением к визиту."
        ),
        "priority": "medium",
    },
    "reviews": {
        "label": "Запросить отзывы после визитов",
        "title": "Собрать свежие отзывы",
        "problem": "Свежие довольные клиенты не всегда доходят до отзыва сами.",
        "reason": "После закрытых визитов уместно попросить короткую обратную связь и усилить рейтинг.",
        "client_message": (
            "Спасибо за визит! Если вам всё понравилось, буду благодарна за "
            "короткий отзыв — это очень помогает «Мужской Эстетике»."
        ),
        "priority": "low",
    },
    "subscriptions": {
        "label": "Обновить абонементы и отправить продление",
        "title": "Подтолкнуть продление абонементов",
        "problem": "Истекающие абонементы рискуют сгореть без продления и следующего визита.",
        "reason": "В системе есть активные абонементы, которым уже пора напомнить о продлении.",
        "client_message": (
            "Здравствуйте! Напоминаю, что ваш абонемент скоро заканчивается. "
            "Если хотите, помогу продлить его без паузы между визитами."
        ),
        "priority": "medium",
    },
}
_OPPORTUNITY_TO_ACTION = {
    "return_clients": "reactivation",
    "empty_windows": "cycle",
    "expiring_subscriptions": "subscriptions",
}
_AUTOMATION_LIBRARY = {
    "reactivation": {"cadence_days": 7, "title": "Реактивация уснувших"},
    "cycle": {"cadence_days": 2, "title": "Цикл «пора подстричься»"},
    "birthday": {"cadence_days": 1, "title": "Дни рождения"},
    "reviews": {"cadence_days": 1, "title": "Отзывы после визитов"},
    "subscriptions": {"cadence_days": 3, "title": "Абонементы"},
}
_AUTOMATION_COOLDOWN_SECONDS = 60


def _today() -> str:
    return date.today().isoformat()


def _rub(n) -> int:
    try:
        return int(round(float(n or 0)))
    except Exception:
        return 0


def _m(n) -> str:
    """665000 → «665 000» (разряды тонким пробелом) для человекочитаемых сумм."""
    return f"{_rub(n):,}".replace(",", " ")


def _avg_check_30d() -> int:
    """Средний чек салона за 30 дней (реальный) — база денежных оценок."""
    summary = _summary_30d()
    if summary and summary.get("avg_check") is not None:
        return _rub(summary.get("avg_check"))
    now = time.time()
    if _avg_cache["val"] is not None and now - _avg_cache["ts"] < _AVG_TTL:
        return _avg_cache["val"]
    val = 0
    try:
        import analytics
        f, t, _ = analytics.resolve_period("last_30", None, None)
        val = _rub(analytics.business_summary(f, t).get("avg_check"))
    except Exception as e:
        logger.error(f"owner_ai avg_check: {e}")
    _avg_cache["val"] = val
    _avg_cache["ts"] = now
    return val


def _summary_30d() -> dict | None:
    """Реальная сводка последних 30 дней, кешируется на процесс."""
    now = time.time()
    if _summary30_cache["val"] is not None and now - _summary30_cache["ts"] < _AVG_TTL:
        return _summary30_cache["val"]
    try:
        import analytics
        f, t, _ = analytics.resolve_period("last_30", None, None)
        val = analytics.business_summary(f, t) or {}
        _summary30_cache.update(val=val, ts=now)
        return val
    except Exception as e:
        logger.error(f"owner_ai summary_30d: {e}")
        return None


def _last_30_windows() -> tuple[str, str, str, str]:
    """Текущее и предыдущее окно 30 дней: (cur_from, cur_to, prev_from, prev_to)."""
    cur_to = date.today()
    cur_from = cur_to - timedelta(days=29)
    prev_to = cur_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=29)
    return (
        cur_from.isoformat(),
        cur_to.isoformat(),
        prev_from.isoformat(),
        prev_to.isoformat(),
    )


def _week_trend() -> dict | None:
    """Динамика этой недели против прошлой (выручка/визиты/чек + health)."""
    try:
        import analytics
        f, t, label = analytics.resolve_period("week", None, None)
        p = analytics.business_pulse(f, t, "week", label)
        return {
            "health": p.get("health"),
            "gross": p["metrics"]["gross"],
            "visits": p["metrics"]["visits"],
            "avg_check": p["metrics"]["avg_check"],
            "anomaly": p.get("anomaly"),
        }
    except Exception as e:
        logger.error(f"owner_ai week_trend: {e}")
        return None


def _today_load() -> dict:
    """Загрузка на сегодня: кто работает, сколько записей у каждого, кто простаивает."""
    today = _today()
    working, recs = [], []
    try:
        from yclients import YClientsAPI
        yc = YClientsAPI()
        working = [m for m in (yc.get_working_masters(today) or [])
                   if isinstance(m, dict) and m.get("is_working")]
        recs = yc.get_company_records(today, today) or []
    except Exception as e:
        logger.error(f"owner_ai today_load: {e}")

    by_staff = {}
    for r in recs:
        if isinstance(r, dict) and r.get("staff_id") is not None:
            by_staff[r["staff_id"]] = by_staff.get(r["staff_id"], 0) + 1

    masters, idle, underused = [], [], []
    for m in working:
        sid = m.get("id")
        nm = m.get("name") or f"Мастер #{sid}"
        cnt = by_staff.get(sid, 0)
        free = max(0, _VISITS_PER_SHIFT - cnt)
        masters.append({
            "staff_id": sid, "name": nm, "records_today": cnt,
            "free_slots_est": free,
            "work_start": m.get("work_start", ""), "work_end": m.get("work_end", ""),
        })
        if cnt == 0:
            idle.append(nm)
        elif free >= 3:
            underused.append(nm)

    return {
        "date": today,
        "booked_today": len(recs),
        "working_masters": len(working),
        "idle_masters": idle,            # работают, но 0 записей
        "underused_masters": underused,  # работают, но много свободных окон
        "masters": masters,
    }


def business_snapshot() -> dict:
    """Операционная картина «сегодня»: записи, ожидаемая выручка, загрузка, тренд."""
    load = _today_load()
    avg = _avg_check_30d()
    free_capacity = sum(m["free_slots_est"] for m in load["masters"])
    return {
        **load,
        "avg_check_rub": avg,
        "expected_revenue_rub": _rub(load["booked_today"] * avg),
        "free_capacity_today": free_capacity,
        "potential_fill_revenue_rub": _rub(free_capacity * avg),
        "week_trend": _week_trend(),
        "note": ("expected_revenue = записи сегодня × средний чек 30д (оценка); "
                 "free_slots/ёмкость — грубая оценка по ~%d визитов на смену."
                 % _VISITS_PER_SHIFT),
    }


def _manual_daily_target_rub() -> int:
    """Опциональная ручная цель владельца через settings.owner_daily_target_rub."""
    try:
        import database
        val = database.get_setting("owner_daily_target_rub")
        return _rub(val)
    except Exception:
        return 0


def _today_revenue_summary() -> dict:
    try:
        import analytics
        day = _today()
        return analytics.business_summary(day, day) or {}
    except Exception as e:
        logger.error(f"owner_ai today_revenue_summary: {e}")
        return {}


def plan_fact(snap: dict = None) -> dict:
    """План-факт дня: факт оплат + прогноз по записям против дневной базы.

    База не выдумывается: ручная цель из settings, если задана; иначе средняя
    дневная выручка последних 30 дней. Прогноз дня — оценка по записям и среднему
    чеку, поэтому помечается estimate=true.
    """
    snap = snap or business_snapshot()
    base = _summary_30d() or {}
    today = _today_revenue_summary()
    manual_target = _manual_daily_target_rub()
    avg_daily = _rub((base.get("total_gross") or 0) / 30) if base.get("total_gross") else 0
    daily_target = manual_target or avg_daily
    target_source = "manual_setting" if manual_target else "last_30_actual_average"

    actual = _rub(today.get("total_gross"))
    paid_visits = _rub(today.get("visits"))
    expected = _rub(snap.get("expected_revenue_rub"))
    projected = max(actual, expected)
    avg_check = _rub(snap.get("avg_check_rub") or base.get("avg_check"))
    gap = projected - daily_target if daily_target else 0
    progress = round((projected / daily_target) * 100) if daily_target else None
    needed = 0
    if daily_target and gap < 0 and avg_check:
        needed = int((abs(gap) + avg_check - 1) // avg_check)
    if not daily_target:
        status = "ok"
    elif progress is not None and progress < 70:
        status = "risk"
    elif progress is not None and progress < 95:
        status = "warn"
    else:
        status = "ok"

    return {
        "status": status,
        "date": snap.get("date") or _today(),
        "daily_target_rub": daily_target,
        "target_source": target_source,
        "actual_revenue_rub": actual,
        "paid_visits": paid_visits,
        "booked_today": _rub(snap.get("booked_today")),
        "expected_revenue_rub": expected,
        "projected_revenue_rub": projected,
        "gap_rub": gap,
        "progress_pct": progress,
        "needed_visits_to_target": needed,
        "avg_check_rub": avg_check,
        "estimate": True,
        "note": (
            "План-факт: факт оплат сегодня + прогноз по текущим записям. "
            "Дневной план — ручная цель owner_daily_target_rub или средняя "
            "дневная выручка последних 30 дней."
        ),
    }


def master_performance() -> dict:
    """Мастера за 30 дней: выручка, выплаты и вклад после процента.

    Это не полная управленческая прибыль салона: аренда, эквайринг, расходники и
    прочие общие расходы здесь не распределяются по мастерам. Метрика нужна для
    честного ответа владельцу: кто приносит больше выручки и вклад после выплаты
    процента мастеру.
    """
    summary = _summary_30d() or {}
    rows = []
    for m in summary.get("masters") or []:
        if not isinstance(m, dict):
            continue
        gross = _rub(m.get("gross"))
        salary = 0 if m.get("is_owner") else _rub(m.get("salary"))
        profit = gross - salary
        visits = _rub(m.get("visits"))
        rows.append({
            "staff_id": m.get("staff_id"),
            "name": m.get("name") or "Мастер",
            "gross_rub": gross,
            "salary_rub": salary,
            "profit_after_salary_rub": profit,
            "visits": visits,
            "avg_check_rub": _rub(m.get("avg_check")),
            "salary_percent": _rub(m.get("percent")),
            "is_owner": bool(m.get("is_owner")),
            "profit_per_visit_rub": _rub(profit / visits) if visits else 0,
        })
    rows.sort(key=lambda x: (-(x.get("profit_after_salary_rub") or 0), -(x.get("gross_rub") or 0)))
    gross_leader = sorted(rows, key=lambda x: (-(x.get("gross_rub") or 0), x.get("name") or ""))[:1]
    return {
        "period": {"from": summary.get("from"), "to": summary.get("to")},
        "total_gross_rub": _rub(summary.get("total_gross")),
        "salary_total_rub": _rub(summary.get("salary_total")),
        "profit_after_salary_total_rub": sum(_rub(r.get("profit_after_salary_rub")) for r in rows),
        "top_profit_master": rows[0] if rows else None,
        "top_gross_master": gross_leader[0] if gross_leader else None,
        "masters": rows[:8],
        "note": (
            "Вклад после процента = выручка мастера минус выплата мастеру. "
            "Для владельца-мастера выплата не вычитается; общие расходы салона "
            "по мастерам не распределяются."
        ),
    }


def expiring_assets() -> dict:
    """Истекающие/активные активы: абонементы (7 дней) и сертификаты на руках."""
    m, certs = {}, {}
    try:
        import database
        m = database.dashboard_metrics(days=30) or {}
        # Сертификаты — ТОЛЬКО реально проданные (резерв «на продажу» не считаем).
        certs = database.active_sold_gift_certs() or {}
    except Exception as e:
        logger.error(f"owner_ai expiring_assets: {e}")
    subs = m.get("subscriptions") or {}
    return {
        "subscriptions_expiring_7d": _rub(subs.get("expiring_soon")),
        "subscriptions_active": _rub(subs.get("active")),
        "gift_certs_active_count": _rub(certs.get("count")),
        "gift_certs_active_value_rub": _rub(certs.get("value_rub")),
        "note": ("Абонементы «истекают» — окно 7 дней. Сертификаты — только ПРОДАННЫЕ "
                 "клиентам, активные на руках (оплачены, не погашены, срок не вышел). "
                 "Пред-генерённый резерв на продажу сюда НЕ входит."),
    }


def return_candidates() -> dict:
    """Уснувшие клиенты на возврат — из результата ежедневной реактивации (быстро, без
    ре-скана базы). Действие — существующая рассылка /reactivation_now."""
    import json as _json
    count, at = None, None
    try:
        import database
        raw = database.get_setting("reactivation_last")
        if raw:
            d = _json.loads(raw)
            count = int(d.get("count"))
            at = d.get("at")
    except Exception as e:
        logger.error(f"owner_ai return_candidates: {e}")
    avg = _avg_check_30d()
    out = {
        "avg_check_rub": avg,
        "action": "reactivation",
        "action_hint": ("Запустить персональную рассылку «соскучились» уснувшим — "
                        "команда /reactivation_now (владелец)."),
    }
    if count is None:
        out["count"] = None
        out["note"] = ("Ещё не считалось (реактивация ещё не запускалась). Ищет уснувших "
                       "28–56 дней без визита, с согласием на маркетинг. Запусти "
                       "/reactivation_now — покажу число и разошлю приглашения.")
    else:
        out["count"] = count
        out["as_of"] = at
        out["potential_return_revenue_rub"] = _rub(count * avg * _RETURN_RATE)
        out["note"] = ("Уснувшие с маркетинг-согласием (28–56 дней без визита), данные на "
                       "%s. Потенциал возврата — ОЦЕНКА ~%d%% при персональном касании, не факт."
                       % (at or "?", int(_RETURN_RATE * 100)))
    return out


def service_insights() -> dict:
    """Популярные и просевшие услуги за текущие 30 дней против предыдущих 30 дней."""
    cur_from, cur_to, prev_from, prev_to = _last_30_windows()
    cur_rows, prev_rows = [], []
    try:
        import analytics
        cur_rows = analytics.top_services(cur_from, cur_to, limit=12) or []
        prev_rows = analytics.top_services(prev_from, prev_to, limit=12) or []
    except Exception as e:
        logger.error(f"owner_ai service_insights: {e}")
    cur_map = {str(r.get("title") or "").strip(): r for r in cur_rows if isinstance(r, dict)}
    prev_map = {str(r.get("title") or "").strip(): r for r in prev_rows if isinstance(r, dict)}

    popular = []
    for row in cur_rows[:5]:
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        popular.append({
            "title": title,
            "count": _rub(row.get("count")),
            "sum_rub": _rub(row.get("sum")),
        })

    weak = []
    titles = set(cur_map) | set(prev_map)
    for title in titles:
        if not title:
            continue
        cur = cur_map.get(title) or {}
        prev = prev_map.get(title) or {}
        cur_sum = _rub(cur.get("sum"))
        prev_sum = _rub(prev.get("sum"))
        cur_count = _rub(cur.get("count"))
        prev_count = _rub(prev.get("count"))
        if prev_sum <= 0 or cur_sum >= prev_sum:
            continue
        weak.append({
            "title": title,
            "current_count": cur_count,
            "previous_count": prev_count,
            "current_sum_rub": cur_sum,
            "previous_sum_rub": prev_sum,
            "delta_sum_rub": cur_sum - prev_sum,
            "delta_count": cur_count - prev_count,
        })
    weak.sort(key=lambda x: x["delta_sum_rub"])

    return {
        "period": {"from": cur_from, "to": cur_to},
        "previous_period": {"from": prev_from, "to": prev_to},
        "popular_services": popular,
        "weak_services": weak[:5],
        "note": (
            "Популярные/просевшие услуги считаются по реально пришедшим визитам "
            "за 30 дней vs предыдущие 30 дней. Суммы по услугам могут слегка "
            "расходиться с кассой из-за скидок."
        ),
    }


def owner_action_payload(task: str, *,
                         title: str | None = None,
                         problem: str | None = None,
                         reason: str | None = None,
                         potential_rub: int | None = None,
                         client_message: str | None = None,
                         priority: str | None = None,
                         label: str | None = None) -> dict | None:
    """Пакет для action-card владельца: текст + кнопка подтверждения без автозапуска."""
    task = (task or "").strip().lower()
    base = _ACTION_LIBRARY.get(task)
    if not base:
        return None
    out = {
        "kind": "run_job",
        "job": task,
        "label": label or base["label"],
        "title": title or base["title"],
        "problem": problem or base["problem"],
        "reason": reason or base["reason"],
        "client_message": client_message or base["client_message"],
        "priority": (priority or base["priority"]).lower(),
    }
    if potential_rub is not None:
        out["potential_rub"] = _rub(potential_rub)
    return out


def _safe_control_text(value, limit: int = 240) -> str:
    text = str(value or "").strip()
    try:
        import anonymizer
        text = anonymizer.redact_pii(text)
    except Exception:
        pass
    text = " ".join(text.split())
    return text[:limit]


def _normalize_assignee(value: str | None = None) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "owner": "owner",
        "владелец": "owner",
        "стас": "owner",
        "maya": "maya",
        "майя": "maya",
        "system": "maya",
        "система": "maya",
        "admin": "admin",
        "administrator": "admin",
        "админ": "admin",
        "администратор": "admin",
        "manager": "admin",
        "мастер": "master",
        "master": "master",
        "barber": "master",
        "team": "team",
        "команда": "team",
        "персонал": "team",
    }
    return aliases.get(raw, "owner")


def _assignee_label(assigned_to: str | None = None, assignee_name: str | None = "") -> str:
    assigned_to = _normalize_assignee(assigned_to)
    name = _safe_control_text(assignee_name, 80)
    base = {
        "owner": "Владелец",
        "maya": "MAYA",
        "admin": "Админ",
        "master": "Мастер",
        "team": "Команда",
    }.get(assigned_to, "Владелец")
    return "%s · %s" % (base, name) if name else base


def _assignment_delivery(assigned_to: str | None = None) -> tuple[str, str]:
    assigned_to = _normalize_assignee(assigned_to)
    if assigned_to in ("admin", "master", "team"):
        return "team_chat", "queued"
    if assigned_to == "maya":
        return "maya_queue", "internal"
    return "owner_control", "owner_only"


def _assignment_delivery_label(state: str | None = "", channel: str | None = "") -> str:
    state = str(state or "").strip().lower()
    channel = str(channel or "").strip().lower()
    if state == "delivered" and channel == "team_chat":
        return "Доставлено в чат команды"
    if state == "queued" and channel == "team_chat":
        return "Ожидает доставки в чат"
    if state == "failed":
        return "Не удалось доставить"
    if state == "internal" and channel == "maya_queue":
        return "В очереди MAYA"
    if state == "owner_only":
        return "На контроле владельца"
    return ""


def _assignment_work_label(state: str | None = "") -> str:
    state = str(state or "").strip().lower()
    return {
        "accepted": "Исполнитель принял",
        "running": "Исполнитель в работе",
        "done": "Исполнитель отметил готово",
        "revision": "Владелец вернул на доработку",
        "blocked": "Исполнитель заблокирован",
    }.get(state, "")


def _public_assignment_title(raw: str | None = "") -> str:
    text = _safe_control_text(raw or "Задача", 140)
    text = re.sub(r"\b\d[\d\s.,]*(?:₽|руб(?:\.|лей|ля)?)", "сумма", text, flags=re.I)
    return " ".join(text.split())[:140] or "Задача"


def _assignment_role_for_panel(role: str | None = "") -> str:
    role = str(role or "").strip().lower()
    if role == "manager":
        return "admin"
    if role == "master":
        return "master"
    if role == "owner":
        return "owner"
    return ""


def _normalize_control_due_at(due_at: str | None = None, due_in_days=None) -> str:
    raw = str(due_at or "").strip()
    if raw:
        try:
            if len(raw) == 10:
                return datetime.fromisoformat(raw).replace(hour=18, minute=0, second=0).isoformat(timespec="seconds")
            return datetime.fromisoformat(raw[:19]).isoformat(timespec="seconds")
        except Exception:
            pass
    try:
        days = int(due_in_days)
    except Exception:
        days = 2
    days = max(0, min(days, 30))
    return (datetime.now() + timedelta(days=days)).isoformat(timespec="seconds")


def _control_item_from_owner_action(task: dict | None) -> dict:
    task = task or {}
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    summary = task.get("summary") if isinstance(task.get("summary"), dict) else {}
    action_id = task.get("id")
    return {
        "key": "owner_control:%s" % (action_id or task.get("title") or "task"),
        "action_id": action_id,
        "title": task.get("title") or "Контрольная задача",
        "detail": payload.get("detail") or "",
        "status": payload.get("priority") or "medium",
        "source": "owner_control",
        "potential_rub": payload.get("potential_rub"),
        "owner_next_step": payload.get("owner_next_step") or "",
        "due_at": task.get("result_due_at") or payload.get("due_at"),
        "signal_key": payload.get("signal_key"),
        "signal_kind": payload.get("signal_kind"),
        "signal_source": payload.get("signal_source"),
        "safe_autocreate": bool(payload.get("safe_autocreate")),
        "action_job": payload.get("action_job"),
        "assigned_to": payload.get("assigned_to") or "owner",
        "assignee_name": payload.get("assignee_name") or "",
        "assigned_label": _assignee_label(payload.get("assigned_to"), payload.get("assignee_name")),
        "assignment_delivery_state": payload.get("assignment_delivery_state") or "",
        "assignment_delivery_channel": payload.get("assignment_delivery_channel") or "",
        "assignment_delivery_message_id": payload.get("assignment_delivery_message_id") or 0,
        "assignment_delivery_updated_at": payload.get("assignment_delivery_updated_at") or payload.get("assignment_delivered_at") or "",
        "assignment_delivery_label": _assignment_delivery_label(
            payload.get("assignment_delivery_state"),
            payload.get("assignment_delivery_channel"),
        ),
        "assignment_work_state": payload.get("assignment_work_state") or summary.get("assignment_work_state") or "",
        "assignment_work_updated_at": payload.get("assignment_work_updated_at") or summary.get("assignment_work_updated_at") or "",
        "assignment_work_actor_role": payload.get("assignment_work_actor_role") or summary.get("assignment_work_actor_role") or "",
        "assignment_work_actor_name": payload.get("assignment_work_actor_name") or summary.get("assignment_work_actor_name") or "",
        "assignment_work_label": _assignment_work_label(payload.get("assignment_work_state") or summary.get("assignment_work_state")),
        "linked_action_id": payload.get("linked_action_id") or summary.get("linked_action_id"),
        "linked_action_job": payload.get("linked_action_job") or summary.get("linked_action_job"),
        "linked_action_status": payload.get("linked_action_status") or summary.get("linked_action_status"),
        "linked_action_due_at": payload.get("linked_action_due_at"),
        "linked_action_updated_at": payload.get("linked_action_updated_at") or summary.get("updated_at"),
    }


def create_control_task(*, title: str, detail: str = "", priority: str = "medium",
                        due_at: str | None = None, due_in_days=None,
                        potential_rub=None, owner_next_step: str = "",
                        signal_key: str = "", signal_kind: str = "",
                        signal_source: str = "", action_job: str = "",
                        assigned_to: str = "owner", assignee_name: str = "",
                        created_by=None, safe_autocreate: bool = False) -> dict:
    """Создаёт ручную контрольную задачу AI-директора без ПД и автодействий."""
    title = _safe_control_text(title, 140)
    if not title:
        return {"ok": False, "error": "empty_title"}
    detail = _safe_control_text(detail, 420)
    owner_next_step = _safe_control_text(owner_next_step, 300)
    priority = str(priority or "medium").strip().lower()
    if priority not in ("low", "medium", "high"):
        priority = "medium"
    signal_key = _safe_control_text(signal_key, 180)
    signal_kind = _safe_control_text(signal_kind, 80)
    signal_source = _safe_control_text(signal_source, 80)
    action_job = _safe_control_text(action_job, 80)
    assigned_to = _normalize_assignee(assigned_to)
    assignee_name = _safe_control_text(assignee_name, 80)
    try:
        potential = _rub(potential_rub) if potential_rub is not None else None
    except Exception:
        potential = None
    normalized_due_at = _normalize_control_due_at(due_at, due_in_days)
    delivery_channel, delivery_state = _assignment_delivery(assigned_to)
    payload = {
        "detail": detail,
        "priority": priority,
        "potential_rub": potential,
        "owner_next_step": owner_next_step,
        "due_at": normalized_due_at,
        "signal_key": signal_key,
        "signal_kind": signal_kind,
        "signal_source": signal_source,
        "action_job": action_job,
        "assigned_to": assigned_to,
        "assignee_name": assignee_name,
        "assigned_label": _assignee_label(assigned_to, assignee_name),
        "assignment_delivery_channel": delivery_channel,
        "assignment_delivery_state": delivery_state,
        "assignment_delivery_message_id": 0,
        "assignment_delivery_error": "",
        "safe_autocreate": bool(safe_autocreate),
    }
    try:
        import database
        if signal_key:
            for existing in database.list_owner_actions(limit=50) or []:
                existing_payload = existing.get("payload") if isinstance(existing.get("payload"), dict) else {}
                if (
                    existing.get("source") == "owner_control"
                    and existing.get("status") in ("pending", "running")
                    and existing_payload.get("signal_key") == signal_key
                ):
                    return {
                        "ok": True,
                        "existing": True,
                        "task_id": existing.get("id"),
                        "task": existing,
                        "control_item": _control_item_from_owner_action(existing),
                        "note": "Такая задача уже есть в очереди контроля.",
                    }
        action_id = database.create_owner_action(
            "control_task",
            title,
            source="owner_control",
            created_by=created_by,
            payload=payload,
            status="pending",
            baseline={},
            result_due_at=normalized_due_at,
        )
        task = (database.list_owner_actions(limit=1) or [{}])[0]
    except Exception as e:
        logger.error("owner_ai create_control_task: %s", e)
        return {"ok": False, "error": "create_failed"}
    return {
        "ok": True,
        "task_id": action_id,
        "task": task,
        "control_item": _control_item_from_owner_action(task),
        "note": "Задача добавлена в Owner Command Center и появится в очереди контроля.",
    }


def update_control_task(*, task_id, action: str, note: str = "",
                        due_at: str | None = None, due_in_days=None,
                        assigned_to: str = "", assignee_name: str = "") -> dict:
    """Обновляет ручную контрольную задачу: done/cancel/postpone/reopen."""
    try:
        action_id = int(task_id)
    except Exception:
        return {"ok": False, "error": "bad_task_id"}
    action = str(action or "").strip().lower()
    if action not in ("complete", "done", "finish", "cancel", "canceled", "cancelled", "postpone", "snooze", "delay", "reopen", "open", "assign", "reassign", "revision", "return", "redo", "rework"):
        return {"ok": False, "error": "bad_action"}
    safe_note = _safe_control_text(note, 420)
    normalized_due_at = None
    if action in ("postpone", "snooze", "delay"):
        normalized_due_at = _normalize_control_due_at(due_at, due_in_days if due_in_days is not None else 1)
    try:
        import database
        task = database.update_owner_control_task(
            action_id,
            action,
            note=safe_note,
            due_at=normalized_due_at,
            assigned_to=_normalize_assignee(assigned_to) if assigned_to else None,
            assignee_name=_safe_control_text(assignee_name, 80),
        )
    except Exception as e:
        logger.error("owner_ai update_control_task: %s", e)
        return {"ok": False, "error": "update_failed"}
    if not task:
        return {"ok": False, "error": "not_found"}
    return {
        "ok": True,
        "task": task,
        "note": "Контрольная задача обновлена.",
    }


def _staff_visible_assignment(assigned_to: str | None, viewer_role: str | None) -> bool:
    viewer = _assignment_role_for_panel(viewer_role)
    assigned = _normalize_assignee(assigned_to)
    if viewer == "owner":
        return assigned in ("owner", "maya", "admin", "master", "team")
    if viewer == "admin":
        return assigned in ("admin", "team")
    if viewer == "master":
        return assigned in ("master", "team")
    return False


def _staff_assignment_item(task: dict | None, *, viewer_role: str | None = "") -> dict | None:
    task = task or {}
    if task.get("source") != "owner_control" or task.get("job") != "control_task":
        return None
    if str(task.get("status") or "").lower() in ("done", "canceled"):
        return None
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    summary = task.get("summary") if isinstance(task.get("summary"), dict) else {}
    assigned_to = payload.get("assigned_to") or summary.get("assigned_to") or "owner"
    if not _staff_visible_assignment(assigned_to, viewer_role):
        return None
    due_at = task.get("result_due_at") or payload.get("due_at")
    now_iso = datetime.now().isoformat(timespec="seconds")
    due_state = ""
    if due_at:
        due_s = str(due_at)
        if due_s <= now_iso:
            due_state = "overdue"
        elif due_s[:10] == now_iso[:10]:
            due_state = "today"
        else:
            due_state = "scheduled"
    work_state = payload.get("assignment_work_state") or summary.get("assignment_work_state") or ""
    if not work_state:
        next_actions = ["accept"]
    elif work_state == "accepted":
        next_actions = ["start", "done"]
    elif work_state == "running":
        next_actions = ["done"]
    elif work_state == "revision":
        next_actions = ["start", "done"]
    elif work_state == "blocked":
        next_actions = ["start", "done"]
    else:
        next_actions = []
    return {
        "task_id": task.get("id"),
        "title": _public_assignment_title(task.get("title") or "Задача"),
        "assigned_to": _normalize_assignee(assigned_to),
        "assignee_name": _safe_control_text(payload.get("assignee_name") or summary.get("assignee_name"), 80),
        "assigned_label": _assignee_label(assigned_to, payload.get("assignee_name") or summary.get("assignee_name")),
        "due_at": due_at,
        "due_state": due_state,
        "priority": payload.get("priority") or "medium",
        "delivery_state": payload.get("assignment_delivery_state") or summary.get("assignment_delivery_state") or "",
        "delivery_label": _assignment_delivery_label(
            payload.get("assignment_delivery_state") or summary.get("assignment_delivery_state"),
            payload.get("assignment_delivery_channel") or summary.get("assignment_delivery_channel"),
        ),
        "work_state": work_state,
        "work_label": _assignment_work_label(work_state) or "Ждёт исполнителя",
        "work_updated_at": payload.get("assignment_work_updated_at") or summary.get("assignment_work_updated_at") or "",
        "next_actions": next_actions,
    }


def staff_task_inbox(*, viewer_role: str, limit: int = 12) -> dict:
    """Безопасная очередь поручений для рабочих кабинетов."""
    try:
        import database
        rows = database.list_owner_actions(limit=50) or []
    except Exception as e:
        logger.error("owner_ai staff_task_inbox: %s", e)
        rows = []
    tasks = []
    for row in rows:
        item = _staff_assignment_item(row, viewer_role=viewer_role)
        if item:
            tasks.append(item)
    rank = {"overdue": 0, "today": 1, "scheduled": 2, "": 3}
    work_rank = {"": 0, "revision": 0, "accepted": 1, "blocked": 1, "running": 2, "done": 4}
    tasks.sort(key=lambda it: (
        work_rank.get(it.get("work_state") or "", 3),
        rank.get(it.get("due_state") or "", 9),
        str(it.get("due_at") or "9999-99-99"),
        int(it.get("task_id") or 0),
    ))
    tasks = tasks[:max(1, min(int(limit or 12), 20))]
    return {
        "ok": True,
        "role": viewer_role,
        "summary": {
            "tasks_count": len(tasks),
            "new_count": len([it for it in tasks if not it.get("work_state")]),
            "running_count": len([it for it in tasks if it.get("work_state") in ("accepted", "running", "blocked", "revision")]),
            "done_count": len([it for it in tasks if it.get("work_state") == "done"]),
            "overdue_count": len([it for it in tasks if it.get("due_state") == "overdue"]),
        },
        "tasks": tasks,
    }


def update_staff_task(*, task_id, viewer_role: str, actor_name: str = "",
                      actor_chat_id: int = 0, action: str = "", note: str = "") -> dict:
    """Исполнитель отмечает ход работы по назначенной задаче."""
    try:
        action_id = int(task_id)
    except Exception:
        return {"ok": False, "error": "bad_task_id"}
    action = str(action or "").strip().lower()
    if action not in ("accept", "accepted", "start", "run", "running", "done", "complete", "finish", "blocked"):
        return {"ok": False, "error": "bad_action"}
    try:
        import database
        current = None
        for row in database.list_owner_actions(limit=50) or []:
            if int(row.get("id") or 0) == action_id:
                current = row
                break
        if not _staff_assignment_item(current, viewer_role=viewer_role):
            return {"ok": False, "error": "forbidden"}
        updated = database.update_owner_assignment_work_state(
            action_id,
            action,
            actor_role=_assignment_role_for_panel(viewer_role),
            actor_name=_safe_control_text(actor_name, 80),
            actor_chat_id=int(actor_chat_id or 0),
            note=_safe_control_text(note, 300),
        )
    except Exception as e:
        logger.error("owner_ai update_staff_task: %s", e)
        return {"ok": False, "error": "update_failed"}
    if not updated:
        return {"ok": False, "error": "not_found"}
    item = _staff_assignment_item(updated, viewer_role=viewer_role)
    return {
        "ok": True,
        "task": item,
        "inbox": staff_task_inbox(viewer_role=viewer_role),
    }


def _action_from_opportunity(opp: dict | None) -> dict | None:
    if not isinstance(opp, dict):
        return None
    task = _OPPORTUNITY_TO_ACTION.get(str(opp.get("type") or ""))
    if not task:
        return None
    return owner_action_payload(
        task,
        title=str(opp.get("title") or "").strip() or None,
        problem=str(opp.get("title") or "").strip() or None,
        reason=str(opp.get("detail") or "").strip() or None,
        potential_rub=opp.get("potential_rub"),
        priority="high" if (opp.get("potential_rub") or 0) else None,
    )


def _severity_rank(value: str | None) -> int:
    return {"ok": 0, "low": 1, "medium": 2, "warn": 2, "high": 3, "risk": 3}.get(
        str(value or "").lower(),
        0,
    )


def _command_status(*values: str | None) -> str:
    rank = max((_severity_rank(v) for v in values), default=0)
    if rank >= 3:
        return "risk"
    if rank >= 2:
        return "warn"
    return "ok"


def _fallback_snapshot() -> dict:
    return {
        "date": _today(),
        "booked_today": 0,
        "working_masters": 0,
        "idle_masters": [],
        "underused_masters": [],
        "masters": [],
        "avg_check_rub": 0,
        "expected_revenue_rub": 0,
        "free_capacity_today": 0,
        "potential_fill_revenue_rub": 0,
        "week_trend": None,
        "note": "Операционная картина временно недоступна.",
    }


def _fallback_assets() -> dict:
    return {
        "subscriptions_expiring_7d": 0,
        "subscriptions_active": 0,
        "gift_certs_active_count": 0,
        "gift_certs_active_value_rub": 0,
        "note": "Активы временно недоступны.",
    }


def _fallback_return_candidates() -> dict:
    return {
        "count": None,
        "avg_check_rub": 0,
        "action": "reactivation",
        "action_hint": "",
        "note": "Кандидаты на возврат временно недоступны.",
    }


def _fallback_services() -> dict:
    return {
        "period": {},
        "previous_period": {},
        "popular_services": [],
        "weak_services": [],
        "note": "Услуги временно недоступны.",
    }


def _fallback_plan_fact() -> dict:
    return {
        "status": "ok",
        "date": _today(),
        "daily_target_rub": 0,
        "target_source": "unavailable",
        "actual_revenue_rub": 0,
        "paid_visits": 0,
        "booked_today": 0,
        "expected_revenue_rub": 0,
        "projected_revenue_rub": 0,
        "gap_rub": 0,
        "progress_pct": None,
        "needed_visits_to_target": 0,
        "avg_check_rub": 0,
        "estimate": True,
        "note": "План-факт временно недоступен.",
    }


def _fallback_master_performance() -> dict:
    return {
        "period": {},
        "total_gross_rub": 0,
        "salary_total_rub": 0,
        "profit_after_salary_total_rub": 0,
        "top_profit_master": None,
        "top_gross_master": None,
        "masters": [],
        "note": "Аналитика мастеров временно недоступна.",
    }


def _safe_owner_block(key: str, fn, fallback):
    try:
        return fn(), None
    except Exception as e:
        logger.error("owner_ai command_center %s: %s", key, e)
        return fallback(), {
            "key": key,
            "status": "warn",
            "message": "Не удалось собрать блок %s." % key,
        }


def _money_at_stake(opps: list[dict], risks: list[dict]) -> int:
    vals = []
    rows = list(opps or []) or list(risks or [])
    for row in rows:
        if isinstance(row, dict) and row.get("potential_rub") is not None:
            vals.append(_rub(row.get("potential_rub")))
    return sum(vals)


def _dedup_actions(opps: list[dict]) -> list[dict]:
    actions, seen = [], set()
    for opp in opps or []:
        action = _action_from_opportunity(opp)
        if not action:
            continue
        key = action.get("job") or action.get("label") or action.get("title")
        if key in seen:
            continue
        seen.add(key)
        actions.append(action)
    return actions[:4]


def _control_queue(*, risks: list[dict], actions: list[dict], journal: list[dict],
                   errors: list[dict], plan: dict | None, now_iso: str) -> list[dict]:
    """Единая очередь управленческого контроля owner OS.

    Это не отдельная task-БД, а стабильная read-only проекция: MAYA собирает
    ближайшие контрольные пункты из рисков, предложенных действий, журнала и
    системных ошибок. ПД не попадают: только агрегаты и названия задач.
    """
    out, seen = [], set()

    def add(key: str, title: str, detail: str = "", *, status: str = "warn",
            source: str = "maya", potential_rub=None, owner_next_step: str = "",
            due_at: str | None = None, action_job: str | None = None,
            action_id=None, due_state: str | None = None,
            signal_key: str | None = None, linked_action_id=None,
            linked_action_job: str | None = None,
            linked_action_status: str | None = None,
            linked_action_due_at: str | None = None,
            linked_action_updated_at: str | None = None,
            linked_action_evaluated_at: str | None = None,
            linked_action_impact_status: str | None = None,
            linked_action_impact_message: str | None = None,
            assigned_to: str | None = None,
            assignee_name: str | None = "",
            assignment_delivery_state: str | None = "",
            assignment_delivery_channel: str | None = "",
            assignment_delivery_message_id=0,
            assignment_delivery_updated_at: str | None = "",
            assignment_work_state: str | None = "",
            assignment_work_updated_at: str | None = "",
            assignment_work_actor_name: str | None = "",
            safe_autocreate: bool = False) -> None:
        key = (key or title or "control").strip()[:120]
        if not key or key in seen:
            return
        seen.add(key)
        out.append({
            "key": key,
            "title": title or "Контрольный пункт",
            "detail": detail or "",
            "status": status or "warn",
            "source": source,
            "potential_rub": _rub(potential_rub) if potential_rub is not None else None,
            "owner_next_step": owner_next_step or "",
            "due_at": due_at,
            "due_state": due_state,
            "action_job": action_job,
            "action_id": action_id,
            "signal_key": signal_key,
            "assigned_to": _normalize_assignee(assigned_to),
            "assignee_name": _safe_control_text(assignee_name, 80),
            "assigned_label": _assignee_label(assigned_to, assignee_name),
            "assignment_delivery_state": assignment_delivery_state or "",
            "assignment_delivery_channel": assignment_delivery_channel or "",
            "assignment_delivery_message_id": assignment_delivery_message_id or 0,
            "assignment_delivery_updated_at": assignment_delivery_updated_at or "",
            "assignment_delivery_label": _assignment_delivery_label(
                assignment_delivery_state,
                assignment_delivery_channel,
            ),
            "assignment_work_state": assignment_work_state or "",
            "assignment_work_updated_at": assignment_work_updated_at or "",
            "assignment_work_actor_name": _safe_control_text(assignment_work_actor_name, 80),
            "assignment_work_label": _assignment_work_label(assignment_work_state),
            "linked_action_id": linked_action_id,
            "linked_action_job": linked_action_job,
            "linked_action_status": linked_action_status,
            "linked_action_due_at": linked_action_due_at,
            "linked_action_updated_at": linked_action_updated_at,
            "linked_action_evaluated_at": linked_action_evaluated_at,
            "linked_action_impact_status": linked_action_impact_status,
            "linked_action_impact_message": linked_action_impact_message,
            "safe_autocreate": bool(safe_autocreate),
        })

    journal_by_id = {}
    for item in journal or []:
        try:
            journal_by_id[int(item.get("id") or 0)] = item
        except Exception:
            pass

    for er in errors or []:
        add(
            "error:%s" % (er.get("key") or "system"),
            "Проверить системный блок",
            er.get("message") or er.get("key") or "Один из блоков Owner OS временно недоступен.",
            status="high",
            source="system",
            owner_next_step="Обновить Owner OS. Если предупреждение повторяется — проверить backend-интеграцию.",
        )

    plan = plan or {}
    if plan.get("status") in ("warn", "risk"):
        needed = _rub(plan.get("needed_visits_to_target"))
        add(
            "plan_fact:revenue_gap",
            "День ниже плана",
            "Прогноз %s ₽ из плана %s ₽; разрыв %s ₽." % (
                _m(plan.get("projected_revenue_rub")),
                _m(plan.get("daily_target_rub")),
                _m(abs(plan.get("gap_rub") or 0)),
            ),
            status="high" if plan.get("status") == "risk" else "medium",
            source="plan_fact",
            potential_rub=abs(_rub(plan.get("gap_rub"))),
            owner_next_step=(
                "Нужно добрать примерно %d визит(а/ов): заполнить окна и запустить тёплый спрос."
                % needed
                if needed else "Проверить свободные окна и усилить продажи на сегодня."
            ),
        )

    for it in journal or []:
        status = str(it.get("status") or "")
        payload = it.get("payload") or {}
        if it.get("source") == "owner_control" and status in ("pending", "running"):
            due_at = it.get("result_due_at") or payload.get("due_at")
            due_state = None
            if due_at:
                due_s = str(due_at)
                if due_s <= now_iso:
                    due_state = "overdue"
                elif due_s[:10] == now_iso[:10]:
                    due_state = "today"
                else:
                    due_state = "scheduled"
            priority = payload.get("priority") or "medium"
            owner_next_step = payload.get("owner_next_step") or "Довести задачу до результата и проверить в журнале."
            summary = it.get("summary") if isinstance(it.get("summary"), dict) else {}
            linked_action_id = payload.get("linked_action_id") or summary.get("linked_action_id")
            linked_action_job = payload.get("linked_action_job") or summary.get("linked_action_job")
            linked_action_status = payload.get("linked_action_status") or summary.get("linked_action_status")
            linked_action_due_at = payload.get("linked_action_due_at")
            linked_action_updated_at = payload.get("linked_action_updated_at") or summary.get("updated_at")
            assignment_work_state = payload.get("assignment_work_state") or summary.get("assignment_work_state") or ""
            assignment_work_actor_name = payload.get("assignment_work_actor_name") or summary.get("assignment_work_actor_name") or ""
            assignment_work_updated_at = payload.get("assignment_work_updated_at") or summary.get("assignment_work_updated_at") or ""
            linked_action = None
            try:
                linked_action = journal_by_id.get(int(linked_action_id or 0))
            except Exception:
                linked_action = None
            linked_impact = linked_action.get("impact") if isinstance((linked_action or {}).get("impact"), dict) else {}
            linked_impact_status = (linked_action or {}).get("impact_status") or linked_impact.get("status")
            linked_impact_message = linked_impact.get("message") if isinstance(linked_impact, dict) else None
            linked_evaluated_at = (linked_action or {}).get("evaluated_at")
            if due_state == "overdue":
                priority = "high"
                owner_next_step = "Срок контроля прошёл. Отметить результат, отложить или отменить задачу."
            elif due_state == "today" and not payload.get("owner_next_step"):
                owner_next_step = "Проверить сегодня и закрыть или отложить задачу."
            if linked_action_status == "failed":
                priority = "high"
                owner_next_step = "Связанное действие завершилось ошибкой. Проверить журнал и повторить или закрыть контроль."
            elif linked_action_status in ("running", "done"):
                if due_state == "overdue":
                    priority = "high"
                    owner_next_step = "Действие уже выполнено. Срок проверки прошёл — оценить эффект и закрыть или отложить контроль."
                elif due_state == "today":
                    owner_next_step = "Действие уже выполнено. Сегодня проверить эффект и закрыть или отложить контроль."
                elif linked_action_status == "running":
                    owner_next_step = "Действие запущено. После завершения проверить результат и срок контроля."
                else:
                    owner_next_step = "Действие выполнено. Дождаться срока контроля результата и закрыть задачу по факту."
            if linked_impact_status == "positive_signal":
                owner_next_step = "Есть положительный сигнал. Можно закрыть контроль или оставить наблюдение до срока."
            elif linked_impact_status == "no_signal_yet":
                owner_next_step = "Эффект пока не виден. Отложить контроль и проверить позже."
            elif linked_impact_status == "no_reach":
                owner_next_step = "Охвата по действию не было. Проверить настройки автоматизации или повторить действие."
            if assignment_work_state == "done":
                owner_next_step = "Исполнитель отметил задачу как готовую. Проверить результат и закрыть контроль."
            elif assignment_work_state == "revision":
                owner_next_step = "Задача возвращена на доработку. Дождаться повторной готовности от исполнителя."
            elif assignment_work_state == "running":
                owner_next_step = "Исполнитель взял задачу в работу. Держать контроль результата до срока."
            elif assignment_work_state == "accepted":
                owner_next_step = "Исполнитель принял задачу. Проверить переход в работу и результат к сроку."
            elif assignment_work_state == "blocked":
                priority = "high"
                owner_next_step = "Исполнитель отметил блокировку. Разобрать причину и переназначить или помочь."
            add(
                "owner_control:%s" % (it.get("id") or it.get("title") or "task"),
                it.get("title") or "Контрольная задача",
                payload.get("detail") or "",
                status=priority,
                source="owner_control",
                potential_rub=payload.get("potential_rub"),
                due_at=due_at,
                due_state=due_state,
                action_job=payload.get("action_job"),
                action_id=it.get("id"),
                signal_key=payload.get("signal_key"),
                assigned_to=payload.get("assigned_to") or "owner",
                assignee_name=payload.get("assignee_name") or "",
                assignment_delivery_state=payload.get("assignment_delivery_state") or summary.get("assignment_delivery_state") or "",
                assignment_delivery_channel=payload.get("assignment_delivery_channel") or summary.get("assignment_delivery_channel") or "",
                assignment_delivery_message_id=payload.get("assignment_delivery_message_id") or summary.get("assignment_delivery_message_id") or 0,
                assignment_delivery_updated_at=payload.get("assignment_delivery_updated_at") or summary.get("assignment_delivery_updated_at") or payload.get("assignment_delivered_at") or "",
                assignment_work_state=assignment_work_state,
                assignment_work_updated_at=assignment_work_updated_at,
                assignment_work_actor_name=assignment_work_actor_name,
                owner_next_step=owner_next_step,
                linked_action_id=linked_action_id,
                linked_action_job=linked_action_job,
                linked_action_status=linked_action_status,
                linked_action_due_at=linked_action_due_at,
                linked_action_updated_at=linked_action_updated_at,
                linked_action_evaluated_at=linked_evaluated_at,
                linked_action_impact_status=linked_impact_status,
                linked_action_impact_message=linked_impact_message,
                safe_autocreate=payload.get("safe_autocreate"),
            )
        if status == "failed":
            add(
                "journal_failed:%s" % (it.get("id") or it.get("job") or "task"),
                "Разобрать сбой действия",
                it.get("title") or it.get("job") or "Действие завершилось ошибкой.",
                status="high",
                source="journal",
                owner_next_step="Открыть журнал AI-директора и повторить действие после проверки причины.",
            )
        due_at = it.get("result_due_at")
        if status == "done" and not it.get("evaluated_at") and due_at and str(due_at) <= now_iso:
            add(
                "journal_due:%s" % (it.get("id") or it.get("job") or "task"),
                "Проверить результат действия",
                it.get("title") or it.get("job") or "По действию уже наступил срок контроля результата.",
                status="medium",
                source="journal",
                due_at=due_at,
                owner_next_step="Нажать «Проверить» в журнале и посмотреть наблюдаемый сдвиг.",
            )

    for r in risks or []:
        add(
            "risk:%s" % (r.get("type") or r.get("title") or "risk"),
            r.get("title") or "Снять риск",
            r.get("detail") or "",
            status="high" if _severity_rank(r.get("severity")) >= 3 else "medium",
            source="risk",
            potential_rub=r.get("potential_rub"),
            owner_next_step=r.get("action_hint") or "Проверить причину и назначить следующее действие.",
        )

    for a in actions or []:
        job = a.get("job")
        add(
            "action:%s" % (job or a.get("title") or "action"),
            a.get("title") or a.get("label") or "Запустить действие",
            a.get("reason") or a.get("problem") or "",
            status="medium" if a.get("priority") != "high" else "high",
            source="action",
            potential_rub=a.get("potential_rub"),
            action_job=job,
            owner_next_step="Подтвердить запуск в блоке «Следующие действия».",
        )

    out.sort(key=lambda item: (
        -_severity_rank(item.get("status")),
        item.get("potential_rub") is None,
        -(item.get("potential_rub") or 0),
    ))
    return out[:8]


def _control_focus(control: list[dict], *, now_iso: str) -> dict:
    """Короткий дневной фокус по контролям: что владельцу закрыть первым."""
    rows = list(control or [])

    def item_reason(it: dict) -> tuple[str, str]:
        due_state = str(it.get("due_state") or "")
        linked_status = str(it.get("linked_action_status") or "")
        impact = str(it.get("linked_action_impact_status") or "")
        work_state = str(it.get("assignment_work_state") or "")
        if due_state == "overdue":
            return "overdue", "Просрочено"
        if work_state == "blocked":
            return "urgent", "Блокировка"
        if work_state == "revision":
            return "today", "На доработке"
        if work_state == "done":
            return "ready_to_close", "Исполнитель готов"
        if impact == "positive_signal":
            return "ready_to_close", "Можно закрыть"
        if linked_status == "done" and not it.get("linked_action_evaluated_at"):
            return "effect_check", "Проверить эффект"
        if due_state == "today":
            return "today", "Сегодня"
        if str(it.get("source") or "") == "journal" and it.get("due_at"):
            return "effect_check", "Проверить эффект"
        if _severity_rank(it.get("status")) >= 3:
            return "urgent", "Высокий риск"
        if it.get("potential_rub"):
            return "money", "Деньги на кону"
        return "watch", "Наблюдать"

    rank = {
        "overdue": 0,
        "effect_check": 1,
        "ready_to_close": 2,
        "today": 3,
        "urgent": 4,
        "money": 5,
        "watch": 6,
    }
    enriched = []
    for it in rows:
        reason_key, reason_label = item_reason(it)
        enriched.append({
            **it,
            "focus_reason": reason_key,
            "focus_label": reason_label,
        })
    enriched.sort(key=lambda it: (
        rank.get(it.get("focus_reason"), 9),
        -_severity_rank(it.get("status")),
        -(it.get("potential_rub") or 0),
        str(it.get("due_at") or "9999-99-99"),
        it.get("title") or "",
    ))

    overdue = [it for it in enriched if it.get("due_state") == "overdue"]
    due_today = [it for it in enriched if it.get("due_state") == "today"]
    needs_effect = [
        it for it in enriched
        if it.get("focus_reason") == "effect_check"
    ]
    ready_to_close = [
        it for it in enriched
        if it.get("focus_reason") == "ready_to_close"
    ]
    urgent = [
        it for it in enriched
        if _severity_rank(it.get("status")) >= 3
    ]
    money_at_stake = sum(_rub(it.get("potential_rub")) for it in enriched if it.get("potential_rub") is not None)
    top = enriched[:4]
    if overdue:
        headline = "Сначала закрыть просроченные контроли"
        status = "risk"
    elif needs_effect:
        headline = "Проверить эффект запущенных действий"
        status = "warn"
    elif ready_to_close:
        headline = "Есть контроли, готовые к закрытию"
        status = "ok"
    elif due_today:
        headline = "Сегодня есть контрольные точки"
        status = "warn"
    elif urgent:
        headline = "Есть срочные управленческие сигналы"
        status = "risk"
    else:
        headline = "Критичных контролей сейчас нет"
        status = "ok"
    return {
        "status": status,
        "headline": headline,
        "generated_at": now_iso,
        "summary": {
            "items_count": len(enriched),
            "focus_count": len(top),
            "urgent_count": len(urgent),
            "overdue_count": len(overdue),
            "due_today_count": len(due_today),
            "needs_effect_check_count": len(needs_effect),
            "ready_to_close_count": len(ready_to_close),
            "money_at_stake_rub": money_at_stake,
        },
        "items": top,
    }


def _execution_plan(*, control_focus: dict | None, plan: dict | None,
                    opps: list[dict], actions: list[dict],
                    automations: list[dict] | None = None,
                    top_risk: dict | None = None,
                    now_iso: str | None = None) -> dict:
    """1-3 шага владельца на сегодня: короткий слой исполнения поверх OS-сигналов."""
    plan = plan or {}
    control_focus = control_focus or {}
    automations = automations or []
    actions_by_job = {
        item.get("job"): item
        for item in (actions or [])
        if item.get("job")
    }
    steps: list[dict] = []
    seen: set[str] = set()
    seen_jobs: set[str] = set()

    def add(key: str, title: str, detail: str = "", *, status: str = "medium",
            source: str = "maya", potential_rub=None, owner_next_step: str = "",
            action_job: str | None = None, action_card: dict | None = None,
            control_action_id=None, signal_key: str | None = None,
            linked_action_id=None, linked_action_status: str | None = None,
            linked_action_evaluated_at: str | None = None,
            focus_reason: str | None = None, focus_label: str | None = None,
            due_state: str | None = None,
            assigned_to: str | None = None,
            assignee_name: str | None = "",
            assignment_delivery_state: str | None = "",
            assignment_delivery_channel: str | None = "",
            assignment_delivery_message_id=0,
            assignment_delivery_updated_at: str | None = "",
            assignment_work_state: str | None = "",
            assignment_work_updated_at: str | None = "",
            assignment_work_actor_name: str | None = "",
            safe_autocreate: bool = False) -> None:
        if not key or key in seen or len(steps) >= 3:
            return
        if action_job and ("job:%s" % action_job) in seen and source != "control_focus":
            return
        seen.add(key)
        if action_job:
            seen.add("job:%s" % action_job)
            seen_jobs.add(action_job)
        if not action_card and action_job:
            action_card = actions_by_job.get(action_job) or owner_action_payload(
                action_job,
                title=title,
                reason=detail or owner_next_step,
                potential_rub=potential_rub,
                priority=status,
            )
        steps.append({
            "key": key,
            "title": title or "Шаг владельца",
            "detail": detail or "",
            "status": status or "medium",
            "source": source,
            "potential_rub": _rub(potential_rub) if potential_rub is not None else None,
            "owner_next_step": owner_next_step or "",
            "action_job": action_job,
            "action_card": action_card,
            "control_action_id": control_action_id,
            "signal_key": signal_key,
            "linked_action_id": linked_action_id,
            "linked_action_status": linked_action_status,
            "linked_action_evaluated_at": linked_action_evaluated_at,
            "focus_reason": focus_reason,
            "focus_label": focus_label,
            "due_state": due_state,
            "assigned_to": _normalize_assignee(assigned_to),
            "assignee_name": _safe_control_text(assignee_name, 80),
            "assigned_label": _assignee_label(assigned_to, assignee_name),
            "assignment_delivery_state": assignment_delivery_state or "",
            "assignment_delivery_channel": assignment_delivery_channel or "",
            "assignment_delivery_message_id": assignment_delivery_message_id or 0,
            "assignment_delivery_updated_at": assignment_delivery_updated_at or "",
            "assignment_delivery_label": _assignment_delivery_label(
                assignment_delivery_state,
                assignment_delivery_channel,
            ),
            "assignment_work_state": assignment_work_state or "",
            "assignment_work_updated_at": assignment_work_updated_at or "",
            "assignment_work_actor_name": _safe_control_text(assignment_work_actor_name, 80),
            "assignment_work_label": _assignment_work_label(assignment_work_state),
            "safe_autocreate": bool(safe_autocreate),
        })

    for item in (control_focus.get("items") or [])[:1]:
        reason = item.get("focus_reason")
        if reason == "effect_check":
            title = "Проверить эффект действия"
            next_step = "Оценить результат и закрыть или переназначить контроль."
        elif reason == "ready_to_close":
            title = "Закрыть сработавший контроль"
            next_step = "Зафиксировать результат и закрыть контроль как выполненный."
        elif item.get("due_state") == "overdue":
            title = "Закрыть просроченный контроль"
            next_step = item.get("owner_next_step") or "Принять решение по просроченному контролю сегодня."
        else:
            title = item.get("title") or "Разобрать главный контроль"
            next_step = item.get("owner_next_step") or "Проверить контроль и назначить следующий шаг."
        add(
            "control:%s" % (item.get("action_id") or item.get("key") or item.get("title") or "focus"),
            title,
            item.get("title") or item.get("detail") or "",
            status=item.get("status") or "medium",
            source="control_focus",
            potential_rub=item.get("potential_rub"),
            owner_next_step=next_step,
            action_job=item.get("action_job"),
            control_action_id=item.get("action_id"),
            signal_key=item.get("signal_key"),
            linked_action_id=item.get("linked_action_id"),
            linked_action_status=item.get("linked_action_status"),
            linked_action_evaluated_at=item.get("linked_action_evaluated_at"),
            focus_reason=reason,
            focus_label=item.get("focus_label"),
            due_state=item.get("due_state"),
            assigned_to=item.get("assigned_to") or "owner",
            assignee_name=item.get("assignee_name") or "",
            assignment_delivery_state=item.get("assignment_delivery_state") or "",
            assignment_delivery_channel=item.get("assignment_delivery_channel") or "",
            assignment_delivery_message_id=item.get("assignment_delivery_message_id") or 0,
            assignment_delivery_updated_at=item.get("assignment_delivery_updated_at") or "",
            assignment_work_state=item.get("assignment_work_state") or "",
            assignment_work_updated_at=item.get("assignment_work_updated_at") or "",
            assignment_work_actor_name=item.get("assignment_work_actor_name") or "",
            safe_autocreate=item.get("safe_autocreate"),
        )

    gap = _rub(plan.get("gap_rub"))
    if len(steps) < 3 and plan.get("status") in ("warn", "risk") and gap < 0:
        action_job = "cycle" if "cycle" in actions_by_job else None
        add(
            "plan_fact:gap",
            "Добрать план дня",
            "Не хватает %s ₽; нужно примерно %s визит(а/ов)." % (
                _m(abs(gap)),
                _m(plan.get("needed_visits_to_target") or 0),
            ),
            status=plan.get("status") or "medium",
            source="plan_fact",
            potential_rub=abs(gap),
            owner_next_step="Заполнить свободные окна тёплым спросом и пересмотреть прогноз вечером.",
            action_job=action_job,
            signal_key=_attention_signal_key(kind="plan_fact", source="plan_fact", title="День ниже плана"),
        )

    for action in actions or []:
        if len(steps) >= 3:
            break
        job = action.get("job")
        if job in seen_jobs:
            continue
        add(
            "action:%s" % (job or action.get("title") or "next"),
            action.get("title") or action.get("label") or "Запустить действие",
            action.get("reason") or action.get("problem") or "",
            status="high" if action.get("priority") == "high" else "medium",
            source="action",
            potential_rub=action.get("potential_rub"),
            owner_next_step="Подтвердить запуск и проверить результат в журнале.",
            action_job=job,
            action_card=action,
        )

    for auto in automations:
        if len(steps) >= 3:
            break
        if auto.get("state") != "recommended" or auto.get("job") in seen_jobs:
            continue
        action = auto.get("action_card") or actions_by_job.get(auto.get("job"))
        add(
            "automation:%s" % (auto.get("job") or auto.get("title") or "recommended"),
            auto.get("title") or "Запустить автоматизацию",
            auto.get("next_step") or auto.get("label") or "",
            status=auto.get("status") or "medium",
            source="automation",
            potential_rub=auto.get("potential_rub"),
            owner_next_step="Запустить вручную, если повод актуален.",
            action_job=auto.get("job"),
            action_card=action,
        )

    if len(steps) < 3 and top_risk:
        add(
            "risk:%s" % (top_risk.get("type") or top_risk.get("title") or "top"),
            top_risk.get("title") or "Снять риск",
            top_risk.get("detail") or "",
            status="high" if _severity_rank(top_risk.get("severity")) >= 3 else "medium",
            source="risk",
            potential_rub=top_risk.get("potential_rub"),
            owner_next_step=top_risk.get("action_hint") or "Проверить причину риска и назначить контроль.",
        )

    if not steps and opps:
        top = opps[0] or {}
        add(
            "opportunity:%s" % (top.get("type") or top.get("title") or "top"),
            top.get("title") or "Разобрать возможность",
            top.get("detail") or "",
            status="medium",
            source="money",
            potential_rub=top.get("potential_rub"),
            owner_next_step=top.get("action_hint") or "Принять решение, стоит ли брать в работу.",
            action_job=_OPPORTUNITY_TO_ACTION.get(top.get("type")),
        )

    actionable_count = len([
        it for it in steps
        if it.get("action_job") or it.get("linked_action_id") or it.get("control_action_id")
    ])
    money_at_stake = sum(_rub(it.get("potential_rub")) for it in steps if it.get("potential_rub") is not None)
    high_count = len([it for it in steps if _severity_rank(it.get("status")) >= 3])
    plan_gap = bool(plan.get("status") in ("warn", "risk") and gap < 0)
    if not steps:
        status = "ok"
        headline = "Срочных шагов на сегодня нет"
    elif high_count or any(it.get("due_state") == "overdue" for it in steps):
        status = "risk"
        headline = "Сегодня сначала закрыть критичный шаг"
    else:
        status = "warn"
        headline = "План действий на сегодня"

    return {
        "status": status,
        "headline": headline,
        "generated_at": now_iso or datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "steps_count": len(steps),
            "actionable_count": actionable_count,
            "money_at_stake_rub": money_at_stake,
            "high_count": high_count,
            "has_control": any(it.get("source") == "control_focus" for it in steps),
            "has_plan_gap": plan_gap,
            "has_action": any(it.get("action_job") for it in steps),
        },
        "steps": steps,
    }


def _task_center(*, control: list[dict], journal: list[dict],
                 automations: list[dict] | None,
                 execution_plan: dict | None,
                 now_iso: str | None = None) -> dict:
    """Единый центр задач owner OS: что открыто, кто держит, какой следующий шаг."""
    now_iso = now_iso or datetime.now().isoformat(timespec="seconds")
    automations = automations or []
    execution_plan = execution_plan or {}
    rows: list[dict] = []
    seen: set[str] = set()
    lane_label = {
        "overdue": "Просрочено",
        "today": "Сегодня",
        "effect_check": "Проверить эффект",
        "running": "Выполняется",
        "owner_queue": "Ждёт владельца",
        "recommended": "Рекомендовано",
        "system": "Система",
    }
    lane_rank = {
        "overdue": 0,
        "effect_check": 1,
        "today": 2,
        "running": 3,
        "owner_queue": 4,
        "recommended": 5,
        "system": 6,
    }

    def normalize_lane(*, due_state: str | None = None,
                       linked_status: str | None = None,
                       linked_evaluated_at: str | None = None,
                       source: str | None = None,
                       status: str | None = None,
                       state: str | None = None,
                       assignment_work_state: str | None = None) -> str:
        if due_state == "overdue" or status == "failed" or state == "failed":
            return "overdue"
        if assignment_work_state == "blocked":
            return "overdue"
        if assignment_work_state == "done":
            return "effect_check"
        if assignment_work_state == "revision":
            return "running"
        if linked_status == "done" and not linked_evaluated_at:
            return "effect_check"
        if due_state == "today":
            return "today"
        if linked_status == "running" or status == "running" or state == "running" or assignment_work_state in ("accepted", "running"):
            return "running"
        if source == "system":
            return "system"
        if state in ("recommended", "stale", "never_run"):
            return "recommended"
        return "owner_queue"

    def task_key(prefix: str, item: dict) -> str:
        if item.get("control_action_id") or item.get("action_id"):
            return "control:%s" % (item.get("control_action_id") or item.get("action_id"))
        if item.get("linked_action_id"):
            return "linked:%s" % item.get("linked_action_id")
        if item.get("action_job"):
            return "action:%s" % item.get("action_job")
        return "%s:%s" % (prefix, item.get("key") or item.get("title") or len(rows))

    def add(key: str, title: str, detail: str = "", *, lane: str = "owner_queue",
            status: str = "medium", source: str = "maya", assigned_to: str = "owner",
            potential_rub=None, owner_next_step: str = "", due_at: str | None = None,
            due_state: str | None = None, action_job: str | None = None,
            action_card: dict | None = None, control_action_id=None,
            linked_action_id=None, linked_action_status: str | None = None,
            linked_action_evaluated_at: str | None = None,
            assignee_name: str | None = "",
            assignment_delivery_state: str | None = "",
            assignment_delivery_channel: str | None = "",
            assignment_delivery_message_id=0,
            assignment_delivery_updated_at: str | None = "",
            assignment_work_state: str | None = "",
            assignment_work_updated_at: str | None = "",
            assignment_work_actor_name: str | None = "",
            pinned: bool = False, safe_autocreate: bool = False) -> None:
        key = (key or title or "task").strip()[:140]
        if not key or key in seen:
            return
        seen.add(key)
        if action_job and not action_card:
            action_card = owner_action_payload(
                action_job,
                title=title,
                reason=detail or owner_next_step,
                potential_rub=potential_rub,
                priority=status,
            )
        rows.append({
            "key": key,
            "title": title or "Задача",
            "detail": detail or "",
            "lane": lane,
            "lane_label": lane_label.get(lane, "Задача"),
            "status": status or "medium",
            "source": source,
            "assigned_to": _normalize_assignee(assigned_to),
            "assignee_name": _safe_control_text(assignee_name, 80),
            "assigned_label": _assignee_label(assigned_to, assignee_name),
            "assignment_delivery_state": assignment_delivery_state or "",
            "assignment_delivery_channel": assignment_delivery_channel or "",
            "assignment_delivery_message_id": assignment_delivery_message_id or 0,
            "assignment_delivery_updated_at": assignment_delivery_updated_at or "",
            "assignment_delivery_label": _assignment_delivery_label(
                assignment_delivery_state,
                assignment_delivery_channel,
            ),
            "assignment_work_state": assignment_work_state or "",
            "assignment_work_updated_at": assignment_work_updated_at or "",
            "assignment_work_actor_name": _safe_control_text(assignment_work_actor_name, 80),
            "assignment_work_label": _assignment_work_label(assignment_work_state),
            "potential_rub": _rub(potential_rub) if potential_rub is not None else None,
            "owner_next_step": owner_next_step or "",
            "due_at": due_at,
            "due_state": due_state,
            "action_job": action_job,
            "action_card": action_card,
            "control_action_id": control_action_id,
            "linked_action_id": linked_action_id,
            "linked_action_status": linked_action_status,
            "linked_action_evaluated_at": linked_action_evaluated_at,
            "safe_autocreate": bool(safe_autocreate),
            "pinned": bool(pinned),
        })

    for step in (execution_plan.get("steps") or []):
        lane = normalize_lane(
            due_state=step.get("due_state"),
            linked_status=step.get("linked_action_status"),
            linked_evaluated_at=step.get("linked_action_evaluated_at"),
            source=step.get("source"),
            status=step.get("status"),
            assignment_work_state=step.get("assignment_work_state"),
        )
        add(
            task_key("execution", step),
            step.get("title") or "Шаг плана",
            step.get("detail") or "",
            lane=lane,
            status=step.get("status") or "medium",
            source="execution_plan",
            potential_rub=step.get("potential_rub"),
            owner_next_step=step.get("owner_next_step") or "",
            due_state=step.get("due_state"),
            action_job=step.get("action_job"),
            action_card=step.get("action_card"),
            control_action_id=step.get("control_action_id"),
            linked_action_id=step.get("linked_action_id"),
            linked_action_status=step.get("linked_action_status"),
            linked_action_evaluated_at=step.get("linked_action_evaluated_at"),
            assigned_to=step.get("assigned_to") or "owner",
            assignee_name=step.get("assignee_name") or "",
            assignment_delivery_state=step.get("assignment_delivery_state") or "",
            assignment_delivery_channel=step.get("assignment_delivery_channel") or "",
            assignment_delivery_message_id=step.get("assignment_delivery_message_id") or 0,
            assignment_delivery_updated_at=step.get("assignment_delivery_updated_at") or "",
            assignment_work_state=step.get("assignment_work_state") or "",
            assignment_work_updated_at=step.get("assignment_work_updated_at") or "",
            assignment_work_actor_name=step.get("assignment_work_actor_name") or "",
            safe_autocreate=step.get("safe_autocreate"),
            pinned=True,
        )

    for item in control or []:
        lane = normalize_lane(
            due_state=item.get("due_state"),
            linked_status=item.get("linked_action_status"),
            linked_evaluated_at=item.get("linked_action_evaluated_at"),
            source=item.get("source"),
            status=item.get("status"),
            assignment_work_state=item.get("assignment_work_state"),
        )
        source = item.get("source") or "maya"
        assignee = item.get("assigned_to") or ("system" if source == "system" else "owner")
        add(
            task_key("control", item),
            item.get("title") or "Контроль",
            item.get("detail") or "",
            lane=lane,
            status=item.get("status") or "medium",
            source=source,
            assigned_to=assignee,
            assignee_name=item.get("assignee_name") or "",
            potential_rub=item.get("potential_rub"),
            owner_next_step=item.get("owner_next_step") or "",
            due_at=item.get("due_at"),
            due_state=item.get("due_state"),
            action_job=item.get("action_job"),
            control_action_id=item.get("action_id"),
            linked_action_id=item.get("linked_action_id"),
            linked_action_status=item.get("linked_action_status"),
            linked_action_evaluated_at=item.get("linked_action_evaluated_at"),
            assignment_delivery_state=item.get("assignment_delivery_state") or "",
            assignment_delivery_channel=item.get("assignment_delivery_channel") or "",
            assignment_delivery_message_id=item.get("assignment_delivery_message_id") or 0,
            assignment_delivery_updated_at=item.get("assignment_delivery_updated_at") or "",
            assignment_work_state=item.get("assignment_work_state") or "",
            assignment_work_updated_at=item.get("assignment_work_updated_at") or "",
            assignment_work_actor_name=item.get("assignment_work_actor_name") or "",
            safe_autocreate=item.get("safe_autocreate"),
        )

    for item in journal or []:
        status = str(item.get("status") or "")
        if status not in ("running", "failed", "done"):
            continue
        due_at = item.get("result_due_at")
        if status == "done" and (item.get("evaluated_at") or not due_at or str(due_at) > now_iso):
            continue
        lane = normalize_lane(status=status, state=status)
        if status == "done":
            lane = "effect_check"
        add(
            "journal:%s" % (item.get("id") or item.get("job") or item.get("title")),
            item.get("title") or item.get("job") or "Действие MAYA",
            item.get("error") or "",
            lane=lane,
            status="high" if status == "failed" else ("medium" if status == "done" else "warn"),
            source="journal",
            assigned_to="maya" if status == "running" else "owner",
            owner_next_step=(
                "Дождаться завершения в журнале AI-директора."
                if status == "running" else
                "Проверить эффект действия и закрыть контроль результата."
                if status == "done" else
                "Разобрать ошибку и повторить действие после проверки причины."
            ),
            due_at=due_at,
            linked_action_id=item.get("id"),
            linked_action_status=status,
            linked_action_evaluated_at=item.get("evaluated_at"),
        )

    for item in automations:
        state = str(item.get("state") or "")
        if item.get("status") == "ok" and state not in ("recommended", "stale", "never_run", "running", "failed"):
            continue
        lane = normalize_lane(state=state, status=item.get("status"))
        action = item.get("action_card") or (
            {"job": item.get("job"), "title": item.get("title"), "label": item.get("label"), "priority": item.get("status")}
            if item.get("recommended") and item.get("job") else None
        )
        add(
            "automation:%s" % (item.get("job") or item.get("title") or "task"),
            item.get("title") or item.get("job") or "Автоматизация",
            item.get("next_step") or "",
            lane=lane,
            status=item.get("status") or "medium",
            source="automation",
            assigned_to="maya" if state == "running" else "owner",
            owner_next_step=item.get("next_step") or "",
            action_job=item.get("job") if action else None,
            action_card=action,
            linked_action_id=item.get("last_action_id"),
            linked_action_status=item.get("last_status"),
            linked_action_evaluated_at=item.get("last_evaluated_at"),
        )

    rows.sort(key=lambda item: (
        not item.get("pinned"),
        lane_rank.get(item.get("lane"), 9),
        -_severity_rank(item.get("status")),
        item.get("potential_rub") is None,
        -(item.get("potential_rub") or 0),
        str(item.get("due_at") or "9999-99-99"),
    ))
    rows = rows[:12]
    summary = {
        "tasks_count": len(rows),
        "overdue_count": len([it for it in rows if it.get("lane") == "overdue"]),
        "today_count": len([it for it in rows if it.get("lane") == "today"]),
        "effect_check_count": len([it for it in rows if it.get("lane") == "effect_check"]),
        "running_count": len([it for it in rows if it.get("lane") == "running"]),
        "owner_count": len([it for it in rows if it.get("assigned_to") == "owner"]),
        "maya_count": len([it for it in rows if it.get("assigned_to") == "maya"]),
        "delivery_queued_count": len([it for it in rows if it.get("assignment_delivery_state") == "queued"]),
        "delivery_done_count": len([it for it in rows if it.get("assignment_delivery_state") == "delivered"]),
        "assignee_running_count": len([it for it in rows if it.get("assignment_work_state") in ("accepted", "running", "blocked", "revision")]),
        "assignee_done_count": len([it for it in rows if it.get("assignment_work_state") == "done"]),
        "money_at_stake_rub": sum(_rub(it.get("potential_rub")) for it in rows if it.get("potential_rub") is not None),
    }
    if summary["overdue_count"]:
        status = "risk"
        headline = "Есть просроченные задачи"
    elif summary["effect_check_count"]:
        status = "warn"
        headline = "Нужно проверить эффект действий"
    elif summary["today_count"]:
        status = "warn"
        headline = "Сегодня есть контрольные задачи"
    elif summary["running_count"]:
        status = "warn"
        headline = "MAYA выполняет задачи"
    elif rows:
        status = "warn"
        headline = "Задачи на контроле"
    else:
        status = "ok"
        headline = "Открытых задач нет"
    return {
        "status": status,
        "headline": headline,
        "generated_at": now_iso,
        "summary": summary,
        "tasks": rows,
    }


def _attention_signal_key(*, kind: str, source: str, control_key: str | None = None,
                          action_job: str | None = None, title: str | None = None) -> str:
    return "attention:%s:%s:%s" % (
        kind or "notice",
        source or "maya",
        control_key or action_job or title or "signal",
    )


def _attention_feed(*, control: list[dict], plan: dict | None, top_risk: dict | None,
                    opps: list[dict], errors: list[dict]) -> list[dict]:
    """Короткая лента того, что владельцу стоит увидеть первым."""
    out, seen = [], set()
    active_signal_controls = {
        item.get("signal_key"): item
        for item in (control or [])
        if item.get("source") == "owner_control" and item.get("signal_key")
    }

    def add(kind: str, title: str, detail: str = "", *, severity: str = "medium",
            source: str = "maya", potential_rub=None, action_job: str | None = None,
            control_key: str | None = None, due_state: str | None = None) -> None:
        key = "%s:%s:%s" % (kind or "notice", source or "maya", control_key or title or "")
        if key in seen:
            return
        seen.add(key)
        signal_key = _attention_signal_key(
            kind=kind or "notice",
            source=source or "maya",
            control_key=control_key,
            action_job=action_job,
            title=title,
        )
        active_control = active_signal_controls.get(signal_key) or {}
        out.append({
            "kind": kind or "notice",
            "title": title or "Требует внимания",
            "detail": detail or "",
            "severity": severity or "medium",
            "source": source,
            "potential_rub": _rub(potential_rub) if potential_rub is not None else None,
            "action_job": action_job,
            "control_key": control_key,
            "due_state": due_state,
            "signal_key": signal_key,
            "in_control": bool(active_control),
            "control_task_id": active_control.get("action_id"),
        })

    for er in errors or []:
        add(
            "system",
            "Проверить системный блок",
            er.get("message") or er.get("key") or "",
            severity="high",
            source="system",
        )

    for item in control or []:
        if item.get("due_state") == "overdue":
            add(
                "control_overdue",
                "Просрочен контроль",
                item.get("title") or item.get("detail") or "",
                severity="high",
                source="owner_control",
                potential_rub=item.get("potential_rub"),
                control_key=item.get("key"),
                due_state=item.get("due_state"),
            )
        elif item.get("due_state") == "today":
            add(
                "control_today",
                "Контроль сегодня",
                item.get("title") or item.get("detail") or "",
                severity="medium",
                source="owner_control",
                potential_rub=item.get("potential_rub"),
                control_key=item.get("key"),
                due_state=item.get("due_state"),
            )

    plan = plan or {}
    if plan.get("status") in ("warn", "risk"):
        add(
            "plan_fact",
            "День ниже плана",
            "Разрыв %s ₽, нужно добрать примерно %s визит(а/ов)." % (
                _m(abs(plan.get("gap_rub") or 0)),
                _m(plan.get("needed_visits_to_target") or 0),
            ),
            severity="high" if plan.get("status") == "risk" else "medium",
            source="plan_fact",
            potential_rub=abs(_rub(plan.get("gap_rub"))),
        )

    if top_risk:
        add(
            "risk",
            top_risk.get("title") or "Риск бизнеса",
            top_risk.get("detail") or "",
            severity="high" if _severity_rank(top_risk.get("severity")) >= 3 else "medium",
            source="risk",
            potential_rub=top_risk.get("potential_rub"),
        )

    if opps:
        top = opps[0] or {}
        add(
            "opportunity",
            top.get("title") or "Деньги на кону",
            top.get("detail") or "",
            severity="medium",
            source="money",
            potential_rub=top.get("potential_rub"),
            action_job=(top.get("action") or top.get("task")),
        )

    out.sort(key=lambda item: (
        -_severity_rank(item.get("severity")),
        item.get("potential_rub") is None,
        -(item.get("potential_rub") or 0),
    ))
    return out[:6]


def _parse_iso(value: str | None):
    try:
        return datetime.fromisoformat(str(value or "")[:19])
    except Exception:
        return None


def _automation_status(*, journal: list[dict], actions: list[dict], now_iso: str) -> list[dict]:
    """Read-only карта бизнес-автоматизаций: что есть, что запускалось, что пора."""
    now_dt = _parse_iso(now_iso) or datetime.now()
    recommended = {}
    for action in actions or []:
        job = action.get("job")
        if job:
            recommended[job] = action

    last_by_job = {}
    for item in journal or []:
        job = item.get("job")
        if job in _AUTOMATION_LIBRARY and job not in last_by_job:
            last_by_job[job] = item

    out = []
    for job, meta in _AUTOMATION_LIBRARY.items():
        base = _ACTION_LIBRARY.get(job) or {}
        last = last_by_job.get(job) or {}
        last_at = last.get("completed_at") or last.get("created_at")
        last_summary = last.get("summary") if isinstance(last.get("summary"), dict) else {}
        last_impact = last.get("impact") if isinstance(last.get("impact"), dict) else {}
        last_dt = _parse_iso(last_at)
        days_since = None
        seconds_since = None
        if last_dt:
            try:
                days_since = max(0, (now_dt.date() - last_dt.date()).days)
                seconds_since = max(0, int((now_dt - last_dt).total_seconds()))
            except Exception:
                days_since = None
                seconds_since = None
        rec = recommended.get(job)
        cadence = int(meta.get("cadence_days") or 1)
        if last and last.get("status") == "running":
            state = "running"
            status = "warn"
            next_step = "Уже выполняется. Дождитесь завершения в журнале AI-директора."
        elif last and last.get("status") == "failed":
            state = "failed"
            status = "high"
            next_step = "Разобрать ошибку в журнале и повторить после проверки."
        elif seconds_since is not None and seconds_since < _AUTOMATION_COOLDOWN_SECONDS:
            state = "recently_run"
            status = "ok"
            next_step = "Только что запускалось. Повторный запуск пока заблокирован, чтобы не отправить дубли."
        elif rec:
            state = "recommended"
            status = "warn" if rec.get("priority") != "high" else "high"
            next_step = "Есть повод запустить через подтверждение владельца."
        elif not last:
            state = "never_run"
            status = "warn"
            next_step = "Проверить условия и запустить вручную, если сценарий актуален."
        elif days_since is not None and days_since > cadence * 2:
            state = "stale"
            status = "warn"
            next_step = "Давно не запускалось. Проверить, есть ли новый повод."
        else:
            state = "ready"
            status = "ok"
            next_step = "Работает в ручном контуре подтверждения."
        out.append({
            "job": job,
            "title": meta.get("title") or base.get("title") or job,
            "label": base.get("label") or meta.get("title") or job,
            "mode": "manual_confirm",
            "status": status,
            "state": state,
            "recommended": bool(rec),
            "cadence_days": cadence,
            "last_status": last.get("status"),
            "last_action_id": last.get("id"),
            "last_run_at": last_at,
            "last_evaluated_at": last.get("evaluated_at"),
            "last_summary": last_summary,
            "last_impact_status": last.get("impact_status") or last_impact.get("status"),
            "last_impact": last_impact,
            "last_error": (last.get("error") or "")[:180],
            "days_since_last": days_since,
            "seconds_since_last": seconds_since,
            "cooldown_seconds_left": (
                max(0, _AUTOMATION_COOLDOWN_SECONDS - seconds_since)
                if seconds_since is not None and seconds_since < _AUTOMATION_COOLDOWN_SECONDS else 0
            ),
            "next_step": next_step,
            "action_card": rec if state == "recommended" else None,
        })
    out.sort(key=lambda item: (
        -_severity_rank(item.get("status")),
        not item.get("recommended"),
        item.get("days_since_last") is None,
        -(item.get("days_since_last") or 0),
        item.get("title") or "",
    ))
    return out


def _owner_review_layer(*, control: list[dict], now_iso: str) -> dict:
    """Очередь решений владельца по задачам, которые команда вернула на проверку."""
    now_dt = _parse_iso(now_iso) or datetime.now()
    rows = []
    for it in control or []:
        if it.get("source") != "owner_control" or not it.get("action_id"):
            continue
        work_state = str(it.get("assignment_work_state") or "")
        if work_state not in ("done", "blocked", "revision"):
            continue
        updated_at = it.get("assignment_work_updated_at") or it.get("due_at") or ""
        updated_dt = _parse_iso(updated_at)
        age_hours = None
        if updated_dt:
            try:
                age_hours = max(0, int((now_dt - updated_dt).total_seconds() // 3600))
            except Exception:
                age_hours = None
        if work_state == "done":
            review_state = "ready"
            status = "high" if age_hours is not None and age_hours >= 24 else "warn"
            decision_label = "Закрыть или вернуть"
            owner_next_step = "Проверить факт выполнения: закрыть контроль или вернуть исполнителю на доработку."
            next_actions = ["complete", "revision", "postpone"]
        elif work_state == "blocked":
            review_state = "blocked"
            status = "high"
            decision_label = "Разобрать блокировку"
            owner_next_step = "Исполнитель заблокирован. Помочь, переназначить или вернуть задачу в работу."
            next_actions = ["assign", "revision", "postpone"]
        else:
            review_state = "revision"
            status = "medium"
            decision_label = "Ждём доработку"
            owner_next_step = "Задача уже возвращена. Дождаться повторной готовности от исполнителя."
            next_actions = ["postpone"]
        rows.append({
            "key": "owner_review:%s" % it.get("action_id"),
            "control_action_id": it.get("action_id"),
            "title": it.get("title") or "Контрольная задача",
            "detail": it.get("detail") or "",
            "status": status,
            "review_state": review_state,
            "decision_label": decision_label,
            "assigned_to": it.get("assigned_to"),
            "assignee_name": it.get("assignee_name") or "",
            "assigned_label": it.get("assigned_label") or _assignee_label(it.get("assigned_to"), it.get("assignee_name")),
            "assignment_work_state": work_state,
            "assignment_work_label": it.get("assignment_work_label") or _assignment_work_label(work_state),
            "assignment_work_actor_name": it.get("assignment_work_actor_name") or "",
            "assignment_work_updated_at": updated_at,
            "assignment_age_hours": age_hours,
            "potential_rub": it.get("potential_rub"),
            "due_at": it.get("due_at"),
            "due_state": it.get("due_state"),
            "owner_next_step": owner_next_step,
            "next_actions": next_actions,
        })
    review_rank = {"blocked": 0, "ready": 1, "revision": 2}
    rows.sort(key=lambda item: (
        review_rank.get(item.get("review_state"), 9),
        -_severity_rank(item.get("status")),
        -(item.get("potential_rub") or 0),
        item.get("assignment_work_updated_at") or "",
    ))
    ready = [it for it in rows if it.get("review_state") == "ready"]
    blocked = [it for it in rows if it.get("review_state") == "blocked"]
    revision = [it for it in rows if it.get("review_state") == "revision"]
    if blocked:
        status = "risk"
        headline = "Есть задачи с блокировкой"
    elif ready:
        status = "warn"
        headline = "Есть задачи на проверку владельца"
    elif revision:
        status = "warn"
        headline = "Есть задачи на доработке"
    else:
        status = "ok"
        headline = "Нечего принимать у команды"
    return {
        "status": status,
        "headline": headline,
        "generated_at": now_iso,
        "summary": {
            "items_count": len(rows),
            "ready_count": len(ready),
            "blocked_count": len(blocked),
            "revision_count": len(revision),
            "stale_ready_count": len([
                it for it in ready
                if it.get("assignment_age_hours") is not None and it.get("assignment_age_hours") >= 24
            ]),
        },
        "items": rows[:8],
    }


def _automation_action_card(item: dict) -> dict | None:
    job = str((item or {}).get("job") or "").strip().lower()
    if job not in _AUTOMATION_LIBRARY:
        return None
    status = str((item or {}).get("status") or "").lower()
    priority = status if status in ("low", "medium", "high") else ("high" if status == "risk" else "medium")
    return owner_action_payload(
        job,
        title=(item or {}).get("title") or None,
        priority=priority,
    )


def _automation_queue(automations: list[dict]) -> dict:
    """Action-ready очередь бизнес-сценариев owner OS."""
    rows = []
    for it in automations or []:
        state = str(it.get("state") or "")
        status = str(it.get("status") or "ok")
        action_card = it.get("action_card")
        next_action = "watch"
        if state == "running":
            next_action = "wait"
        elif state == "failed":
            next_action = "fix_or_retry"
            action_card = action_card or _automation_action_card(it)
        elif state in ("recommended", "stale", "never_run"):
            next_action = "run"
            action_card = action_card or _automation_action_card(it)
        elif it.get("last_action_id") and it.get("last_status") == "done" and not it.get("last_evaluated_at"):
            next_action = "evaluate"
        else:
            continue
        rows.append({
            "key": "automation_queue:%s" % (it.get("job") or it.get("title") or len(rows)),
            "job": it.get("job"),
            "title": it.get("title") or it.get("job") or "Автоматизация",
            "label": it.get("label") or it.get("title") or it.get("job"),
            "status": "high" if status == "high" or state == "failed" else ("warn" if status != "ok" or next_action in ("run", "evaluate") else "ok"),
            "state": state,
            "mode": it.get("mode") or "manual_confirm",
            "next_action": next_action,
            "next_step": it.get("next_step") or "",
            "recommended": bool(it.get("recommended")),
            "action_card": action_card,
            "last_action_id": it.get("last_action_id"),
            "last_status": it.get("last_status"),
            "last_evaluated_at": it.get("last_evaluated_at"),
            "last_summary": it.get("last_summary") or {},
            "last_impact_status": it.get("last_impact_status"),
            "last_impact": it.get("last_impact") or {},
            "last_error": it.get("last_error") or "",
            "days_since_last": it.get("days_since_last"),
            "cooldown_seconds_left": it.get("cooldown_seconds_left") or 0,
        })
    action_rank = {"fix_or_retry": 0, "run": 1, "evaluate": 2, "wait": 3, "watch": 4}
    rows.sort(key=lambda item: (
        action_rank.get(item.get("next_action"), 9),
        -_severity_rank(item.get("status")),
        item.get("days_since_last") is None,
        -(item.get("days_since_last") or 0),
        item.get("title") or "",
    ))
    actionable = [it for it in rows if it.get("next_action") in ("run", "fix_or_retry") and it.get("action_card")]
    evaluable = [it for it in rows if it.get("next_action") == "evaluate"]
    failed = [it for it in rows if it.get("state") == "failed"]
    if failed:
        status = "risk"
        headline = "Есть ошибки автоматизаций"
    elif actionable:
        status = "warn"
        headline = "Есть бизнес-сценарии к запуску"
    elif evaluable:
        status = "warn"
        headline = "Нужно проверить эффект автоматизаций"
    elif rows:
        status = "warn"
        headline = "Автоматизации требуют контроля"
    else:
        status = "ok"
        headline = "Автоматизации под контролем"
    return {
        "status": status,
        "headline": headline,
        "summary": {
            "items_count": len(rows),
            "actionable_count": len(actionable),
            "evaluable_count": len(evaluable),
            "failed_count": len(failed),
            "manual_confirm": True,
        },
        "items": rows[:8],
    }


def _kpi_scorecard(*, snap: dict, plan: dict, masters: dict, ret: dict,
                   exp: dict, svc: dict, control_focus: dict,
                   owner_review: dict, automation_queue: dict) -> dict:
    """Сводный KPI-пульт: не бухгалтерия, а быстрый health-score бизнеса."""
    progress = plan.get("progress_pct")
    free_capacity = _rub(snap.get("free_capacity_today"))
    booked = _rub(snap.get("booked_today"))
    capacity_total = booked + free_capacity
    load_pct = int(round(booked * 100 / capacity_total)) if capacity_total else 100
    sleeping = _rub(ret.get("count"))
    weak_services = len(svc.get("weak_services") or [])
    review_ready = _rub((owner_review.get("summary") or {}).get("ready_count"))
    overdue = _rub((control_focus.get("summary") or {}).get("overdue_count"))
    automation_actions = _rub((automation_queue.get("summary") or {}).get("actionable_count"))
    score = 100
    if progress is not None and progress < 100:
        score -= min(24, int((100 - max(0, progress)) * 0.35))
    if load_pct < 80:
        score -= min(18, int((80 - load_pct) * 0.45))
    if sleeping:
        score -= min(14, max(3, sleeping // 2))
    if weak_services:
        score -= min(12, weak_services * 4)
    if overdue:
        score -= min(18, overdue * 6)
    if review_ready:
        score -= min(10, review_ready * 3)
    if automation_actions:
        score -= min(8, automation_actions * 2)
    score = max(0, min(100, score))
    if score < 55:
        status = "risk"
        headline = "Бизнес требует вмешательства"
    elif score < 78:
        status = "warn"
        headline = "Есть управленческие просадки"
    else:
        status = "ok"
        headline = "Операционный контур в норме"
    items = [
        {
            "key": "revenue_plan",
            "title": "План выручки",
            "value": progress,
            "unit": "%",
            "status": "warn" if progress is not None and progress < 100 else "ok",
            "detail": "Прогресс дневного плана." if progress is not None else "План пока считается автоматически.",
        },
        {
            "key": "daily_load",
            "title": "Загрузка дня",
            "value": load_pct,
            "unit": "%",
            "status": "warn" if load_pct < 80 else "ok",
            "detail": "Записи относительно доступной ёмкости дня.",
        },
        {
            "key": "client_base",
            "title": "Клиентская база",
            "value": sleeping,
            "unit": "уснувших",
            "status": "warn" if sleeping else "ok",
            "detail": "Клиенты без визита 28-56 дней.",
        },
        {
            "key": "execution",
            "title": "Исполнение",
            "value": overdue + review_ready,
            "unit": "контролей",
            "status": "risk" if overdue else ("warn" if review_ready else "ok"),
            "detail": "Просрочки и задачи, ожидающие решения владельца.",
        },
    ]
    top_profit = masters.get("top_profit_master") or {}
    if top_profit:
        items.append({
            "key": "master_profit_leader",
            "title": "Лидер вклада",
            "value": top_profit.get("name"),
            "unit": "",
            "status": "ok",
            "detail": "Вклад после процента: %s ₽." % _m(top_profit.get("profit_after_salary_rub")),
        })
    return {
        "status": status,
        "headline": headline,
        "score": score,
        "summary": {
            "score": score,
            "plan_progress_pct": progress,
            "daily_load_pct": load_pct,
            "free_capacity_today": free_capacity,
            "sleeping_clients": sleeping,
            "weak_services_count": weak_services,
            "owner_review_ready_count": review_ready,
            "automation_actionable_count": automation_actions,
        },
        "items": items,
        "note": "KPI-score — операционный индикатор, не бухгалтерский отчёт.",
    }


def _financial_director(*, snap: dict, plan: dict, masters: dict,
                        opps: list[dict], risks: list[dict]) -> dict:
    """Финансовый директор: прогноз по run-rate и управленческие деньги на кону."""
    today = date.today()
    first = today.replace(day=1)
    next_month = (first.replace(year=first.year + 1, month=1) if first.month == 12
                  else first.replace(month=first.month + 1))
    days_in_month = max(1, (next_month - first).days)
    gross_30 = _rub(masters.get("total_gross_rub"))
    salary_30 = _rub(masters.get("salary_total_rub"))
    contribution_30 = _rub(masters.get("profit_after_salary_total_rub"))
    daily_gross_run_rate = _rub(gross_30 / 30) if gross_30 else _rub(snap.get("avg_check_rub")) * _rub(snap.get("booked_today"))
    daily_contribution_run_rate = _rub(contribution_30 / 30) if contribution_30 else 0
    projected_month_gross = daily_gross_run_rate * days_in_month
    projected_month_contribution = daily_contribution_run_rate * days_in_month
    money_at_stake = _money_at_stake(opps, risks)
    plan_gap = _rub(plan.get("gap_rub"))
    runway_status = "warn" if plan_gap < 0 or money_at_stake else "ok"
    decisions = []
    if plan_gap < 0:
        decisions.append({
            "key": "close_daily_gap",
            "title": "Закрыть разрыв дня",
            "detail": "Не хватает %s ₽ до дневного плана." % _m(abs(plan_gap)),
            "status": "high" if plan.get("status") == "risk" else "medium",
            "potential_rub": abs(plan_gap),
        })
    if money_at_stake:
        decisions.append({
            "key": "protect_money_at_stake",
            "title": "Забрать деньги на кону",
            "detail": "Возможности и риски дают до %s ₽ потенциального эффекта." % _m(money_at_stake),
            "status": "medium",
            "potential_rub": money_at_stake,
        })
    return {
        "status": runway_status,
        "headline": "Финансовый директор держит прогноз месяца",
        "summary": {
            "gross_30d_rub": gross_30,
            "salary_30d_rub": salary_30,
            "contribution_after_salary_30d_rub": contribution_30,
            "daily_gross_run_rate_rub": daily_gross_run_rate,
            "projected_month_gross_rub": projected_month_gross,
            "projected_month_contribution_after_salary_rub": projected_month_contribution,
            "money_at_stake_rub": money_at_stake,
            "plan_gap_rub": plan_gap,
            "days_in_month": days_in_month,
        },
        "decisions": decisions[:4],
        "note": (
            "Прогноз месяца считается по run-rate последних 30 дней. Общие расходы "
            "салона пока не распределены: это вклад после выплат мастерам, не чистая прибыль."
        ),
    }


def _approval_matrix() -> dict:
    """Матрица автономии: что MAYA может делать сама, а где нужен владелец."""
    rows = [
        {
            "key": "internal_control_tasks",
            "title": "Внутренние задачи и контроль",
            "autonomy": "auto",
            "owner_approval": False,
            "examples": ["создать задачу", "назначить контроль", "поставить дедлайн"],
        },
        {
            "key": "staff_followup",
            "title": "Напоминания сотрудникам",
            "autonomy": "supervised",
            "owner_approval": False,
            "examples": ["попросить статус", "вернуть задачу в работу"],
        },
        {
            "key": "marketing_broadcast",
            "title": "Рассылки клиентам",
            "autonomy": "approval_required",
            "owner_approval": True,
            "examples": ["реактивация", "цикл визита", "абонементы"],
        },
        {
            "key": "money_prices_payroll",
            "title": "Деньги, цены, зарплаты",
            "autonomy": "approval_required",
            "owner_approval": True,
            "examples": ["изменить цену", "утвердить выплату", "скидка"],
        },
        {
            "key": "access_and_sensitive_data",
            "title": "Доступы и чувствительные данные",
            "autonomy": "owner_only",
            "owner_approval": True,
            "examples": ["роль сотрудника", "зарплаты", "персональные данные"],
        },
    ]
    return {
        "version": "approval_matrix_v1",
        "status": "ok",
        "headline": "Автономия включена только в безопасном контуре",
        "rows": rows,
        "summary": {
            "auto_count": len([r for r in rows if r.get("autonomy") == "auto"]),
            "approval_required_count": len([r for r in rows if r.get("owner_approval")]),
        },
    }


def _autonomous_task_candidates(*, plan: dict, top_risk: dict | None,
                                automation_queue: dict, owner_review: dict,
                                svc: dict, control: list[dict]) -> list[dict]:
    """Что AI-директор может сам поставить в контроль как внутреннюю задачу."""
    active_keys = {
        item.get("signal_key")
        for item in control or []
        if item.get("source") == "owner_control" and item.get("signal_key")
    }
    out, seen = [], set()

    def add(key: str, title: str, detail: str = "", *, priority: str = "medium",
            potential_rub=None, assigned_to: str = "owner", assignee_name: str = "",
            due_in_days: int = 1, action_job: str = "", approval_required: bool = False,
            owner_next_step: str = "") -> None:
        signal_key = "autonomy:%s" % (key or title or "task")
        if signal_key in seen:
            return
        seen.add(signal_key)
        in_control = signal_key in active_keys
        out.append({
            "key": key,
            "signal_key": signal_key,
            "title": title or "Автономная задача",
            "detail": detail or "",
            "priority": priority if priority in ("low", "medium", "high") else "medium",
            "potential_rub": _rub(potential_rub) if potential_rub is not None else None,
            "assigned_to": _normalize_assignee(assigned_to),
            "assignee_name": _safe_control_text(assignee_name, 80),
            "assigned_label": _assignee_label(assigned_to, assignee_name),
            "due_in_days": due_in_days,
            "action_job": action_job or "",
            "approval_required": bool(approval_required),
            "safe_autocreate": True,
            "in_control": in_control,
            "owner_next_step": owner_next_step or "Довести задачу до результата и проверить эффект.",
        })

    gap = _rub(plan.get("gap_rub"))
    if plan.get("status") in ("warn", "risk") and gap < 0:
        add(
            "plan_fact_gap",
            "Автопилот: добрать план дня",
            "Разрыв %s ₽; проверить свободные окна и подготовить тёплый спрос." % _m(abs(gap)),
            priority="high" if plan.get("status") == "risk" else "medium",
            potential_rub=abs(gap),
            assigned_to="admin",
            assignee_name="смена",
            due_in_days=1,
            action_job="cycle",
            approval_required=True,
            owner_next_step="Админу проверить окна; владельцу подтвердить рассылку, если нужен внешний контакт.",
        )
    if top_risk:
        add(
            "top_risk:%s" % (top_risk.get("type") or top_risk.get("title") or "risk"),
            "Автопилот: снять главный риск",
            top_risk.get("detail") or top_risk.get("title") or "",
            priority="high" if _severity_rank(top_risk.get("severity")) >= 3 else "medium",
            potential_rub=top_risk.get("potential_rub"),
            assigned_to="owner",
            due_in_days=1,
            owner_next_step=top_risk.get("action_hint") or "Назначить ответственного и закрыть риск.",
        )
    for item in (automation_queue.get("items") or [])[:2]:
        if item.get("next_action") not in ("run", "fix_or_retry") or not item.get("job"):
            continue
        add(
            "automation:%s" % item.get("job"),
            "Автопилот: подготовить сценарий «%s»" % (item.get("title") or item.get("job")),
            item.get("next_step") or "Подготовить запуск и дождаться подтверждения владельца.",
            priority="high" if item.get("status") == "high" else "medium",
            assigned_to="maya",
            due_in_days=1,
            action_job=item.get("job") or "",
            approval_required=True,
            owner_next_step="MAYA готовит сценарий; внешний запуск только после подтверждения владельца.",
        )
    ready_review = (owner_review.get("summary") or {}).get("ready_count") or 0
    if ready_review:
        add(
            "owner_review_ready",
            "Автопилот: принять готовые поручения",
            "Команда отметила готовыми %s задач(и). Нужно закрыть или вернуть на доработку." % _m(ready_review),
            priority="medium",
            assigned_to="owner",
            due_in_days=1,
            owner_next_step="Проверить результат исполнителя и принять решение.",
        )
    weak = svc.get("weak_services") or []
    if weak:
        first = weak[0] or {}
        add(
            "weak_service:%s" % (first.get("title") or first.get("service") or "service"),
            "Автопилот: разобрать просевшую услугу",
            "Просела услуга: %s. Проверить причину, подачу и предложение в чате." % (first.get("title") or first.get("service") or "услуга"),
            priority="medium",
            assigned_to="owner",
            due_in_days=2,
            owner_next_step="Решить: усилить продажу, пакет, скрипт админа или временно не продвигать.",
        )
    out.sort(key=lambda item: (
        item.get("in_control"),
        -_severity_rank(item.get("priority")),
        item.get("potential_rub") is None,
        -(item.get("potential_rub") or 0),
        item.get("title") or "",
    ))
    return out[:6]


def _autonomous_director(*, kpi: dict, finance: dict, approval: dict,
                         task_candidates: list[dict]) -> dict:
    open_candidates = [c for c in task_candidates if c.get("safe_autocreate") and not c.get("in_control")]
    approval_needed = [c for c in task_candidates if c.get("approval_required")]
    if open_candidates:
        status = "warn"
        headline = "Автопилот готов поставить внутренние задачи"
    elif approval_needed:
        status = "warn"
        headline = "Есть действия, требующие подтверждения владельца"
    else:
        status = "ok"
        headline = "Автономный контур под контролем"
    return {
        "version": "maya_os_v2_autonomous_director",
        "status": status,
        "headline": headline,
        "mode": "supervised_autopilot",
        "capabilities": [
            "сам считает KPI и прогноз",
            "сам формирует внутренние задачи",
            "сам держит approval matrix",
            "не запускает деньги и рассылки без владельца",
        ],
        "summary": {
            "kpi_score": kpi.get("score"),
            "task_candidates_count": len(task_candidates),
            "open_autocreate_count": len(open_candidates),
            "approval_required_count": len(approval_needed),
            "projected_month_gross_rub": (finance.get("summary") or {}).get("projected_month_gross_rub"),
            "money_at_stake_rub": (finance.get("summary") or {}).get("money_at_stake_rub"),
        },
        "task_candidates": task_candidates,
        "approval_matrix": approval,
        "next_step": (
            "Запустить автопилот: MAYA создаст безопасные внутренние задачи и не тронет внешние действия без подтверждения."
            if open_candidates else "Наблюдать и проверять эффект уже созданных задач."
        ),
    }


def run_autonomous_director_tick(*, created_by=None, limit: int = 5) -> dict:
    """Создаёт безопасные внутренние задачи из autonomous_director.task_candidates."""
    center = command_center()
    director = center.get("autonomous_director") or {}
    candidates = [
        c for c in (director.get("task_candidates") or [])
        if c.get("safe_autocreate") and not c.get("in_control")
    ][:max(1, min(10, int(limit or 5)))]
    created, skipped = [], []
    for cand in candidates:
        result = create_control_task(
            title=cand.get("title") or "Автономная задача",
            detail=cand.get("detail") or "",
            priority=cand.get("priority") or "medium",
            due_in_days=cand.get("due_in_days") or 1,
            potential_rub=cand.get("potential_rub"),
            owner_next_step=cand.get("owner_next_step") or "",
            signal_key=cand.get("signal_key") or "",
            signal_kind="autonomy",
            signal_source="maya_os_v2",
            action_job=cand.get("action_job") or "",
            assigned_to=cand.get("assigned_to") or "owner",
            assignee_name=cand.get("assignee_name") or "",
            created_by=created_by,
            safe_autocreate=True,
        )
        if result.get("ok") and not result.get("existing"):
            created.append({"candidate": cand, "task": result.get("task"), "task_id": result.get("task_id")})
        else:
            skipped.append({"candidate": cand, "result": result})
    updated_center = command_center()
    return {
        "ok": True,
        "mode": "supervised_autopilot",
        "created_count": len(created),
        "skipped_count": len(skipped),
        "created": created,
        "skipped": skipped,
        "center": updated_center,
        "note": "Созданы только внутренние контрольные задачи. Внешние действия требуют подтверждения владельца.",
    }


def command_center() -> dict:
    """Owner Command Center v1: единый read-only контракт Maya OS.

    Собирает уже существующие директорские блоки в стабильную структуру для
    founder/owner UI и будущего AI-директора. Блоки независимы: сбой одной
    подсистемы не валит весь центр управления.
    """
    snap, snap_err = _safe_owner_block("business_snapshot", business_snapshot, _fallback_snapshot)
    exp, exp_err = _safe_owner_block("expiring_assets", expiring_assets, _fallback_assets)
    ret, ret_err = _safe_owner_block("return_candidates", return_candidates, _fallback_return_candidates)
    svc, svc_err = _safe_owner_block("service_insights", service_insights, _fallback_services)
    plan, plan_err = _safe_owner_block("plan_fact", lambda: plan_fact(snap=snap), _fallback_plan_fact)
    masters, masters_err = _safe_owner_block("master_performance", master_performance, _fallback_master_performance)

    errors = [e for e in (snap_err, exp_err, ret_err, svc_err, plan_err, masters_err) if e]
    try:
        opps = money_opportunities(snap=snap, exp=exp, ret=ret)
    except Exception as e:
        logger.error("owner_ai command_center money_opportunities: %s", e)
        opps = []
        errors.append({
            "key": "money_opportunities",
            "status": "warn",
            "message": "Не удалось собрать возможности по деньгам.",
        })
    try:
        risk_payload = risk_signals(snap=snap, exp=exp, ret=ret, svc=svc)
    except Exception as e:
        logger.error("owner_ai command_center risk_signals: %s", e)
        risk_payload = {"risks": [], "top_risk": None}
        errors.append({
            "key": "risk_signals",
            "status": "warn",
            "message": "Не удалось собрать риски.",
        })
    risks = risk_payload.get("risks") or []
    top_risk = risk_payload.get("top_risk")
    top_risk_status = (top_risk or {}).get("severity")
    actions = _dedup_actions(opps)
    journal = []
    try:
        import database
        database.evaluate_due_owner_actions(limit=5)
        journal = database.list_owner_actions(limit=24)
    except Exception as e:
        logger.error("owner_ai command_center owner_journal: %s", e)
        errors.append({
            "key": "owner_journal",
            "status": "warn",
            "message": "Не удалось собрать журнал действий.",
        })

    today_status = _command_status(
        "warn" if snap.get("free_capacity_today") else "ok",
        "warn" if snap_err else "ok",
    )
    money_status = _command_status(
        "warn" if opps else "ok",
        "warn" if errors else "ok",
    )
    plan_status = _command_status(
        plan.get("status"),
        "warn" if plan_err else "ok",
    )
    risk_status = _command_status(top_risk_status, "warn" if errors else "ok")
    client_status = _command_status(
        "warn" if ret.get("count") else "ok",
        "warn" if exp.get("subscriptions_expiring_7d") else "ok",
        "warn" if ret_err or exp_err else "ok",
    )
    service_status = _command_status(
        "warn" if (svc.get("weak_services") or []) else "ok",
        "warn" if svc_err else "ok",
    )
    masters_status = _command_status(
        "ok" if (masters.get("masters") or []) else "warn",
        "warn" if masters_err else "ok",
    )
    overall = _command_status(
        today_status,
        money_status,
        plan_status,
        risk_status,
        client_status,
        service_status,
        masters_status,
        "warn" if errors else "ok",
    )

    journal_due = [
        it for it in journal
        if it.get("status") == "done" and not it.get("evaluated_at")
        and it.get("result_due_at") and str(it.get("result_due_at")) <= datetime.now().isoformat(timespec="seconds")
    ]
    journal_checked = [it for it in journal if it.get("evaluated_at")]
    now_iso = datetime.now().isoformat(timespec="seconds")
    control = _control_queue(
        risks=risks,
        actions=actions,
        journal=journal,
        errors=errors,
        plan=plan,
        now_iso=now_iso,
    )
    control_urgent = [
        it for it in control if _severity_rank(it.get("status")) >= 3
    ]
    control_due = [
        it for it in control
        if it.get("due_state") in ("overdue", "today")
        or (it.get("source") == "journal" and it.get("due_at"))
    ]
    control_overdue = [
        it for it in control if it.get("due_state") == "overdue"
    ]
    control_focus = _control_focus(control, now_iso=now_iso)
    attention = _attention_feed(
        control=control,
        plan=plan,
        top_risk=top_risk,
        opps=opps,
        errors=errors,
    )
    attention_critical = [
        it for it in attention if _severity_rank(it.get("severity")) >= 3
    ]
    automations = _automation_status(
        journal=journal,
        actions=actions,
        now_iso=now_iso,
    )
    automations_need_attention = [
        it for it in automations if it.get("status") != "ok"
    ]
    automation_queue = _automation_queue(automations)
    execution_plan = _execution_plan(
        control_focus=control_focus,
        plan=plan,
        opps=opps,
        actions=actions,
        automations=automations,
        top_risk=top_risk,
        now_iso=now_iso,
    )
    task_center = _task_center(
        control=control,
        journal=journal,
        automations=automations,
        execution_plan=execution_plan,
        now_iso=now_iso,
    )
    owner_review = _owner_review_layer(
        control=control,
        now_iso=now_iso,
    )
    kpi_scorecard = _kpi_scorecard(
        snap=snap,
        plan=plan,
        masters=masters,
        ret=ret,
        exp=exp,
        svc=svc,
        control_focus=control_focus,
        owner_review=owner_review,
        automation_queue=automation_queue,
    )
    financial_director = _financial_director(
        snap=snap,
        plan=plan,
        masters=masters,
        opps=opps,
        risks=risks,
    )
    approval = _approval_matrix()
    autonomous_candidates = _autonomous_task_candidates(
        plan=plan,
        top_risk=top_risk,
        automation_queue=automation_queue,
        owner_review=owner_review,
        svc=svc,
        control=control,
    )
    autonomous_director = _autonomous_director(
        kpi=kpi_scorecard,
        finance=financial_director,
        approval=approval,
        task_candidates=autonomous_candidates,
    )
    overall = _command_status(
        overall,
        owner_review.get("status"),
        automation_queue.get("status"),
        kpi_scorecard.get("status"),
        autonomous_director.get("status"),
    )
    sections = [
        {
            "key": "today",
            "title": "Сегодня",
            "status": today_status,
            "summary": {
                "booked": _rub(snap.get("booked_today")),
                "working_masters": _rub(snap.get("working_masters")),
                "free_capacity_today": _rub(snap.get("free_capacity_today")),
                "expected_revenue_rub": _rub(snap.get("expected_revenue_rub")),
                "potential_fill_revenue_rub": _rub(snap.get("potential_fill_revenue_rub")),
                "idle_masters": snap.get("idle_masters") or [],
                "underused_masters": snap.get("underused_masters") or [],
            },
            "items": snap.get("masters") or [],
            "note": snap.get("note"),
        },
        {
            "key": "money",
            "title": "Деньги",
            "status": money_status,
            "summary": {
                "avg_check_rub": _rub(snap.get("avg_check_rub")),
                "money_at_stake_rub": _money_at_stake(opps, risks),
                "opportunities_count": len(opps),
            },
            "items": opps[:6],
            "note": "Возможности отсортированы по деньгам на кону; estimate=true — оценка, не факт.",
        },
        {
            "key": "autonomous_director",
            "title": "AI-директор v2",
            "status": autonomous_director.get("status"),
            "summary": autonomous_director.get("summary") or {},
            "items": autonomous_director.get("task_candidates") or [],
            "note": autonomous_director.get("next_step"),
        },
        {
            "key": "kpi_scorecard",
            "title": "KPI",
            "status": kpi_scorecard.get("status"),
            "summary": kpi_scorecard.get("summary") or {},
            "items": kpi_scorecard.get("items") or [],
            "note": kpi_scorecard.get("note"),
        },
        {
            "key": "financial_director",
            "title": "Финансовый директор",
            "status": financial_director.get("status"),
            "summary": financial_director.get("summary") or {},
            "items": financial_director.get("decisions") or [],
            "note": financial_director.get("note"),
        },
        {
            "key": "plan_fact",
            "title": "План-факт",
            "status": plan_status,
            "summary": {
                "daily_target_rub": _rub(plan.get("daily_target_rub")),
                "actual_revenue_rub": _rub(plan.get("actual_revenue_rub")),
                "projected_revenue_rub": _rub(plan.get("projected_revenue_rub")),
                "gap_rub": _rub(plan.get("gap_rub")),
                "progress_pct": plan.get("progress_pct"),
                "needed_visits_to_target": _rub(plan.get("needed_visits_to_target")),
                "paid_visits": _rub(plan.get("paid_visits")),
                "booked_today": _rub(plan.get("booked_today")),
                "target_source": plan.get("target_source"),
            },
            "items": [],
            "note": plan.get("note"),
        },
        {
            "key": "control",
            "title": "Контроль",
            "status": "risk" if control_urgent else ("warn" if control else "ok"),
            "summary": {
                "items_count": len(control),
                "urgent_count": len(control_urgent),
                "due_count": len(control_due),
                "overdue_count": len(control_overdue),
                "focus_count": (control_focus.get("summary") or {}).get("focus_count", 0),
                "needs_effect_check_count": (control_focus.get("summary") or {}).get("needs_effect_check_count", 0),
                "ready_to_close_count": (control_focus.get("summary") or {}).get("ready_to_close_count", 0),
            },
            "items": control,
            "note": "Очередь контроля собирается из рисков, действий, журнала результата и системных предупреждений.",
        },
        {
            "key": "owner_review",
            "title": "Проверка владельца",
            "status": owner_review.get("status"),
            "summary": owner_review.get("summary") or {},
            "items": owner_review.get("items") or [],
            "note": "Сюда попадают поручения, которые команда отметила готовыми, заблокированными или вернула в доработку.",
        },
        {
            "key": "risks",
            "title": "Риски",
            "status": risk_status,
            "summary": {
                "top_risk": top_risk,
                "risks_count": len(risks),
            },
            "items": risks[:6],
            "note": risk_payload.get("note"),
        },
        {
            "key": "clients",
            "title": "Клиенты и активы",
            "status": client_status,
            "summary": {
                "sleeping_clients": ret.get("count"),
                "sleeping_potential_rub": ret.get("potential_return_revenue_rub"),
                "subscriptions_expiring_7d": _rub(exp.get("subscriptions_expiring_7d")),
                "subscriptions_active": _rub(exp.get("subscriptions_active")),
                "gift_certs_active_count": _rub(exp.get("gift_certs_active_count")),
                "gift_certs_active_value_rub": _rub(exp.get("gift_certs_active_value_rub")),
            },
            "items": [
                {"key": "return_candidates", "data": ret},
                {"key": "expiring_assets", "data": exp},
            ],
        },
        {
            "key": "services",
            "title": "Услуги",
            "status": service_status,
            "summary": {
                "popular_count": len(svc.get("popular_services") or []),
                "weak_count": len(svc.get("weak_services") or []),
            },
            "items": {
                "popular_services": svc.get("popular_services") or [],
                "weak_services": svc.get("weak_services") or [],
            },
            "note": svc.get("note"),
        },
        {
            "key": "masters",
            "title": "Мастера",
            "status": masters_status,
            "summary": {
                "total_gross_rub": _rub(masters.get("total_gross_rub")),
                "salary_total_rub": _rub(masters.get("salary_total_rub")),
                "profit_after_salary_total_rub": _rub(masters.get("profit_after_salary_total_rub")),
                "top_profit_master": masters.get("top_profit_master"),
                "top_gross_master": masters.get("top_gross_master"),
                "masters_count": len(masters.get("masters") or []),
            },
            "items": masters.get("masters") or [],
            "note": masters.get("note"),
        },
        {
            "key": "actions",
            "title": "Следующие действия",
            "status": "warn" if actions else "ok",
            "summary": {"actions_count": len(actions), "read_only": True},
            "items": actions,
            "note": "Action-card только предлагает действие. Запуск должен идти отдельным подтверждением владельца.",
        },
        {
            "key": "automations",
            "title": "Автоматизации",
            "status": "warn" if automations_need_attention else "ok",
            "summary": {
                "items_count": len(automations),
                "need_attention_count": len(automations_need_attention),
                "manual_confirm": True,
            },
            "items": automations,
            "note": "Сценарии не запускаются сами: владелец подтверждает действие вручную.",
        },
        {
            "key": "automation_queue",
            "title": "Очередь автоматизаций",
            "status": automation_queue.get("status"),
            "summary": automation_queue.get("summary") or {},
            "items": automation_queue.get("items") or [],
            "note": "Action-ready слой: что запустить, повторить или проверить по эффекту.",
        },
        {
            "key": "journal",
            "title": "Журнал AI-директора",
            "status": "warn" if any((it.get("status") == "failed") for it in journal) else "ok",
            "summary": {
                "items_count": len(journal),
                "due_count": len(journal_due),
                "checked_count": len(journal_checked),
            },
            "items": journal,
            "note": "Последние действия владельца и результаты задач.",
        },
    ]

    return {
        "version": "owner_command_center_v1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "date": snap.get("date") or _today(),
        "status": overall,
        "read_only": True,
        "summary": {
            "booked_today": _rub(snap.get("booked_today")),
            "expected_revenue_rub": _rub(snap.get("expected_revenue_rub")),
            "avg_check_rub": _rub(snap.get("avg_check_rub")),
            "free_capacity_today": _rub(snap.get("free_capacity_today")),
            "daily_target_rub": _rub(plan.get("daily_target_rub")),
            "plan_progress_pct": plan.get("progress_pct"),
            "plan_gap_rub": _rub(plan.get("gap_rub")),
            "salary_total_rub": _rub(masters.get("salary_total_rub")),
            "top_profit_master": masters.get("top_profit_master"),
            "top_gross_master": masters.get("top_gross_master"),
            "money_at_stake_rub": _money_at_stake(opps, risks),
            "top_priority": opps[0] if opps else None,
            "top_risk": top_risk,
            "next_action": actions[0] if actions else None,
            "top_control": control[0] if control else None,
            "control_focus": control_focus.get("headline"),
            "control_focus_count": (control_focus.get("summary") or {}).get("focus_count", 0),
            "execution_steps_count": (execution_plan.get("summary") or {}).get("steps_count", 0),
            "task_count": (task_center.get("summary") or {}).get("tasks_count", 0),
            "overdue_task_count": (task_center.get("summary") or {}).get("overdue_count", 0),
            "effect_check_task_count": (task_center.get("summary") or {}).get("effect_check_count", 0),
            "owner_review_count": (owner_review.get("summary") or {}).get("items_count", 0),
            "owner_review_ready_count": (owner_review.get("summary") or {}).get("ready_count", 0),
            "owner_review_blocked_count": (owner_review.get("summary") or {}).get("blocked_count", 0),
            "attention_count": len(attention),
            "critical_attention_count": len(attention_critical),
            "automation_attention_count": len(automations_need_attention),
            "automation_queue_count": (automation_queue.get("summary") or {}).get("items_count", 0),
            "automation_actionable_count": (automation_queue.get("summary") or {}).get("actionable_count", 0),
            "kpi_score": kpi_scorecard.get("score"),
            "autonomous_task_candidates_count": len(autonomous_candidates),
            "autonomous_open_tasks_count": (autonomous_director.get("summary") or {}).get("open_autocreate_count", 0),
            "approval_required_count": (autonomous_director.get("summary") or {}).get("approval_required_count", 0),
            "projected_month_gross_rub": (financial_director.get("summary") or {}).get("projected_month_gross_rub", 0),
            "projected_month_contribution_after_salary_rub": (financial_director.get("summary") or {}).get("projected_month_contribution_after_salary_rub", 0),
        },
        "sections": sections,
        "attention_feed": attention,
        "autonomous_director": autonomous_director,
        "kpi_scorecard": kpi_scorecard,
        "financial_director": financial_director,
        "approval_matrix": approval,
        "automation_status": automations,
        "automation_queue": automation_queue,
        "opportunities": opps,
        "plan_fact": plan,
        "master_performance": masters,
        "risks": risks,
        "next_best_actions": actions,
        "execution_plan": execution_plan,
        "task_center": task_center,
        "owner_review": owner_review,
        "control_focus": control_focus,
        "control_queue": control,
        "journal": journal,
        "errors": errors,
    }


def risk_signals(snap: dict = None, exp: dict = None, ret: dict = None,
                 svc: dict = None) -> dict:
    """Риски бизнеса: падение выручки, пустые окна, уснувшие клиенты, просевшие услуги."""
    snap = snap or business_snapshot()
    exp = exp or expiring_assets()
    ret = ret or return_candidates()
    svc = svc or service_insights()
    risks = []

    trend = snap.get("week_trend") or {}
    gross = trend.get("gross") or {}
    dgross = gross.get("delta_pct")
    if dgross is not None and dgross <= -10:
        risks.append({
            "type": "revenue_drop",
            "severity": "high" if dgross <= -20 else "medium",
            "title": "Выручка ниже прошлой недели",
            "detail": "Текущая неделя к прошлой: %s%d%% по выручке." % ("+" if dgross >= 0 else "", dgross),
            "potential_rub": abs(_rub(gross.get("delta"))),
            "action_hint": "Проверь пустые окна и быстро верни клиентов с тёплым поводом.",
        })

    if snap.get("free_capacity_today"):
        risks.append({
            "type": "idle_capacity",
            "severity": "high" if snap.get("idle_masters") else "medium",
            "title": "Сегодня есть незаполненные окна",
            "detail": "Свободная ёмкость дня ≈%d слотов." % _rub(snap.get("free_capacity_today")),
            "potential_rub": _rub(snap.get("potential_fill_revenue_rub")),
            "action_hint": "Подними тёплый спрос: уснувшие + цикл-напоминание + лист ожидания.",
        })

    if ret.get("count"):
        risks.append({
            "type": "sleeping_clients",
            "severity": "medium",
            "title": "Клиенты могут окончательно отвалиться",
            "detail": "%d уснувших клиентов без визита 28–56 дней." % _rub(ret.get("count")),
            "potential_rub": _rub(ret.get("potential_return_revenue_rub")),
            "action_hint": ret.get("action_hint"),
        })

    weak = (svc.get("weak_services") or [])
    if weak:
        top = weak[0]
        risks.append({
            "type": "weak_service",
            "severity": "medium",
            "title": "Просела одна из услуг",
            "detail": "%s: выручка ниже на ~%s ₽ против прошлых 30 дней." % (
                top.get("title") or "Услуга",
                _m(abs(top.get("delta_sum_rub") or 0)),
            ),
            "potential_rub": abs(_rub(top.get("delta_sum_rub"))),
            "action_hint": "Перепроверь, кто обычно берёт эту услугу, и усили допродажу/напоминания.",
        })

    if exp.get("subscriptions_expiring_7d"):
        risks.append({
            "type": "expiring_subscriptions",
            "severity": "low",
            "title": "Скоро сгорят абонементы без продления",
            "detail": "%d абонементов истекают в ближайшие 7 дней." % _rub(exp.get("subscriptions_expiring_7d")),
            "potential_rub": None,
            "action_hint": "Запусти обновление абонементов и напоминания о продлении.",
        })

    risks.sort(key=lambda r: (r.get("potential_rub") is None, -(r.get("potential_rub") or 0)))
    return {
        "risks": risks,
        "top_risk": risks[0] if risks else None,
        "note": "Риски приоритизированы по деньгам на кону, если оценка доступна.",
    }


def money_opportunities(snap: dict = None, exp: dict = None, ret: dict = None) -> list[dict]:
    """Приоритизированный ПО ДЕНЬГАМ список возможностей (что сделать, чтобы заработать/
    не потерять). Принимает предвычисленные snap/exp/ret, чтобы не дёргать API дважды."""
    snap = snap or business_snapshot()
    exp = exp or expiring_assets()
    ret = ret or return_candidates()
    opps = []

    if ret.get("count"):
        opps.append({
            "type": "return_clients",
            "title": "Вернуть уснувших клиентов",
            "detail": "%d клиентов не были 28–56 дней (на %s)." % (ret["count"], ret.get("as_of") or "?"),
            "potential_rub": ret.get("potential_return_revenue_rub", 0),
            "estimate": True,
            "action": "reactivation",
            "action_hint": ret.get("action_hint"),
        })

    if snap.get("free_capacity_today"):
        who = ", ".join((snap.get("idle_masters") or []) + (snap.get("underused_masters") or [])) or "мастера с окнами"
        opps.append({
            "type": "empty_windows",
            "title": "Заполнить пустые окна сегодня",
            "detail": "≈%d свободных слотов сегодня (%s)." % (snap["free_capacity_today"], who),
            "potential_rub": snap.get("potential_fill_revenue_rub", 0),
            "estimate": True,
            "action": "fill_slots",
            "action_hint": "Предложить запись клиентам из листа ожидания и уснувшим — на сегодня.",
        })

    if exp.get("gift_certs_active_value_rub"):
        opps.append({
            "type": "unredeemed_certs",
            "title": "Пригласить погасить сертификаты",
            "detail": "%d активных сертификатов на руках у клиентов, сумма ~%s ₽." % (
                exp["gift_certs_active_count"], _m(exp["gift_certs_active_value_rub"])),
            "potential_rub": exp["gift_certs_active_value_rub"],
            "estimate": False,   # это уже оплаченные деньги (face value)
            "action": "cert_nudge",
            "action_hint": "Напомнить владельцам сертификатов записаться — оплаченные деньги, приведут людей в кресло.",
        })

    if exp.get("subscriptions_expiring_7d"):
        opps.append({
            "type": "expiring_subscriptions",
            "title": "Продлить истекающие абонементы",
            "detail": "%d абонементов истекают в ближайшие 7 дней." % exp["subscriptions_expiring_7d"],
            "potential_rub": None,   # цена абонемента варьируется — не выдумываем сумму
            "estimate": True,
            "action": "renew_reminder",
            "action_hint": "Истекающим уходит авто-напоминание о продлении; можно усилить личным сообщением.",
        })

    # Ранжируем по деньгам на кону (None → в конец).
    opps.sort(key=lambda o: (o.get("potential_rub") is None, -(o.get("potential_rub") or 0)))
    return opps


def daily_briefing() -> dict:
    """Утренний брифинг директора: что сегодня + приоритеты с суммами на кону.
    Считает snap/exp/ret по одному разу и переиспользует."""
    snap = business_snapshot()
    exp = expiring_assets()
    ret = return_candidates()
    svc = service_insights()
    opps = money_opportunities(snap=snap, exp=exp, ret=ret)
    risks = risk_signals(snap=snap, exp=exp, ret=ret, svc=svc)
    actions = _dedup_actions(opps)
    top_action = actions[0] if actions else None
    now_iso = datetime.now().isoformat(timespec="seconds")
    control_errors = []
    try:
        plan = plan_fact(snap=snap)
    except Exception as e:
        logger.error("owner_ai daily_briefing plan_fact: %s", e)
        plan = _fallback_plan_fact()
        control_errors.append({
            "key": "plan_fact",
            "status": "warn",
            "message": "Не удалось собрать план-факт для брифинга.",
        })
    try:
        import database
        database.evaluate_due_owner_actions(limit=5)
        journal = database.list_owner_actions(limit=24)
    except Exception as e:
        logger.error("owner_ai daily_briefing owner_journal: %s", e)
        journal = []
        control_errors.append({
            "key": "owner_journal",
            "status": "warn",
            "message": "Не удалось собрать журнал действий для брифинга.",
        })
    control = _control_queue(
        risks=risks.get("risks") or [],
        actions=actions,
        journal=journal,
        errors=control_errors,
        plan=plan,
        now_iso=now_iso,
    )
    control_focus = _control_focus(control, now_iso=now_iso)
    execution_plan = _execution_plan(
        control_focus=control_focus,
        plan=plan,
        opps=opps,
        actions=actions,
        automations=[],
        top_risk=risks.get("top_risk"),
        now_iso=now_iso,
    )
    task_center = _task_center(
        control=control,
        journal=journal,
        automations=[],
        execution_plan=execution_plan,
        now_iso=now_iso,
    )
    return {
        "date": snap["date"],
        "today": {
            "booked": snap["booked_today"],
            "expected_revenue_rub": snap["expected_revenue_rub"],
            "avg_check_rub": snap["avg_check_rub"],
            "working_masters": snap["working_masters"],
            "idle_masters": snap["idle_masters"],
            "underused_masters": snap["underused_masters"],
            "free_capacity_today": snap["free_capacity_today"],
        },
        "week_trend": snap["week_trend"],
        "opportunities": opps,
        "top_priority": opps[0] if opps else None,
        "risks": risks["risks"],
        "top_risk": risks.get("top_risk"),
        "next_best_actions": actions,
        "execution_plan": execution_plan,
        "task_center": task_center,
        "control_focus": control_focus,
        "control_queue": control,
        "top_action": top_action,
        "note": snap["note"],
    }
