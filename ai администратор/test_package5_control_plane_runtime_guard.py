import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    "package5_control_plane_runtime_guard",
    ROOT / "package5_control_plane_runtime_guard.py",
)
guard = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = guard
SPEC.loader.exec_module(guard)


class Package5ControlPlaneRuntimeGuardTest(unittest.TestCase):
    def test_active_source_is_protected(self):
        self.assertEqual([], guard.scan_runtime(ROOT))

    def _web_bypass(self, function_name: str, needle: str):
        source = (ROOT / "webhook_server.py").read_text(encoding="utf-8")
        functions = guard._functions(source, "webhook_server.py")
        original = functions[function_name]
        injected = source.replace(original, original + "\n    " + needle + "\n", 1)
        findings = guard.scan_runtime(ROOT, {"webhook_server.py": injected})
        called = needle.split("(", 1)[0]
        symbols = {called, called.rsplit(".", 1)[-1], "panel_manager_ids"}
        self.assertTrue(any(any(symbol in item.detail for symbol in symbols) for item in findings), findings)

    def test_direct_staff_writer_fails(self):
        self._web_bypass("panel_team_handler", "database.set_cashier_role(1, True)")

    def test_raw_manager_authority_fails(self):
        self._web_bypass("_panel_resolve_role", 'database.get_setting("panel_manager_ids")')

    def test_direct_goal_writer_fails(self):
        self._web_bypass("panel_plan_target_handler", 'database.set_setting("owner_daily_target_rub", "1")')

    def test_god_tenant_writer_fails(self):
        self._web_bypass("god_subscribers_handler", 'database.add_maya_tenant("x", plan="pro", mrr=1)')

    def test_god_billing_settings_writer_fails(self):
        self._web_bypass("god_billing_handler", 'database.set_setting("god_ai_budget_usd", "1")')

    def test_god_overview_legacy_projection_fails(self):
        self._web_bypass("god_overview_handler", "database.list_maya_tenants()")

    def test_god_health_write_probe_fails(self):
        self._web_bypass("_god_health_checks", 'database.set_setting("god_probe_ts", "today")')

    def test_retired_renewal_reader_fails(self):
        self._web_bypass("_god_renewals_view", 'database.get_setting("god_renewals")')

    def test_chat_history_save_fails(self):
        self._web_bypass("chat_history_handler", "memory.save_conversations({})")

    def test_chat_history_client_creation_fails(self):
        self._web_bypass("chat_history_handler", "database.get_or_create_client(1)")

    def test_chat_history_recommendation_creation_fails(self):
        self._web_bypass(
            "chat_history_handler",
            '_store_assistant_message_in_chat(1, "offer")',
        )

    def test_booking_prefill_raw_chat_id_resolution_fails(self):
        self._web_bypass("booking_prefill_handler", "database.get_client(chat_id)")

    def test_booking_prefill_legacy_session_authority_fails(self):
        self._web_bypass("booking_prefill_handler", "_authed_chat_id(request, body)")

    def test_booking_prefill_hidden_client_creation_fails(self):
        self._web_bypass("booking_prefill_handler", "database.get_or_create_client(1)")

    def test_booking_prefill_phone_only_projection_fails(self):
        self._web_bypass("booking_prefill_handler", 'database.get_client(body.get("phone"))')

    def test_client_cancel_legacy_session_authority_fails(self):
        self._web_bypass("_client_record_request_context", "_authed_chat_id(request, body)")

    def test_client_cancel_phone_identity_fails(self):
        self._web_bypass("_client_record_request_context", 'database.get_client(body.get("phone"))')

    def test_client_cancel_direct_provider_writer_fails(self):
        self._web_bypass("client_cancel_record_handler", "_yc.cancel_booking(77)")

    def test_client_reschedule_direct_provider_writer_fails(self):
        self._web_bypass("client_reschedule_record_handler", "_yc.reschedule_booking(77)")

    def test_client_record_legacy_owner_module_fails(self):
        source = (ROOT / "client_record_actions.py").read_text(encoding="utf-8")
        findings = guard.scan_runtime(
            ROOT,
            {"client_record_actions.py": source + "\n\ndef cancel_for_client():\n    pass\n"},
        )
        self.assertTrue(
            any(item.check == "b17_client_appointment_owner" for item in findings),
            findings,
        )

    def test_marked_future_read_surface_writer_fails(self):
        source = (ROOT / "webhook_server.py").read_text(encoding="utf-8")
        injected = source + (
            "\n\ndef future_read_handler():\n"
            "    # p5_b15_chat_history_read_only\n"
            "    database.update_client(1)\n"
        )
        findings = guard.scan_runtime(ROOT, {"webhook_server.py": injected})
        self.assertTrue(
            any(item.check == "read_only_business_boundary" for item in findings),
            findings,
        )

    def test_later_pwa_control_plane_writer_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            (temp_root / "later_route.py").write_text(
                'database.set_maya_tenant_status(1, "active")\n', encoding="utf-8"
            )
            overrides = {
                name: (ROOT / name).read_text(encoding="utf-8")
                for name in ("webhook_server.py", "database.py", "growth_planner.py")
            }
            findings = guard.scan_runtime(temp_root, overrides)
        self.assertTrue(any(item.check == "later_pwa_module" for item in findings), findings)

    def test_later_pwa_god_settings_and_projection_bypasses_fail(self):
        for bypass in (
            'database.set_setting("god_renewals", "[]")',
            'database.set_setting("god_ai_budget_usd", "10")',
            'database.list_maya_tenants()',
        ):
            with tempfile.TemporaryDirectory() as tmp:
                temp_root = Path(tmp)
                (temp_root / "later_route.py").write_text(bypass + "\n", encoding="utf-8")
                overrides = {
                    name: (ROOT / name).read_text(encoding="utf-8")
                    for name in ("webhook_server.py", "database.py", "growth_planner.py")
                }
                findings = guard.scan_runtime(temp_root, overrides)
            self.assertTrue(any(item.check == "later_pwa_module" for item in findings), findings)

    def test_bind_cli_cannot_restore_create_reset_or_delete(self):
        source = (ROOT / "generate_bind_codes.py").read_text(encoding="utf-8")
        for bypass in (
            "database.create_master_with_bind_code(1, 'x')",
            "database.reset_master_bind_code(1, 'x')",
            'conn.execute("DELETE FROM masters_telegram")',
        ):
            findings = guard.scan_runtime(
                ROOT,
                {"generate_bind_codes.py": source + "\n" + bypass},
            )
            self.assertTrue(any(item.check == "legacy_bind_cli" for item in findings), findings)


if __name__ == "__main__":
    unittest.main()
