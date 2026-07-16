"""Deterministic growth planning for MAYA OS.

The module turns YClients aggregates into one monthly operating plan. Raw
client names and contacts are never stored in the plan snapshot or sent to an
LLM; the client base is represented only by aggregate lifecycle segments.
"""
from __future__ import annotations

import calendar
import hashlib
import json
import logging
import math
import re
import time
from datetime import date, datetime, timedelta
from statistics import median

logger = logging.getLogger(__name__)

GOAL_SETTING = "maya_growth_goal_v1"
SNAPSHOT_SETTING = "maya_growth_snapshot_v1"
WORKSTATIONS_SETTING = "business_workstations_count"
SNAPSHOT_TTL_SECONDS = 6 * 60 * 60

_DEFAULT_VISITS_PER_SHIFT = 8
_DEFAULT_SERVICE_MINUTES = 60
_DEFAULT_SALON_MINUTES = 11 * 60
_RECOVERABLE_RETURN_RATE = 0.20


def _rub(value) -> int:
    try:
        return max(0, int(round(float(value or 0))))
    except (TypeError, ValueError):
        return 0


def _ratio(value, total) -> float:
    return float(value or 0) / float(total or 1) if total else 0.0


def _as_date(value, fallback: date | None = None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value or "").strip()[:10]
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError):
        return fallback


def _month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def _previous_month(day: date) -> tuple[date, date]:
    end = day.replace(day=1) - timedelta(days=1)
    return end.replace(day=1), end


def _record_date(record: dict) -> date | None:
    return _as_date(record.get("datetime") or record.get("date")) if isinstance(record, dict) else None


def _record_client_id(record: dict) -> int:
    if not isinstance(record, dict):
        return 0
    client = record.get("client") or {}
    try:
        return int(client.get("id") or record.get("client_id") or 0)
    except (TypeError, ValueError):
        return 0


def _record_staff_id(record: dict) -> int:
    if not isinstance(record, dict):
        return 0
    staff = record.get("staff") or {}
    try:
        return int(record.get("staff_id") or staff.get("id") or 0)
    except (TypeError, ValueError):
        return 0


def _record_is_active(record: dict) -> bool:
    return bool(
        isinstance(record, dict)
        and not record.get("deleted")
        and not record.get("is_deleted")
        and record.get("attendance") != -1
    )


def _service_price(service: dict) -> int:
    if not isinstance(service, dict):
        return 0
    for key in ("cost", "price", "price_min", "amount"):
        value = _rub(service.get(key))
        if value:
            return value
    return 0


def _record_gross(record: dict) -> int:
    if not _record_is_active(record):
        return 0
    return sum(_service_price(service) for service in (record.get("services") or []))


def estimate_service_minutes(records: list[dict]) -> int:
    """Estimate a robust service duration from YClients record payloads."""
    values = []
    for record in records or []:
        if not _record_is_active(record):
            continue
        raw_values = [record.get("seance_length"), record.get("length")]
        raw_values.extend(
            service.get("seance_length") or service.get("duration")
            for service in (record.get("services") or [])
            if isinstance(service, dict)
        )
        for raw in raw_values:
            try:
                amount = float(raw or 0)
            except (TypeError, ValueError):
                continue
            if amount > 600:
                amount /= 60
            if 20 <= amount <= 240:
                values.append(amount)
                break
    if not values:
        return _DEFAULT_SERVICE_MINUTES
    return max(35, min(120, int(round(median(values)))))


def segment_client_base(
    clients: list[dict],
    records: list[dict],
    *,
    as_of: date | str | None = None,
    avg_check_rub: int = 0,
) -> dict:
    """Split the complete client registry into active/recoverable/lost cohorts.

    For clients with enough visits MAYA uses their personal median interval.
    Sparse histories fall back to conservative salon-wide time windows.
    """
    today = _as_date(as_of, date.today()) or date.today()
    past_visits: dict[int, set[date]] = {}
    future_bookings: set[int] = set()
    for record in records or []:
        if not _record_is_active(record):
            continue
        client_id = _record_client_id(record)
        visit_day = _record_date(record)
        if not client_id or not visit_day:
            continue
        if visit_day > today:
            future_bookings.add(client_id)
        elif record.get("attendance") == 1 or record.get("paid_full"):
            past_visits.setdefault(client_id, set()).add(visit_day)

    counts = {"active": 0, "recoverable": 0, "lost": 0, "no_history": 0}
    personal_cycle_clients = 0
    recoverable_due_now = 0
    cycle_samples = []
    seen_ids = set()
    for client in clients or []:
        if not isinstance(client, dict):
            continue
        try:
            client_id = int(client.get("id") or 0)
        except (TypeError, ValueError):
            client_id = 0
        if client_id:
            seen_ids.add(client_id)
        dates = sorted(past_visits.get(client_id) or [])
        listed_last = _as_date(client.get("last_visit_date"))
        last_visit = max([d for d in (listed_last, dates[-1] if dates else None) if d], default=None)
        if client_id in future_bookings:
            counts["active"] += 1
            continue
        if not last_visit:
            counts["lost"] += 1
            counts["no_history"] += 1
            continue

        intervals = [
            (right - left).days
            for left, right in zip(dates, dates[1:])
            if 7 <= (right - left).days <= 180
        ]
        days_since = max(0, (today - last_visit).days)
        if len(intervals) >= 2:
            cycle = max(14, min(90, int(round(median(intervals)))))
            personal_cycle_clients += 1
            cycle_samples.append(cycle)
            overdue = days_since - cycle
            if overdue <= 14:
                counts["active"] += 1
            elif overdue <= max(120, cycle * 3) and days_since <= 365:
                counts["recoverable"] += 1
                if overdue <= 60:
                    recoverable_due_now += 1
            else:
                counts["lost"] += 1
        elif days_since <= 60:
            counts["active"] += 1
        elif days_since <= 210:
            counts["recoverable"] += 1
            if days_since <= 120:
                recoverable_due_now += 1
        else:
            counts["lost"] += 1

    # Records can contain recently merged/imported clients absent from search.
    unlisted_active = len((set(past_visits) | future_bookings) - seen_ids)
    counts["active"] += unlisted_active
    total = sum(counts[key] for key in ("active", "recoverable", "lost"))
    avg_check = _rub(avg_check_rub)
    return {
        "version": "maya_client_lifecycle_v1",
        "as_of": today.isoformat(),
        "total_clients": total,
        "active_clients": counts["active"],
        "recoverable_clients": counts["recoverable"],
        "recoverable_due_now": recoverable_due_now,
        "lost_clients": counts["lost"],
        "no_history_clients": counts["no_history"],
        "active_share_pct": round(_ratio(counts["active"], total) * 100),
        "recoverable_share_pct": round(_ratio(counts["recoverable"], total) * 100),
        "lost_share_pct": round(_ratio(counts["lost"], total) * 100),
        "personal_cycle_clients": personal_cycle_clients,
        "median_personal_cycle_days": round(median(cycle_samples)) if cycle_samples else None,
        "recoverable_revenue_potential_rub": _rub(
            counts["recoverable"] * avg_check * _RECOVERABLE_RETURN_RATE
        ),
        "assumed_recovery_rate_pct": round(_RECOVERABLE_RETURN_RATE * 100),
        "contains_personal_data": False,
        "note": (
            "Active includes a future booking or a visit within the personal cycle. "
            "Recoverable is overdue but still inside a conservative return window; "
            "lost is outside that window. Revenue potential is an estimate, not fact."
        ),
    }


def _clock_minutes(value) -> int | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    match = re.search(r"(\d{1,2}):(\d{2})", raw)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    if not (0 <= hour <= 24 and 0 <= minute <= 59):
        return None
    return hour * 60 + minute


def _schedule_minutes(row: dict) -> int:
    total = 0
    for slot in (row.get("slots") or []) if isinstance(row, dict) else []:
        if not isinstance(slot, dict):
            continue
        start = _clock_minutes(slot.get("from") or slot.get("start"))
        end = _clock_minutes(slot.get("to") or slot.get("end"))
        if start is not None and end is not None and end > start:
            total += end - start
    return total


def calculate_capacity(
    *,
    masters: list[dict],
    schedules: dict[int, list[dict]],
    period_start: date | str,
    period_end: date | str,
    workstations_count: int = 0,
    service_minutes: int = _DEFAULT_SERVICE_MINUTES,
    salon_minutes: int = _DEFAULT_SALON_MINUTES,
) -> dict:
    """Calculate physical appointment capacity constrained by staff and chairs."""
    start = _as_date(period_start, date.today()) or date.today()
    end = _as_date(period_end, start) or start
    if end < start:
        start, end = end, start
    valid_masters = [
        master for master in (masters or [])
        if isinstance(master, dict) and master.get("id") and not master.get("error")
    ]
    duration = max(35, min(120, int(service_minutes or _DEFAULT_SERVICE_MINUTES)))
    per_day: dict[str, dict] = {}
    per_master: dict[int, dict] = {}
    usable_rows = 0
    max_working = 0
    for master in valid_masters:
        staff_id = int(master["id"])
        for row in schedules.get(staff_id, []) or []:
            if not isinstance(row, dict) or row.get("error"):
                continue
            row_day = _as_date(row.get("date"))
            if not row_day or row_day < start or row_day > end:
                continue
            minutes = _schedule_minutes(row)
            if not row.get("is_working") or minutes <= 0:
                continue
            usable_rows += 1
            key = row_day.isoformat()
            day_row = per_day.setdefault(key, {"staff_minutes": 0, "working_staff": 0})
            day_row["staff_minutes"] += minutes
            day_row["working_staff"] += 1
            master_row = per_master.setdefault(staff_id, {
                "staff_id": staff_id,
                "name": master.get("name") or f"Мастер #{staff_id}",
                "shift_days": 0,
                "staff_minutes": 0,
                "capacity_visits": 0,
            })
            master_row["shift_days"] += 1
            master_row["staff_minutes"] += minutes
    if per_day:
        max_working = max(row["working_staff"] for row in per_day.values())
    explicit_chairs = _rub(workstations_count)
    inferred_chairs = max_working or min(len(valid_masters), 1) or 1
    chairs = explicit_chairs or inferred_chairs

    days_count = (end - start).days + 1
    source = "yclients_schedule"
    if not usable_rows:
        source = "conservative_fallback"
        concurrent_staff = min(chairs, max(1, math.ceil(len(valid_masters) * 0.5)))
        physical_visits = concurrent_staff * _DEFAULT_VISITS_PER_SHIFT * days_count
        for master in valid_masters:
            staff_id = int(master["id"])
            shifts = max(1, round(days_count * 0.5))
            per_master[staff_id] = {
                "staff_id": staff_id,
                "name": master.get("name") or f"Мастер #{staff_id}",
                "shift_days": shifts,
                "staff_minutes": shifts * salon_minutes,
                "capacity_visits": shifts * _DEFAULT_VISITS_PER_SHIFT,
            }
        per_day_rows = []
    else:
        physical_visits = 0
        per_day_rows = []
        for day_key in sorted(per_day):
            row = per_day[day_key]
            staff_slots = math.floor(row["staff_minutes"] / duration)
            chair_slots = math.floor(chairs * salon_minutes / duration)
            capacity = max(0, min(staff_slots, chair_slots))
            physical_visits += capacity
            per_day_rows.append({
                "date": day_key,
                "working_staff": row["working_staff"],
                "capacity_visits": capacity,
            })
        raw_master_capacity = sum(
            math.floor(row["staff_minutes"] / duration) for row in per_master.values()
        ) or 1
        for row in per_master.values():
            raw = math.floor(row["staff_minutes"] / duration)
            row["capacity_visits"] = round(physical_visits * raw / raw_master_capacity)

    return {
        "period_from": start.isoformat(),
        "period_to": end.isoformat(),
        "active_masters": len(valid_masters),
        "workstations_count": chairs,
        "workstations_source": "owner_setting" if explicit_chairs else "inferred_from_schedule",
        "needs_workstations_confirmation": not bool(explicit_chairs),
        "service_minutes_estimate": duration,
        "physical_capacity_visits": physical_visits,
        "working_days_with_schedule": len(per_day),
        "schedule_rows": usable_rows,
        "source": source,
        "confidence": "high" if usable_rows and explicit_chairs else ("medium" if usable_rows else "low"),
        "per_day": per_day_rows,
        "per_master": sorted(per_master.values(), key=lambda row: row.get("name") or ""),
        "note": (
            "Physical capacity is limited by both scheduled staff minutes and chairs. "
            "Confirm the workplace count when it is inferred."
        ),
    }


def _summary_master_map(summary: dict) -> dict[int, dict]:
    result = {}
    for row in (summary.get("masters") or []) if isinstance(summary, dict) else []:
        try:
            staff_id = int(row.get("staff_id") or 0)
        except (TypeError, ValueError):
            continue
        if staff_id:
            result[staff_id] = row
    return result


def _weekly_milestones(
    *,
    start: date,
    end: date,
    actual_rub: int,
    remaining_target_rub: int,
) -> list[dict]:
    days = max(1, (end - start).days + 1)
    milestones = []
    cursor = start
    elapsed = 0
    while cursor <= end:
        week_end = min(end, cursor + timedelta(days=6))
        elapsed += (week_end - cursor).days + 1
        cumulative = actual_rub + round(remaining_target_rub * elapsed / days)
        milestones.append({
            "from": cursor.isoformat(),
            "to": week_end.isoformat(),
            "cumulative_target_rub": cumulative,
        })
        cursor = week_end + timedelta(days=1)
    return milestones


def _money(value) -> str:
    return f"{_rub(value):,}".replace(",", " ") + " ₽"


def render_owner_morning_message(snapshot: dict) -> str:
    """Full aggregate morning brief for the owner; never includes client PII."""
    goal = snapshot.get("goal") or {}
    fact = snapshot.get("plan_fact") or {}
    capacity = snapshot.get("capacity") or {}
    segments = snapshot.get("client_segments") or {}
    lines = ["MAYA · утренний план владельца", ""]
    if goal.get("committed_target_rub"):
        lines.extend([
            f"Цель: {_money(goal.get('committed_target_rub'))}.",
            (
                f"Факт: {_money(fact.get('actual_rub'))}; с текущей записью — "
                f"{_money(fact.get('projected_rub'))}; выполнено {fact.get('progress_pct') or 0}%."
            ),
            f"До цели осталось: {_money(fact.get('remaining_target_rub'))}.",
        ])
    else:
        lines.extend([
            "Общая цель роста ещё не подтверждена.",
            f"Ориентир MAYA на месяц: {_money(goal.get('suggested_target_rub'))}.",
        ])
    lines.extend([
        (
            f"Реалистичный потолок с резервом: "
            f"{_money(capacity.get('realistic_95_ceiling_rub'))}; физический максимум — "
            f"{_money(capacity.get('theoretical_max_gross_rub'))}."
        ),
        (
            f"База: {segments.get('active_clients') or 0} активных, "
            f"{segments.get('recoverable_clients') or 0} можно вернуть."
        ),
    ])
    if capacity.get("needs_workstations_confirmation"):
        lines.append(
            f"Нужно подтвердить рабочие места: сейчас MAYA предполагает {capacity.get('workstations_count') or 0}."
        )
    actions = snapshot.get("actions") or []
    if actions:
        lines.extend(["", f"Главный шаг: {actions[0].get('title') or 'проверить план роста'}."])
    return "\n".join(lines)


def render_manager_morning_message(snapshot: dict) -> str:
    """Execution-only morning brief for a manager."""
    team = snapshot.get("team_plan") or {}
    masters = snapshot.get("masters") or []
    lines = [
        "MAYA · план команды на сегодня",
        "",
        (
            f"Команда: {_money(team.get('actual_rub'))} факт / "
            f"{_money(team.get('target_rub'))} цель."
        ),
    ]
    if team.get("progress_pct") is not None:
        lines.append(f"Исполнение: {round(float(team.get('progress_pct') or 0))}%.")
    risk_rows = [row for row in masters if row.get("status") == "risk"]
    if risk_rows:
        lines.extend(["", "Кому сегодня нужен контроль:"])
        for row in risk_rows[:5]:
            lines.append(
                f"• {row.get('name') or 'Мастер'}: {row.get('progress_pct') or 0}% плана, "
                f"ориентир на рабочий день {_money(row.get('daily_target_remaining_rub'))}."
            )
    else:
        lines.extend(["", "Критических отставаний по мастерам сейчас нет."])
    return "\n".join(lines)


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
    """Build a complete owner plan from already loaded deterministic inputs."""
    today = _as_date(as_of, date.today()) or date.today()
    start = _as_date(period_start, today.replace(day=1)) or today.replace(day=1)
    end = _as_date(period_end, _month_end(today)) or _month_end(today)
    if end < today:
        end = today
    service_minutes = estimate_service_minutes(records)
    full_capacity = calculate_capacity(
        masters=masters,
        schedules=schedules,
        period_start=start,
        period_end=end,
        workstations_count=workstations_count,
        service_minutes=service_minutes,
    )
    remaining_capacity = calculate_capacity(
        masters=masters,
        schedules=schedules,
        period_start=today,
        period_end=end,
        workstations_count=workstations_count,
        service_minutes=service_minutes,
    )

    previous_gross = _rub(previous_summary.get("total_gross"))
    previous_visits = _rub(previous_summary.get("visits"))
    previous_payroll = _rub(previous_summary.get("salary_total"))
    payroll_rate = max(0.0, min(0.70, _ratio(previous_payroll, previous_gross)))
    current_gross = _rub(current_summary.get("total_gross"))
    current_visits = _rub(current_summary.get("visits"))
    period_days = max(1, (end - start).days + 1)
    previous_month_days = calendar.monthrange(
        (start - timedelta(days=1)).year,
        (start - timedelta(days=1)).month,
    )[1]
    baseline_period = _rub(previous_gross * period_days / previous_month_days)
    avg_check = _rub(
        current_summary.get("avg_check")
        or previous_summary.get("avg_check")
        or _ratio(previous_gross, previous_visits)
    )
    avg_check = avg_check or 1
    service_mix = previous_summary.get("service_mix") or {}
    addon_attach = max(0, min(100, _rub(service_mix.get("attach_rate_pct"))))
    avg_addon = _rub(service_mix.get("avg_addon_rub"))
    achievable_addon = _rub(avg_addon * addon_attach / 100)
    theoretical_avg_check = avg_check + achievable_addon
    attendance = previous_summary.get("attendance") or {}
    show_rate = max(0.80, min(1.0, float(attendance.get("show_rate_pct") or 95) / 100))

    future_records = [
        record for record in (records or [])
        if _record_is_active(record)
        and (_record_date(record) or today) > today
        and (_record_date(record) or end) <= end
    ]
    future_booked_visits = len(future_records)
    future_booked_revenue = sum(_record_gross(record) for record in future_records)
    baseline_capacity = max(1, full_capacity.get("physical_capacity_visits") or previous_visits)
    baseline_fill = max(0.0, min(1.0, _ratio(previous_visits, baseline_capacity)))
    practical_fill = max(0.72, min(0.90, baseline_fill + 0.12))
    remaining_visits = _rub(remaining_capacity.get("physical_capacity_visits"))
    physical_max = current_gross + remaining_visits * theoretical_avg_check
    realistic_ceiling = current_gross + _rub(
        remaining_visits * avg_check * practical_fill * show_rate
        + remaining_visits * achievable_addon * min(practical_fill, 0.80)
    )
    suggested_target = max(baseline_period, current_gross + future_booked_revenue)
    suggested_target = _rub(suggested_target * 1.10) if suggested_target else realistic_ceiling
    owner_target = _rub(requested_target_rub)
    requested = owner_target or min(suggested_target, realistic_ceiling or suggested_target)
    committed_candidate = min(requested, realistic_ceiling) if realistic_ceiling else requested
    committed = committed_candidate if owner_target else 0
    if not owner_target:
        feasibility = "awaiting_goal"
    elif requested <= realistic_ceiling:
        feasibility = "realistic_95"
    elif requested <= physical_max:
        feasibility = "stretch"
    else:
        feasibility = "capacity_blocked"
    data_points_ok = previous_visits >= 20 and len(clients or []) >= 30
    confidence = 95 if feasibility == "realistic_95" and data_points_ok and full_capacity["confidence"] != "low" else (
        85 if feasibility != "capacity_blocked" and data_points_ok else 70
    )
    if not owner_target:
        confidence = 0

    segment = segment_client_base(
        clients,
        records,
        as_of=today,
        avg_check_rub=avg_check,
    )
    remaining_target = max(0, committed - current_gross)
    allocation_remaining_target = remaining_target if committed else max(0, baseline_period - current_gross)
    gap_after_bookings = max(0, remaining_target - future_booked_revenue)
    required_visits = math.ceil(gap_after_bookings / avg_check) if avg_check else 0
    remaining_days = max(1, (end - today).days + 1)
    daily_target = math.ceil(remaining_target / remaining_days)
    required_fill = round(_ratio(required_visits + future_booked_visits, remaining_visits) * 100) if remaining_visits else 0

    previous_masters = _summary_master_map(previous_summary)
    current_masters = _summary_master_map(current_summary)
    remaining_master_capacity = {
        int(row["staff_id"]): row for row in (remaining_capacity.get("per_master") or [])
    }
    future_by_master: dict[int, int] = {}
    for record in future_records:
        staff_id = _record_staff_id(record)
        if staff_id:
            future_by_master[staff_id] = future_by_master.get(staff_id, 0) + _record_gross(record)
    roster = [
        row for row in (masters or [])
        if isinstance(row, dict) and row.get("id") and not row.get("error")
    ]
    total_prev = sum(_rub(previous_masters.get(int(row["id"]), {}).get("gross")) for row in roster)
    total_capacity = sum(
        _rub(remaining_master_capacity.get(int(row["id"]), {}).get("capacity_visits"))
        for row in roster
    )
    raw_weights = {}
    for row in roster:
        staff_id = int(row["id"])
        prev_share = _ratio(_rub(previous_masters.get(staff_id, {}).get("gross")), total_prev)
        cap_share = _ratio(
            _rub(remaining_master_capacity.get(staff_id, {}).get("capacity_visits")),
            total_capacity,
        )
        raw_weights[staff_id] = prev_share * 0.60 + cap_share * 0.40
    weight_sum = sum(raw_weights.values()) or len(roster) or 1
    master_rows = []
    for row in roster:
        staff_id = int(row["id"])
        previous_row = previous_masters.get(staff_id, {})
        current_row = current_masters.get(staff_id, {})
        cap_row = remaining_master_capacity.get(staff_id, {})
        share = raw_weights.get(staff_id, 0) / weight_sum
        allocated_remaining = _rub(allocation_remaining_target * share)
        actual = _rub(current_row.get("gross"))
        personal_target = actual + allocated_remaining
        booked = _rub(future_by_master.get(staff_id))
        projected = actual + booked
        shifts = max(1, _rub(cap_row.get("shift_days")))
        previous_shift_days = max(1, len({
            _record_date(record)
            for record in (records or [])
            if _record_staff_id(record) == staff_id
            and _record_date(record)
            and _record_date(record) < start
            and _record_date(record) >= _previous_month(start)[0]
            and _record_is_active(record)
        }))
        previous_daily = _rub(previous_row.get("gross")) // previous_shift_days
        progress = round(_ratio(projected, personal_target) * 100) if personal_target else 100
        master_rows.append({
            "staff_id": staff_id,
            "name": row.get("name") or previous_row.get("name") or f"Мастер #{staff_id}",
            "previous_month_gross_rub": _rub(previous_row.get("gross")),
            "previous_month_daily_rub": previous_daily,
            "actual_month_gross_rub": actual,
            "future_booked_revenue_rub": booked,
            "projected_month_gross_rub": projected,
            "month_target_rub": personal_target,
            "remaining_target_rub": allocated_remaining,
            "daily_target_remaining_rub": math.ceil(allocated_remaining / shifts),
            "remaining_shift_days": _rub(cap_row.get("shift_days")),
            "remaining_capacity_visits": _rub(cap_row.get("capacity_visits")),
            "progress_pct": progress,
            "status": "ok" if progress >= 95 else ("warn" if progress >= 75 else "risk"),
        })
    master_rows.sort(key=lambda row: (row["status"] != "risk", row["progress_pct"], row["name"]))

    recoverable_potential = _rub(segment.get("recoverable_revenue_potential_rub"))
    upsell_potential = _rub(future_booked_visits * achievable_addon)
    fill_potential = max(0, gap_after_bookings - recoverable_potential - upsell_potential)
    actions = []
    if segment.get("recoverable_due_now"):
        actions.append({
            "key": "return_due_clients",
            "title": "Вернуть клиентов, которым уже пора",
            "count": segment.get("recoverable_due_now"),
            "potential_rub": min(gap_after_bookings, recoverable_potential),
            "owner_approval_required": True,
        })
    if upsell_potential:
        actions.append({
            "key": "historical_upsell",
            "title": "Предлагать знакомые клиентам допуслуги",
            "count": future_booked_visits,
            "potential_rub": upsell_potential,
            "owner_approval_required": False,
        })
    if fill_potential:
        actions.append({
            "key": "fill_capacity",
            "title": "Заполнить свободную мощность",
            "required_visits": required_visits,
            "potential_rub": fill_potential,
            "owner_approval_required": True,
        })

    status = "ok" if feasibility == "realistic_95" else (
        "risk" if feasibility == "capacity_blocked" else "warn"
    )
    return {
        "version": "maya_growth_plan_v1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "as_of": today.isoformat(),
        "status": status,
        "period": {"from": start.isoformat(), "to": end.isoformat(), "type": "monthly_goal"},
        "goal": {
            **(goal or {}),
            "owner_set": bool(owner_target),
            "requested_target_rub": owner_target,
            "suggested_target_rub": min(suggested_target, realistic_ceiling or suggested_target),
            "committed_target_rub": committed,
            "baseline_previous_month_rub": previous_gross,
            "baseline_period_rub": baseline_period,
            "growth_vs_previous_month_pct": (
                round((_ratio(committed, previous_gross) - 1) * 100)
                if committed and previous_gross else None
            ),
            "growth_vs_baseline_period_pct": (
                round((_ratio(committed, baseline_period) - 1) * 100)
                if committed and baseline_period else None
            ),
            "feasibility": feasibility,
            "planning_confidence_pct": confidence,
            "planning_reserve_pct": 5,
            "confidence_note": "95% is an operating plan with a 5% reserve, not a statistical revenue guarantee.",
        },
        "plan_fact": {
            "actual_rub": current_gross,
            "future_booked_revenue_rub": future_booked_revenue,
            "projected_rub": current_gross + future_booked_revenue,
            "remaining_target_rub": remaining_target,
            "gap_after_bookings_rub": gap_after_bookings,
            "daily_target_remaining_rub": daily_target,
            "required_additional_visits": required_visits,
            "required_remaining_capacity_pct": required_fill if committed else None,
            "progress_pct": round(_ratio(current_gross, committed) * 100) if committed else None,
        },
        "capacity": {
            **full_capacity,
            "remaining_physical_capacity_visits": remaining_visits,
            "current_avg_check_rub": avg_check,
            "achievable_addon_per_visit_rub": achievable_addon,
            "theoretical_avg_check_rub": theoretical_avg_check,
            "theoretical_max_gross_rub": physical_max,
            "realistic_95_ceiling_rub": realistic_ceiling,
            "historical_master_payroll_rate_pct": round(payroll_rate * 100),
            "theoretical_contribution_after_master_payroll_rub": _rub(physical_max * (1 - payroll_rate)),
            "realistic_95_contribution_after_master_payroll_rub": _rub(realistic_ceiling * (1 - payroll_rate)),
            "historical_fill_pct": round(baseline_fill * 100),
            "planned_fill_pct": round(practical_fill * 100),
            "historical_show_rate_pct": round(show_rate * 100),
            "note": (
                "Gross means service revenue before salaries, rent, tax and other expenses. "
                "Contribution after master payroll excludes rent, tax, materials and an imputed owner salary, so it is not net profit."
            ),
        },
        "client_segments": segment,
        "levers": {
            "recoverable_clients_rub": recoverable_potential,
            "historical_upsell_rub": upsell_potential,
            "capacity_fill_rub": fill_potential,
        },
        "masters": master_rows,
        "milestones": _weekly_milestones(
            start=today,
            end=end,
            actual_rub=current_gross,
            remaining_target_rub=remaining_target,
        ),
        "actions": actions,
        "methodology": {
            "data_sources": ["YClients clients", "YClients records", "YClients schedule", "YClients transactions"],
            "contains_client_personal_data": False,
            "assumptions_are_estimates": True,
        },
    }


def _load_json_setting(key: str) -> dict:
    try:
        import database

        raw = database.get_setting(key) or "{}"
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def _save_json_setting(key: str, value: dict) -> None:
    import database

    database.set_setting(key, json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def get_growth_goal() -> dict:
    return _load_json_setting(GOAL_SETTING)


def _goal_signature(goal: dict) -> str:
    payload = json.dumps(goal or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _snapshot_is_fresh(snapshot: dict, goal: dict) -> bool:
    if not snapshot or snapshot.get("goal_signature") != _goal_signature(goal):
        return False
    generated = snapshot.get("generated_at")
    try:
        age = time.time() - datetime.fromisoformat(str(generated)).timestamp()
    except (TypeError, ValueError):
        return False
    return snapshot.get("as_of") == date.today().isoformat() and 0 <= age < SNAPSHOT_TTL_SECONDS


def calculate_growth_plan(*, goal: dict | None = None) -> dict:
    """Load YClients data and calculate a fresh aggregate growth snapshot."""
    import analytics
    import database
    from yclients import YClientsAPI

    today = date.today()
    goal = dict(goal or get_growth_goal())
    deadline = _as_date(goal.get("deadline"), _month_end(today)) or _month_end(today)
    if deadline < today:
        deadline = _month_end(today)
    period_start = today.replace(day=1)
    previous_start, previous_end = _previous_month(period_start)
    yc = YClientsAPI()
    previous_summary = analytics.business_summary(previous_start.isoformat(), previous_end.isoformat())
    current_summary = analytics.business_summary(period_start.isoformat(), today.isoformat())
    masters = yc.get_masters() or []
    clients = yc.list_all_clients() or []
    history_start = today - timedelta(days=730)
    history_records = yc.get_company_records(
        history_start.isoformat(),
        today.isoformat(),
        max_pages=25,
    ) or []
    future_records = []
    if deadline > today:
        future_records = yc.get_company_records(
            (today + timedelta(days=1)).isoformat(),
            deadline.isoformat(),
            max_pages=25,
        ) or []
    records = []
    seen_record_ids = set()
    for record in list(history_records) + list(future_records):
        if not isinstance(record, dict):
            continue
        record_id = record.get("id")
        if record_id is not None and record_id in seen_record_ids:
            continue
        if record_id is not None:
            seen_record_ids.add(record_id)
        records.append(record)
    schedules = {}
    for master in masters:
        if not isinstance(master, dict) or not master.get("id") or master.get("error"):
            continue
        staff_id = int(master["id"])
        schedules[staff_id] = yc.get_staff_schedule(
            staff_id,
            period_start.isoformat(),
            deadline.isoformat(),
        ) or []
    workstations = _rub(goal.get("workstations_count")) or _rub(
        database.get_setting(WORKSTATIONS_SETTING) or 0
    )
    result = build_growth_plan(
        requested_target_rub=_rub(goal.get("target_rub")),
        period_start=period_start,
        period_end=deadline,
        as_of=today,
        previous_summary=previous_summary,
        current_summary=current_summary,
        clients=clients,
        records=records,
        masters=masters,
        schedules=schedules,
        workstations_count=workstations,
        goal=goal,
    )
    result["goal_signature"] = _goal_signature(goal)
    _save_json_setting(SNAPSHOT_SETTING, result)
    return result


def _error_snapshot(message: str, cached: dict | None = None) -> dict:
    if cached:
        return {**cached, "stale": True, "refresh_error": message}
    return {
        "version": "maya_growth_plan_v1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "as_of": date.today().isoformat(),
        "status": "warn",
        "error": "growth_plan_unavailable",
        "message": message,
        "masters": [],
    }


def owner_view(snapshot: dict) -> dict:
    return dict(snapshot or {})


def manager_view(snapshot: dict) -> dict:
    """Admin sees execution by masters, not owner economics or client cohorts."""
    plan_fact = snapshot.get("plan_fact") or {}
    goal = snapshot.get("goal") or {}
    return {
        "version": "maya_growth_manager_view_v1",
        "generated_at": snapshot.get("generated_at"),
        "as_of": snapshot.get("as_of"),
        "status": snapshot.get("status"),
        "period": snapshot.get("period") or {},
        "team_plan": {
            "target_rub": (
                goal.get("committed_target_rub")
                or goal.get("baseline_period_rub")
                or goal.get("baseline_previous_month_rub")
            ),
            "actual_rub": plan_fact.get("actual_rub"),
            "projected_rub": plan_fact.get("projected_rub"),
            "progress_pct": plan_fact.get("progress_pct") if goal.get("committed_target_rub") else (
                round(_ratio(
                    plan_fact.get("actual_rub"),
                    goal.get("baseline_period_rub") or goal.get("baseline_previous_month_rub"),
                ) * 100)
                if (goal.get("baseline_period_rub") or goal.get("baseline_previous_month_rub")) else None
            ),
            "mode": "growth_goal" if goal.get("committed_target_rub") else "match_previous_month",
        },
        "masters": snapshot.get("masters") or [],
        "access_note": "Администратор видит исполнение плана мастерами без клиентских сегментов и полной экономики владельца.",
    }


def master_view(snapshot: dict, staff_id: int | None) -> dict:
    try:
        wanted = int(staff_id or 0)
    except (TypeError, ValueError):
        wanted = 0
    row = next(
        (item for item in (snapshot.get("masters") or []) if int(item.get("staff_id") or 0) == wanted),
        None,
    )
    return {
        "version": "maya_growth_master_view_v1",
        "generated_at": snapshot.get("generated_at"),
        "as_of": snapshot.get("as_of"),
        "status": (row or {}).get("status") or "warn",
        "period": snapshot.get("period") or {},
        "master": row,
        "access_note": "Мастер видит только свой план и свои результаты.",
    }


def get_growth_plan(
    *,
    role: str = "owner",
    staff_id: int | None = None,
    force_refresh: bool = False,
) -> dict:
    goal = get_growth_goal()
    cached = _load_json_setting(SNAPSHOT_SETTING)
    if force_refresh or not _snapshot_is_fresh(cached, goal):
        try:
            cached = calculate_growth_plan(goal=goal)
        except Exception as exc:
            logger.exception("growth plan refresh failed")
            cached = _error_snapshot(str(exc), cached)
    normalized = str(role or "").lower()
    if normalized in ("founder", "owner"):
        return owner_view(cached)
    if normalized in ("manager", "admin", "administrator"):
        return manager_view(cached)
    if normalized in ("master", "staff"):
        return master_view(cached, staff_id)
    return {"error": "forbidden", "message": "План роста недоступен в клиентском режиме."}


def set_growth_goal(
    *,
    target_rub: int,
    deadline: str | None = None,
    workstations_count: int | None = None,
    created_by: int | str | None = None,
) -> dict:
    """Persist an owner-approved target and immediately rebuild the plan."""
    import database

    target = _rub(target_rub)
    if target < 10_000 or target > 100_000_000:
        return {"ok": False, "error": "bad_target", "message": "Цель должна быть от 10 000 до 100 000 000 ₽."}
    deadline_day = _as_date(deadline, _month_end(date.today())) or _month_end(date.today())
    if deadline_day < date.today():
        return {"ok": False, "error": "bad_deadline", "message": "Дата цели не может быть в прошлом."}
    if deadline_day > date.today() + timedelta(days=365):
        return {"ok": False, "error": "bad_deadline", "message": "Горизонт плана должен быть не больше 12 месяцев."}
    chairs = _rub(workstations_count)
    if workstations_count is not None and not (1 <= chairs <= 100):
        return {"ok": False, "error": "bad_workstations", "message": "Количество рабочих мест должно быть от 1 до 100."}
    goal = {
        "target_rub": target,
        "deadline": deadline_day.isoformat(),
        "workstations_count": chairs or None,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "created_by": str(created_by or "owner"),
        "status": "active",
    }
    _save_json_setting(GOAL_SETTING, goal)
    database.set_setting("owner_month_gross_target_rub", str(target))
    if chairs:
        database.set_setting(WORKSTATIONS_SETTING, str(chairs))
    snapshot = calculate_growth_plan(goal=goal)
    return {"ok": True, "goal": goal, "growth_plan": owner_view(snapshot)}
