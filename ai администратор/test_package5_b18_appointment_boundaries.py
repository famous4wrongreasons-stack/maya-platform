import asyncio
import ast
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import legacy_client_command_bridge as client_commands
import legacy_client_habits_bridge as client_context
from test_legacy_client_command_bridge import Request, functions_from_source


ROOT = Path(__file__).parent
SIX_SITES = {
    "update_booking": "set_appointment_services",
    "set_record_attendance": "set_appointment_attendance",
    "add_services_to_record": "set_appointment_services",
    "set_record_services": "set_appointment_services",
    "set_record_duration": "set_appointment_duration",
    "set_record_client_name": "set_appointment_fields",
}


class Package5B18AppointmentBoundariesTest(unittest.TestCase):
    def setUp(self):
        self.ai = functions_from_source(
            "claude_ai.py", {"_client_appointment_command"}
        )["_client_appointment_command"]

    def _call(self, operation, payload):
        @client_context.authenticated_call
        def invoke():
            return self.ai(operation, payload)

        context = client_context.ClientCommandContext("verified-proof", "intent")
        return invoke(_client_command_context=context)

    def test_verified_client_ai_service_change_uses_canonical_command(self):
        calls = []
        with patch.object(
            client_commands,
            "command",
            side_effect=lambda *args: calls.append(args)
            or {"execution": {"executionId": "execution-1", "state": "SUCCEEDED"}},
        ):
            result = self._call(
                "appointment-services",
                {"recordId": "77", "serviceIds": ["3", "4"]},
            )
        self.assertTrue(result["success"])
        self.assertEqual(
            calls,
            [
                (
                    "appointment-services",
                    "verified-proof",
                    {"recordId": "77", "serviceIds": ["3", "4"]},
                )
            ],
        )

    def test_missing_binding_fails_closed_without_command(self):
        with patch.object(client_commands, "command") as command:
            result = self.ai("appointment-services", {"recordId": "77"})
        self.assertEqual(result["error"], "client_link_required")
        command.assert_not_called()

    def test_wrong_tenant_ambiguous_or_unowned_appointment_has_no_fallback(self):
        for reason in ("wrong_tenant", "ambiguous", "appointment_not_owned"):
            with self.subTest(reason=reason), patch.object(
                client_commands, "command", side_effect=ValueError(reason)
            ):
                result = self._call(
                    "appointment-services",
                    {"recordId": "77", "serviceIds": ["3"]},
                )
            self.assertEqual(
                result["error"], "client_link_or_appointment_authority_required"
            )

    def test_unknown_is_not_blindly_retried(self):
        with patch.object(
            client_commands,
            "command",
            return_value={
                "execution": {"executionId": "execution-u", "state": "UNKNOWN"}
            },
        ) as command:
            result = self._call(
                "appointment-services",
                {"recordId": "77", "serviceIds": ["3"]},
            )
        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        command.assert_called_once()

    def test_ai_appointment_path_has_no_phone_or_direct_provider_owner(self):
        source = (ROOT / "claude_ai.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        functions = {
            node.name: ast.get_source_segment(source, node) or ""
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        self.assertNotIn("_resolve_user_record_id", functions)
        self.assertNotIn("_check_record_ownership", functions)
        appointment_source = functions["_client_appointment_command"] + functions[
            "_execute_tool"
        ]
        for forbidden in (
            "yclients.update_booking",
            "yclients.reschedule_booking",
            "yclients.cancel_booking",
            "database.mark_reschedule_actor",
            "database.mark_cancel_actor",
        ):
            self.assertNotIn(forbidden, appointment_source)

    def test_legacy_journal_writers_fail_closed_without_mutation(self):
        names = {
            "panel_journal_attendance_handler",
            "panel_journal_add_service_handler",
            "panel_journal_set_services_handler",
            "panel_journal_set_duration_handler",
            "panel_journal_set_client_name_handler",
        }
        handlers = functions_from_source("webhook_server.py", names)
        for name in names:
            with self.subTest(name=name):
                result = asyncio.run(handlers[name](Request({"record_id": 77})))
                self.assertEqual(result["status"], 410)
                self.assertEqual(result["body"]["business_mutations"], 0)
                self.assertEqual(
                    result["body"]["canonical_authority"], "CrmStaffAccess"
                )

    def test_all_six_legacy_provider_sites_are_canonical_bridge_only(self):
        source = (ROOT / "yclients.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        functions = {
            node.name: ast.get_source_segment(source, node) or ""
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        for name, action in SIX_SITES.items():
            with self.subTest(name=name):
                body = functions[name]
                self.assertIn("dispatch_appointment_action", body)
                self.assertIn(action, body)
                self.assertNotIn("self._put", body)

    def test_transport_accepts_service_command_and_rejects_unknown_operation(self):
        self.assertIn(
            '"appointment-services"',
            (ROOT / "legacy_client_command_bridge.py").read_text(encoding="utf-8"),
        )
        with self.assertRaises(ValueError):
            client_commands.command("not-an-operation", "proof", {})


if __name__ == "__main__":
    unittest.main()
