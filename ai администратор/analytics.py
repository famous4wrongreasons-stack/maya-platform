"""
analytics.py — read-only бизнес-аналитика для роли MAYA-«замдиректор».

Считает за произвольный период: выручку (наличные/карта/итого), число визитов,
средний чек и зарплаты мастеров (валовая × процент). Источник денег —
финоперации YClients (sold_item_type='service'); нал/карта — по account.is_cash;
правила ЗП — из business_rules (единый источник правды).

Логика 1:1 с webhook_server._period_report — при следующей итерации тот метод
стоит свести к вызову analytics.business_summary, чтобы убрать дублирование
(см. Документация/VISION_AI_NATIVE.md, Фаза 1, шаг 2).

ВАЖНО: модуль ТОЛЬКО ЧИТАЕТ. Никаких записей/оплат/изменений. ПД не используются
(имена мастеров — не клиентские ПД; имена/телефоны клиентов сюда не попадают).
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from yclients import YClientsAPI
from business_rules import OWNER_STAFF_ID, anton_salary_for_period, salary_percent

logger = logging.getLogger(__name__)

_yc = YClientsAPI()


def _date_key(value) -> str:
    """Returns a safe YYYY-MM-DD prefix from YClients date fields."""
    raw = str(value or "")[:10]
    try:
        return date.fromisoformat(raw).isoformat()
    except (TypeError, ValueError):
        return ""


def resolve_period(period: str | None,
                   date_from: str | None = None,
                   date_to: str | None = None) -> tuple[str, str, str]:
    """Превращает запрошенный период в (from_iso, to_iso, человекочитаемая_метка).
    Приоритет у явных date_from/date_to; иначе — пресет period; дефолт — сегодня."""
    today = date.today()
    if date_from and date_to:
        return date_from.strip(), date_to.strip(), f"{date_from.strip()} — {date_to.strip()}"

    p = (period or "").strip().lower()
    if p in ("yesterday", "вчера"):
        d = (today - timedelta(days=1)).isoformat()
        return d, d, "вчера"
    if p in ("week", "this_week", "неделя", "эта неделя"):
        start = today - timedelta(days=today.weekday())          # понедельник
        return start.isoformat(), today.isoformat(), "эта неделя"
    if p in ("last_week", "прошлая неделя"):
        end = today - timedelta(days=today.weekday() + 1)        # воскресенье прошлой
        start = end - timedelta(days=6)
        return start.isoformat(), end.isoformat(), "прошлая неделя"
    if p in ("month", "this_month", "месяц", "этот месяц"):
        start = today.replace(day=1)
        return start.isoformat(), today.isoformat(), "этот месяц"
    if p in ("last_30", "30", "30d", "30 дней"):
        start = today - timedelta(days=29)
        return start.isoformat(), today.isoformat(), "последние 30 дней"
    # today / сегодня / пусто / неизвестное — дефолт
    d = today.isoformat()
    return d, d, "сегодня"


def business_summary(from_iso: str, to_iso: str, include_top: bool = False) -> dict:
    """Сводка по выручке и зарплатам за период [from_iso, to_iso] включительно.
    Только чтение. Логика совпадает с webhook_server._period_report.
    include_top=True добавляет топ услуг (из уже загруженных записей, бесплатно)."""
    transactions_available = True
    records_available = True
    try:
        txs = _yc.get_company_transactions(from_iso, to_iso)
    except Exception as e:
        logger.error(f"business_summary tx: {e}")
        transactions_available = False
        txs = []
    try:
        recs = _yc.get_company_records(from_iso, to_iso)
    except Exception as e:
        logger.error(f"business_summary records: {e}")
        records_available = False
        recs = []

    # record_id -> staff_id (если в транзакции мастер не указан)
    rec_staff = {}
    for r in recs:
        if isinstance(r, dict) and r.get("id") is not None and r.get("staff_id") is not None:
            rec_staff[r["id"]] = r["staff_id"]

    rev = {}                                  # staff_id -> валовая по услугам
    staff_recs = {}                           # staff_id -> set(record_id) для числа визитов
    cash_sum = card_sum = 0.0
    cash_recs, card_recs = set(), set()
    daily_gross: dict[str, float] = {}
    daily_recs: dict[str, set] = {}
    for t in txs:
        if not isinstance(t, dict) or t.get("sold_item_type") != "service":
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:
            continue
        day_key = _date_key(t.get("date") or t.get("last_change_date"))
        if day_key:
            daily_gross[day_key] = daily_gross.get(day_key, 0.0) + a
            if t.get("record_id") is not None:
                daily_recs.setdefault(day_key, set()).add(t.get("record_id"))
        # мастер для зарплаты
        sid = None
        m = t.get("master")
        if isinstance(m, dict) and m.get("id"):
            sid = m["id"]
        if sid is None:
            sid = rec_staff.get(t.get("record_id"))
        if sid is not None:
            rev[sid] = rev.get(sid, 0.0) + a
            _rid = t.get("record_id")
            if _rid is not None:
                staff_recs.setdefault(sid, set()).add(_rid)
        # нал/карта — по счёту операции
        acc = t.get("account")
        is_cash = bool(acc.get("is_cash")) if isinstance(acc, dict) else False
        rid = t.get("record_id")
        if is_cash:
            cash_sum += a
            if rid is not None:
                cash_recs.add(rid)
        else:
            card_sum += a
            if rid is not None:
                card_recs.add(rid)

    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {m.get("id"): m.get("name", "") for m in roster
             if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}

    masters = []
    for sid, g in rev.items():
        if round(g) <= 0:
            continue
        pct = salary_percent(sid)
        _v = len(staff_recs.get(sid, ()))
        masters.append({
            "staff_id": sid,
            "name": names.get(sid) or f"Мастер #{sid}",
            "gross": round(g),
            "percent": int(round(pct * 100)),
            "salary": round(g * pct),
            "visits": _v,                          # число оплаченных визитов у мастера
            "avg_check": round(g / _v) if _v else 0,
            "is_owner": sid == OWNER_STAFF_ID,
        })
    masters.sort(key=lambda x: x["salary"], reverse=True)

    total_gross = round(sum(rev.values()))
    salary_total = round(sum(m["salary"] for m in masters if not m["is_owner"]))
    visits = len(cash_recs | card_recs)       # уникальные оплаченные записи
    avg_check = round(total_gross / visits) if visits else 0

    # The same YClients payload can also provide a seasonality baseline,
    # attendance confidence and historical add-on behaviour without PII.
    daily = []
    try:
        cursor = date.fromisoformat(from_iso[:10])
        end_day = date.fromisoformat(to_iso[:10])
        while cursor <= end_day and len(daily) < 370:
            key = cursor.isoformat()
            daily.append({
                "date": key,
                "weekday": cursor.weekday(),
                "gross_rub": round(daily_gross.get(key, 0.0)),
                "paid_visits": len(daily_recs.get(key, ())),
            })
            cursor += timedelta(days=1)
    except (TypeError, ValueError):
        daily = []

    attended = missed = service_visits = multi_service_visits = 0
    addon_total = 0.0
    today = date.today()
    for record in recs:
        if not isinstance(record, dict) or record.get("deleted") or record.get("is_deleted"):
            continue
        services = [row for row in (record.get("services") or []) if isinstance(row, dict)]
        client_id = (record.get("client") or {}).get("id") if isinstance(record.get("client"), dict) else None
        if not client_id and not services:
            continue
        record_day_raw = _date_key(record.get("datetime") or record.get("date"))
        try:
            record_day = date.fromisoformat(record_day_raw) if record_day_raw else None
        except ValueError:
            record_day = None
        attendance = record.get("attendance")
        if attendance == 1:
            attended += 1
        elif attendance == -1 and (record_day is None or record_day <= today):
            missed += 1
        if attendance != 1:
            continue
        costs = []
        for service in services:
            try:
                cost = float(service.get("cost") or 0)
            except (TypeError, ValueError):
                cost = 0.0
            if cost > 0:
                costs.append(cost)
        if not costs:
            continue
        service_visits += 1
        if len(costs) >= 2:
            multi_service_visits += 1
            addon_total += max(0.0, sum(costs) - max(costs))

    attendance_base = attended + missed
    show_rate_pct = round(attended * 100 / attendance_base) if attendance_base else None
    attach_rate_pct = round(multi_service_visits * 100 / service_visits) if service_visits else None
    avg_addon_rub = round(addon_total / multi_service_visits) if multi_service_visits else 0

    result = {
        "from": from_iso,
        "to": to_iso,
        "source_status": {
            "transactions": "ok" if transactions_available else "unavailable",
            "records": "ok" if records_available else "unavailable",
        },
        "total_gross": total_gross,
        "cash": {"count": len(cash_recs), "sum": round(cash_sum)},
        "card": {"count": len(card_recs), "sum": round(card_sum)},
        "visits": visits,
        "avg_check": avg_check,
        "daily": daily,
        "attendance": {
            "attended": attended,
            "missed": missed,
            "show_rate_pct": show_rate_pct,
        },
        "service_mix": {
            "visits_with_priced_services": service_visits,
            "multi_service_visits": multi_service_visits,
            "attach_rate_pct": attach_rate_pct,
            "avg_addon_rub": avg_addon_rub,
        },
        "masters": masters,
        "salary_total": salary_total,         # сумма к выплате мастерам (без владельца)
        "anton": anton_salary_for_period(from_iso, to_iso, daily_gross),
        "note": (
            "Не удалось получить финансовые операции из YClients."
            if not transactions_available
            else ("" if txs else "За период нет проведённых оплат в YClients.")
        ),
    }
    if include_top:
        result["top_services"] = _top_from_records(recs)   # переиспользуем уже загруженные записи
    return result


def _top_from_records(recs: list, limit: int = 8) -> list[dict]:
    """Топ услуг по выручке среди реально пришедших визитов (attendance==1).
    Источник — record.services[].title/cost. Это вспомогательная разбивка
    «что чаще берут и на какую сумму»; каноничная касса — в business_summary
    (по транзакциям). Суммы могут слегка расходиться с кассой из-за скидок."""
    agg: dict[str, dict] = {}
    for r in recs:
        if not isinstance(r, dict) or r.get("attendance") != 1:
            continue
        for s in (r.get("services") or []):
            if not isinstance(s, dict):
                continue
            title = (s.get("title") or "").strip()
            if not title:
                continue
            try:
                cost = float(s.get("cost") or 0)
            except Exception:
                cost = 0.0
            e = agg.setdefault(title, {"title": title, "count": 0, "sum": 0.0})
            e["count"] += 1
            e["sum"] += cost
    items = sorted(agg.values(), key=lambda x: x["sum"], reverse=True)
    for it in items:
        it["sum"] = round(it["sum"])
    return items[:limit]


def top_services(from_iso: str, to_iso: str, limit: int = 8) -> list[dict]:
    """Топ услуг за период как самостоятельный вызов (сам загружает записи)."""
    try:
        recs = _yc.get_company_records(from_iso, to_iso)
    except Exception as e:
        logger.error(f"top_services: {e}")
        recs = []
    return _top_from_records(recs, limit)


def _previous_window(from_iso: str, to_iso: str, period: str | None) -> tuple[str, str]:
    """Предыдущий сопоставимый период для расчёта динамики.
    week → те же дни неделей раньше (выравнивание по дням недели);
    month → предыдущий календарный месяц от 1-го числа, тот же охват дней;
    остальное (today/yesterday/last_30/произвольный диапазон) → непосредственно
    предшествующее окно той же длины."""
    f = date.fromisoformat(from_iso)
    t = date.fromisoformat(to_iso)
    p = (period or "").strip().lower()
    if p in ("week", "this_week", "неделя", "эта неделя"):
        return (f - timedelta(days=7)).isoformat(), (t - timedelta(days=7)).isoformat()
    if p in ("month", "this_month", "месяц", "этот месяц"):
        last_prev = f.replace(day=1) - timedelta(days=1)      # последний день пред. месяца
        first_prev = last_prev.replace(day=1)
        span = (t - f).days
        end_prev = min(first_prev + timedelta(days=span), last_prev)
        return first_prev.isoformat(), end_prev.isoformat()
    length = (t - f).days + 1
    return (f - timedelta(days=length)).isoformat(), (f - timedelta(days=1)).isoformat()


def business_pulse(from_iso: str, to_iso: str, period: str | None,
                   label: str, include_top: bool = False) -> dict:
    """Динамика: текущий период против предыдущего сопоставимого.
    Возвращает обе сводки, дельты по выручке/визитам/среднему чеку и сигнал
    здоровья бизнеса (рост/спад/стабильно + флаг аномалии). Только чтение.
    Отвечает на «как чувствует себя бизнес / динамика / лучше или хуже»."""
    cur = business_summary(from_iso, to_iso, include_top=include_top)
    pf, pt = _previous_window(from_iso, to_iso, period)
    prev = business_summary(pf, pt)

    def _delta(now: float, before: float) -> dict:
        d = now - before
        if before:
            pct = round(d / before * 100)
        else:
            pct = 100 if now else 0          # рост с нуля — условные 100%
        return {"now": round(now), "prev": round(before), "delta": round(d),
                "delta_pct": pct,
                "trend": "up" if d > 0 else ("down" if d < 0 else "flat")}

    metrics = {
        "gross": _delta(cur["total_gross"], prev["total_gross"]),
        "visits": _delta(cur["visits"], prev["visits"]),
        "avg_check": _delta(cur["avg_check"], prev["avg_check"]),
    }
    g = metrics["gross"]["delta_pct"]
    health = "рост" if g >= 10 else ("спад" if g <= -10 else "стабильно")

    return {
        "current": cur,
        "previous": prev,
        "previous_period": {"from": pf, "to": pt},
        "metrics": metrics,
        "health": health,                     # рост / спад / стабильно (по выручке)
        "anomaly": abs(g) >= 25,              # резкое отклонение — обратить внимание
        "no_prev_data": prev["total_gross"] == 0,
        "current_label": label,
    }
