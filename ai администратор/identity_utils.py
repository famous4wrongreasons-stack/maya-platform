"""Чистые helper'ы для идентичности Telegram-сессий и ролевой матрицы."""

from __future__ import annotations

from maya_roles import (
    ROLE_CLIENT,
    ROLE_FOUNDER,
    ROLE_MANAGER,
    ROLE_MASTER,
    ROLE_OWNER,
    ai_role_can_use_staff_surface,
    normalize_surface,
    panel_permissions,
    panel_role_can_use_staff_surface,
    resolve_ai_role,
    resolve_panel_role,
)


def _clean(value) -> str:
    return str(value or "").strip()


def normalize_tg_user(user: dict | None) -> dict:
    """Нормализует Telegram-профиль к стабильной форме для UI и сессий."""
    src = user if isinstance(user, dict) else {}
    uid = src.get("id")
    try:
        uid = int(uid) if uid not in (None, "") else None
    except (TypeError, ValueError):
        uid = None

    first_name = _clean(src.get("first_name"))
    last_name = _clean(src.get("last_name"))
    username = _clean(src.get("username"))
    photo_url = _clean(src.get("photo_url"))
    full_name = _clean(src.get("full_name"))

    if not full_name:
        full_name = " ".join(part for part in (first_name, last_name) if part).strip()

    if not first_name and full_name:
        parts = full_name.split(None, 1)
        first_name = parts[0]
        if len(parts) > 1 and not last_name:
            last_name = parts[1].strip()

    display_name = full_name or first_name or (f"@{username}" if username else "")

    return {
        "id": uid,
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name,
        "display_name": display_name,
        "username": username,
        "photo_url": photo_url,
    }


def session_tg_user(session: dict | None) -> dict | None:
    """Собирает tg_user из web_session с фолбэком на display_name."""
    sess = session if isinstance(session, dict) else {}
    chat_id = sess.get("chat_id")
    try:
        chat_id = int(chat_id) if chat_id not in (None, "") else None
    except (TypeError, ValueError):
        chat_id = None
    if not chat_id:
        return None

    norm = normalize_tg_user({
        "id": chat_id,
        "first_name": sess.get("tg_first_name"),
        "last_name": sess.get("tg_last_name"),
        "username": sess.get("tg_username"),
        "photo_url": sess.get("tg_photo_url"),
        "full_name": sess.get("display_name"),
    })
    return norm

