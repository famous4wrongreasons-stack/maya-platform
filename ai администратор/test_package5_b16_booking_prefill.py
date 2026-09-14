import asyncio
import copy
import os
import sys
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from test_chat_routing import _load_webhook_server


class _Request:
    def __init__(self, body=None, headers=None):
        self._body = {} if body is None else body
        self.headers = headers or {"X-Telegram-InitData": "verified-init-data"}

    async def json(self):
        return self._body


class Package5B16BookingPrefillTest(unittest.TestCase):
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
            "create_client",
            "update_client",
        ):
            setattr(database, name, lambda *_a, _name=name, **_k: self.fail(
                f"read-only prefill called legacy business function {_name}"
            ))
        return ws

    @staticmethod
    def _verified_result():
        return {
            "linked": True,
            "known": True,
            "has_phone": True,
            "name": "Verified client",
            "phone": "+79990001122",
            "client_link_required": False,
        }

    def test_verified_link_returns_only_canonical_prefill(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.command = lambda *args: calls.append(args) or self._verified_result()

        result = asyncio.run(ws.booking_prefill_handler(_Request()))

        self.assertEqual(result["status"], 200)
        self.assertEqual(result["data"]["name"], "Verified client")
        self.assertEqual(result["data"]["phone"], "+79990001122")
        self.assertEqual(calls, [("booking-prefill", "verified-proof", {})])

    def test_client_without_maya_user_is_supported_by_verified_link_projection(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: self._verified_result()

        result = asyncio.run(ws.booking_prefill_handler(_Request()))

        self.assertTrue(result["data"]["known"])
        self.assertFalse(result["data"]["client_link_required"])

    def test_missing_revoked_wrong_tenant_or_ambiguous_link_returns_no_pii(self):
        for state in ("missing", "revoked", "wrong_tenant", "ambiguous"):
            with self.subTest(state=state):
                ws = self._load()
                bridge = sys.modules["legacy_client_command_bridge"]
                bridge.command = lambda *_a: {
                    "linked": False,
                    "client_link_required": True,
                }

                result = asyncio.run(ws.booking_prefill_handler(_Request()))

                self.assertEqual(result["data"]["name"], "")
                self.assertEqual(result["data"]["phone"], "")
                self.assertTrue(result["data"]["client_link_required"])

    def test_forged_chat_phone_or_client_id_returns_no_pii(self):
        for field, value in (
            ("chat_id", 777),
            ("phone", "+79990001122"),
            ("clientId", "forged-client"),
        ):
            with self.subTest(field=field):
                ws = self._load()
                result = asyncio.run(
                    ws.booking_prefill_handler(_Request({field: value}))
                )
                self.assertEqual(result["data"]["name"], "")
                self.assertEqual(result["data"]["phone"], "")
                self.assertTrue(result["data"]["client_link_required"])

    def test_legacy_session_without_trusted_channel_fails_closed(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.channel_proof = lambda *_a: (_ for _ in ()).throw(
            ValueError("verified_channel_required")
        )

        result = asyncio.run(
            ws.booking_prefill_handler(_Request({"session_token": "legacy"}, {}))
        )

        self.assertEqual(result["status"], 200)
        self.assertEqual(result["data"]["phone"], "")
        self.assertTrue(result["data"]["client_link_required"])

    def test_consent_is_not_identity_and_discloses_no_pii(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: {
            "linked": True,
            "known": True,
            "needs_consent": True,
            "name": "must not escape",
            "phone": "+79990001122",
            "client_link_required": False,
        }

        result = asyncio.run(ws.booking_prefill_handler(_Request()))

        self.assertTrue(result["data"]["needs_consent"])
        self.assertEqual(result["data"]["name"], "")
        self.assertEqual(result["data"]["phone"], "")

    def test_repeated_and_concurrent_reads_do_not_change_legacy_state(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        database = sys.modules["database"]
        database._b16_state = {"clients": 9, "links": 4, "consents": 11}
        before = copy.deepcopy(database._b16_state)
        bridge.command = lambda *_a: self._verified_result()

        async def read_many():
            return await asyncio.gather(
                *(ws.booking_prefill_handler(_Request()) for _ in range(12))
            )

        results = asyncio.run(read_many())

        self.assertTrue(all(item["status"] == 200 for item in results))
        self.assertEqual(database._b16_state, before)

    def test_bridge_failure_has_no_legacy_fallback(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_a: (_ for _ in ()).throw(
            RuntimeError("unavailable")
        )

        result = asyncio.run(ws.booking_prefill_handler(_Request()))

        self.assertEqual(result["status"], 503)
        self.assertEqual(result["data"]["error"], "booking_prefill_unavailable")


if __name__ == "__main__":
    unittest.main()
