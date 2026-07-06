"""Чистые helper'ы для идентичности Telegram-сессий и ролевой матрицы."""

from __future__ import annotations


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


def resolve_panel_role(*, tg_id: int | None, is_founder: bool,
                       is_admin: bool, is_master: bool,
                       manager_ids: set[int] | None = None) -> str | None:
    """Роль панели: owner только для founder; остальные админы = manager."""
    if is_founder:
        return "owner"
    if is_admin:
        return "manager"
    if tg_id is not None and int(tg_id) in (manager_ids or set()):
        return "manager"
    if is_master:
        return "master"
    return None


def resolve_ai_role(*, is_founder: bool, is_admin: bool, is_master: bool) -> str:
    """Роль ассистента для chat/voice-потоков."""
    if is_founder:
        return "founder"
    if is_admin:
        return "manager"
    if is_master:
        return "master"
    return "client"
