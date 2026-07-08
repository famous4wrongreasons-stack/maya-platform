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

BRAIN_CLIENT = "client_concierge"
BRAIN_MASTER = "master_operator"
BRAIN_ADMIN = "admin_operator"
BRAIN_OWNER = "owner_director"
BRAIN_FOUNDER = "founder_director"
BRAIN_TEAM = "team_operator"
BRAIN_VOICE = "voice_dynamic"

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


def allowed_surfaces_for_panel_role(role: str | None, *, is_founder: bool = False,
                                    is_master: bool = False) -> list[str]:
    """Stable list of app surfaces available to an authenticated user."""
    role = str(role or "").strip().lower()
    surfaces = [SURFACE_CLIENT, SURFACE_VOICE]
    if panel_role_can_use_staff_surface(role, is_master=is_master):
        surfaces.extend([SURFACE_STAFF, SURFACE_TEAM])
    if is_founder or role == ROLE_OWNER:
        surfaces.extend([SURFACE_OWNER, SURFACE_ADMIN])
    elif role == ROLE_MANAGER:
        surfaces.append(SURFACE_ADMIN)
    if role == ROLE_MASTER or is_master:
        surfaces.append(SURFACE_MASTER)

    out = []
    for surface in surfaces:
        if surface not in out:
            out.append(surface)
    return out


def brain_profile_for_surface(role: str | None, surface: str | None, *,
                              is_founder: bool = False,
                              is_master: bool = False) -> str:
    """AI brain profile for a role + app surface."""
    role = str(role or "").strip().lower()
    surface = normalize_surface(surface)
    if surface == SURFACE_CLIENT:
        return BRAIN_CLIENT
    if surface == SURFACE_VOICE:
        return BRAIN_VOICE
    if surface == SURFACE_TEAM:
        return BRAIN_TEAM
    if surface == SURFACE_MASTER:
        return BRAIN_MASTER
    if surface == SURFACE_ADMIN:
        return BRAIN_ADMIN
    if is_founder:
        return BRAIN_FOUNDER
    if role == ROLE_OWNER:
        return BRAIN_OWNER
    if role == ROLE_MANAGER:
        return BRAIN_ADMIN
    if role == ROLE_MASTER or is_master:
        return BRAIN_MASTER
    return BRAIN_CLIENT


def default_brain_profile(role: str | None, *, is_founder: bool = False,
                          is_master: bool = False) -> str:
    """Default staff/client brain for the current identity."""
    surfaces = allowed_surfaces_for_panel_role(
        role,
        is_founder=is_founder,
        is_master=is_master,
    )
    surface = SURFACE_STAFF if SURFACE_STAFF in surfaces else SURFACE_CLIENT
    return brain_profile_for_surface(
        role,
        surface,
        is_founder=is_founder,
        is_master=is_master,
    )


def surface_brain_profiles(role: str | None, *, is_founder: bool = False,
                           is_master: bool = False) -> dict[str, str]:
    """Brain profile per allowed app surface."""
    return {
        surface: brain_profile_for_surface(
            role,
            surface,
            is_founder=is_founder,
            is_master=is_master,
        )
        for surface in allowed_surfaces_for_panel_role(
            role,
            is_founder=is_founder,
            is_master=is_master,
        )
    }
