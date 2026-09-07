import ast
import asyncio
import json
import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import canonical_staff_access


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
    def __init__(self, body, headers=None):
        self._body = body
        self.headers = headers or {"X-Telegram-InitData": "verified"}

    async def json(self):
        return self._body


class DatabaseTrap:
    def __init__(self):
        self.calls = []

    def is_admin(self, user_id):
        self.calls.append(("is_admin", user_id))
        return False

    def __getattr__(self, name):
        raise AssertionError(f"legacy database access: {name}")


def function(name: str, extra=None):
    database = DatabaseTrap()
    namespace = {
        "web": SimpleNamespace(Request=object, Response=object),
        "asyncio": asyncio,
        "os": os,
        "_json": json,
        "logger": SimpleNamespace(error=lambda *args, **kwargs: None),
        "database": database,
        "canonical_staff_access": canonical_staff_access,
        "_panel_auth": lambda body, header: {"id": 41} if header else None,
        "_cabinet_response": lambda payload, status=200: Response(payload, status),
        "resolve_panel_role": lambda **kw: "owner" if kw["is_admin"] or kw["is_founder"] else "client",
        "panel_permissions": lambda *args, **kwargs: {},
    }
    namespace.update(extra or {})
    exec(extract(name), namespace)
    return namespace[name], database


class Package5B13ControlPlaneBoundaryTest(unittest.IsolatedAsyncioTestCase):
    async def test_team_bind_reset_and_cashier_are_mutation_free(self):
        handler, database = function("panel_team_handler")
        listing = await handler(Request({"mode": "list"}))
        self.assertEqual(200, listing.status)
        self.assertEqual([], listing.payload["masters"])
        self.assertEqual(0, listing.payload["business_mutations"])
        for mode in ("bind_code", "cashier"):
            result = await handler(Request({"mode": mode, "staff_id": 7}))
            self.assertEqual(410, result.status)
            self.assertEqual(0, result.payload["business_mutations"])
        self.assertEqual([], database.calls)

    async def test_raw_telegram_manager_writes_are_rejected(self):
        handler, database = function("panel_managers_handler")
        listing = await handler(Request({"mode": "list"}))
        self.assertEqual([], listing.payload["managers"])
        self.assertFalse(listing.payload["historical_panel_manager_ids_authoritative"])
        for mode in ("add", "remove"):
            result = await handler(Request({"mode": mode, "tg_id": 99}))
            self.assertEqual(410, result.status)
            self.assertEqual("CrmStaffAccess", result.payload["authority"])
        self.assertEqual([], database.calls)

    async def test_retired_goal_payloads_never_write(self):
        handler, database = function("panel_plan_target_handler")
        for payload in (
            {"target_rub": 10_000},
            {"mode": "growth", "growth_target_rub": 10_000_000},
            {"workstations_count": 8},
        ):
            result = await handler(Request(payload))
            self.assertEqual(410, result.status)
            self.assertEqual("monthly_financial_target", result.payload["supported_goal"])
            self.assertEqual(0, result.payload["business_mutations"])
        self.assertEqual([], database.calls)

    async def test_god_cannot_create_or_change_tenant(self):
        handler, database = function("god_subscribers_handler")
        for payload in (
            {"action": "add", "plan": "pro", "mrr": 1},
            {"action": "set_status", "id": 1, "status": "active"},
        ):
            result = await handler(Request(payload, {"Authorization": "Bearer token"}))
            self.assertEqual(410, result.status)
            self.assertEqual(0, result.payload["business_mutations"])
        self.assertEqual([], database.calls)

    async def test_god_list_reads_canonical_projection(self):
        handler, database = function("god_subscribers_handler")

        class HttpResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps([
                    {"id": "tenant-1", "name": "One", "status": "active"},
                    {"id": "tenant-2", "name": "Two", "status": "suspended"},
                ]).encode()

        with patch("urllib.request.urlopen", return_value=HttpResponse()) as read:
            result = await handler(Request({"action": "list"}, {"Authorization": "Bearer token"}))
        self.assertEqual(200, result.status)
        self.assertTrue(result.payload["read_only"])
        self.assertEqual("canonical_admin_tenants", result.payload["projection"])
        self.assertEqual({"total": 2, "active": 1, "suspended": 1, "mrr": None}, result.payload["summary"])
        self.assertEqual("GET", read.call_args.args[0].method)
        self.assertEqual([], database.calls)

    async def test_panel_role_ignores_legacy_staff_and_manager_data(self):
        resolver, database = function("_panel_resolve_role")
        result = resolver(77)
        self.assertIsNone(result["role"])
        self.assertFalse(result["is_master"])
        self.assertFalse(result["is_cashier"])
        self.assertEqual("CrmStaffAccess", result["staff_authority"])
        self.assertEqual([], database.calls)


if __name__ == "__main__":
    unittest.main()
