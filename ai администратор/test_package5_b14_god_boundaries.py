import ast
import asyncio
import json
import os
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).parent
SOURCE = (ROOT / "webhook_server.py").read_text(encoding="utf-8")


def extract(name: str):
    tree = ast.parse(SOURCE)
    lines = SOURCE.splitlines(keepends=True)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return "".join(lines[node.lineno - 1 : node.end_lineno])
    raise AssertionError(f"missing {name}")


class Response:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status


class Request:
    def __init__(self, body):
        self._body = body
        self.headers = {"X-Telegram-InitData": "verified"}

    async def json(self):
        return self._body


class DatabaseTrap:
    DB_PATH = "/tmp/package5-b14-read-only.db"

    def __init__(self):
        self.calls = []

    def dashboard_metrics(self, **kwargs):
        self.calls.append(("dashboard_metrics", kwargs))
        return {"acquisition": {}, "bookings": {}}

    def get_setting(self, key):
        self.calls.append(("get_setting", key))
        return None

    def list_admins(self):
        self.calls.append(("list_admins",))
        return []

    def list_masters(self):
        self.calls.append(("list_masters",))
        return []

    def __getattr__(self, name):
        raise AssertionError(f"unexpected legacy database access: {name}")


def function(name: str, extra=None):
    database = DatabaseTrap()
    namespace = {
        "web": SimpleNamespace(Request=object, Response=object),
        "asyncio": asyncio,
        "date": date,
        "os": os,
        "logger": SimpleNamespace(
            warning=lambda *args, **kwargs: None,
            error=lambda *args, **kwargs: None,
        ),
        "database": database,
        "_god_gate": lambda request, body: (41, None),
        "_cabinet_response": lambda payload, status=200: Response(payload, status),
        "_panel_period": lambda body: {
            "label": "Сентябрь",
            "from_iso": "2026-09-01",
            "to_iso": "2026-09-30",
        },
        "_daily_report": lambda day: {"cash": {"sum": 0}, "card": {"sum": 0}},
        "_god_health_checks": lambda: {"summary": {"ok": 1, "warn": 0, "fail": 0}},
        "_god_ai_spent_usd": lambda days=30: 12.5,
        "ai_billing": SimpleNamespace(
            build_cost_data=lambda days: {
                "ai_usd": 12.5,
                "ai_rub": 1000,
                "servers_rub": 2000,
                "total_rub": 3000,
                "by_feature": [],
                "days": days,
            }
        ),
    }
    namespace.update(extra or {})
    exec(extract(name), namespace)
    return namespace[name], database


class Package5B14GodBoundaryTest(unittest.IsolatedAsyncioTestCase):
    async def test_billing_view_is_measured_cost_only(self):
        handler, database = function("god_billing_handler")
        result = await handler(Request({"action": "view"}))

        self.assertEqual(200, result.status)
        self.assertTrue(result.payload["read_only"])
        self.assertEqual(0, result.payload["business_mutations"])
        self.assertEqual([], result.payload["renewals"])
        self.assertEqual("retired", result.payload["renewal_tracker_status"])
        self.assertIsNone(result.payload["ai_budget_usd"])
        self.assertEqual("retired", result.payload["ai_budget_status"])
        self.assertEqual(12.5, result.payload["ai_spent_usd"])
        self.assertFalse(result.payload["historical_legacy_settings_authoritative"])
        self.assertEqual([], database.calls)

    async def test_all_billing_mutation_payloads_are_explicitly_retired(self):
        handler, database = function("god_billing_handler")
        for body in (
            {"action": "set_renewal", "key": "host", "due_date": "2030-01-01", "amount": 1},
            {"action": "set_budget", "usd": 1},
            {"action": "unknown", "usd": 999},
        ):
            result = await handler(Request(body))
            self.assertEqual(410, result.status)
            self.assertEqual("god_billing_controls_retired", result.payload["error"])
            self.assertEqual(0, result.payload["business_mutations"])
        self.assertEqual([], database.calls)

    async def test_overview_never_reads_legacy_subscriber_or_renewal_state(self):
        handler, database = function("god_overview_handler")
        first = await handler(Request({}))
        second = await handler(Request({}))

        for result in (first, second):
            self.assertEqual(200, result.status)
            self.assertEqual(0, result.payload["business_mutations"])
            self.assertIsNone(result.payload["nearest_renewal"])
            self.assertEqual("unavailable", result.payload["subscribers"]["status"])
            self.assertEqual("canonical_admin_tenants", result.payload["subscribers"]["projection"])
            self.assertTrue(result.payload["subscribers"]["read_only"])
        self.assertEqual(
            ["dashboard_metrics", "dashboard_metrics"],
            [call[0] for call in database.calls],
        )

    async def test_health_check_is_diagnostic_and_never_repairs(self):
        repairs = []
        memory = SimpleNamespace(
            audit_dual_role_client_context=lambda **kwargs: (
                repairs.append(kwargs),
                {"issues": [], "repaired": [], "dual_role": 0, "healthy": 0},
            )[1]
        )
        yc = SimpleNamespace(get_masters=lambda: [{"id": 1}])
        handler, database = function(
            "_god_health_checks",
            {
                "memory": memory,
                "_yc": yc,
                "config": SimpleNamespace(OPENAI_API_KEY="sk-test", FAL_KEY="present"),
                "_panel_resolve_role": lambda user_id: {"is_founder": False, "role": "client"},
            },
        )
        result = handler()

        self.assertEqual(False, repairs[0]["repair"])
        self.assertEqual({"ok", "warn", "fail"}, set(result["summary"]))
        self.assertFalse(any(call[0] == "set_setting" for call in database.calls))

    async def test_legacy_renewal_projection_is_an_empty_tombstone(self):
        view, database = function("_god_renewals_view")
        self.assertEqual([], view())
        self.assertEqual([], database.calls)

    async def test_pwa_and_proxy_have_no_retired_controls(self):
        app = (ROOT.parent / "сайт и приложение" / "app.html").read_text(encoding="utf-8")
        site = (ROOT.parent / "maya-os-site" / "index.html").read_text(encoding="utf-8")
        proxy = (
            ROOT.parent / "maya-saas-backend" / "test" / "fixtures" / "beget" / "api-proxy.sanitized.php"
        ).read_text(encoding="utf-8")
        for source in (app, site):
            self.assertNotIn("function editRenewal", source)
            self.assertNotIn("function editBudget", source)
            self.assertNotIn("action: 'set_renewal'", source)
            self.assertNotIn("action: 'set_budget'", source)
            self.assertIn("Фактический расход ИИ", source)
        self.assertIn("god_billing_controls_retired", proxy)
        self.assertIn("http_response_code(410)", proxy)


if __name__ == "__main__":
    unittest.main()
