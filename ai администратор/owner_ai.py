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
import calendar
from datetime import date, datetime, timedelta
import json
import logging
import re
from statistics import median
import time

logger = logging.getLogger(__name__)

# Консервативные допущения для оценки ПОТЕНЦИАЛА (не факт; помечаются в ответах).
_RETURN_RATE = None          # доля уснувших, что вернётся при персональном касании
# Грубая ёмкость смены: сколько визитов помещается в рабочий день мастера —
# для оценки недозагрузки. Реальная длительность услуг разная → это оценка.
_VISITS_PER_SHIFT = 8

# Кэш среднего чека (30д) на процесс: избегаем повторных тяжёлых выгрузок
# внутри одного брифинга.
_avg_cache = {"val": None, "ts": 0.0}
_AVG_TTL = 600.0
_summary30_cache = {"val": None, "ts": 0.0}
_today_master_cache = {"date": None, "val": None, "ts": 0.0}
_TODAY_MASTER_TTL = 60.0
_retention_cache = {"val": None, "ts": 0.0}
_RETENTION_SETTING = "owner_client_retention_snapshot_v1"
_client_registry_cache = {"val": None, "ts": 0.0}
_CLIENT_REGISTRY_SETTING = "owner_client_registry_snapshot_v1"
_CLIENT_REGISTRY_TTL = 900.0
_LOYAL_CLIENT_VISITS = 3
_CYCLE_CANDIDATES_SETTING = "cycle_candidates_snapshot_v1"

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
        "label": "Написать клиентам из очереди",
        "title": "Вернуть клиентов по личному циклу",
        "problem": "У части клиентов уже наступил привычный срок следующего визита.",
        "reason": "MAYA заранее рассчитала личный цикл, исключила будущие записи и проверила допустимость контакта.",
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
_OPERATING_RHYTHM_INTERVAL_SECONDS = 3600


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


def _money(n) -> str:
    return _m(n) + " ₽"


def _integer(n) -> int:
    return _rub(n)


def _ru_count(n, one: str, few: str, many: str) -> str:
    value = abs(_rub(n))
    tail = value % 100
    if 11 <= tail <= 14:
        form = many
    elif value % 10 == 1:
        form = one
    elif 2 <= value % 10 <= 4:
        form = few
    else:
        form = many
    return f"{_m(n)} {form}"


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
    schedule_rows, recs = [], []
    schedule_fetch_failed = False
    reference_getter = None
    yc = None
    try:
        import yclients as yclients_module
        yc = yclients_module.YClientsAPI()
        reference_getter = getattr(yclients_module, "get_schedule_reference", None)
        schedule_rows = [
            row for row in (yc.get_working_masters(today) or [])
            if isinstance(row, dict) and row.get("id")
        ]
    except Exception as e:
        schedule_fetch_failed = True
        logger.error(f"owner_ai today_load schedule: {e}")

    try:
        if yc is None:
            import yclients as yclients_module
            yc = yclients_module.YClientsAPI()
        recs = yc.get_company_records(today, today) or []
    except Exception as e:
        logger.error(f"owner_ai today_load records: {e}")

    by_staff = {}
    active_records = []
    booked_service_revenue = 0
    priced_records = 0
    unpriced_records = 0
    single_service_records = 0
    scheduled_service_items = 0
    for r in recs:
        if not isinstance(r, dict) or r.get("deleted") or r.get("is_deleted"):
            continue
        if r.get("attendance") == -1:
            continue
        services = [row for row in (r.get("services") or []) if isinstance(row, dict)]
        client = r.get("client") if isinstance(r.get("client"), dict) else {}
        if ("client" in r or "services" in r) and not client.get("id") and not services:
            # YClients technical breaks live in the records feed too.
            continue
        active_records.append(r)
        if r.get("staff_id") is not None:
            by_staff[r["staff_id"]] = by_staff.get(r["staff_id"], 0) + 1
        scheduled_service_items += len(services)
        if len(services) == 1:
            single_service_records += 1
        service_total = 0
        for service in services:
            service_total += _rub(service.get("cost"))
        if service_total:
            booked_service_revenue += service_total
            priced_records += 1
        else:
            unpriced_records += 1

    schedule_entries = []
    schedule_conflicts = []
    target_date = date.fromisoformat(today)
    for row in schedule_rows:
        sid = row.get("id")
        nm = row.get("name") or f"Мастер #{sid}"
        schedule_unknown = bool(row.get("schedule_unknown"))
        is_working = bool(row.get("is_working")) and not schedule_unknown
        status = "unknown" if schedule_unknown else ("working" if is_working else "off")
        start = row.get("work_start") or ""
        end = row.get("work_end") or ""
        live_hours = f"{start}-{end}" if start and end else None
        reference = {
            "configured": False,
            "hours": None,
            "is_working": None,
            "updated": None,
        }
        if callable(reference_getter):
            try:
                candidate = reference_getter(nm, target_date)
                if isinstance(candidate, dict):
                    reference.update(candidate)
            except Exception as e:
                logger.warning("owner_ai schedule reference %s: %s", sid, e)

        conflict_reason = None
        if reference.get("configured") and not schedule_unknown:
            if bool(reference.get("is_working")) != is_working:
                conflict_reason = "working_status"
            elif is_working and reference.get("hours") and live_hours:
                if str(reference["hours"]) != live_hours:
                    conflict_reason = "working_hours"

        entry = {
            "staff_id": sid,
            "name": nm,
            "status": status,
            "work_start": start,
            "work_end": end,
            "work_slots": row.get("work_slots") or [],
            "records_today": by_staff.get(sid, 0),
            "baseline": {
                "configured": bool(reference.get("configured")),
                "is_working": reference.get("is_working"),
                "hours": reference.get("hours"),
                "updated": reference.get("updated"),
            },
            "baseline_conflict": bool(conflict_reason),
        }
        schedule_entries.append(entry)
        if conflict_reason:
            schedule_conflicts.append({
                "staff_id": sid,
                "name": nm,
                "reason": conflict_reason,
                "yclients_status": status,
                "yclients_hours": live_hours,
                "baseline_status": (
                    "working" if reference.get("is_working") else "off"
                ),
                "baseline_hours": reference.get("hours"),
                "baseline_updated": reference.get("updated"),
                "records_today": by_staff.get(sid, 0),
            })

    working_entries = [row for row in schedule_entries if row["status"] == "working"]
    off_entries = [row for row in schedule_entries if row["status"] == "off"]
    unknown_entries = [row for row in schedule_entries if row["status"] == "unknown"]
    confirmed_working = [row for row in working_entries if not row["baseline_conflict"]]
    confirmed_off = [row for row in off_entries if not row["baseline_conflict"]]

    if schedule_fetch_failed and not schedule_entries:
        schedule_status = "unavailable"
    elif unknown_entries:
        schedule_status = "partial"
    elif schedule_conflicts:
        schedule_status = "conflict"
    else:
        schedule_status = "verified"

    masters, idle, underused = [], [], []
    for row in working_entries:
        sid = row["staff_id"]
        nm = row["name"]
        cnt = by_staff.get(sid, 0)
        free = max(0, _VISITS_PER_SHIFT - cnt)
        masters.append({
            "staff_id": sid, "name": nm, "records_today": cnt,
            "free_slots_est": free,
            "work_start": row["work_start"], "work_end": row["work_end"],
            "baseline_conflict": row["baseline_conflict"],
        })
        # Спорную смену показываем владельцу, но не используем для действий
        # «заполнить окна», пока источники графика не будут согласованы.
        if row["baseline_conflict"]:
            continue
        if cnt == 0:
            idle.append(nm)
        elif free >= 3:
            underused.append(nm)

    return {
        "date": today,
        "booked_today": len(active_records),
        "booked_service_revenue_rub": booked_service_revenue,
        "priced_records": priced_records,
        "unpriced_records": unpriced_records,
        "single_service_records": single_service_records,
        "scheduled_service_items": scheduled_service_items,
        "working_masters": len(working_entries),
        "confirmed_working_masters": len(confirmed_working),
        "staff_schedule": {
            "date": today,
            "source": "yclients",
            "status": schedule_status,
            "working": working_entries,
            "confirmed_working": confirmed_working,
            "off": off_entries,
            "confirmed_off": confirmed_off,
            "unknown": unknown_entries,
            "conflicts": schedule_conflicts,
        },
        "idle_masters": idle,            # работают, но 0 записей
        "underused_masters": underused,  # работают, но много свободных окон
        "masters": masters,
    }


def business_snapshot() -> dict:
    """C8 L08: retain source-labelled operational observations, never extrapolate money/load."""
    load = _today_load()
    facts = {key: load.get(key) for key in ("date", "booked_today", "priced_records", "unpriced_records", "booked_service_revenue_rub", "working_masters", "confirmed_working_masters", "staff_schedule")}
    return {**facts, "source": "legacy_provider_observation", "valuation_available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "avg_check_rub": None, "expected_revenue_rub": None, "forecast_low_rub": None, "forecast_high_rub": None, "free_capacity_today": None, "potential_fill_revenue_rub": None, "upsell_potential_rub": None, "potential_revenue_rub": None, "capacity_revenue_rub": None, "idle_masters": [], "underused_masters": [], "masters": [], "week_trend": {}, "note": "Это наблюдения источника, не оценка C8. Числовой прогноз недоступен; подтверждённые факты C7 и оценки по правилам доступны в кабинете Maya."}


def _manual_setting_rub(key: str) -> int:
    """Опциональная ручная денежная цель владельца из settings."""
    try:
        import database
        val = database.get_setting(key)
        return _rub(val)
    except Exception:
        return 0


def _manual_daily_target_rub() -> int:
    """Опциональная ручная цель владельца через settings.owner_daily_target_rub."""
    return _manual_setting_rub("owner_daily_target_rub")


def _manual_month_gross_target_rub() -> int:
    return _manual_setting_rub("owner_month_gross_target_rub")


def _manual_month_contribution_target_rub() -> int:
    return _manual_setting_rub("owner_month_contribution_target_rub")


def _manual_avg_check_target_rub() -> int:
    return _manual_setting_rub("owner_avg_check_target_rub")


def _today_revenue_summary() -> dict:
    try:
        import analytics
        day = _today()
        return analytics.business_summary(day, day) or {}
    except Exception as e:
        logger.error(f"owner_ai today_revenue_summary: {e}")
        return {}


def _smart_daily_baseline(base: dict, target_day: date) -> dict:
    rows = [row for row in (base.get("daily") or []) if isinstance(row, dict)]
    values = [_rub(row.get("gross_rub")) for row in rows]
    weekday_values = []
    for row in rows:
        try:
            row_day = date.fromisoformat(str(row.get("date") or "")[:10])
        except ValueError:
            continue
        if row_day.weekday() == target_day.weekday():
            weekday_values.append(_rub(row.get("gross_rub")))
    calendar_avg = _rub(sum(values) / len(values)) if values else _rub(
        (base.get("total_gross") or 0) / 30
    )
    weekday_median = _rub(median(weekday_values)) if weekday_values else calendar_avg
    recent = values[-7:]
    previous = values[-14:-7]
    recent_avg = _rub(sum(recent) / len(recent)) if recent else calendar_avg
    previous_avg = _rub(sum(previous) / len(previous)) if previous else calendar_avg
    trend_factor = 1.0
    if previous_avg:
        trend_factor = max(0.85, min(1.15, recent_avg / previous_avg))
    seasonal = _rub(weekday_median * 0.75 + calendar_avg * 0.25)
    baseline = _rub(seasonal * trend_factor) or calendar_avg
    return {
        "baseline_rub": baseline,
        "weekday_median_rub": weekday_median,
        "calendar_daily_average_rub": calendar_avg,
        "recent_7d_average_rub": recent_avg,
        "trend_factor": round(trend_factor, 3),
        "weekday_samples": len(weekday_values),
        "confidence": "high" if len(weekday_values) >= 4 else (
            "medium" if len(weekday_values) >= 2 else "low"
        ),
    }


def _weighted_month_target(month_target: int, base: dict, target_day: date) -> dict:
    if not month_target:
        return {"daily_target_rub": 0, "remaining_month_target_rub": 0}
    daily_rows = [row for row in (base.get("daily") or []) if isinstance(row, dict)]
    weekday_values = {index: [] for index in range(7)}
    month_to_date_before_today = 0
    for row in daily_rows:
        try:
            row_day = date.fromisoformat(str(row.get("date") or "")[:10])
        except ValueError:
            continue
        gross = _rub(row.get("gross_rub"))
        weekday_values[row_day.weekday()].append(gross)
        if row_day.replace(day=1) == target_day.replace(day=1) and row_day < target_day:
            month_to_date_before_today += gross
    fallback = _rub((base.get("total_gross") or 0) / max(1, len(daily_rows) or 30)) or 1
    weights = {
        index: (_rub(median(values)) if values else fallback)
        for index, values in weekday_values.items()
    }
    first = target_day.replace(day=1)
    next_month = (
        first.replace(year=first.year + 1, month=1)
        if first.month == 12 else first.replace(month=first.month + 1)
    )
    remaining_days = []
    cursor = target_day
    while cursor < next_month:
        remaining_days.append(cursor)
        cursor += timedelta(days=1)
    weight_sum = sum(max(1, weights.get(day.weekday(), fallback)) for day in remaining_days)
    remaining_target = max(0, _rub(month_target) - month_to_date_before_today)
    today_weight = max(1, weights.get(target_day.weekday(), fallback))
    daily_target = _rub(remaining_target * today_weight / weight_sum) if weight_sum else 0
    return {
        "daily_target_rub": daily_target,
        "month_target_rub": _rub(month_target),
        "month_actual_before_today_rub": month_to_date_before_today,
        "remaining_month_target_rub": remaining_target,
        "remaining_days": len(remaining_days),
    }


def plan_fact(snap: dict = None) -> dict:
    """C8 L08 numerical caller: no legacy valuation or financial forecast."""
    return _fallback_plan_fact()


def master_performance(
    period: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Мастера за выбранный период: выручка, выплаты и вклад после процента.

    Это не полная управленческая прибыль салона: аренда, эквайринг, расходники и
    прочие общие расходы здесь не распределяются по мастерам. Метрика нужна для
    честного ответа владельцу: кто приносит больше выручки и вклад после выплаты
    процента мастеру.
    """
    requested_period = (period or "last_30").strip().lower()
    if requested_period == "last_30" and not date_from and not date_to:
        summary = _summary_30d() or {}
        period_label = "последние 30 дней"
    else:
        try:
            import analytics
            f_iso, t_iso, period_label = analytics.resolve_period(
                requested_period, date_from, date_to,
            )
            summary = analytics.business_summary(f_iso, t_iso) or {}
        except Exception as e:
            logger.error("owner_ai master_performance: %s", e)
            return {
                "error": "Не удалось получить аналитику мастеров из YClients.",
                "period": {"from": date_from, "to": date_to},
            }
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
        "period": {
            "from": summary.get("from"),
            "to": summary.get("to"),
            "label": period_label,
        },
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


def today_master_revenue() -> dict:
    """Today's paid service revenue by master from YClients transactions."""
    day = _today()
    now = time.time()
    if (
        _today_master_cache["date"] == day
        and _today_master_cache["val"] is not None
        and now - _today_master_cache["ts"] < _TODAY_MASTER_TTL
    ):
        return _today_master_cache["val"]
    try:
        import analytics
        summary = analytics.business_summary(day, day) or {}
        rows = []
        for master in summary.get("masters") or []:
            if not isinstance(master, dict):
                continue
            gross = _rub(master.get("gross"))
            if gross <= 0:
                continue
            rows.append({
                "staff_id": master.get("staff_id"),
                "name": master.get("name") or "Мастер",
                "gross_rub": gross,
                "visits": _rub(master.get("visits")),
                "is_owner": bool(master.get("is_owner")),
            })
        rows.sort(key=lambda row: (-(row.get("gross_rub") or 0), row.get("name") or ""))
        result = {
            "date": day,
            "total_gross_rub": _rub(summary.get("total_gross")),
            "paid_visits": _rub(summary.get("visits")),
            "top_gross_master": rows[0] if rows else None,
            "masters": rows,
            "note": "Только оплаченная выручка за услуги сегодня по финансовым операциям YClients.",
        }
        _today_master_cache.update(date=day, val=result, ts=now)
        return result
    except Exception as exc:
        logger.error("owner_ai today_master_revenue: %s", exc)
        return {
            "date": day,
            "total_gross_rub": 0,
            "paid_visits": 0,
            "top_gross_master": None,
            "masters": [],
            "note": "Оплаченная выручка по мастерам временно недоступна.",
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


def _masked_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", str(phone or ""))
    if len(digits) < 4:
        return "номер доступен"
    return "+7 *** ***-%s-%s" % (digits[-4:-2], digits[-2:])


def _call_url(phone: str) -> str:
    digits = re.sub(r"\D", "", str(phone or ""))
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return ("tel:+" + digits) if digits else ""


def _cycle_owner_alert(payload: dict | None) -> dict:
    raw = (payload or {}).get("owner_alert") or {}
    if not isinstance(raw, dict):
        raw = {}
    return {
        "version": str(raw.get("version") or "maya_cycle_owner_alert_v1")[:40],
        "event_id": str(raw.get("event_id") or "")[:100],
        "active": bool(raw.get("active")),
        "state": str(raw.get("state") or "empty")[:24],
        "candidate_count": _rub(raw.get("candidate_count")),
        "new_count": _rub(raw.get("new_count")),
        "created_at": str(raw.get("created_at") or "")[:32],
        "notified_at": str(raw.get("notified_at") or "")[:32],
    }


def _cycle_candidate_queue(*, include_personal_data: bool = False) -> dict:
    """Loads the PII-free cycle snapshot and expands contacts only for owner UI."""
    try:
        import database
        raw = database.get_setting(_CYCLE_CANDIDATES_SETTING)
        payload = json.loads(raw) if raw else {}
    except Exception as exc:
        logger.error("owner_ai cycle queue: %s", exc)
        payload = {}
    if not isinstance(payload, dict) or payload.get("version") != "maya_cycle_candidates_v1":
        return {
            "state": "pending_first_scan",
            "generated_at": "",
            "summary": {"candidates": None, "pending": None, "overdue": 0, "due": 0, "due_soon": 0},
            "candidates": [],
            "owner_alert": _cycle_owner_alert({}),
        }

    summary = dict(payload.get("summary") or {})
    rows = [row for row in (payload.get("candidates") or []) if isinstance(row, dict)]
    state = "fresh"
    try:
        generated = datetime.fromisoformat(str(payload.get("generated_at") or "")[:19])
        if datetime.now() - generated > timedelta(hours=36):
            state = "stale"
    except Exception:
        state = "stale"

    owner_rows = []
    if include_personal_data:
        try:
            import database
            getter = getattr(database, "get_client_by_id", None)
            for row in rows[:20]:
                client = getter(int(row.get("client_id") or 0)) if getter else None
                if not isinstance(client, dict):
                    continue
                name = " ".join(str(client.get("name") or "Клиент").split())[:100]
                phone = str(client.get("phone") or "")
                owner_rows.append({
                    "client_id": int(row.get("client_id") or 0),
                    "name": name or "Клиент",
                    "phone_masked": _masked_phone(phone),
                    "call_url": _call_url(phone),
                    "cycle_days": _rub(row.get("cycle_days")),
                    "last_visit": str(row.get("last_visit") or "")[:10],
                    "predicted_visit": str(row.get("predicted_visit") or "")[:10],
                    "days_from_due": int(row.get("days_from_due") or 0),
                    "urgency": str(row.get("urgency") or "due")[:20],
                    "reason": str(row.get("reason") or "")[:160],
                    "last_master": str(row.get("last_master") or "")[:100],
                    "contact_status": str(row.get("contact_status") or "pending")[:24],
                    "contact_methods": list(row.get("eligible_channels") or [])[:3],
                })
        except Exception as exc:
            logger.error("owner_ai expand cycle contacts: %s", exc)
            owner_rows = []

    return {
        "state": state,
        "generated_at": str(payload.get("generated_at") or "")[:32],
        "mode": str(payload.get("mode") or "scan")[:20],
        "summary": summary,
        "candidates": owner_rows,
        "owner_alert": _cycle_owner_alert(payload),
    }


def _return_decision_options(cycle_count) -> list[dict]:
    if cycle_count is None:
        return [{
            "key": "scan_pending",
            "label": "MAYA анализирует",
            "kind": "dismiss",
            "disabled": True,
            "requires_owner_confirmation": False,
        }]
    if not _rub(cycle_count):
        return [{
            "key": "later",
            "label": "Проверить завтра",
            "kind": "dismiss",
            "requires_owner_confirmation": False,
        }]
    return [{
        "key": "message_without_discount",
        "label": "Написать без скидки",
        "kind": "run_job",
        "job": "cycle",
        "recommended": True,
        "requires_owner_confirmation": True,
        "description": "Персональное напоминание и помощь с записью.",
    }, {
        "key": "call_queue",
        "label": "Позвонить",
        "kind": "show_call_list",
        "requires_owner_confirmation": False,
        "description": "Открыть owner-only список и номера для звонка.",
    }, {
        "key": "prepare_offer",
        "label": "Подготовить акцию",
        "kind": "ask_maya",
        "requires_owner_confirmation": True,
        "description": "Сначала определить условия и не давать скидку на заполненные часы.",
    }, {
        "key": "later",
        "label": "Позже",
        "kind": "dismiss",
        "requires_owner_confirmation": False,
    }]


def return_candidates(*, include_personal_data: bool = False) -> dict:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "count": None, "cycle_due_count": None, "potential_return_revenue_rub": None, "cycle_potential_return_revenue_rub": None, "candidates": [], "decision_options": [], "note": "Оценка возврата недоступна. Используйте подтверждённые правила и факты в кабинете Maya; прогноз и отправка не выполняются."}


def _stored_client_retention() -> dict | None:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return None


def _stored_client_registry_analysis() -> dict | None:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return None


def _subtract_calendar_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 - months
    year, month_index = divmod(month_index, 12)
    month = month_index + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _empty_inactivity_breakdown() -> dict:
    return {
        "over_1_month": 0,
        "over_2_months": 0,
        "over_3_months": 0,
        "over_4_months": 0,
        "over_5_months": 0,
        "over_6_months": 0,
        "over_1_year": 0,
    }


def _non_negative_number(value) -> float:
    try:
        parsed = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return parsed if parsed > 0 else 0.0


def _analyze_client_registry(clients: list[dict], *, as_of: date) -> dict:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return _fallback_client_retention()


def client_registry_analysis(*, force: bool = False) -> dict:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return _fallback_client_retention()


def client_retention(*, force: bool = False) -> dict:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return _fallback_client_retention()


def _fallback_client_retention() -> dict:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return {"version": "c8.legacy.unavailable/1", "available": False, "status": "unavailable", "complete": False, "summary": {"previous_cohort_clients": None, "returned_clients": None, "retention_90d_pct": None, "current_clients": None, "repeat_clients": None, "repeat_client_share_pct": None, "recent_clients_60d": None, "future_booked_clients": None, "forward_booking_pct": None, "churn_candidates": None, "data_complete": False}, "reason": "qualified_c8_tenant_read_required", "note": "Оценка по подтверждённым фактам и правилам доступна в кабинете Maya. Старые пороги лояльности и прогноза не применяются."}


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
    import canonical_work_entry
    return canonical_work_entry.owner_required()


def update_control_task(*, task_id, action: str, note: str = "",
                        due_at: str | None = None, due_in_days=None,
                        assigned_to: str = "", assignee_name: str = "") -> dict:
    import canonical_work_entry
    return canonical_work_entry.owner_required()


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
    import canonical_work_entry
    return {**canonical_work_entry.owner_required(), 'tasks': [], 'summary': {}}


def update_staff_task(*, task_id, viewer_role: str, actor_name: str = "",
                      actor_chat_id: int = 0, action: str = "", note: str = "") -> dict:
    import canonical_work_entry
    return canonical_work_entry.owner_required()


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
        "today_paid_revenue_rub": 0,
        "today_paid_visits": 0,
        "top_today_master": None,
        "today_master_revenue": [],
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
        "recommended_action": "cycle",
        "action_hint": "",
        "cycle_due_count": None,
        "cycle_overdue_count": 0,
        "cycle_due_now_count": 0,
        "cycle_due_soon_count": 0,
        "cycle_snapshot_state": "unavailable",
        "owner_alert": _cycle_owner_alert({}),
        "owner_question": "Что сделать с клиентами, которым уже пора вернуться?",
        "decision_options": _return_decision_options(None),
        "candidates": [],
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
    """C8 L08 numerical caller: no legacy valuation or financial forecast."""
    return {"available": False, "status": "unavailable", "daily_target_rub": None, "target_source": "canonical_a22_required", "actual_revenue_rub": None, "paid_visits": None, "booked_today": None, "expected_revenue_rub": None, "projected_revenue_rub": None, "gap_rub": None, "progress_pct": None, "needed_visits_to_target": None, "confidence": None, "note": "Оценка по C8 недоступна; подтверждённый план/факт C7 доступен отдельно."}


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


def _fallback_growth_plan() -> dict:
    return {
        "version": "maya_growth_plan_v1",
        "as_of": _today(),
        "status": "warn",
        "goal": {},
        "plan_fact": {},
        "capacity": {},
        "client_segments": {},
        "masters": [],
        "actions": [],
        "message": "Стратегический план роста временно недоступен.",
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
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return None


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
            return "money", "Потенциальный эффект"
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
            top.get("title") or "Возможность роста",
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
                   owner_review: dict, automation_queue: dict,
                   execution_loop: dict | None = None) -> dict:
    """C8 L08: legacy derived scoring/strategy is retired; source owners remain independent."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "score": None, "summary": {}, "items": [], "decisions": [], "goals": [], "dimensions": [], "sections": [], "note": "Оценки и прогнозы доступны только по проверенным данным и подтверждённым правилам в кабинете Maya."}


def _financial_director(*, snap: dict, plan: dict, masters: dict,
                        opps: list[dict], risks: list[dict]) -> dict:
    """C8 L08: legacy derived scoring/strategy is retired; source owners remain independent."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "score": None, "summary": {}, "items": [], "decisions": [], "goals": [], "dimensions": [], "sections": [], "note": "Оценки и прогнозы доступны только по проверенным данным и подтверждённым правилам в кабинете Maya."}


def _goal_status(progress_pct, *, warn_below: int = 95, risk_below: int = 75) -> str:
    if progress_pct is None:
        return "ok"
    try:
        progress = float(progress_pct)
    except Exception:
        return "ok"
    if progress < risk_below:
        return "risk"
    if progress < warn_below:
        return "warn"
    return "ok"


def _goal_progress(actual, target):
    target = _rub(target)
    if not target:
        return None
    return round((_rub(actual) / target) * 100)


def _business_goals(*, snap: dict, plan: dict, masters: dict,
                    ret: dict, finance: dict) -> dict:
    """C8 L08: legacy derived scoring/strategy is retired; source owners remain independent."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "score": None, "summary": {}, "items": [], "decisions": [], "goals": [], "dimensions": [], "sections": [], "note": "Оценки и прогнозы доступны только по проверенным данным и подтверждённым правилам в кабинете Maya."}


def _owner_business_advisor(
    *,
    snap: dict,
    plan: dict,
    business_goals: dict,
    ret: dict,
    retention: dict,
    reputation_payload: dict,
    internal_reviews: dict,
) -> dict:
    """C8 L08: legacy derived scoring/strategy is retired; source owners remain independent."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "score": None, "summary": {}, "items": [], "decisions": [], "goals": [], "dimensions": [], "sections": [], "note": "Оценки и прогнозы доступны только по проверенным данным и подтверждённым правилам в кабинете Maya."}


def _growth_engine(
    *,
    snap: dict,
    plan: dict,
    ret: dict,
    retention: dict,
    reputation_payload: dict,
    market_payload: dict,
) -> dict:
    """C8 L08: legacy derived scoring/strategy is retired; source owners remain independent."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "score": None, "summary": {}, "items": [], "decisions": [], "goals": [], "dimensions": [], "sections": [], "note": "Оценки и прогнозы доступны только по проверенным данным и подтверждённым правилам в кабинете Maya."}


def _owner_briefing(
    *,
    snap: dict,
    plan: dict,
    business_goals: dict,
    owner_advisor: dict,
    return_candidates: dict,
    retention: dict,
    reputation_payload: dict,
    market_payload: dict,
    masters: dict,
    growth_engine: dict,
) -> dict:
    """C8 L08: legacy derived scoring/strategy is retired; source owners remain independent."""
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "score": None, "summary": {}, "items": [], "decisions": [], "goals": [], "dimensions": [], "sections": [], "note": "Оценки и прогнозы доступны только по проверенным данным и подтверждённым правилам в кабинете Maya."}


def _decision_memory(*, journal: list[dict], control: list[dict],
                     business_goals: dict, now_iso: str) -> dict:
    """Операционная память: решения, открытые петли и выводы по результатам."""
    now_dt = _parse_iso(now_iso) or datetime.now()
    rows = []
    seen = set()

    def age_days(value: str | None):
        dt = _parse_iso(value)
        if not dt:
            return None
        try:
            return max(0, (now_dt.date() - dt.date()).days)
        except Exception:
            return None

    def add(key: str, kind: str, title: str, *, status: str = "ok",
            detail: str = "", source: str = "", happened_at: str | None = None,
            potential_rub=None, impact_status: str = "", owner_next_step: str = "",
            decision_state: str = "") -> None:
        key = (key or title or kind or "memory").strip()[:140]
        if not key or key in seen:
            return
        seen.add(key)
        rows.append({
            "key": key,
            "kind": kind,
            "title": title or "Память решения",
            "status": status or "ok",
            "detail": detail or "",
            "source": source or "",
            "happened_at": happened_at or "",
            "age_days": age_days(happened_at),
            "potential_rub": _rub(potential_rub) if potential_rub is not None else None,
            "impact_status": impact_status or "",
            "owner_next_step": owner_next_step or "",
            "decision_state": decision_state or "",
        })

    for item in control or []:
        if item.get("source") != "owner_control" or not item.get("action_id"):
            continue
        work_state = str(item.get("assignment_work_state") or "")
        due_state = str(item.get("due_state") or "")
        if due_state == "overdue":
            status = "risk"
            state = "overdue"
            step = "Закрыть, перенести или вернуть задачу в работу — она уже просрочена."
        elif work_state == "done":
            status = "warn"
            state = "ready_review"
            step = "Принять результат владельцем: закрыть или вернуть на доработку."
        elif work_state == "blocked":
            status = "risk"
            state = "blocked"
            step = "Разобрать блокировку и назначить следующий шаг."
        else:
            status = "warn"
            state = work_state or "open"
            step = item.get("owner_next_step") or "Довести решение до результата и проверки эффекта."
        add(
            "open_decision:%s" % item.get("action_id"),
            "open_decision",
            item.get("title") or "Открытое решение",
            status=status,
            detail=item.get("detail") or item.get("next_transition") or "",
            source="owner_control",
            happened_at=item.get("created_at") or item.get("due_at"),
            potential_rub=item.get("potential_rub"),
            owner_next_step=step,
            decision_state=state,
        )

    for item in journal or []:
        job = str(item.get("job") or "")
        src = str(item.get("source") or "")
        status_raw = str(item.get("status") or "")
        title = item.get("title") or (_AUTOMATION_LIBRARY.get(job) or {}).get("title") or job or "Действие"
        happened = item.get("completed_at") or item.get("evaluated_at") or item.get("created_at")
        impact = item.get("impact") if isinstance(item.get("impact"), dict) else {}
        impact_status = item.get("impact_status") or impact.get("status") or ""
        impact_message = impact.get("message") or item.get("error") or ""
        if status_raw == "failed":
            add(
                "failed:%s" % item.get("id"),
                "lesson",
                "Ошибка: %s" % title,
                status="risk",
                detail=impact_message or "Действие завершилось ошибкой.",
                source=src or "journal",
                happened_at=happened,
                potential_rub=(item.get("payload") or {}).get("potential_rub"),
                impact_status="failed",
                owner_next_step="Разобрать причину ошибки и решить: повторить, отменить или заменить сценарий.",
                decision_state="failed",
            )
            continue
        if status_raw == "done" and not item.get("evaluated_at") and item.get("result_due_at"):
            add(
                "unverified:%s" % item.get("id"),
                "unverified_result",
                "Проверить эффект: %s" % title,
                status="warn",
                detail="Действие выполнено, но эффект ещё не оценён.",
                source=src or "journal",
                happened_at=happened,
                potential_rub=(item.get("payload") or {}).get("potential_rub"),
                owner_next_step="Оценить результат и записать вывод в журнал.",
                decision_state="needs_effect_check",
            )
        if item.get("evaluated_at") or impact_status:
            if impact_status == "positive_signal":
                status = "ok"
                step = "Повторять похожий сценарий, когда снова появится такой же повод."
            elif impact_status in ("no_signal_yet", "no_reach"):
                status = "warn"
                step = "Не считать это доказанным успехом: проверить сегмент, оффер и канал."
            else:
                status = "warn"
                step = "Оставить как наблюдение и проверить следующий запуск."
            add(
                "learning:%s" % item.get("id"),
                "lesson",
                title,
                status=status,
                detail=impact_message or "Результат оценён.",
                source=src or "journal",
                happened_at=item.get("evaluated_at") or happened,
                potential_rub=(item.get("payload") or {}).get("potential_rub"),
                impact_status=impact_status,
                owner_next_step=step,
                decision_state="evaluated",
            )

    for goal in (business_goals.get("goals") or [])[:6]:
        if goal.get("status") == "ok":
            continue
        add(
            "goal_memory:%s" % goal.get("key"),
            "goal_gap",
            goal.get("title") or "Отклонение цели",
            status=goal.get("status") or "warn",
            detail=goal.get("detail") or "",
            source="business_goals",
            happened_at=now_iso,
            potential_rub=abs(_rub(goal.get("gap_value"))) if goal.get("unit") == "rub" else None,
            owner_next_step=goal.get("owner_next_step") or "Принять управленческое решение по отклонению.",
            decision_state="goal_off_track",
        )

    rows.sort(key=lambda item: (
        -_severity_rank(item.get("status")),
        {"open_decision": 0, "unverified_result": 1, "goal_gap": 2, "lesson": 3}.get(item.get("kind"), 9),
        item.get("age_days") is None,
        -(item.get("age_days") or 0),
        -(item.get("potential_rub") or 0),
    ))
    open_decisions = [r for r in rows if r.get("kind") == "open_decision"]
    unverified = [r for r in rows if r.get("kind") == "unverified_result"]
    lessons = [r for r in rows if r.get("kind") == "lesson"]
    positive = [r for r in lessons if r.get("impact_status") == "positive_signal"]
    failed = [r for r in rows if r.get("status") == "risk"]
    stale = [
        r for r in open_decisions
        if r.get("age_days") is not None and r.get("age_days") >= 2
    ]
    if failed or stale:
        status = "risk"
        headline = "Память решений показывает незакрытые разрывы"
    elif open_decisions or unverified:
        status = "warn"
        headline = "Есть решения без финального вывода"
    elif lessons:
        status = "ok"
        headline = "Выводы по решениям сохранены"
    else:
        status = "ok"
        headline = "Память решений пока набирается"
    next_step = (
        (failed[0].get("owner_next_step") if failed else "")
        or (stale[0].get("owner_next_step") if stale else "")
        or (unverified[0].get("owner_next_step") if unverified else "")
        or "После каждого действия проверять эффект и закрывать вывод в журнале."
    )
    return {
        "version": "maya_os_v5_decision_memory",
        "mode": "operating_memory",
        "status": status,
        "headline": headline,
        "summary": {
            "items_count": len(rows),
            "open_decisions_count": len(open_decisions),
            "unverified_results_count": len(unverified),
            "lessons_count": len(lessons),
            "positive_signals_count": len(positive),
            "risk_memory_count": len(failed),
            "stale_decisions_count": len(stale),
            "goal_gaps_count": len([r for r in rows if r.get("kind") == "goal_gap"]),
        },
        "items": rows[:10],
        "next_step": next_step,
        "note": "Память строится по журналу действий и контрольным задачам без персональных данных.",
    }


def _operating_rhythm_status(now_iso: str | None = None) -> dict:
    """Статус безопасного backend-ритма MAYA OS."""
    now_iso = now_iso or datetime.now().isoformat(timespec="seconds")
    now_dt = _parse_iso(now_iso) or datetime.now()
    last_at = ""
    last_summary = {}
    try:
        import database
        last_at = database.get_setting("maya_os_rhythm_last_at") or ""
        raw = database.get_setting("maya_os_rhythm_last_summary") or ""
        if raw:
            last_summary = json.loads(raw)
    except Exception as e:
        logger.error("owner_ai operating_rhythm_status: %s", e)
        last_summary = {"error": "settings_unavailable"}
    last_dt = _parse_iso(last_at)
    age_seconds = None
    if last_dt:
        try:
            age_seconds = max(0, int((now_dt - last_dt).total_seconds()))
        except Exception:
            age_seconds = None
    interval = _OPERATING_RHYTHM_INTERVAL_SECONDS
    if not last_at:
        status = "warn"
        headline = "Операционный ритм ещё не запускался"
    elif age_seconds is not None and age_seconds > interval * 2:
        status = "warn"
        headline = "Операционный ритм пора обновить"
    else:
        status = "ok"
        headline = "Операционный ритм активен"
    next_run_after = ""
    if last_dt:
        try:
            next_run_after = (last_dt + timedelta(seconds=interval)).isoformat(timespec="seconds")
        except Exception:
            next_run_after = ""
    return {
        "version": "maya_os_v6_operating_rhythm",
        "mode": "safe_scheduler",
        "status": status,
        "headline": headline,
        "summary": {
            "enabled": True,
            "safe_only": True,
            "interval_seconds": interval,
            "interval_minutes": int(interval // 60),
            "last_run_at": last_at,
            "last_age_seconds": age_seconds,
            "next_run_after": next_run_after,
            "last_created_count": _rub(last_summary.get("created_count")),
            "last_updated_count": _rub(last_summary.get("updated_count")),
            "last_skipped_count": _rub(last_summary.get("skipped_count")),
        },
        "last_summary": last_summary,
        "next_step": (
            "Scheduler сам выполнит безопасный тик; внешние действия останутся через подтверждение владельца."
        ),
        "note": "Ритм запускает только внутренние задачи, контроль исполнения и замыкание циклов.",
    }


def run_operating_rhythm_tick(*, created_by=None, force: bool = False) -> dict:
    import canonical_work_entry
    return canonical_work_entry.owner_required()


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


def _hours_since(value: str | None, *, now_dt: datetime) -> int | None:
    dt = _parse_iso(value)
    if not dt:
        return None
    try:
        return max(0, int((now_dt - dt).total_seconds() // 3600))
    except Exception:
        return None


def _autopilot_supervisor(*, control: list[dict], owner_review: dict,
                          now_iso: str) -> dict:
    """Autopilot 2.1: ведёт внутренние задачи до результата без внешних действий."""
    now_dt = _parse_iso(now_iso) or datetime.now()
    active_keys = {
        item.get("signal_key")
        for item in control or []
        if item.get("source") == "owner_control" and item.get("signal_key")
    }
    rows, seen = [], set()

    def add(kind: str, item: dict, title: str, detail: str = "", *,
            priority: str = "medium", safe_action: str = "",
            owner_next_step: str = "", action_title: str = "",
            action_detail: str = "") -> None:
        control_id = item.get("action_id") or item.get("control_action_id") or item.get("key") or title
        key = "%s:%s" % (kind, control_id)
        if key in seen:
            return
        seen.add(key)
        signal_key = "autopilot_supervision:%s:%s" % (kind, control_id)
        in_control = signal_key in active_keys
        rows.append({
            "key": key,
            "kind": kind,
            "control_action_id": item.get("action_id") or item.get("control_action_id"),
            "source_control_key": item.get("key"),
            "source_signal_key": item.get("signal_key"),
            "signal_key": signal_key,
            "title": title or "Контроль исполнения",
            "detail": detail or "",
            "priority": priority if priority in ("low", "medium", "high") else "medium",
            "assigned_to": item.get("assigned_to") or "owner",
            "assigned_label": item.get("assigned_label") or _assignee_label(item.get("assigned_to"), item.get("assignee_name")),
            "assignment_work_state": item.get("assignment_work_state") or "",
            "assignment_delivery_state": item.get("assignment_delivery_state") or "",
            "due_at": item.get("due_at"),
            "due_state": item.get("due_state"),
            "potential_rub": item.get("potential_rub"),
            "safe_action": safe_action,
            "safe_to_execute": bool(safe_action in ("start_internal", "create_escalation")),
            "in_control": in_control,
            "owner_next_step": owner_next_step or "Проверить задачу и довести до результата.",
            "action_title": action_title or title,
            "action_detail": action_detail or detail,
        })

    for item in control or []:
        if item.get("source") != "owner_control" or not item.get("action_id"):
            continue
        if item.get("signal_kind") == "autopilot_supervision":
            continue
        status = str(item.get("status") or "").lower()
        if status in ("done", "canceled"):
            continue
        assigned_to = _normalize_assignee(item.get("assigned_to"))
        work_state = str(item.get("assignment_work_state") or "")
        delivery_state = str(item.get("assignment_delivery_state") or "")
        due_state = str(item.get("due_state") or "")
        delivery_age = _hours_since(
            item.get("assignment_delivery_updated_at") or item.get("due_at"),
            now_dt=now_dt,
        )
        work_age = _hours_since(item.get("assignment_work_updated_at"), now_dt=now_dt)

        if assigned_to == "maya" and not work_state:
            add(
                "start_maya_task",
                item,
                "MAYA должна взять задачу в работу",
                item.get("title") or item.get("detail") or "",
                priority="medium",
                safe_action="start_internal",
                owner_next_step="MAYA отметит внутреннюю задачу как взятую в работу.",
            )

        if due_state == "overdue" and work_state != "done":
            add(
                "overdue",
                item,
                "Эскалация просроченной задачи",
                item.get("title") or item.get("detail") or "",
                priority="high",
                safe_action="create_escalation",
                owner_next_step="Создать owner-эскалацию и решить: закрыть, переназначить или вернуть в работу.",
                action_title="Эскалация: %s" % (item.get("title") or "просроченная задача"),
                action_detail="Задача просрочена. Ответственный: %s. Следующий шаг: проверить статус и назначить решение." % (
                    item.get("assigned_label") or _assignee_label(item.get("assigned_to"), item.get("assignee_name"))
                ),
            )

        if assigned_to in ("admin", "master", "team") and not work_state and due_state != "overdue":
            stale_delivery = (
                due_state == "overdue"
                or delivery_state in ("queued", "failed")
                or (delivery_state == "delivered" and delivery_age is not None and delivery_age >= 18)
            )
            if stale_delivery:
                add(
                    "waiting_accept",
                    item,
                    "Исполнитель не взял задачу",
                    item.get("title") or "",
                    priority="high" if due_state == "overdue" or delivery_state == "failed" else "medium",
                    safe_action="create_escalation",
                    owner_next_step="Поднять задачу владельцу: исполнитель не подтвердил работу.",
                    action_title="Проверить исполнителя: %s" % (item.get("title") or "задача без принятия"),
                    action_detail="Задача назначена, но исполнитель не взял её в работу. Проверить в командном чате или переназначить.",
                )

        if work_state == "blocked":
            add(
                "blocked",
                item,
                "Исполнитель заблокирован",
                item.get("title") or item.get("detail") or "",
                priority="high",
                safe_action="create_escalation",
                owner_next_step="Разобрать блокировку и помочь исполнителю или переназначить.",
                action_title="Разобрать блокировку: %s" % (item.get("title") or "задача"),
                action_detail="Исполнитель отметил блокировку. Нужно решение владельца.",
            )
        elif work_state == "done":
            add(
                "ready_review",
                item,
                "Задача ждёт приёмки владельца",
                item.get("title") or item.get("detail") or "",
                priority="medium" if work_age is None or work_age < 24 else "high",
                safe_action="",
                owner_next_step="Проверить результат: закрыть контроль или вернуть на доработку.",
            )

    for item in (owner_review.get("items") or []):
        if str(item.get("review_state") or "") != "ready":
            continue
        if (item.get("assignment_age_hours") or 0) < 24:
            continue
        add(
            "stale_review",
            item,
            "Приёмка владельца висит больше суток",
            item.get("title") or "",
            priority="high",
            safe_action="",
            owner_next_step="Принять результат или вернуть задачу на доработку.",
        )

    rows.sort(key=lambda item: (
        item.get("in_control"),
        -_severity_rank(item.get("priority")),
        0 if item.get("safe_to_execute") else 1,
        item.get("title") or "",
    ))
    safe_open = [it for it in rows if it.get("safe_to_execute") and not it.get("in_control")]
    if any(it.get("kind") in ("overdue", "blocked") and not it.get("in_control") for it in rows):
        status = "risk"
        headline = "Autopilot нашёл задачи, которые нужно эскалировать"
    elif safe_open:
        status = "warn"
        headline = "Autopilot может безопасно продвинуть задачи"
    elif rows:
        status = "warn"
        headline = "Есть задачи на контроле исполнения"
    else:
        status = "ok"
        headline = "Исполнение задач под контролем"
    return {
        "version": "autopilot_supervisor_v1",
        "status": status,
        "headline": headline,
        "mode": "internal_supervision",
        "summary": {
            "items_count": len(rows),
            "safe_actions_count": len(safe_open),
            "overdue_count": len([it for it in rows if it.get("kind") == "overdue"]),
            "waiting_accept_count": len([it for it in rows if it.get("kind") == "waiting_accept"]),
            "blocked_count": len([it for it in rows if it.get("kind") == "blocked"]),
            "ready_review_count": len([it for it in rows if it.get("kind") in ("ready_review", "stale_review")]),
            "maya_start_count": len([it for it in rows if it.get("kind") == "start_maya_task"]),
            "in_control_count": len([it for it in rows if it.get("in_control")]),
        },
        "items": rows[:8],
        "next_step": (
            "Провести контроль: MAYA отметит свои задачи в работе и создаст owner-эскалации по просрочкам."
            if safe_open else "Наблюдать: опасных автодействий нет, внешние действия требуют владельца."
        ),
    }


def _execution_stage_label(stage: str | None = "") -> str:
    return {
        "owner_queue": "Ждёт владельца",
        "maya_queue": "Ждёт MAYA",
        "queued": "Ждёт доставки",
        "delivered": "Доставлено",
        "accepted": "Принято",
        "running": "В работе",
        "revision": "На доработке",
        "blocked": "Заблокировано",
        "ready_review": "Готово к приёмке",
        "effect_check": "Проверить эффект",
        "overdue": "Просрочено",
    }.get(str(stage or ""), "В контроле")


def _execution_loop(*, control: list[dict], journal: list[dict],
                    owner_review: dict, autopilot_supervisor: dict,
                    now_iso: str) -> dict:
    """Maya OS v3: замкнутый цикл от постановки задачи до результата."""
    now_dt = _parse_iso(now_iso) or datetime.now()
    active_keys = {
        item.get("signal_key")
        for item in control or []
        if item.get("source") == "owner_control" and item.get("signal_key")
    }
    rows, seen = [], set()

    def add(item: dict, *, stage: str, break_kind: str = "", priority: str = "medium",
            next_transition: str = "", owner_next_step: str = "",
            safe_action: str = "", action_title: str = "",
            action_detail: str = "") -> None:
        control_id = item.get("action_id") or item.get("control_action_id") or item.get("key") or item.get("title")
        key = "execution_loop:%s" % control_id
        if key in seen:
            return
        seen.add(key)
        signal_key = "closed_loop:%s:%s" % (break_kind or stage or "watch", control_id)
        in_control = signal_key in active_keys
        rows.append({
            "key": key,
            "control_action_id": item.get("action_id") or item.get("control_action_id"),
            "source_control_key": item.get("key"),
            "title": item.get("title") or "Задача",
            "detail": item.get("detail") or "",
            "stage": stage,
            "stage_label": _execution_stage_label(stage),
            "break_kind": break_kind,
            "is_broken": bool(break_kind),
            "priority": priority if priority in ("low", "medium", "high") else "medium",
            "assigned_to": item.get("assigned_to") or "owner",
            "assigned_label": item.get("assigned_label") or _assignee_label(item.get("assigned_to"), item.get("assignee_name")),
            "assignment_delivery_state": item.get("assignment_delivery_state") or "",
            "assignment_delivery_label": item.get("assignment_delivery_label") or "",
            "assignment_work_state": item.get("assignment_work_state") or "",
            "assignment_work_label": item.get("assignment_work_label") or "",
            "assignment_work_updated_at": item.get("assignment_work_updated_at") or "",
            "assignment_work_actor_name": item.get("assignment_work_actor_name") or "",
            "linked_action_id": item.get("linked_action_id"),
            "linked_action_status": item.get("linked_action_status"),
            "linked_action_evaluated_at": item.get("linked_action_evaluated_at"),
            "linked_action_impact_status": item.get("linked_action_impact_status"),
            "due_at": item.get("due_at"),
            "due_state": item.get("due_state"),
            "potential_rub": item.get("potential_rub"),
            "next_transition": next_transition or "Довести задачу до следующего статуса.",
            "owner_next_step": owner_next_step or item.get("owner_next_step") or "Проверить задачу и закрыть следующий переход.",
            "safe_action": safe_action,
            "safe_to_execute": bool(safe_action == "create_owner_followup" and not in_control),
            "signal_key": signal_key,
            "in_control": in_control,
            "action_title": action_title or ("Замкнуть цикл: %s" % (item.get("title") or "задача")),
            "action_detail": action_detail or (owner_next_step or item.get("owner_next_step") or ""),
        })

    for item in control or []:
        if item.get("source") != "owner_control" or not item.get("action_id"):
            continue
        if item.get("signal_kind") == "closed_loop":
            continue
        status = str(item.get("status") or "").lower()
        if status in ("done", "canceled"):
            continue
        assigned_to = _normalize_assignee(item.get("assigned_to"))
        delivery_state = str(item.get("assignment_delivery_state") or "")
        work_state = str(item.get("assignment_work_state") or "")
        due_state = str(item.get("due_state") or "")
        linked_status = str(item.get("linked_action_status") or "")
        work_age = _hours_since(item.get("assignment_work_updated_at"), now_dt=now_dt)
        delivery_age = _hours_since(
            item.get("assignment_delivery_updated_at") or item.get("due_at"),
            now_dt=now_dt,
        )

        stage = "owner_queue"
        break_kind = ""
        priority = item.get("status") or "medium"
        next_transition = ""
        owner_next_step = item.get("owner_next_step") or ""
        safe_action = ""

        if work_state == "blocked":
            stage = "blocked"
            break_kind = "blocked"
            priority = "high"
            next_transition = "Владелец снимает блокировку или переназначает задачу."
            owner_next_step = "Разобрать блокировку, помочь исполнителю или назначить другого ответственного."
        elif work_state == "done":
            stage = "ready_review"
            stale = work_age is not None and work_age >= 24
            break_kind = "owner_acceptance_stale" if stale else "owner_acceptance"
            priority = "high" if stale else "medium"
            next_transition = "Владелец принимает результат или возвращает задачу на доработку."
            owner_next_step = "Проверить факт выполнения и закрыть контроль либо вернуть на доработку."
            if stale:
                safe_action = "create_owner_followup"
        elif linked_status == "done" and not item.get("linked_action_evaluated_at"):
            stage = "effect_check"
            break_kind = "effect_check_due" if due_state in ("today", "overdue") else ""
            priority = "high" if due_state == "overdue" else "medium"
            next_transition = "Проверить эффект действия и закрыть контроль результата."
            owner_next_step = "Оценить результат действия в журнале AI-директора и зафиксировать следующий шаг."
            if break_kind:
                safe_action = "create_owner_followup"
        elif due_state == "overdue":
            stage = "overdue"
            break_kind = "overdue"
            priority = "high"
            next_transition = "Решить по просроченной задаче: закрыть, переназначить или отложить."
            owner_next_step = "Срок прошёл. Нужен управленческий разбор и решение владельца."
        elif work_state == "revision":
            stage = "revision"
            next_transition = "Исполнитель повторно берёт доработку в работу и отмечает готово."
            owner_next_step = "Дождаться повторной готовности или помочь снять препятствие."
            if work_age is not None and work_age >= 24:
                break_kind = "revision_stale"
                priority = "high"
                safe_action = "create_owner_followup"
        elif work_state == "running":
            stage = "running"
            next_transition = "Исполнитель завершает работу и отмечает готово."
            owner_next_step = "Держать задачу на контроле до результата."
            if work_age is not None and work_age >= 24:
                break_kind = "running_stale"
                priority = "high"
                safe_action = "create_owner_followup"
        elif work_state == "accepted":
            stage = "accepted"
            next_transition = "Исполнитель переводит задачу из принятой в работу."
            owner_next_step = "Проверить, что принятая задача реально пошла в работу."
            if work_age is not None and work_age >= 8:
                break_kind = "accepted_stale"
                priority = "medium"
                safe_action = "create_owner_followup"
        elif assigned_to in ("admin", "master", "team"):
            if delivery_state == "delivered":
                stage = "delivered"
                next_transition = "Исполнитель принимает задачу в работу."
                owner_next_step = "Дождаться принятия задачи исполнителем."
                if delivery_age is not None and delivery_age >= 18:
                    break_kind = "waiting_accept"
                    priority = "medium"
            elif delivery_state == "queued":
                stage = "queued"
                next_transition = "Задача должна быть доставлена в рабочий чат."
                owner_next_step = "Проверить доставку поручения в командный чат."
                break_kind = "delivery_waiting"
            elif delivery_state == "failed":
                stage = "queued"
                break_kind = "delivery_failed"
                priority = "high"
                next_transition = "Повторить доставку или назначить задачу вручную."
                owner_next_step = "Доставка не прошла. Нужно проверить командный чат и повторить."
            else:
                stage = "queued"
                break_kind = "delivery_missing"
                next_transition = "Доставить задачу исполнителю."
                owner_next_step = "Поручение назначено, но доставка не зафиксирована."
        elif assigned_to == "maya":
            if work_state:
                stage = "running"
                next_transition = "MAYA завершает внутреннюю подготовку и отдаёт результат владельцу."
                owner_next_step = "Дождаться результата MAYA."
            else:
                stage = "maya_queue"
                break_kind = "maya_not_started"
                next_transition = "MAYA должна взять внутреннюю задачу в работу."
                owner_next_step = "Autopilot 2.1 может безопасно отметить задачу MAYA как взятую в работу."
        else:
            stage = "owner_queue"
            next_transition = "Владелец принимает решение по задаче."
            owner_next_step = item.get("owner_next_step") or "Принять решение: выполнить, назначить, отложить или закрыть."
            if due_state in ("today", "overdue"):
                break_kind = "owner_decision_due"
                priority = "high" if due_state == "overdue" else "medium"
                safe_action = "create_owner_followup"

        add(
            item,
            stage=stage,
            break_kind=break_kind,
            priority=priority,
            next_transition=next_transition,
            owner_next_step=owner_next_step,
            safe_action=safe_action,
            action_title="Замкнуть цикл: %s" % (item.get("title") or "задача"),
            action_detail="%s Следующий переход: %s" % (
                owner_next_step or "Нужно довести задачу до результата.",
                next_transition or "закрыть следующий статус",
            ),
        )

    rows.sort(key=lambda item: (
        not item.get("is_broken"),
        item.get("in_control"),
        -_severity_rank(item.get("priority")),
        0 if item.get("safe_to_execute") else 1,
        str(item.get("due_at") or "9999-99-99"),
        item.get("title") or "",
    ))
    open_count = len(rows)
    broken = [it for it in rows if it.get("is_broken")]
    safe_open = [it for it in rows if it.get("safe_to_execute")]
    ready_review = [it for it in rows if it.get("stage") == "ready_review"]
    effect_check = [it for it in rows if it.get("stage") == "effect_check"]
    closed_loop_score = 100 if not open_count else max(0, int(round((open_count - len(broken)) * 100 / open_count)))
    supervisor_safe = _rub((autopilot_supervisor.get("summary") or {}).get("safe_actions_count"))
    review_ready = _rub((owner_review.get("summary") or {}).get("ready_count"))
    if any(_severity_rank(it.get("priority")) >= 3 for it in broken):
        status = "risk"
        headline = "Цикл исполнения разорван в критичных задачах"
    elif broken or supervisor_safe or review_ready:
        status = "warn"
        headline = "Есть задачи, которые нужно довести до результата"
    else:
        status = "ok"
        headline = "Задачи проходят полный цикл"
    return {
        "version": "maya_os_v3_closed_loop",
        "status": status,
        "headline": headline,
        "mode": "closed_loop_control",
        "generated_at": now_iso,
        "summary": {
            "open_count": open_count,
            "broken_count": len(broken),
            "safe_actions_count": len(safe_open),
            "closed_loop_score": closed_loop_score,
            "ready_review_count": len(ready_review),
            "effect_check_count": len(effect_check),
            "blocked_count": len([it for it in rows if it.get("stage") == "blocked"]),
            "overdue_count": len([it for it in rows if it.get("stage") == "overdue"]),
            "waiting_accept_count": len([it for it in rows if it.get("break_kind") == "waiting_accept"]),
            "in_control_count": len([it for it in rows if it.get("in_control")]),
        },
        "items": rows[:10],
        "next_step": (
            "Замкнуть цикл: MAYA создаст owner-followup по безопасным разрывам исполнения."
            if safe_open else "Наблюдать и принимать решения по задачам на проверке."
        ),
    }


def run_execution_loop_tick(*, created_by=None, limit: int = 6) -> dict:
    import canonical_work_entry
    return canonical_work_entry.owner_required()


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
    import canonical_work_entry
    return canonical_work_entry.owner_required()


def run_autopilot_supervision_tick(*, created_by=None, limit: int = 8) -> dict:
    import canonical_work_entry
    return canonical_work_entry.owner_required()


def _c8_legacy_projection(value):
    """Consumer boundary: legacy bridges may expose observations, never revive cached C8 estimates."""
    forbidden = {"confidence", "confidence_pct", "planning_confidence_pct", "money_at_stake_rub", "free_capacity_today", "risk_level", "recoverable_clients", "lost_clients", "loyal_clients", "retention_90d_pct", "forward_booking_pct", "retention_score", "plan_potential_rub", "plan_baseline_rub", "plan_gap_rub", "daily_target_rub", "plan_progress_pct", "avg_check_rub", "daily_load_pct", "kpi_score", "owner_advisor_score", "growth_opportunity_min_rub", "growth_opportunity_max_rub", "growth_realistic_ceiling_rub", "growth_recoverable_clients", "month_goal_gap_rub", "month_goal_progress_pct", "growth_target_rub"}
    if isinstance(value, dict):
        return {key: None if key in forbidden or key.startswith(("potential_", "forecast_", "projected_", "expected_", "realistic_95_", "theoretical_max_", "upsell_potential", "fill_potential", "capacity_revenue")) else _c8_legacy_projection(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_c8_legacy_projection(item) for item in value]
    return value


def command_center(*, include_personal_data: bool = False) -> dict:
    """Owner Command Center v1: единый read-only контракт Maya OS.

    Собирает уже существующие директорские блоки в стабильную структуру для
    founder/owner UI и будущего AI-директора. Блоки независимы: сбой одной
    подсистемы не валит весь центр управления.
    """
    snap, snap_err = _safe_owner_block("business_snapshot", business_snapshot, _fallback_snapshot)
    exp, exp_err = _safe_owner_block("expiring_assets", expiring_assets, _fallback_assets)
    ret, ret_err = _safe_owner_block(
        "return_candidates",
        lambda: return_candidates(include_personal_data=include_personal_data),
        _fallback_return_candidates,
    )
    retention, retention_err = _safe_owner_block(
        "client_retention", client_retention, _fallback_client_retention
    )
    svc, svc_err = _safe_owner_block("service_insights", service_insights, _fallback_services)
    plan, plan_err = _safe_owner_block("plan_fact", lambda: plan_fact(snap=snap), _fallback_plan_fact)
    masters, masters_err = _safe_owner_block("master_performance", master_performance, _fallback_master_performance)
    growth_plan, growth_plan_err = _safe_owner_block(
        "growth_plan",
        lambda: __import__("growth_planner").get_growth_plan(role="owner"),
        _fallback_growth_plan,
    )

    errors = [
        e for e in (
            snap_err, exp_err, ret_err, retention_err, svc_err, plan_err,
            masters_err, growth_plan_err,
        ) if e
    ]
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
        journal = []  # R04: historical journal is not current operational truth
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
        retention.get("status"),
        "warn" if ret_err or retention_err or exp_err else "ok",
    )
    service_status = _command_status(
        "warn" if (svc.get("weak_services") or []) else "ok",
        "warn" if svc_err else "ok",
    )
    masters_status = _command_status(
        "ok" if (masters.get("masters") or []) else "warn",
        "warn" if masters_err else "ok",
    )
    growth_plan_status = _command_status(
        growth_plan.get("status"),
        "warn" if growth_plan_err else "ok",
    )
    overall = _command_status(
        today_status,
        money_status,
        plan_status,
        risk_status,
        client_status,
        service_status,
        masters_status,
        growth_plan_status,
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
    autopilot_supervisor = _autopilot_supervisor(
        control=control,
        owner_review=owner_review,
        now_iso=now_iso,
    )
    execution_loop = _execution_loop(
        control=control,
        journal=journal,
        owner_review=owner_review,
        autopilot_supervisor=autopilot_supervisor,
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
        execution_loop=execution_loop,
    )
    financial_director = _financial_director(
        snap=snap,
        plan=plan,
        masters=masters,
        opps=opps,
        risks=risks,
    )
    business_goals = _business_goals(
        snap=snap,
        plan=plan,
        masters=masters,
        ret=ret,
        finance=financial_director,
    )
    try:
        import reputation
        reputation_payload = reputation.reputation_snapshot(force_refresh=False)
    except Exception as e:
        logger.error("owner_ai command_center reputation: %s", e)
        reputation_payload = {
            "version": "maya_reputation_v1",
            "status": "warn",
            "headline": "Репутационный источник временно недоступен",
            "summary": {
                "overall_rating": None,
                "rated_sources_count": 0,
                "text_reviews_count": 0,
                "negative_reviews_count": 0,
                "text_analysis_status": "unavailable",
            },
            "sources": [],
            "recommendations": ["Проверить подключение источников отзывов."],
        }
    try:
        import market_intelligence
        market_payload = market_intelligence.market_snapshot(force_refresh=False)
    except Exception as e:
        logger.error("owner_ai command_center market_intelligence: %s", e)
        market_payload = {
            "version": "maya_market_intelligence_v1",
            "status": "warn",
            "headline": "MAYA готовит первый снимок рынка Ставрополя",
            "source": "2gis_public_pages",
            "observed_at": "",
            "summary": {"city": "Ставрополь", "competitors_scanned": 0, "reviews_analyzed": 0},
            "leaders": [],
            "review_themes": [],
            "insights": ["Первый рыночный анализ появится после фонового обновления."],
        }
    try:
        import database
        internal_reviews = database.review_stats(days=90)
    except Exception:
        internal_reviews = {"avg_rating": None, "total_rated": 0}
    owner_advisor = _owner_business_advisor(
        snap=snap,
        plan=plan,
        business_goals=business_goals,
        ret=ret,
        retention=retention,
        reputation_payload=reputation_payload,
        internal_reviews=internal_reviews,
    )
    growth_engine = _growth_engine(
        snap=snap,
        plan=plan,
        ret=ret,
        retention=retention,
        reputation_payload=reputation_payload,
        market_payload=market_payload,
    )
    briefing = _owner_briefing(
        snap=snap,
        plan=plan,
        business_goals=business_goals,
        owner_advisor=owner_advisor,
        return_candidates=ret,
        retention=retention,
        reputation_payload=reputation_payload,
        market_payload=market_payload,
        masters=masters,
        growth_engine=growth_engine,
    )
    decision_memory = _decision_memory(
        journal=journal,
        control=control,
        business_goals=business_goals,
        now_iso=now_iso,
    )
    operating_rhythm = _operating_rhythm_status(now_iso=now_iso)
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
        autopilot_supervisor.get("status"),
        execution_loop.get("status"),
        automation_queue.get("status"),
        kpi_scorecard.get("status"),
        business_goals.get("status"),
        owner_advisor.get("status"),
        growth_engine.get("status"),
        market_payload.get("status"),
        decision_memory.get("status"),
        operating_rhythm.get("status"),
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
            "note": "Возможности отсортированы по ожидаемому эффекту; estimate=true — оценка, не факт.",
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
            "key": "autopilot_supervisor",
            "title": "Контроль исполнения",
            "status": autopilot_supervisor.get("status"),
            "summary": autopilot_supervisor.get("summary") or {},
            "items": autopilot_supervisor.get("items") or [],
            "note": autopilot_supervisor.get("next_step"),
        },
        {
            "key": "execution_loop",
            "title": "Замкнутый цикл",
            "status": execution_loop.get("status"),
            "summary": execution_loop.get("summary") or {},
            "items": execution_loop.get("items") or [],
            "note": execution_loop.get("next_step"),
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
            "key": "business_goals",
            "title": "Цели бизнеса",
            "status": business_goals.get("status"),
            "summary": business_goals.get("summary") or {},
            "items": business_goals.get("goals") or [],
            "note": business_goals.get("next_step"),
        },
        {
            "key": "growth_plan",
            "title": "План роста",
            "status": growth_plan_status,
            "summary": {
                "requested_target_rub": (growth_plan.get("goal") or {}).get("requested_target_rub"),
                "committed_target_rub": (growth_plan.get("goal") or {}).get("committed_target_rub"),
                "planning_confidence_pct": (growth_plan.get("goal") or {}).get("planning_confidence_pct"),
                "actual_rub": (growth_plan.get("plan_fact") or {}).get("actual_rub"),
                "projected_rub": (growth_plan.get("plan_fact") or {}).get("projected_rub"),
                "progress_pct": (growth_plan.get("plan_fact") or {}).get("progress_pct"),
                "theoretical_max_gross_rub": (growth_plan.get("capacity") or {}).get("theoretical_max_gross_rub"),
                "realistic_95_ceiling_rub": (growth_plan.get("capacity") or {}).get("realistic_95_ceiling_rub"),
                "realistic_95_contribution_after_master_payroll_rub": (growth_plan.get("capacity") or {}).get("realistic_95_contribution_after_master_payroll_rub"),
                "active_clients": (growth_plan.get("client_segments") or {}).get("active_clients"),
                "recoverable_clients": (growth_plan.get("client_segments") or {}).get("recoverable_clients"),
            },
            "items": growth_plan.get("actions") or [],
            "note": (growth_plan.get("goal") or {}).get("confidence_note"),
        },
        {
            "key": "owner_advisor",
            "title": "Советник владельца",
            "status": owner_advisor.get("status"),
            "summary": owner_advisor.get("summary") or {},
            "items": owner_advisor.get("dimensions") or [],
            "note": owner_advisor.get("note"),
        },
        {
            "key": "reputation",
            "title": "Репутация",
            "status": reputation_payload.get("status"),
            "summary": reputation_payload.get("summary") or {},
            "items": reputation_payload.get("sources") or [],
            "note": reputation_payload.get("headline"),
        },
        {
            "key": "decision_memory",
            "title": "Память решений",
            "status": decision_memory.get("status"),
            "summary": decision_memory.get("summary") or {},
            "items": decision_memory.get("items") or [],
            "note": decision_memory.get("next_step"),
        },
        {
            "key": "operating_rhythm",
            "title": "Операционный ритм",
            "status": operating_rhythm.get("status"),
            "summary": operating_rhythm.get("summary") or {},
            "items": operating_rhythm.get("last_summary") or {},
            "note": operating_rhythm.get("next_step"),
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
                "retention_90d_pct": (retention.get("summary") or {}).get("retention_90d_pct"),
                "repeat_client_share_pct": (retention.get("summary") or {}).get("repeat_client_share_pct"),
                "forward_booking_pct": (retention.get("summary") or {}).get("forward_booking_pct"),
                "churn_candidates": (retention.get("summary") or {}).get("churn_candidates", 0),
                "subscriptions_expiring_7d": _rub(exp.get("subscriptions_expiring_7d")),
                "subscriptions_active": _rub(exp.get("subscriptions_active")),
                "gift_certs_active_count": _rub(exp.get("gift_certs_active_count")),
                "gift_certs_active_value_rub": _rub(exp.get("gift_certs_active_value_rub")),
            },
            "items": [
                {"key": "return_candidates", "data": ret},
                {"key": "client_retention", "data": retention},
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

    return _c8_legacy_projection({
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
            "plan_baseline_rub": _rub(plan.get("baseline_rub")),
            "plan_potential_rub": _rub(plan.get("potential_revenue_rub")),
            "plan_target_source": plan.get("target_source"),
            "salary_total_rub": _rub(masters.get("salary_total_rub")),
            "top_profit_master": masters.get("top_profit_master"),
            "top_gross_master": masters.get("top_gross_master"),
            "top_today_gross_master": snap.get("top_today_master"),
            "today_paid_revenue_rub": _rub(snap.get("today_paid_revenue_rub")),
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
            "autopilot_supervision_count": (autopilot_supervisor.get("summary") or {}).get("items_count", 0),
            "autopilot_safe_actions_count": (autopilot_supervisor.get("summary") or {}).get("safe_actions_count", 0),
            "autopilot_overdue_count": (autopilot_supervisor.get("summary") or {}).get("overdue_count", 0),
            "execution_loop_open_count": (execution_loop.get("summary") or {}).get("open_count", 0),
            "execution_loop_broken_count": (execution_loop.get("summary") or {}).get("broken_count", 0),
            "execution_loop_score": (execution_loop.get("summary") or {}).get("closed_loop_score", 100),
            "execution_loop_safe_actions_count": (execution_loop.get("summary") or {}).get("safe_actions_count", 0),
            "approval_required_count": (autonomous_director.get("summary") or {}).get("approval_required_count", 0),
            "projected_month_gross_rub": (financial_director.get("summary") or {}).get("projected_month_gross_rub", 0),
            "projected_month_contribution_after_salary_rub": (financial_director.get("summary") or {}).get("projected_month_contribution_after_salary_rub", 0),
            "business_goals_off_track_count": (business_goals.get("summary") or {}).get("off_track_count", 0),
            "business_goals_risk_count": (business_goals.get("summary") or {}).get("risk_count", 0),
            "month_goal_progress_pct": (business_goals.get("summary") or {}).get("month_goal_progress_pct"),
            "month_goal_gap_rub": (business_goals.get("summary") or {}).get("month_goal_gap_rub", 0),
            "daily_load_pct": (business_goals.get("summary") or {}).get("daily_load_pct", 0),
            "owner_advisor_score": (owner_advisor.get("summary") or {}).get("score", 0),
            "owner_advisor_attention_count": (owner_advisor.get("summary") or {}).get("attention_count", 0),
            "owner_advisor_top_priority": (owner_advisor.get("summary") or {}).get("top_priority_key"),
            "growth_decisions_count": (growth_engine.get("summary") or {}).get("decisions_count", 0),
            "growth_opportunity_min_rub": (growth_engine.get("summary") or {}).get("money_opportunity_min_rub", 0),
            "growth_opportunity_max_rub": (growth_engine.get("summary") or {}).get("money_opportunity_max_rub", 0),
            "maps_rating": (reputation_payload.get("summary") or {}).get("overall_rating"),
            "maps_sources_connected": (reputation_payload.get("summary") or {}).get("rated_sources_count", 0),
            "external_reviews_analyzed": (reputation_payload.get("summary") or {}).get("text_reviews_count", 0),
            "market_competitors_scanned": (market_payload.get("summary") or {}).get("competitors_scanned", 0),
            "market_median_haircut_price_rub": (market_payload.get("summary") or {}).get("market_median_haircut_price_rub"),
            "market_reviews_analyzed": (market_payload.get("summary") or {}).get("reviews_analyzed", 0),
            "retention_90d_pct": (retention.get("summary") or {}).get("retention_90d_pct"),
            "forward_booking_pct": (retention.get("summary") or {}).get("forward_booking_pct"),
            "decision_memory_count": (decision_memory.get("summary") or {}).get("items_count", 0),
            "open_decisions_count": (decision_memory.get("summary") or {}).get("open_decisions_count", 0),
            "unverified_results_count": (decision_memory.get("summary") or {}).get("unverified_results_count", 0),
            "positive_decision_signals_count": (decision_memory.get("summary") or {}).get("positive_signals_count", 0),
            "operating_rhythm_last_run_at": (operating_rhythm.get("summary") or {}).get("last_run_at", ""),
            "operating_rhythm_last_created_count": (operating_rhythm.get("summary") or {}).get("last_created_count", 0),
            "operating_rhythm_last_updated_count": (operating_rhythm.get("summary") or {}).get("last_updated_count", 0),
            "growth_target_rub": (growth_plan.get("goal") or {}).get("committed_target_rub", 0),
            "growth_plan_progress_pct": (growth_plan.get("plan_fact") or {}).get("progress_pct"),
            "growth_realistic_ceiling_rub": (growth_plan.get("capacity") or {}).get("realistic_95_ceiling_rub", 0),
            "growth_recoverable_clients": (growth_plan.get("client_segments") or {}).get("recoverable_clients", 0),
        },
        "sections": sections,
        "attention_feed": attention,
        "autonomous_director": autonomous_director,
        "autopilot_supervisor": autopilot_supervisor,
        "execution_loop": execution_loop,
        "kpi_scorecard": kpi_scorecard,
        "financial_director": financial_director,
        "business_goals": business_goals,
        "growth_plan": growth_plan,
        "owner_advisor": owner_advisor,
        "growth_engine": growth_engine,
        "briefing": briefing,
        "owner_alert": ret.get("owner_alert") or _cycle_owner_alert({}),
        "reputation": reputation_payload,
        "market_intelligence": market_payload,
        "decision_memory": decision_memory,
        "operating_rhythm": operating_rhythm,
        "approval_matrix": approval,
        "automation_status": automations,
        "automation_queue": automation_queue,
        "opportunities": opps,
        "plan_fact": plan,
        "master_performance": masters,
        "client_retention": retention,
        "risks": risks,
        "next_best_actions": actions,
        "execution_plan": execution_plan,
        "task_center": task_center,
        "owner_review": owner_review,
        "control_focus": control_focus,
        "control_queue": control,
        "journal": journal,
        "errors": errors,
    })


def risk_signals(snap: dict = None, exp: dict = None, ret: dict = None,
                 svc: dict = None) -> dict:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return {"available": False, "risks": [], "top_risk": None, "reason": "qualified_c8_tenant_read_required", "note": "Ожидаемые деньги и приоритеты не оценены. Это не означает отсутствие риска."}


def money_opportunities(snap: dict = None, exp: dict = None, ret: dict = None) -> list[dict]:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return []


def daily_briefing() -> dict:
    """Утренний брифинг директора: что сегодня + приоритеты с оценкой эффекта.
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
        journal = []  # R04: historical journal is not current operational truth
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
    try:
        center = command_center()
        owner_advisor = center.get("owner_advisor") or {}
        reputation_payload = center.get("reputation") or {}
    except Exception as e:
        logger.error("owner_ai daily_briefing advisor: %s", e)
        owner_advisor = {}
        reputation_payload = {}
    return _c8_legacy_projection({
        "date": snap["date"],
        "today": {
            "booked": snap["booked_today"],
            "expected_revenue_rub": snap["expected_revenue_rub"],
            "avg_check_rub": snap["avg_check_rub"],
            "working_masters": snap["working_masters"],
            "confirmed_working_masters": snap["confirmed_working_masters"],
            "staff_schedule": snap["staff_schedule"],
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
        "owner_advisor": owner_advisor,
        "reputation": reputation_payload,
        "grounding_contract": {
            "working_staff_path": "today.staff_schedule.working",
            "confirmed_working_staff_path": "today.staff_schedule.confirmed_working",
            "off_staff_path": "today.staff_schedule.off",
            "unknown_staff_path": "today.staff_schedule.unknown",
            "conflicts_path": "today.staff_schedule.conflicts",
            "infer_staff_names": False,
            "conflicts_require_explicit_caveat": True,
        },
        "note": snap["note"],
    })


def format_daily_briefing(brief: dict) -> str:
    """Формирует проверенную owner-сводку без участия языковой модели."""
    brief = brief if isinstance(brief, dict) else {}
    today = brief.get("today") if isinstance(brief.get("today"), dict) else {}
    schedule = (
        today.get("staff_schedule")
        if isinstance(today.get("staff_schedule"), dict)
        else {}
    )

    def person(row: dict) -> str:
        name = row.get("name") or "Мастер"
        start = row.get("work_start") or ""
        end = row.get("work_end") or ""
        return f"{name} ({start}–{end})" if start and end else name

    def date_label(value) -> str:
        weekdays = [
            "понедельник", "вторник", "среда", "четверг",
            "пятница", "суббота", "воскресенье",
        ]
        months = [
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря",
        ]
        try:
            parsed = date.fromisoformat(str(value or "")[:10])
            return f"{weekdays[parsed.weekday()]}, {parsed.day} {months[parsed.month - 1]}"
        except Exception:
            return str(value or "сегодня")

    lines = [
        f"Вот проверенная сводка на сегодня — {date_label(brief.get('date'))}.",
        "",
        (
            f"Загрузка: {_ru_count(today.get('booked'), 'запись', 'записи', 'записей')}. "
            "Прогноз выручки недоступен — нет квалифицированной модели C8."
        ),
    ]

    confirmed_working = [
        row for row in (schedule.get("confirmed_working") or [])
        if isinstance(row, dict)
    ]
    confirmed_off = [
        row for row in (schedule.get("confirmed_off") or [])
        if isinstance(row, dict)
    ]
    unknown = [
        row for row in (schedule.get("unknown") or [])
        if isinstance(row, dict)
    ]
    conflicts = [
        row for row in (schedule.get("conflicts") or [])
        if isinstance(row, dict)
    ]

    lines.extend(["", "График:"])
    if confirmed_working:
        lines.append("Работают подтверждённо: " + ", ".join(person(row) for row in confirmed_working) + ".")
    else:
        lines.append("Подтверждённых рабочих смен сейчас нет.")
    if confirmed_off:
        lines.append("Выходные подтверждены: " + ", ".join(row.get("name") or "Мастер" for row in confirmed_off) + ".")

    if conflicts:
        lines.append("Нужна сверка графика — источники расходятся:")
        for row in conflicts:
            live_status = row.get("yclients_status")
            live_hours = row.get("yclients_hours")
            if live_status == "working":
                live = "YClients показывает смену" + (f" {live_hours.replace('-', '–')}" if live_hours else "")
            else:
                live = "YClients показывает выходной"
            baseline = (
                "базовый график показывает смену"
                if row.get("baseline_status") == "working"
                else "базовый график показывает выходной"
            )
            records = _rub(row.get("records_today"))
            records_text = f", записей на день: {records}" if records else ""
            lines.append(f"• {row.get('name') or 'Мастер'}: {live}; {baseline}{records_text}.")
    if unknown:
        lines.append(
            "Не удалось проверить график: "
            + ", ".join(row.get("name") or "Мастер" for row in unknown)
            + "."
        )

    lines.extend(["", "Свободная ёмкость не измерена; числовой прогноз загрузки недоступен."])

    trend = brief.get("week_trend") if isinstance(brief.get("week_trend"), dict) else {}
    gross = trend.get("gross") if isinstance(trend.get("gross"), dict) else {}
    visits = trend.get("visits") if isinstance(trend.get("visits"), dict) else {}
    trend_parts = []
    if gross.get("delta_pct") is not None:
        trend_parts.append(f"выручка {float(gross['delta_pct']):+g}%")
    if visits.get("delta_pct") is not None:
        trend_parts.append(f"визиты {float(visits['delta_pct']):+g}%")
    if trend_parts:
        lines.append("Неделя к прошлой: " + ", ".join(trend_parts) + ".")

    top_risk = brief.get("top_risk") if isinstance(brief.get("top_risk"), dict) else {}
    if top_risk:
        risk_text = top_risk.get("detail") or top_risk.get("title")
        if risk_text:
            lines.append(f"Главный риск: {risk_text}")
    top_priority = (
        brief.get("top_priority")
        if isinstance(brief.get("top_priority"), dict)
        else {}
    )
    if top_priority:
        priority_text = top_priority.get("detail") or top_priority.get("title")
        if priority_text:
            lines.append(f"Приоритет дня: {priority_text}")

    return "\n".join(lines).strip()
