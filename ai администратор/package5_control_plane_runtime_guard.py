#!/usr/bin/env python3
"""Fail closed when the active PWA restores B13-B24 legacy owners."""

from __future__ import annotations

import argparse
import ast
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Finding:
    check: str
    detail: str


WEB_FUNCTIONS = {
    "push_subscribe_handler": {
        "markers": ('channel_proof(request.headers, body)', 'command, "push-subscribe"', 'CLIENT_WEB_PUSH_LIMIT_EXCEEDED'),
        "forbidden": ('_authed_chat_id', 'database.', 'sqlite3', '_save_master_push', '_send_', 'get_or_create_client', 'body.get("clientId")'),
    },
    "push_unsubscribe_handler": {
        "markers": ('channel_proof(request.headers, body)', 'command, "push-unsubscribe"'),
        "forbidden": ('_authed_chat_id', 'database.', 'sqlite3', '_send_', 'get_or_create_client'),
    },
    "chat_delete_handler": {
        "markers": ("p5_b23_server_history_delete_retired", "FEATURE_NOT_AVAILABLE", "status=410"),
        "forbidden": ("request.json", "request.app", "chat_id", "session", "phone", "memory", "database.", "messages", "client_command", "load_conversations", "save_conversations"),
    },
    "tip_sent_handler": {
        "markers": ("p5_b22_unverified_tip_signal_retired", '"ok": False', '"payment_confirmed": False', "status=410"),
        "forbidden": ("request.json", "request.app", "database.", "_master_by", "send_message", "_send_master_push", "client_command", "_yc", ".execute("),
    },
    "realtime_handler": {
        "markers": (
            "p5_b21_verified_realtime_authority",
            'client_command, "realtime-authority"',
            'authority.get("ready") is not True',
            '"type": "ready"',
        ),
        "forbidden": (
            "session_token",
            "resolve_session",
            "session_tg_user",
            "has_valid_consent_by_chat_id",
            "chat_id",
            "database.",
            "_verify_telegram_",
        ),
    },
    "_growth_role_recipients": {
        "markers": ("p5_b13_raw_telegram_manager_brief_authority_disabled",),
        "forbidden": ("panel_manager_ids", "database.list_admins", "database.get_master_by_chat_id"),
    },
    "_panel_resolve_role": {
        "markers": ("p5_b13_raw_telegram_staff_manager_authority_disabled",),
        "forbidden": (
            "panel_manager_ids",
            "database.get_master_by_chat_id",
            "can_redeem",
            "is_master=True",
            "is_cashier=True",
        ),
    },
    "panel_team_handler": {
        "markers": ("CrmStaffAccess", "configure_crm_staff_access", "business_mutations"),
        "forbidden": (
            "database.create_master_with_bind_code",
            "database.reset_master_bind_code",
            "database.set_cashier_role",
            "database.list_masters",
        ),
    },
    "panel_managers_handler": {
        "markers": ("CrmStaffAccess", "configure_crm_staff_access", "business_mutations"),
        "forbidden": (
            "_panel_set_manager_ids",
            "_panel_get_manager_ids",
            "database.get_master_by_chat_id",
        ),
    },
    "panel_plan_target_handler": {
        "markers": (
            "legacy_business_goal_mutation_retired",
            "update_finance_dashboard_preferences",
            "monthly_financial_target",
            "business_mutations",
        ),
        "forbidden": (
            "database.set_setting",
            "growth_planner.set_growth_goal",
            "owner_daily_target_rub",
            "workstations_count",
        ),
    },
    "god_subscribers_handler": {
        "markers": (
            "p5_b13_god_subscribers_read_only_canonical_projection",
            "/api/admin/tenants",
            "TrialActivation",
            "Package4",
            "business_mutations",
        ),
        "forbidden": (
            "database.add_maya_tenant",
            "database.set_maya_tenant_status",
            "database.list_maya_tenants",
        ),
    },
    "_god_renewals_view": {
        "markers": ("p5_b14_legacy_renewal_tracker_retired", "return []"),
        "forbidden": (
            "database.get_setting",
            "database.set_setting",
            "GOD_DEFAULT_RENEWALS",
            "GOD_RENEWAL_WARN_DAYS",
        ),
    },
    "_god_health_checks": {
        "markers": (
            "p5_b14_god_health_read_only",
            "repair=False",
            "Расход ИИ (30 дней)",
        ),
        "forbidden": (
            "database.set_setting",
            "god_probe_ts",
            "_god_ai_budget_usd",
            "_god_renewals_view",
            "repair=True",
        ),
    },
    "god_overview_handler": {
        "markers": (
            "p5_b14_god_overview_canonical_projection_only",
            "canonical_admin_tenants",
            '"status": "unavailable"',
            '"read_only": True',
            '"business_mutations": 0',
        ),
        "forbidden": (
            "database.list_maya_tenants",
            "_god_renewals_view",
            "database.set_setting",
            "repair=True",
        ),
    },
    "god_billing_handler": {
        "markers": (
            "p5_b14_legacy_god_billing_mutations_retired",
            'action != "view"',
            "god_billing_controls_retired",
            '"read_only": True',
            '"business_mutations": 0',
            '"renewal_tracker_status": "retired"',
            '"ai_budget_status": "retired"',
        ),
        "forbidden": (
            "database.set_setting",
            "database.get_setting",
            "_god_set_renewals",
            "_god_get_renewals",
            "_god_ai_budget_usd",
            'body.get("usd")',
            'body.get("due_date")',
            'body.get("amount")',
        ),
    },
    "_ensure_client_loyalty_chat_offer": {
        "markers": ("Retired B15 hook", "return False"),
        "forbidden": (
            "database.get_client",
            "lazy_backfill_for_client",
            "loyalty_balance",
            "_store_assistant_message_in_chat",
        ),
    },
    "_ensure_client_repeat_booking_offer": {
        "markers": ("Retired B15 hook", "return False"),
        "forbidden": (
            "database.get_client",
            "memory.get_usual_booking",
            "get_client_bookings",
            "_store_assistant_message_in_chat",
        ),
    },
    "chat_history_handler": {
        "markers": (
            "p5_b15_chat_history_read_only",
            "client_commands.channel_proof",
            'client_commands.command, "status"',
            'status.get("linked")',
            "load_conversations",
            "_chat_history_payload",
        ),
        "forbidden": (
            "database.has_valid_consent_by_chat_id",
            "database.get_client",
            "get_or_create_client",
            "_ensure_client_loyalty_chat_offer",
            "_ensure_client_repeat_booking_offer",
            "_store_assistant_message_in_chat",
            "save_conversations",
            "_ensure_chat_history_ids",
            "memory.save_conversations",
        ),
    },
    "booking_prefill_handler": {
        "markers": (
            "p5_b16_booking_prefill_read_only",
            "client_commands.channel_proof",
            'client_commands.command, "booking-prefill"',
            'result.get("linked")',
            'result.get("client_link_required")',
        ),
        "forbidden": (
            "_authed_chat_id",
            "database.get_client",
            "database.get_or_create_client",
            "database.has_valid_consent_by_chat_id",
            'body.get("chat_id")',
            "int(chat_id)",
            'body.get("phone")',
            'body.get("clientId")',
            "database.create_",
            "database.add_",
            "database.update_",
            "database.set_",
            "database.delete_",
        ),
    },
    "cabinet_me_handler": {
        "markers": ("B20", "_build_full_cabinet(request, {})"),
        "forbidden": (
            "_verify_telegram_init_data",
            "database.",
            "int(chat_id)",
        ),
    },
    "cabinet_me_via_login_handler": {
        "markers": ("Telegram Login Widget", "_build_full_cabinet(request, body)"),
        "forbidden": (
            "_verify_telegram_login_widget",
            "database.",
            'body.get("chat_id")',
            'body.get("clientId")',
            'body.get("phone")',
        ),
    },
    "cabinet_me_via_session_handler": {
        "markers": ("B20 session parity", "_build_full_cabinet(request, {})"),
        "forbidden": (
            "resolve_session",
            "session_tg_user",
            "database.",
            'body.get("chat_id")',
            'body.get("clientId")',
            'body.get("phone")',
        ),
    },
    "_build_full_cabinet": {
        "markers": (
            "p5_b20_verified_client_cabinet_read_only",
            "client_commands.channel_proof",
            'client_commands.command, "cabinet-projection"',
            "_unlinked_cabinet_projection",
        ),
        "forbidden": (
            "database.",
            "_yc",
            "chat_id",
            'body.get("clientId")',
            'body.get("phone")',
            "get_or_create",
            "set_client_history_cache",
            "lazy_backfill",
            "save_conversations",
            "memory.",
        ),
    },
    "_client_record_request_context": {
        "markers": (
            "p5_b17_verified_client_appointment_authority",
            "client_commands.channel_proof",
            '"record_id"',
        ),
        "forbidden": (
            "_authed_chat_id",
            "database.get_client",
            "database.get_or_create_client",
            "database.has_valid_consent_by_chat_id",
            'body.get("phone")',
            'body.get("chat_id")',
            'body.get("clientId")',
            'body.get("client_id")',
            "database.create_",
            "database.update_",
        ),
    },
    "client_cancel_record_handler": {
        "markers": (
            "B17 verified Client",
            "client_commands.command",
            '"appointment-cancel"',
            "_client_appointment_command_response",
        ),
        "forbidden": (
            "_authed_chat_id",
            "database.",
            "_yc",
            "cancel_for_client",
            "cancel_booking",
            "mark_cancel_actor",
            "client.get",
        ),
    },
    "client_reschedule_record_handler": {
        "markers": (
            "B17 verified Client",
            "client_commands.command",
            '"appointment-reschedule"',
            "_client_appointment_command_response",
        ),
        "forbidden": (
            "_authed_chat_id",
            "database.",
            "_yc",
            "reschedule_for_client",
            "reschedule_booking",
            "mark_reschedule_actor",
            "client.get",
        ),
    },
    "_finalize_booking_for_chat": {
        "markers": (
            "B19",
            'client_commands.command("chat-appointment-create"',
            "verified Client initiator",
            'state == "UNKNOWN"',
            "Не повторяйте действие",
        ),
        "forbidden": (
            "database.",
            "_yc.",
            "get_or_create_client",
            "save_booking",
            "lazy_backfill_for_client",
            "apply_redemption_for_booking",
            "get_notify_prefs_by_chat_id",
        ),
    },
    "chat_handler": {
        "markers": (
            "_client_command_context=request_context",
            "_client_command_context=_client_command_context",
            "_client_command_context, contact_request",
        ),
        "forbidden": (
            "_finalize_booking_for_chat(chat_id",
            "_yc.create_booking",
            "database.save_booking",
            "apply_redemption_for_booking",
        ),
    },
    "chat_stream_handler": {
        "markers": (
            "_client_command_context=request_context",
            "_client_command_context=_client_command_context",
            "_client_command_context, contact_request",
        ),
        "forbidden": (
            "_finalize_booking_for_chat, chat_id",
            "_yc.create_booking",
            "database.save_booking",
            "apply_redemption_for_booking",
        ),
    },
    "panel_journal_attendance_handler": {
        "markers": ("B18", "canonical_staff_session_required", "CrmStaffAccess", "set_appointment_attendance", "business_mutations"),
        "forbidden": ("_panel_auth", "_panel_resolve_role", "_panel_record_guard", "_yc", "database."),
    },
    "panel_journal_add_service_handler": {
        "markers": ("B18", "canonical_staff_session_required", "CrmStaffAccess", "set_appointment_services", "business_mutations"),
        "forbidden": ("_panel_auth", "_panel_resolve_role", "_panel_record_guard", "_yc", "database."),
    },
    "panel_journal_set_services_handler": {
        "markers": ("B18", "canonical_staff_session_required", "CrmStaffAccess", "set_appointment_services", "business_mutations"),
        "forbidden": ("_panel_auth", "_panel_resolve_role", "_panel_record_guard", "_yc", "database."),
    },
    "panel_journal_set_duration_handler": {
        "markers": ("B18", "canonical_staff_session_required", "CrmStaffAccess", "set_appointment_duration", "business_mutations"),
        "forbidden": ("_panel_auth", "_panel_resolve_role", "_panel_record_guard", "_yc", "database."),
    },
    "panel_journal_set_client_name_handler": {
        "markers": ("B18", "canonical_staff_session_required", "CrmStaffAccess", "set_appointment_fields", "business_mutations"),
        "forbidden": ("_panel_auth", "_panel_resolve_role", "_panel_record_guard", "_yc", "database."),
    },
}

B18_APPOINTMENT_SITES = {
    "update_booking": "set_appointment_services",
    "set_record_attendance": "set_appointment_attendance",
    "add_services_to_record": "set_appointment_services",
    "set_record_services": "set_appointment_services",
    "set_record_duration": "set_appointment_duration",
    "set_record_client_name": "set_appointment_fields",
}

READ_ONLY_MARKERS = (
    "p5_b15_chat_history_read_only",
    "p5_b16_booking_prefill_read_only",
    "p5_b20_verified_client_cabinet_read_only",
)
READ_ONLY_BUSINESS_WRITERS = (
    "get_or_create_client",
    "save_conversations",
    "_store_assistant_message_in_chat",
    "_ensure_client_loyalty_chat_offer",
    "_ensure_client_repeat_booking_offer",
    "database.create_",
    "database.add_",
    "database.update_",
    "database.set_",
    "database.delete_",
)

DATABASE_RETIREMENTS = {
    "save_tip": "p5_b22_unverified_tip_signal_retired",
    "tips_totals_by_master": "p5_b22_legacy_tip_projection_retired",
    "tips_for_master": "p5_b22_legacy_tip_projection_retired",
    "can_redeem_codes": "p5_b13_legacy_cashier_value_authority_disabled",
    "set_cashier_role": "canonical_package4_value_authority_required",
    "create_master_with_bind_code": "canonical_crm_staff_access_required",
    "reset_master_bind_code": "canonical_crm_staff_access_required",
    "bind_master": "canonical_crm_staff_access_required",
    "unbind_master": "canonical_crm_staff_access_required",
    "add_maya_tenant": "canonical_trial_activation_required",
    "set_maya_tenant_status": "canonical_a26_tenant_lifecycle_required",
}

GLOBAL_FORBIDDEN = (
    "database.create_master_with_bind_code",
    "database.reset_master_bind_code",
    "database.set_cashier_role",
    "database.add_maya_tenant",
    "database.set_maya_tenant_status",
    'database.set_setting("god_renewals"',
    'database.set_setting("god_ai_budget_usd"',
    'database.get_setting("god_renewals"',
    'database.get_setting("god_ai_budget_usd"',
    "database.list_maya_tenants",
)


def _read(root: Path, filename: str, overrides: Mapping[str, str]) -> str:
    if filename in overrides:
        return overrides[filename]
    return (root / filename).read_text(encoding="utf-8")


def _functions(source: str, filename: str) -> dict[str, str]:
    tree = ast.parse(source, filename=filename)
    lines = source.splitlines(keepends=True)
    result: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            result[node.name] = "".join(lines[node.lineno - 1 : (node.end_lineno or node.lineno)])
    return result


def scan_runtime(root: Path | str, overrides: Mapping[str, str] | None = None) -> list[Finding]:
    root = Path(root)
    overrides = overrides or {}
    findings: list[Finding] = []
    required = (
        "webhook_server.py",
        "database.py",
        "growth_planner.py",
        "claude_ai.py",
        "yclients.py",
        "legacy_client_command_bridge.py",
        "realtime_bridge.py",
    )
    for filename in required:
        if filename not in overrides and not (root / filename).is_file():
            findings.append(Finding("runtime_surface", f"{filename} missing"))
    if findings:
        return findings

    web = _read(root, "webhook_server.py", overrides)
    web_functions = _functions(web, "webhook_server.py")
    for path, handler in (("/api/push/subscribe", "push_subscribe_handler"), ("/api/push/unsubscribe", "push_unsubscribe_handler")):
        push_routes = [n for n in ast.walk(ast.parse(web)) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr != 'add_options' and any(isinstance(a, ast.Constant) and a.value == path for a in n.args)]
        if len(push_routes) != 1 or len(push_routes[0].args) != 2 or not isinstance(push_routes[0].args[1], ast.Name) or push_routes[0].args[1].id != handler:
            findings.append(Finding("b24_web_push", "Web Push route must use its verified registry handler"))
    for name, expected in (("_send_master_push", 'return 0'), ("_send_client_push", 'return 0'), ("_push_subscriptions_for_master", 'return []')):
        body = web_functions.get(name, '')
        if not body:
            findings.append(Finding("b24_web_push", f"{name} fail-closed adapter missing"))
            continue
        node = ast.parse(body).body[0]
        statements = [n for n in node.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))]
        if len(statements) != 1 or ast.dump(statements[0]) != ast.dump(ast.parse(expected).body[0]):
            findings.append(Finding("b24_web_push", f"{name} restores legacy identity/delivery/storage"))
    for name, contract in WEB_FUNCTIONS.items():
        body = web_functions.get(name)
        if body is None:
            findings.append(Finding("control_plane_boundary", f"{name} missing"))
            continue
        for marker in contract["markers"]:
            if marker not in body:
                findings.append(Finding("control_plane_boundary", f"{name} lacks {marker}"))
        for forbidden in contract["forbidden"]:
            if forbidden in body:
                findings.append(Finding("control_plane_boundary", f"{name} references {forbidden}"))
    for name, body in web_functions.items():
        if not any(marker in body for marker in READ_ONLY_MARKERS):
            continue
        for writer in READ_ONLY_BUSINESS_WRITERS:
            if writer in body:
                findings.append(
                    Finding("read_only_business_boundary", f"{name} references {writer}")
                )

    tip_body = web_functions.get("tip_sent_handler", "")
    if tip_body:
        tip_node = ast.parse(tip_body).body[0]
        statements = [n for n in tip_node.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))]
        calls = [n for n in ast.walk(tip_node) if isinstance(n, ast.Call)]
        if len(statements) != 1 or not isinstance(statements[0], ast.Return) or len(calls) != 1 or not isinstance(calls[0].func, ast.Name) or calls[0].func.id != "_cabinet_response":
            findings.append(Finding("b22_tip_authority", "Retired endpoint must only return unsupported"))

    delete_body = web_functions.get("chat_delete_handler", "")
    if delete_body:
        node = ast.parse(delete_body).body[0]
        statements = [n for n in node.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))]
        expected = ast.parse('return _cabinet_response({"ok": False, "error": "FEATURE_NOT_AVAILABLE"}, status=410)').body[0]
        if len(statements) != 1 or ast.dump(statements[0]) != ast.dump(expected):
            findings.append(Finding("b23_history_delete", "Retired delete must return a fixed unsupported response without input/state access"))
    routes = [n for n in ast.walk(ast.parse(web)) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr != "add_options" and any(isinstance(a, ast.Constant) and a.value == "/api/chat/delete" for a in n.args)]
    if len(routes) != 1 or len(routes[0].args) != 2 or not isinstance(routes[0].args[1], ast.Name) or routes[0].args[1].id != "chat_delete_handler":
        findings.append(Finding("b23_history_delete", "Compatibility route must use the retired handler"))

    database = _read(root, "database.py", overrides)
    db_functions = _functions(database, "database.py")
    for name, marker in DATABASE_RETIREMENTS.items():
        body = db_functions.get(name)
        if body is None:
            findings.append(Finding("legacy_fallback", f"database.py:{name} missing"))
            continue
        if marker not in body:
            findings.append(Finding("legacy_fallback", f"database.py:{name} lacks {marker}"))
        if "with _db()" in body or ".execute(" in body:
            findings.append(Finding("legacy_fallback", f"database.py:{name} still writes/reads authority"))

    growth = _read(root, "growth_planner.py", overrides)
    growth_body = _functions(growth, "growth_planner.py").get("set_growth_goal", "")
    for marker in (
        "legacy_business_goal_mutation_retired",
        "update_finance_dashboard_preferences",
        "business_mutations",
    ):
        if marker not in growth_body:
            findings.append(Finding("retired_goal", f"set_growth_goal lacks {marker}"))
    for forbidden in ("_save_json_setting", "database.set_setting", "calculate_growth_plan"):
        if forbidden in growth_body:
            findings.append(Finding("retired_goal", f"set_growth_goal references {forbidden}"))

    ai = _read(root, "claude_ai.py", overrides)
    ai_functions = _functions(ai, "claude_ai.py")
    ai_tool = ai_functions.get("_execute_tool", "")
    ai_command = ai_functions.get("_client_appointment_command", "")
    for marker in (
        "B18",
        "current_context",
        "legacy_client_command_bridge",
        "appointment-reschedule",
        "appointment-services",
        "appointment-cancel",
    ):
        if marker not in ai_command + ai_tool:
            findings.append(Finding("b18_ai_appointment_authority", f"AI appointment path lacks {marker}"))
    for forbidden in (
        "_resolve_user_record_id",
        "_check_record_ownership",
        "yclients.update_booking",
        "yclients.reschedule_booking",
        "yclients.cancel_booking",
        "database.mark_reschedule_actor",
        "database.mark_cancel_actor",
    ):
        if forbidden in ai_command + ai_tool or forbidden in ai_functions:
            findings.append(Finding("b18_ai_legacy_identity", f"claude_ai.py references {forbidden}"))
    for forbidden in (
        "database.get_client",
        "get_client_bookings",
        "_authed_chat_id",
        "client_row",
    ):
        if forbidden in ai_command:
            findings.append(Finding("b18_ai_legacy_identity", f"AI appointment command references {forbidden}"))

    yclients = _read(root, "yclients.py", overrides)
    yclients_functions = _functions(yclients, "yclients.py")
    for name, action in B18_APPOINTMENT_SITES.items():
        body = yclients_functions.get(name, "")
        if not body:
            findings.append(Finding("b18_all_six", f"yclients.py:{name} missing"))
            continue
        if "dispatch_appointment_action" not in body or action not in body:
            findings.append(Finding("b18_all_six", f"yclients.py:{name} lacks canonical {action}"))
        for forbidden in ("self._put", "requests.put", "requests.request"):
            if forbidden in body:
                findings.append(Finding("b18_direct_provider_owner", f"yclients.py:{name} references {forbidden}"))

    client_bridge = _read(root, "legacy_client_command_bridge.py", overrides)
    if '"appointment-services"' not in client_bridge:
        findings.append(Finding("b18_client_command", "appointment-services command missing"))
    if '"appointment-create"' not in client_bridge:
        findings.append(Finding("b19_chat_booking", "appointment-create command missing"))
    if '"realtime-authority"' not in client_bridge or "def staff_ai_turn" not in client_bridge:
        findings.append(Finding("b21_realtime_authority", "canonical realtime transport missing"))

    realtime = _read(root, "realtime_bridge.py", overrides)
    realtime_session = _functions(realtime, "realtime_bridge.py").get("run_session", "")
    for marker in (
        "history: list[dict] = []",
        "turn_lock = asyncio.Lock()",
        "client_link_verified",
        "crm_staff_access_verified",
        "staff_ai_turn",
        "history.clear()",
    ):
        if marker not in realtime_session:
            findings.append(Finding("b21_realtime_boundary", f"run_session lacks {marker}"))
    for forbidden in (
        "chat_id",
        "load_conversations",
        "save_conversations",
        "database.",
        "_resolve_role",
        "ClientRealtimeConversation",
    ):
        if forbidden in realtime_session:
            findings.append(Finding("b21_realtime_boundary", f"run_session references {forbidden}"))

    client_actions_path = root / "client_record_actions.py"
    if client_actions_path.is_file():
        client_actions = overrides.get("client_record_actions.py")
        if client_actions is None:
            client_actions = client_actions_path.read_text(encoding="utf-8")
        for forbidden in (
            "def cancel_for_client",
            "def reschedule_for_client",
            "def _owned_upcoming_record",
            "cancel_booking",
            "reschedule_booking",
            "client_phone",
        ):
            if forbidden in client_actions:
                findings.append(
                    Finding("b17_client_appointment_owner", f"client_record_actions.py references {forbidden}")
                )

    bind_cli_path = root / "generate_bind_codes.py"
    if bind_cli_path.is_file():
        bind_cli = overrides.get("generate_bind_codes.py")
        if bind_cli is None:
            bind_cli = bind_cli_path.read_text(encoding="utf-8")
        if "configure_crm_staff_access" not in bind_cli:
            findings.append(Finding("legacy_bind_cli", "generate_bind_codes.py lacks A16 retirement marker"))
        for forbidden in ("create_master_with_bind_code", "reset_master_bind_code", "DELETE FROM masters_telegram"):
            if forbidden in bind_cli:
                findings.append(Finding("legacy_bind_cli", f"generate_bind_codes.py references {forbidden}"))

    excluded = {
        "bot.py",  # historical caller; database functions above fail closed
        "database.py",
        "growth_planner.py",
        "generate_bind_codes.py",
        "package5_control_plane_runtime_guard.py",
    }
    for path in sorted(root.glob("*.py")):
        if path.name in excluded or path.name.startswith("test_"):
            continue
        source = overrides.get(path.name)
        if source is None:
            source = path.read_text(encoding="utf-8")
        for forbidden in GLOBAL_FORBIDDEN:
            if forbidden in source:
                findings.append(Finding("later_pwa_module", f"{path.name} references {forbidden}"))
    for path in sorted(root.glob("*.py")):
        if path.name == "package5_control_plane_runtime_guard.py" or path.name.startswith("test_"):
            continue
        source = overrides.get(path.name, path.read_text(encoding="utf-8"))
        tree = ast.parse(source, filename=path.name)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)) and ('pywebpush' in ast.unparse(node)):
                findings.append(Finding("b24_web_push", f"{path.name}:{node.lineno} imports direct Web Push transport"))
            if isinstance(node, ast.Call):
                func = node.func
                name = func.attr if isinstance(func, ast.Attribute) else func.id if isinstance(func, ast.Name) else ""
                if name == "save_tip":
                    findings.append(Finding("b22_tip_authority", f"{path.name}:{node.lineno} calls retired tip writer"))
                if name in ('webpush', '_save_master_push_subscription', '_save_master_push_subscription_sqlite', '_push_db', '_list_master_push_subscriptions_sqlite', '_delete_master_push_subscription_sqlite'):
                    findings.append(Finding("b24_web_push", f"{path.name}:{node.lineno} calls legacy Web Push owner"))
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                normalized = " ".join(node.value.upper().split())
                if re.search(r"\b(?:INSERT INTO|UPDATE|DELETE FROM|FROM|CREATE TABLE IF NOT EXISTS) (?:MASTER|CLIENT)_PUSH_SUBSCRIPTIONS\b", normalized):
                    findings.append(Finding("b24_web_push", f"{path.name}:{node.lineno} uses plaintext legacy Web Push registry"))
                if re.search(r"\b(?:INSERT INTO|UPDATE|DELETE FROM|FROM) TIPS\b", normalized):
                    findings.append(Finding("b22_tip_authority", f"{path.name}:{node.lineno} uses legacy tip facts"))
    import importlib.util
    spec = importlib.util.spec_from_file_location('package5_loyalty_read_guard', Path(__file__).with_name('package5_loyalty_read_guard.py'))
    if spec is None or spec.loader is None:
        raise RuntimeError('B27 loyalty guard is required')
    loyalty_guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loyalty_guard)
    findings.extend(Finding('b27_loyalty_read', detail) for detail in loyalty_guard.scan_loyalty_reads(root, overrides))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).parent)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    findings = scan_runtime(args.root)
    payload = {
        "pass": not findings,
        "b13LegacyControlPlaneOwners": 0 if not findings else None,
        "b14LegacyGodOwners": 0 if not findings else None,
        "b15ChatHistoryReadOwners": 0 if not findings else None,
        "b16BookingPrefillLegacyIdentityOwners": 0 if not findings else None,
        "b17ClientAppointmentLegacyIdentityOwners": 0 if not findings else None,
        "b18ActiveLegacyProviderMutationOwners": 0 if not findings else None,
        "b18LegacyAppointmentAuthorityBypasses": 0 if not findings else None,
        "b18AppointmentSitesMapped": "6/6" if not findings else None,
        "b19ChatBookingLegacyWriteSites": 0 if not findings else None,
        "b19ChatBookingInventoryCoverage": "3/3" if not findings else None,
        "b19ChatStreamAuthorityParity": True if not findings else None,
        "b19ChatStreamMutationOwnerParity": True if not findings else None,
        "b20CabinetLegacyIdentityOwners": 0 if not findings else None,
        "b20CabinetReadSurfaceWriters": 0 if not findings else None,
        "b20CabinetEndpointIdentityParity": True if not findings else None,
        "b20CabinetEndpointReadOnlyParity": True if not findings else None,
        "b21RealtimeLegacyIdentityOwners": 0 if not findings else None,
        "b21RealtimeLegacyHistoryWriters": 0 if not findings else None,
        "b21RealtimePreReadyBypasses": 0 if not findings else None,
        "b22UnverifiedTipOwners": 0 if not findings else None,
        "b23LegacyHistoryDeleteOwners": 0 if not findings else None,
        "b24LegacyWebPushOwners": 0 if not findings else None,
        "activePwaIncluded": True,
        "findings": [asdict(item) for item in findings],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    elif findings:
        for finding in findings:
            print(f"FAIL {finding.check}: {finding.detail}")
    else:
        print("Package 5 B13-B24 active PWA control-plane guard: PASS")
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
