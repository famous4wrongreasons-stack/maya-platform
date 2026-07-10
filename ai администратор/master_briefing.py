"""Персональный прогноз рабочего дня мастера.

Деньги считаются детерминированно. История клиента используется только для
услуг, которые он уже покупал; персональные данные не передаются в LLM.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

import masters_ai


_MONTHS_RU = (
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def _rub(value) -> int:
    try:
        return max(0, round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _record_gross(record: dict) -> int:
    total = 0
    for service in (record.get("services") or []):
        if isinstance(service, dict):
            total += masters_ai._mp_service_price(service)
    return total


def _record_is_active(record: dict) -> bool:
    if not isinstance(record, dict):
        return False
    if record.get("deleted") or record.get("is_deleted"):
        return False
    if record.get("attendance") == -1:
        return False
    return bool(record.get("services"))


def _client_label(record: dict) -> str:
    raw = str((record.get("client") or {}).get("name") or "").strip()
    first = raw.split()[0] if raw else "клиент"
    first = re.sub(r"[^A-Za-zА-Яа-яЁё-]", "", first)[:24]
    return first or "клиент"


def _record_time(record: dict) -> str:
    raw = str(record.get("datetime") or record.get("date") or "")
    if "T" in raw and len(raw) >= 16:
        return raw[11:16]
    if " " in raw and len(raw) >= 16:
        return raw[11:16]
    return ""


def build_day_forecast(
    *,
    staff_id: int,
    master_name: str,
    target_date: str,
    records: list[dict],
    histories_by_client: dict[int, list[dict]],
    salary_percent: float,
    service_catalog: list[dict] | None = None,
) -> dict:
    """Считает записанную и теоретически достижимую выручку мастера."""
    try:
        pct = max(0.0, min(float(salary_percent or 0), 1.0))
    except (TypeError, ValueError):
        pct = 0.0
    active_records = [record for record in (records or []) if _record_is_active(record)]
    active_records.sort(key=lambda record: str(record.get("datetime") or record.get("date") or ""))

    booked_revenue = sum(_record_gross(record) for record in active_records)
    opportunities = []
    for record in active_records:
        client = record.get("client") or {}
        try:
            client_id = int(client.get("id"))
        except (TypeError, ValueError):
            client_id = 0
        if not client_id:
            continue
        opportunity = masters_ai.historical_addon_opportunity(
            histories_by_client.get(client_id) or [],
            record,
            service_catalog=service_catalog,
        )
        if not opportunity:
            continue
        price = _rub(opportunity.get("price_rub"))
        if not price:
            continue
        opportunities.append({
            "record_id": record.get("id") or record.get("record_id"),
            "client_id": client_id,
            "client_label": _client_label(record),
            "time": _record_time(record),
            "service": opportunity.get("title") or "Дополнительная услуга",
            "price_rub": price,
            "master_income_rub": _rub(price * pct),
            "times_bought": int(opportunity.get("times_bought") or 0),
            "last_date": opportunity.get("last_date") or "",
            "historical_only": True,
        })

    opportunities.sort(key=lambda item: (
        -int(item.get("master_income_rub") or 0),
        item.get("time") or "99:99",
        item.get("service") or "",
    ))
    upsell_revenue = sum(item["price_rub"] for item in opportunities)
    booked_income = _rub(booked_revenue * pct)
    upsell_income = _rub(upsell_revenue * pct)
    return {
        "version": "maya_master_day_plan_v1",
        "staff_id": int(staff_id),
        "master_name": str(master_name or "Мастер").strip() or "Мастер",
        "date": target_date,
        "records_count": len(active_records),
        "booked_revenue_rub": booked_revenue,
        "booked_master_income_rub": booked_income,
        "upsell_potential_revenue_rub": upsell_revenue,
        "upsell_potential_master_income_rub": upsell_income,
        "potential_total_revenue_rub": booked_revenue + upsell_revenue,
        "potential_total_master_income_rub": booked_income + upsell_income,
        "salary_percent": round(pct * 100),
        "opportunities_count": len(opportunities),
        "opportunities": opportunities,
        "note": (
            "Потенциал не гарантирован: учитываются только допуслуги из истории "
            "конкретного клиента, которых нет в текущей записи."
        ),
    }


def _money(value) -> str:
    return f"{_rub(value):,}".replace(",", " ")


def _date_label(raw: str) -> str:
    try:
        value = date.fromisoformat(str(raw)[:10])
        return f"{value.day} {_MONTHS_RU[value.month]}"
    except Exception:
        return str(raw or "рабочий день")


def render_master_day_message(forecast: dict, max_opportunities: int = 6) -> str:
    day = _date_label(forecast.get("date") or "")
    lines = [
        f"MAYA · план на {day}",
        "",
        f"Записей: {int(forecast.get('records_count') or 0)}.",
        (
            f"По текущей записи: {_money(forecast.get('booked_revenue_rub'))} ₽ выручки, "
            f"твой расчётный доход — {_money(forecast.get('booked_master_income_rub'))} ₽."
        ),
    ]
    upside = _rub(forecast.get("upsell_potential_revenue_rub"))
    if upside:
        lines.extend([
            (
                f"Теоретический потенциал: до {_money(forecast.get('potential_total_revenue_rub'))} ₽ "
                f"выручки и {_money(forecast.get('potential_total_master_income_rub'))} ₽ тебе."
            ),
            (
                f"Дополнительный потенциал: +{_money(upside)} ₽ салону / "
                f"+{_money(forecast.get('upsell_potential_master_income_rub'))} ₽ тебе."
            ),
            "",
            "Что можно спокойно напомнить:",
        ])
        for item in (forecast.get("opportunities") or [])[:max(1, max_opportunities)]:
            prefix = f"{item.get('time')} · " if item.get("time") else ""
            times = int(item.get("times_bought") or 0)
            history_note = f"брал {times} раз(а)" if times > 1 else "уже брал раньше"
            lines.append(
                f"• {prefix}{item.get('client_label')}: «{item.get('service')}» "
                f"{_money(item.get('price_rub'))} ₽ — {history_note}."
            )
        lines.extend([
            "",
            "Это не навязывание: предложи только как знакомую клиенту опцию и прими его решение.",
        ])
    else:
        lines.extend([
            "История клиентов не даёт честных допродаж на этот день.",
            "Фокус — качество визита и следующая запись клиента.",
        ])
    return "\n".join(lines)


def render_master_day_push(forecast: dict) -> str:
    base = (
        f"{int(forecast.get('records_count') or 0)} записей · "
        f"{_money(forecast.get('booked_revenue_rub'))} ₽ по записи · "
        f"{_money(forecast.get('booked_master_income_rub'))} ₽ тебе"
    )
    upside = _rub(forecast.get("upsell_potential_master_income_rub"))
    if upside:
        return f"{base}. Исторический потенциал: +{_money(upside)} ₽ тебе."
    return f"{base}. Фокус — качество и следующая запись."


def scheduled_brief_date(
    now: datetime,
    *,
    send_hour: int = 19,
    window_hours: int = 3,
) -> str | None:
    """Вечернее окно отправки плана на следующий рабочий день."""
    start = max(0, min(int(send_hour), 23))
    width = max(1, min(int(window_hours), 6))
    if start <= now.hour < min(24, start + width):
        return (now.date() + timedelta(days=1)).isoformat()
    return None


def delivery_is_complete(
    state: dict | None,
    *,
    has_telegram: bool,
    has_push: bool,
) -> bool:
    """Готовность доставки с учётом реально доступных каналов мастера."""
    state = state if isinstance(state, dict) else {}
    telegram_done = bool(state.get("telegram"))
    push_done = bool(state.get("push"))
    return bool(
        (telegram_done or not has_telegram)
        and (push_done or not has_push)
        and (telegram_done or push_done)
    )
