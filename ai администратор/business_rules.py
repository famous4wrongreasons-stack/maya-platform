"""
business_rules.py — единый каталог бизнес-правил салона (зарплаты, проценты).

Единый источник правды для расчётов ЗП мастеров. До этого модуля проценты были
зашиты внутри webhook_server.py (строки ~3211–3213) — теперь канонично здесь.
Это первый кирпич «единого каталога продуктов/цен/правил»
(см. Документация/VISION_AI_NATIVE.md и ROADMAP P2).

ВАЖНО: здесь нет ПД и нет секретов — только бизнес-константы. Безопасно
импортировать из любого модуля (бот, webhook, analytics).
"""

from datetime import date

# Доля мастера от его валовой выручки ПО УСЛУГАМ (после скидок).
# Стас (владелец) — показываем 100% (оставляет себе, не выплачивается).
MASTER_SALARY_PCT = {1460233: 0.60}    # Илья Третьяков — 60%
MASTER_SALARY_DEFAULT = 0.50           # остальные мастера — 50%
OWNER_STAFF_ID = 1461615               # Стас — владелец (staff_id в YClients)
ANTON_STAFF_ID = 1461625                # Антон — администратор (staff_id в YClients)

# Условия Антона остаются в каталоге как договорные настройки. Финансовые
# отчёты не пересчитывают их сами: фактом считаются только начисления YClients.
ANTON_WEEKEND_PAY = 1000
ANTON_WORKDAY_BASE = 1500
ANTON_GROSS_PCT = 0.05
ANTON_DAYS_OFF = (6, 0)                 # два выходных: воскресенье, понедельник


def salary_percent(staff_id: int) -> float:
    """Доля мастера от его валовой выручки по услугам, 0..1.
    Владелец — 1.0; Илья — 0.60; остальные — 0.50."""
    if staff_id == OWNER_STAFF_ID:
        return 1.0
    return MASTER_SALARY_PCT.get(staff_id, MASTER_SALARY_DEFAULT)


def anton_salary_for_period(
    from_iso: str,
    to_iso: str,
    payroll: dict | None = None,
) -> dict:
    """Нормализует подтверждённые начисления Антона из YClients.

    Зарплату нельзя восстанавливать по календарю или выручке: начисление в
    YClients может быть создано не за каждую запланированную смену. Поэтому при
    недоступном payroll возвращаем ``total=None`` и не подменяем факт прогнозом.
    """
    start = date.fromisoformat(str(from_iso)[:10])
    end = date.fromisoformat(str(to_iso)[:10])
    if end < start:
        raise ValueError("to_iso must not be earlier than from_iso")

    payroll = payroll if isinstance(payroll, dict) else {}
    verified = bool(payroll.get("verified")) and payroll.get("accrued") is not None
    total = payroll.get("accrued") if verified else None
    paid = payroll.get("paid") if verified else None

    return {
        "name": "Антон",
        "staff_id": ANTON_STAFF_ID,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "source": "yclients_payroll",
        "verified": verified,
        "available": verified,
        "accrued": total,
        "paid": paid,
        "total": total,
        "salary": total,
        "note": "" if verified else "YClients не отдал подтверждённые начисления зарплаты.",
    }
