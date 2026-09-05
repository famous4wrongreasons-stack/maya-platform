import asyncio
import os
import sys
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from test_chat_routing import _load_webhook_server


class _Request:
    def __init__(self, body=None, headers=None):
        self._body = {"record_id": 77} if body is None else body
        self.headers = headers or {"X-Telegram-InitData": "verified-init-data"}

    async def json(self):
        return self._body


def _execution(state="SUCCEEDED", execution_id="execution-1"):
    return {
        "contract": "maya.client-appointment-command-result/1",
        "execution_owner": "action_engine",
        "execution": {
            "contract": "maya.action-execution-result/1",
            "executionId": execution_id,
            "state": state,
        },
    }


class Package5B17ClientAppointmentAuthorityTest(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def _load(self):
        ws = _load_webhook_server()

        class _Response(dict):
            def __init__(self, data, status):
                super().__init__(data=data, status=status)
                self.headers = {}

        ws._cabinet_response = lambda data, status=200: _Response(data, status)
        database = sys.modules["database"]
        for name in (
            "get_client",
            "get_or_create_client",
            "has_valid_consent_by_chat_id",
            "mark_cancel_actor",
            "mark_reschedule_actor",
            "pop_recent_cancel_actor",
            "pop_recent_reschedule_actor",
            "create_client",
            "update_client",
        ):
            setattr(database, name, lambda *_a, _name=name, **_k: self.fail(
                f"B17 route called legacy identity/business function {_name}"
            ))
        ws._yc.cancel_booking = lambda *_a, **_k: self.fail(
            "B17 route called direct legacy cancel helper"
        )
        ws._yc.reschedule_booking = lambda *_a, **_k: self.fail(
            "B17 route called direct legacy reschedule helper"
        )
        return ws

    def test_verified_client_cancel_uses_canonical_command(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _execution()

        result = asyncio.run(ws.client_cancel_record_handler(_Request()))

        self.assertEqual(result["status"], 200)
        self.assertTrue(result["data"]["success"])
        self.assertEqual(
            calls,
            [("appointment-cancel", "verified-proof", {"recordId": "77"})],
        )

    def test_verified_client_without_maya_user_can_reschedule(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _execution()

        result = asyncio.run(ws.client_reschedule_record_handler(_Request({
            "record_id": 77,
            "datetime": "2099-07-21T16:30:00+03:00",
        })))

        self.assertEqual(result["status"], 200)
        self.assertEqual(
            calls,
            [(
                "appointment-reschedule",
                "verified-proof",
                {"recordId": "77", "start": "2099-07-21T16:30:00+03:00"},
            )],
        )

    def test_missing_revoked_wrong_tenant_or_ambiguous_link_fails_closed(self):
        for state in ("missing", "revoked", "wrong_tenant", "ambiguous"):
            with self.subTest(state=state):
                ws = self._load()
                bridge = sys.modules["legacy_client_command_bridge"]
                bridge.command = lambda *_a: (_ for _ in ()).throw(
                    ValueError("client_link_or_authority_required")
                )

                result = asyncio.run(ws.client_cancel_record_handler(_Request()))

                self.assertEqual(result["status"], 403)
                self.assertEqual(result["data"]["code"], "client_link_required")

    def test_phone_chat_client_and_tenant_fields_are_never_authority(self):
        for field, value in (
            ("phone", "+79990001122"),
            ("chat_id", 42),
            ("clientId", "client-2"),
            ("client_id", "client-2"),
            ("tenantId", "tenant-2"),
        ):
            with self.subTest(field=field):
                ws = self._load()
                bridge = sys.modules["legacy_client_command_bridge"]
                bridge.command = lambda *_a: self.fail("forged payload reached command")

                result = asyncio.run(ws.client_cancel_record_handler(_Request({
                    "record_id": 77,
                    field: value,
                })))

                self.assertEqual(result["status"], 403)
                self.assertEqual(result["data"]["code"], "client_link_required")

    def test_legacy_session_alone_is_not_client_or_appointment_authority(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.channel_proof = lambda *_a: (_ for _ in ()).throw(
            ValueError("verified_channel_required")
        )

        result = asyncio.run(ws.client_cancel_record_handler(_Request(
            {"record_id": 77, "session_token": "legacy"}, {},
        )))

        self.assertEqual(result["status"], 403)
        self.assertEqual(result["data"]["code"], "client_link_required")

    def test_retry_and_concurrent_requests_keep_exact_canonical_input(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or _execution()

        async def run_many():
            return await asyncio.gather(*(
                ws.client_cancel_record_handler(_Request()) for _ in range(8)
            ))

        results = asyncio.run(run_many())

        self.assertTrue(all(result["status"] == 200 for result in results))
        self.assertEqual(
            set(repr(call) for call in calls),
            {repr(("appointment-cancel", "verified-proof", {"recordId": "77"}))},
        )

    def test_unknown_is_preserved_without_blind_retry(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: _execution("UNKNOWN", "execution-unknown")

        result = asyncio.run(ws.client_cancel_record_handler(_Request()))

        self.assertEqual(result["status"], 202)
        self.assertTrue(result["data"]["unknown"])
        self.assertFalse(result["data"]["retry_allowed"])
        self.assertEqual(result["data"]["execution_id"], "execution-unknown")

    def test_downstream_failure_has_no_legacy_fallback_or_marker(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: (_ for _ in ()).throw(
            RuntimeError("canonical backend unavailable")
        )

        result = asyncio.run(ws.client_cancel_record_handler(_Request()))

        self.assertEqual(result["status"], 503)
        self.assertEqual(result["data"]["code"], "appointment_command_unavailable")


if __name__ == "__main__":
    unittest.main()
