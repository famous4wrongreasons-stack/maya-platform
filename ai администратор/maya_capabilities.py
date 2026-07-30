"""Founder-controlled allowlist of safe client-facing MAYA capabilities."""

from __future__ import annotations

import json
from datetime import datetime

import config
import database


CLIENT_SELF_VISIT_HISTORY = "client_self_visit_history"

_REGISTRY = {
    CLIENT_SELF_VISIT_HISTORY: {
        "label": "Клиенты видят в чате собственную историю посещений",
        "setting_key": "maya_capability:client_self_visit_history",
        "default_enabled": True,
        "scope": "own_data_only",
    },
}


def _founder_ids() -> set[int]:
    out = set()
    for value in getattr(config, "FOUNDER_IDS", []) or []:
        try:
            out.add(int(value))
        except (TypeError, ValueError):
            continue
    return out


def _definition(code: str) -> dict:
    definition = _REGISTRY.get(str(code or "").strip())
    if not definition:
        raise KeyError("unknown_capability")
    return definition


def _decode_enabled(raw, default: bool) -> bool:
    if raw in (None, ""):
        return bool(default)
    low = str(raw).strip().lower()
    if low in {"1", "true", "yes", "on", "enabled"}:
        return True
    if low in {"0", "false", "no", "off", "disabled"}:
        return False
    try:
        payload = json.loads(str(raw))
        if isinstance(payload, dict) and "enabled" in payload:
            return bool(payload["enabled"])
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return bool(default)


def is_enabled(code: str) -> bool:
    definition = _definition(code)
    raw = database.get_setting(definition["setting_key"])
    return _decode_enabled(raw, definition["default_enabled"])


def list_capabilities() -> list[dict]:
    return [
        {
            "code": code,
            "label": definition["label"],
            "scope": definition["scope"],
            "enabled": is_enabled(code),
        }
        for code, definition in _REGISTRY.items()
    ]


def set_enabled(code: str, enabled: bool, actor_id: int) -> dict:
    try:
        actor = int(actor_id)
    except (TypeError, ValueError):
        actor = 0
    if actor not in _founder_ids():
        raise PermissionError("founder_only")

    definition = _definition(code)
    payload = {
        "enabled": bool(enabled),
        "changed_by": actor,
        "changed_at": datetime.now().isoformat(timespec="seconds"),
    }
    database.set_setting(
        definition["setting_key"],
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    )
    return {
        "code": code,
        "label": definition["label"],
        "scope": definition["scope"],
        "enabled": bool(enabled),
    }
