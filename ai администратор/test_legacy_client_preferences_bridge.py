import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import legacy_client_preferences_bridge as bridge
from test_legacy_client_command_bridge import Request, functions_from_source


class ClientPreferencesBridgeTests(unittest.TestCase):
    def setUp(self):
        self.handlers = functions_from_source("webhook_server.py", {"notify_prefs_handler", "set_visit_mood_handler", "_apply_client_reminder_pref"}, {"database": Mock()})

    def test_empty_request_only_reads_and_never_creates_client(self):
        with patch.object(bridge, "command", return_value={"prefs": {}}) as command:
            result = asyncio.run(self.handlers["notify_prefs_handler"](Request({}, {"Authorization": "Bearer synthetic"})))
            self.assertEqual(result["status"], 200)
            self.assertEqual([call.args[0] for call in command.call_args_list], ["read"])
            self.handlers["database"].assert_not_called()
            self.assertEqual(self.handlers["database"].mock_calls, [])

    def test_mutation_preserves_exact_patch_identity_and_generation(self):
        body = {"prefs": {"reminder": False}, "expectedGeneration": 3, "idempotencyKey": "synthetic-request"}
        with patch.object(bridge, "command", side_effect=[{"outcome": "updated"}, {"prefs": body["prefs"]}]) as command:
            result = asyncio.run(self.handlers["notify_prefs_handler"](Request(body, {"X-Telegram-InitData": "synthetic"})))
            self.assertEqual(result["status"], 200)
            self.assertEqual(command.call_args_list[0].args[2], body)
            self.assertEqual([call.args[0] for call in command.call_args_list], ["notifications", "read"])

    def test_forged_identity_or_legacy_session_cannot_dispatch(self):
        for extra in [{"clientId": "forged"}, {"tenantId": "forged"}, {"phone": "synthetic"}, {"session_token": "legacy"}]:
            with patch.object(bridge, "command") as command:
                result = asyncio.run(self.handlers["notify_prefs_handler"](Request(extra)))
                self.assertEqual(result["status"], 409)
                command.assert_not_called()

    def test_upstream_failure_does_not_fall_back_to_sql_or_create_client(self):
        with patch.object(bridge, "command", side_effect=ValueError("rejected")):
            result = asyncio.run(self.handlers["notify_prefs_handler"](Request({"prefs": {"reminder": False}, "expectedGeneration": 0, "idempotencyKey": "synthetic-request"}, {"Authorization": "Bearer synthetic"})))
            self.assertEqual(result["status"], 409)
            self.assertEqual(self.handlers["database"].mock_calls, [])

    def test_mood_is_one_canonical_command_and_no_provider_call(self):
        with patch.object(bridge, "command", return_value={"outcome": "updated"}) as command:
            result = asyncio.run(self.handlers["set_visit_mood_handler"](Request({"record_id": 123, "mood": "red", "expectedGeneration": 0, "idempotencyKey": "synthetic-request"}, {"Authorization": "Bearer synthetic"})))
            self.assertEqual(result["status"], 200)
            self.assertEqual(command.call_args.args[0], "visit-mood")
            self.assertEqual(command.call_args.args[2]["recordId"], "123")
            self.assertEqual(self.handlers["database"].mock_calls, [])

    def test_webhook_observation_cannot_synchronize_preferences(self):
        asyncio.run(self.handlers["_apply_client_reminder_pref"]({"client": {"phone": "synthetic"}}, 123))
        self.assertEqual(self.handlers["database"].mock_calls, [])

    def test_delivery_read_missing_binding_and_failure_are_closed(self):
        with patch.object(bridge, "command", return_value={"linked": False}):
            result = bridge.delivery_preferences(123)
            self.assertIs(result["reminder"], False)
            self.assertIs(result["marketing"], False)
        with patch.object(bridge, "command", side_effect=RuntimeError("unavailable")):
            self.assertIs(bridge.delivery_preferences(123)["reminder"], False)

    def test_delivery_reader_preserves_sparse_overrides_and_server_quiet_time(self):
        with patch.object(bridge, "command", return_value={"linked": True, "prefs": {"marketing": False}, "quietNow": True}):
            result = bridge.delivery_preferences(123)
            self.assertNotIn("reminder_hours", result)
            self.assertNotIn("reminder", result)
            self.assertIs(result["_canonical_quiet_now"], True)

    def test_legacy_sql_writers_fail_closed(self):
        scope = functions_from_source("database.py", {"set_notify_prefs", "set_visit_mood"})
        with self.assertRaises(RuntimeError): scope["set_notify_prefs"](1, {"reminder": False})
        with self.assertRaises(RuntimeError): scope["set_visit_mood"](1, "red")

    def test_visit_projection_batches_and_has_no_sql_fallback(self):
        with patch.object(bridge, "command", return_value={"moods": {"1": "blue"}}) as command:
            self.assertEqual(bridge.visit_projection(range(1, 203)), {1: "blue"})
            self.assertEqual(command.call_count, 2)
        with patch.object(bridge, "command", side_effect=RuntimeError("unavailable")):
            self.assertEqual(bridge.visit_projection([1]), {})


if __name__ == "__main__":
    unittest.main()
