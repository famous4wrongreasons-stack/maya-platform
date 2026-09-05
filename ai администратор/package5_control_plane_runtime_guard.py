#!/usr/bin/env python3
"""Fail closed when the active PWA restores B13-B15 legacy owners."""

from __future__ import annotations

import argparse
import ast
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Finding:
    check: str
    detail: str


WEB_FUNCTIONS = {
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
}

READ_ONLY_MARKER = "p5_b15_chat_history_read_only"
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
    required = ("webhook_server.py", "database.py", "growth_planner.py")
    for filename in required:
        if filename not in overrides and not (root / filename).is_file():
            findings.append(Finding("runtime_surface", f"{filename} missing"))
    if findings:
        return findings

    web = _read(root, "webhook_server.py", overrides)
    web_functions = _functions(web, "webhook_server.py")
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
        if READ_ONLY_MARKER not in body:
            continue
        for writer in READ_ONLY_BUSINESS_WRITERS:
            if writer in body:
                findings.append(
                    Finding("read_only_business_boundary", f"{name} references {writer}")
                )

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
        "activePwaIncluded": True,
        "findings": [asdict(item) for item in findings],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    elif findings:
        for finding in findings:
            print(f"FAIL {finding.check}: {finding.detail}")
    else:
        print("Package 5 B13/B14/B15 active PWA control-plane guard: PASS")
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
