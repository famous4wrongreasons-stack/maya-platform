"""Server-side contract for inline widgets rendered in MAYA chat."""
from __future__ import annotations

from typing import Any


CHAT_WIDGETS = frozenset({
    "book",
    "mybookings",
    "loyalty",
    "shop",
    "profile",
    "history",
    "referral",
    "notify",
    "tips",
})

_ACTION_WIDGETS = {
    "open_booking": "book",
    "open_cabinet": "mybookings",
    "open_bookings": "mybookings",
    "open_loyalty": "loyalty",
    "open_shop": "shop",
    "open_certs": "shop",
    "open_subs": "shop",
    "open_profile": "profile",
    "open_history": "history",
    "open_referral": "referral",
    "open_notify": "notify",
    "open_tips": "tips",
}


def normalize_chat_widget(value: Any) -> str | None:
    """Return a supported widget name or None for untrusted/unknown values."""
    candidate = str(value or "").strip().lower()
    return candidate if candidate in CHAT_WIDGETS else None


def normalize_chat_widget_data(widget: Any, value: Any) -> dict | None:
    """Keep only server-approved payload fields for a supported widget."""
    normalized_widget = normalize_chat_widget(widget)
    if not isinstance(value, dict):
        return None
    if normalized_widget == "book":
        if value.get("repeat_booking") is not True:
            return None

        def _external_id(raw: Any) -> str:
            candidate = str(raw or "").strip()
            if not candidate or len(candidate) > 120:
                return ""
            return candidate if all(ch.isalnum() or ch in "._:-" for ch in candidate) else ""

        result: dict[str, Any] = {"repeat_booking": True}
        master_id = _external_id(value.get("master_id"))
        if master_id:
            result["master_id"] = master_id
        master_name = str(value.get("master_name") or "").strip()[:160]
        if master_name:
            result["master_name"] = master_name
        service_ids = []
        raw_service_ids = value.get("service_ids") or []
        if not isinstance(raw_service_ids, (list, tuple)):
            raw_service_ids = []
        for raw in raw_service_ids:
            service_id = _external_id(raw)
            if service_id and service_id not in service_ids:
                service_ids.append(service_id)
            if len(service_ids) >= 16:
                break
        if service_ids:
            result["service_ids"] = service_ids
        service_names = []
        raw_service_names = value.get("service_names") or []
        if not isinstance(raw_service_names, (list, tuple)):
            raw_service_names = []
        for raw in raw_service_names:
            name = str(raw or "").strip()[:200]
            if name and name not in service_names:
                service_names.append(name)
            if len(service_names) >= 16:
                break
        if service_names:
            result["service_names"] = service_names
        if not (master_id or master_name) or not (service_ids or service_names):
            return None
        return result

    if normalized_widget != "tips":
        return None
    result = {}
    try:
        master_id = int(value.get("master_id"))
    except (TypeError, ValueError, OverflowError):
        master_id = 0
    if master_id > 0:
        result["master_id"] = master_id
    try:
        base_amount = int(round(float(value.get("base_amount"))))
    except (TypeError, ValueError, OverflowError):
        base_amount = 0
    if 0 < base_amount <= 10_000_000:
        result["base_amount"] = base_amount
    return result or None


def widget_for_action(action: Any) -> str | None:
    """Translate an existing legacy action card into the widget contract."""
    if not isinstance(action, dict):
        return None
    return _ACTION_WIDGETS.get(str(action.get("type") or "").strip().lower())


def widget_from_signal(signal: Any, action: Any = None) -> str | None:
    """Read a model widget signal, falling back to a deterministic action map."""
    if isinstance(signal, dict) and signal.get("kind") == "widget":
        widget = normalize_chat_widget(signal.get("widget"))
        if widget:
            return widget
    return widget_for_action(action)
