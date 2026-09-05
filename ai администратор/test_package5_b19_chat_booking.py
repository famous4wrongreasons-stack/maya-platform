import os
import sys
import types
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from test_chat_routing import _load_webhook_server


BOOKING = {
    "staff_id": 7,
    "service_ids": [2, 1, 2],
    "staff_name": "Verified staff",
    "service_names": ["Service two", "Service one"],
    "datetime_str": "2099-04-05T09:00:00+03:00",
    "pay_with_points": ["Service two"],
}


def _result(state="SUCCEEDED"):
    return {
        "contract": "maya.client-appointment-command-result/1",
        "identity_authority": "verified_client_channel_link",
        "execution_owner": "action_engine",
        "provider_writes_outside_canonical_executor": 0,
        "safe_explanation": "Операция не выполнена.",
        "execution": {
            "contract": "maya.action-execution-result/1",
            "executionId": "execution-1",
            "state": state,
        },
    }


class Package5B19ChatBookingTest(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def _load(self):
        ws = _load_webhook_server()
        database = sys.modules["database"]
        for name in (
            "get_client",
            "get_or_create_client",
            "save_booking",
            "get_notify_prefs_by_chat_id",
            "loyalty_balance",
            "create_client",
            "update_client",
        ):
            setattr(database, name, lambda *_a, _name=name, **_k: self.fail(
                f"B19 booking called legacy identity/business function {_name}"
            ))
        ws._yc.create_booking = lambda *_a, **_k: self.fail(
            "B19 booking called the legacy appointment bridge"
        )
        return ws

    def _context(self):
        return types.SimpleNamespace(proof="verified-proof", intent="intent-hash")

    def test_verified_client_chat_and_stream_share_one_canonical_command(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _result()

        normal = ws._finalize_booking_for_chat(self._context(), dict(BOOKING))
        stream = ws._finalize_booking_for_chat(self._context(), dict(BOOKING))

        self.assertIn("Готово", normal)
        self.assertEqual(normal, stream)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0], calls[1])
        operation, proof, payload = calls[0]
        self.assertEqual(operation, "appointment-create")
        self.assertEqual(proof, "verified-proof")
        self.assertEqual(
            set(payload), {"idempotencyKey", "staffId", "serviceIds", "start"}
        )
        self.assertTrue(payload["idempotencyKey"].startswith("chat-booking:"))
        self.assertNotIn("clientId", payload)
        self.assertNotIn("phone", payload)
        self.assertNotIn("pay_with_points", payload)

    def test_missing_revoked_ambiguous_or_legacy_session_binding_fails_closed(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: self.fail("missing context reached command")

        reply = ws._finalize_booking_for_chat(None, dict(BOOKING))

        self.assertIn("подтвердите связь", reply)
        self.assertIn("ничего не создала", reply)

    def test_forged_chat_phone_and_client_fields_never_reach_command(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _result()
        forged = {
            **BOOKING,
            "chat_id": 999,
            "phone": "+79990009988",
            "clientId": "client-2",
            "tenantId": "tenant-2",
        }

        ws._finalize_booking_for_chat(self._context(), forged)

        payload = calls[0][2]
        self.assertTrue(
            {"chat_id", "phone", "clientId", "tenantId"}.isdisjoint(payload)
        )

    def test_duplicate_concurrent_and_restart_attempts_keep_one_durable_identity(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _result()

        for _ in range(12):
            ws._finalize_booking_for_chat(self._context(), dict(BOOKING))

        identities = {call[2]["idempotencyKey"] for call in calls}
        self.assertEqual(len(identities), 1)

    def test_unknown_is_preserved_without_blind_retry_or_legacy_fallback(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _result("UNKNOWN")

        reply = ws._finalize_booking_for_chat(self._context(), dict(BOOKING))

        self.assertIn("уточняется", reply)
        self.assertIn("Не повторяйте", reply)
        self.assertEqual(len(calls), 1)

    def test_failure_does_not_enter_booking_cache_or_loyalty(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: _result("FAILED")

        reply = ws._finalize_booking_for_chat(self._context(), dict(BOOKING))

        self.assertEqual(reply, "Операция не выполнена.")


if __name__ == "__main__":
    unittest.main()
