"""Ownership-safe client cancellation and rescheduling for legacy YClients."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from typing import Any, Callable
from zoneinfo import ZoneInfo


MOSCOW_TZ = ZoneInfo("Europe/Moscow")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


@dataclass(frozen=True)
class ClientRecordError(Exception):
    code: str
    message: str
    status: int = 400

    def __str__(self) -> str:
        return self.message


def _phone_key(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else ""


def _record_datetime(record: dict) -> datetime | None:
    raw = str(record.get("datetime") or record.get("date") or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=MOSCOW_TZ)
    return parsed.astimezone(MOSCOW_TZ)


def parse_new_datetime(payload: dict, now: datetime | None = None) -> str:
    """Validate client date/time input and return the YClients local format."""
    raw_datetime = str(payload.get("datetime") or "").strip()
    if raw_datetime:
        try:
            parsed = datetime.fromisoformat(raw_datetime.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ClientRecordError(
                "invalid_datetime", "Укажите корректные дату и время.", 400,
            ) from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=MOSCOW_TZ)
        else:
            parsed = parsed.astimezone(MOSCOW_TZ)
    else:
        date_part = str(payload.get("date") or "").strip()
        time_part = str(payload.get("time") or "").strip()
        if not (_DATE_RE.fullmatch(date_part) and _TIME_RE.fullmatch(time_part)):
            raise ClientRecordError(
                "invalid_datetime", "Укажите дату YYYY-MM-DD и время HH:MM.", 400,
            )
        try:
            parsed = datetime.fromisoformat(f"{date_part}T{time_part}:00").replace(
                tzinfo=MOSCOW_TZ,
            )
        except ValueError as exc:
            raise ClientRecordError(
                "invalid_datetime", "Укажите корректные дату и время.", 400,
            ) from exc

    current = now or datetime.now(MOSCOW_TZ)
    if current.tzinfo is None:
        current = current.replace(tzinfo=MOSCOW_TZ)
    else:
        current = current.astimezone(MOSCOW_TZ)
    if parsed <= current:
        raise ClientRecordError(
            "invalid_datetime", "Новое время записи уже прошло.", 400,
        )
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def _owned_upcoming_record(
    yclients,
    record_id: int,
    client_phone: str,
    *,
    action: str,
    now: datetime | None = None,
) -> dict:
    record = yclients.get_record(int(record_id))
    if not isinstance(record, dict) or not record:
        raise ClientRecordError("not_found", "Запись не найдена.", 404)

    authenticated_phone = _phone_key(client_phone)
    record_phone = _phone_key((record.get("client") or {}).get("phone"))
    if not authenticated_phone or not record_phone or authenticated_phone != record_phone:
        raise ClientRecordError("not_yours", "Эта запись принадлежит другому клиенту.", 403)

    starts_at = _record_datetime(record)
    current = now or datetime.now(MOSCOW_TZ)
    if current.tzinfo is None:
        current = current.replace(tzinfo=MOSCOW_TZ)
    else:
        current = current.astimezone(MOSCOW_TZ)
    if not starts_at:
        raise ClientRecordError("not_found", "У записи не найдено время.", 404)
    if starts_at <= current:
        code = "too_late_to_cancel" if action == "cancel" else "too_late_to_reschedule"
        message = (
            "Запись уже началась, отменить её через приложение нельзя."
            if action == "cancel"
            else "Запись уже началась, перенести её через приложение нельзя."
        )
        raise ClientRecordError(code, message, 400)
    return record


def cancel_for_client(
    yclients,
    record_id: int,
    client_phone: str,
    *,
    now: datetime | None = None,
    before_write: Callable[[int], None] | None = None,
) -> dict:
    _owned_upcoming_record(
        yclients, record_id, client_phone, action="cancel", now=now,
    )
    if before_write:
        before_write(int(record_id))
    result = yclients.cancel_booking(int(record_id)) or {}
    if result.get("success"):
        return {"success": True, "record_id": int(record_id)}
    detail = str(result.get("error") or "")
    if "не найд" in detail.lower() or "not found" in detail.lower():
        raise ClientRecordError("not_found", "Запись не найдена.", 404)
    raise ClientRecordError(
        "cancel_failed", detail or "YClients отклонил отмену.", 409,
    )


def reschedule_for_client(
    yclients,
    record_id: int,
    client_phone: str,
    payload: dict,
    *,
    now: datetime | None = None,
    before_write: Callable[[int], None] | None = None,
) -> dict:
    _owned_upcoming_record(
        yclients, record_id, client_phone, action="reschedule", now=now,
    )
    new_datetime = parse_new_datetime(payload, now=now)
    if before_write:
        before_write(int(record_id))
    result = yclients.reschedule_booking(
        int(record_id), new_datetime, None, None,
    ) or {}
    if result.get("success"):
        return {
            "success": True,
            "record_id": int(result.get("record_id") or record_id),
            "datetime": new_datetime,
        }
    detail = str(result.get("error") or "")
    if "не найд" in detail.lower() or "not found" in detail.lower():
        raise ClientRecordError("not_found", "Запись не найдена.", 404)
    raise ClientRecordError(
        "reschedule_failed", detail or "Новое время недоступно.", 409,
    )
