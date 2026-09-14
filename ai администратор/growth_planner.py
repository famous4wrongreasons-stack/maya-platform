"""C8 L08 retirement. No standalone SQLite/provider valuation or C9 strategy owner."""
from __future__ import annotations
from datetime import date

def _unavailable() -> dict:
    return {"available": False, "status": "unavailable", "reason": "qualified_c8_tenant_read_required", "actions": [], "plan_fact": {}, "capacity": {}, "client_segments": {}, "message": "Оценка недоступна. Используйте подтверждённые факты и правила в кабинете Maya."}

def estimate_service_minutes(records: list[dict]) -> int:
    return _unavailable()

def segment_client_base(
    clients: list[dict],
    records: list[dict],
    *,
    as_of: date | str | None = None,
    avg_check_rub: int = 0,
) -> dict:
    return _unavailable()

def calculate_capacity(
    *,
    masters: list[dict],
    schedules: dict[int, list[dict]],
    period_start: date | str,
    period_end: date | str,
    workstations_count: int = 0,
    service_minutes: int | None = None,
    salon_minutes: int | None = None,
) -> dict:
    return _unavailable()

def render_owner_morning_message(snapshot: dict) -> str:
    return "Оценка недоступна: необходимы подтверждённые факты и правила Maya."

def render_manager_morning_message(snapshot: dict) -> str:
    return "Оценка недоступна: необходимы подтверждённые факты и правила Maya."

def build_growth_plan(
    *,
    requested_target_rub: int,
    period_start: date | str,
    period_end: date | str,
    as_of: date | str,
    previous_summary: dict,
    current_summary: dict,
    clients: list[dict],
    records: list[dict],
    masters: list[dict],
    schedules: dict[int, list[dict]],
    workstations_count: int = 0,
    goal: dict | None = None,
) -> dict:
    return _unavailable()

def get_growth_goal() -> dict:
    return _unavailable()

def calculate_growth_plan(*, goal: dict | None = None) -> dict:
    return _unavailable()

def owner_view(snapshot: dict) -> dict:
    return _unavailable()

def manager_view(snapshot: dict) -> dict:
    return _unavailable()

def master_view(snapshot: dict, staff_id: int | None) -> dict:
    return _unavailable()

def get_growth_plan(
    *,
    role: str = "owner",
    staff_id: int | None = None,
    force_refresh: bool = False,
) -> dict:
    return _unavailable()

def set_growth_goal(
    *,
    target_rub: int,
    deadline: str | None = None,
    workstations_count: int | None = None,
    created_by: int | str | None = None,
) -> dict:
    """Daily/growth/capacity goal mutation is retired in Package 5 V1."""
    del target_rub, deadline, workstations_count, created_by
    return {
        "ok": False,
        "error": "legacy_business_goal_mutation_retired",
        "canonical_action": "update_finance_dashboard_preferences",
        "supported_goal": "monthly_financial_target",
        "business_mutations": 0,
    }
