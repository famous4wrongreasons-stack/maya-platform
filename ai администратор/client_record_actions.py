"""Input validation for canonical Client appointment commands."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from zoneinfo import ZoneInfo


MOSCOW_TZ = ZoneInfo("Europe/Moscow")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


@dataclass(frozen=True)
class ClientRecordError(Exception):
    code: str
    message: str
    status: int = 400
    reference: str | None = None

    def __str__(self) -> str:
        return self.message


def parse_new_datetime(payload: dict, now: datetime | None = None) -> str:
    """Validate input and return an explicit salon-timezone instant."""
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
    return parsed.isoformat(timespec="seconds")
