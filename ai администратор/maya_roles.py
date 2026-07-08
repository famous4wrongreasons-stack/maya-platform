"""Единая ролевая матрица MAYA OS.

Модуль не импортирует database/config и остаётся чистым: сюда можно безопасно
подключать backend, AI-логику, голос, тесты и будущие CRM-адаптеры.
"""

from __future__ import annotations


ROLE_CLIENT = "client"
ROLE_MASTER = "master"
ROLE_MANAGER = "manager"
ROLE_OWNER = "owner"
ROLE_FOUNDER = "founder"

PANEL_ROLES = {ROLE_OWNER, ROLE_MANAGER, ROLE_MASTER}
AI_ROLES = {ROLE_CLIENT, ROLE_MASTER, ROLE_MANAGER, ROLE_OWNER, ROLE_FOUNDER}
AI_STAFF_ROLES = {ROLE_MASTER, ROLE_MANAGER, ROLE_OWNER, ROLE_FOUNDER}

SURFACE_CLIENT = "client"
SURFACE_STAFF = "staff"
SURFACE_OWNER = "owner"
SURFACE_ADMIN = "admin"
SURFACE_MASTER = "master"
SURFACE_TEAM = "team"
SURFACE_VOICE = "voice"

SURFACES = {
    SURFACE_CLIENT,
    SURFACE_STAFF,
    SURFACE_OWNER,
    SURFACE_ADMIN,
    SURFACE_MASTER,
    SURFACE_TEAM,
    SURFACE_VOICE,
}

PANEL_PERMISSION_KEYS = {
    "dashboard",
    "analytics",
    "marketing",
    "jobs",
    "reviews",
    "staff",
    "roles",
    "pii_export",
    "master_tools",
    "redeem",
}

_PANEL_PERMISSIONS = {
    ROLE_OWNER: {
        "dashboard": True,
        "analytics": True,
        "marketing": True,
        "jobs": True,
        "reviews": True,
        "staff": True,
        "roles": True,
        "pii_export": True,
        "master_tools": True,
        "redeem": True,
    },
    ROLE_MANAGER: {
        "dashboard": True,
        "analytics": True,
        "marketing": True,
        "jobs": True,
        "reviews": True,
        "staff": False,
        "roles": False,
        "pii_export": False,
        "master_tools": False,
        "redeem": False,
    },
    ROLE_MASTER: {
        "dashboard": False,
        "analytics": False,
        "marketing": False,
        "jobs": False,
        "reviews": False,
        "staff": False,
        "roles": False,
        "pii_export": False,
        "master_tools": True,
        "redeem": False,
    },
}


def normalize_surface(surface: str | None) -> str:
    """Normalize app surface. Unknown modes fall back to client."""
    value = str(surface or "").strip().lower()
    return value if value in SURFACES else SURFACE_CLIENT


def resolve_panel_role(*, tg_id: int | None, is_founder: bool,
                       is_admin: bool, is_master: bool,
                       manager_ids: set[int] | None = None) -> str | None:
    """Роль панели: owner только для founder; остальные админы = manager."""
    if is_founder:
        return ROLE_OWNER
    if is_admin:
        return ROLE_MANAGER
    if tg_id is not None and int(tg_id) in (manager_ids or set()):
        return ROLE_MANAGER
    if is_master:
        return ROLE_MASTER
    return None


def resolve_ai_role(*, is_founder: bool, is_admin: bool, is_master: bool) -> str:
    """Роль ассистента для chat/voice/tool-loop."""
    if is_founder:
        return ROLE_FOUNDER
    if is_admin:
        return ROLE_MANAGER
    if is_master:
        return ROLE_MASTER
    return ROLE_CLIENT


def panel_permissions(role: str | None, *, is_master: bool = False,
                      is_cashier: bool = False) -> dict:
    """Permissions for operational panel surfaces."""
    perms = dict(_PANEL_PERMISSIONS.get(role, {}))
    if is_master:
        perms["master_tools"] = True
        if is_cashier:
            perms["redeem"] = True
    return perms


def ai_role_can_use_staff_surface(role: str | None) -> bool:
    return str(role or "").strip().lower() in AI_STAFF_ROLES


def panel_role_can_use_staff_surface(role: str | None, *, is_master: bool = False) -> bool:
    return str(role or "").strip().lower() in PANEL_ROLES or bool(is_master)

