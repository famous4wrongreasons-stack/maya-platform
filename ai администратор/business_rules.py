"""
business_rules.py — единый каталог бизнес-правил салона (зарплаты, проценты).

Единый источник правды для расчётов ЗП мастеров. До этого модуля проценты были
зашиты внутри webhook_server.py (строки ~3211–3213) — теперь канонично здесь.
Это первый кирпич «единого каталога продуктов/цен/правил»
(см. Документация/VISION_AI_NATIVE.md и ROADMAP P2).

ВАЖНО: здесь нет ПД и нет секретов — только бизнес-константы. Безопасно
импортировать из любого модуля (бот, webhook, analytics).
"""

from datetime import date, timedelta

# Доля мастера от его валовой выручки ПО УСЛУГАМ (после скидок).
# Стас (владелец) — показываем 100% (оставляет себе, не выплачивается).
MASTER_SALARY_PCT = {1460233: 0.60}    # Илья Третьяков — 60%
MASTER_SALARY_DEFAULT = 0.50           # остальные мастера — 50%
OWNER_STAFF_ID = 1461615               # Стас — владелец (staff_id в YClients)

# Антон — администратор салона. Зарплата считается детерминированно по каждому
# календарному дню, чтобы отчёт и ответы MAYA всегда показывали одну сумму.
ANTON_WEEKEND_PAY = 2000
ANTON_WORKDAY_BASE = 1500
ANTON_GROSS_PCT = 0.05
ANTON_DAYS_OFF = (6, 0)                 # воскресенье, понедельник


def salary_percent(staff_id: int) -> float:
    """Доля мастера от его валовой выручки по услугам, 0..1.
    Владелец — 1.0; Илья — 0.60; остальные — 0.50."""
    if staff_id == OWNER_STAFF_ID:
        return 1.0
    return MASTER_SALARY_PCT.get(staff_id, MASTER_SALARY_DEFAULT)


def anton_salary_for_period(
    from_iso: str,
    to_iso: str,
    gross_by_day: dict[str, float] | None = None,
) -> dict:
    """Возвращает фактическую зарплату Антона за включительный диапазон дат."""
    start = date.fromisoformat(str(from_iso)[:10])
    end = date.fromisoformat(str(to_iso)[:10])
    if end < start:
        raise ValueError("to_iso must not be earlier than from_iso")

    gross_by_day = gross_by_day or {}
    fixed_total = 0
    percent_total = 0
    workdays = 0
    days_off = 0
    cursor = start
    while cursor <= end:
        if cursor.weekday() in ANTON_DAYS_OFF:
            days_off += 1
            fixed_total += ANTON_WEEKEND_PAY
        else:
            workdays += 1
            fixed_total += ANTON_WORKDAY_BASE
            percent_total += round(
                ANTON_GROSS_PCT * float(gross_by_day.get(cursor.isoformat(), 0) or 0)
            )
        cursor += timedelta(days=1)

    return {
        "name": "Антон",
        "days": workdays + days_off,
        "workdays": workdays,
        "days_off": days_off,
        "base": round(fixed_total),
        "pct": int(round(ANTON_GROSS_PCT * 100)),
        "pct_amount": round(percent_total),
        "total": round(fixed_total + percent_total),
    }
