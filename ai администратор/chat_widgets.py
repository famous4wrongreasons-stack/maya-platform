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
}


def normalize_chat_widget(value: Any) -> str | None:
    """Return a supported widget name or None for untrusted/unknown values."""
    candidate = str(value or "").strip().lower()
    return candidate if candidate in CHAT_WIDGETS else None


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
