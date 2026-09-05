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


class Package5B20CabinetProjectionTest(unittest.TestCase):
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
            "set_client_history_cache",
            "loyalty_balance",
            "get_active_subscription_for_client",
            "referral_stats_for_client",
            "create_client",
            "update_client",
        ):
            setattr(database, name, lambda *_a, _name=name, **_k: self.fail(
                f"B20 cabinet read called legacy business function {_name}"
            ))
        return ws

    @staticmethod
    def _verified_result():
        return {
            "linked": True,
            "known": True,
            "has_phone": True,
            "name": "Verified",
            "full_name": "Verified Client",
            "phone_tail": "1122",
            "booking_phone": "+79990001122",
            "upcoming": [],
            "history": [],
            "client_link_required": False,
            "business_mutations": 0,
        }

    def test_all_three_routes_use_the_same_canonical_projection(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        calls = []
        bridge.channel_proof = lambda headers, body: (
            "maya-proof" if headers.get("Authorization") else "telegram-proof"
        )
        bridge.command = lambda *args: calls.append(args) or self._verified_result()

        me = asyncio.run(ws.cabinet_me_handler(_Request()))
        login = asyncio.run(ws.cabinet_me_via_login_handler(
            _Request({"auth_data": {"id": 7, "hash": "signed"}}, {})
        ))
        session = asyncio.run(ws.cabinet_me_via_session_handler(
            _Request({}, {"Authorization": "Bearer canonical-session"})
        ))

        self.assertTrue(me["data"]["known"])
        self.assertTrue(login["data"]["known"])
        self.assertTrue(session["data"]["known"])
        self.assertEqual([call[0] for call in calls], ["cabinet-projection"] * 3)
        self.assertTrue(all(call[2] == {} for call in calls))

    def test_client_without_maya_user_works_with_verified_channel_link(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.channel_proof = lambda *_a: "verified-telegram-proof"
        bridge.command = lambda *_a: self._verified_result()

        result = asyncio.run(ws.cabinet_me_handler(_Request()))

        self.assertTrue(result["data"]["known"])
        self.assertEqual(result["data"]["full_name"], "Verified Client")

    def test_missing_revoked_wrong_tenant_or_ambiguous_link_exposes_no_pii(self):
        for state in ("missing", "revoked", "wrong_tenant", "ambiguous"):
            with self.subTest(state=state):
                ws = self._load()
                bridge = sys.modules["legacy_client_command_bridge"]
                bridge.channel_proof = lambda *_a: "verified-proof"
                bridge.command = lambda *_a: {
                    "linked": False,
                    "known": False,
                    "full_name": "must not escape",
                    "booking_phone": "+79990001122",
                }

                result = asyncio.run(ws.cabinet_me_handler(_Request()))

                self.assertEqual(result["data"]["full_name"], "")
                self.assertEqual(result["data"]["booking_phone"], "")
                self.assertTrue(result["data"]["client_link_required"])

    def test_legacy_session_raw_identity_and_caller_identity_fail_closed(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.channel_proof = lambda *_a: (_ for _ in ()).throw(
            ValueError("verified_channel_required")
        )
        for headers in (
            {"X-Session-Token": "legacy-chat-session"},
            {"X-Chat-Id": "777"},
            {"X-Phone": "+79990001122"},
            {"X-Client-Id": "client-other"},
        ):
            result = asyncio.run(ws.cabinet_me_via_session_handler(_Request({}, headers)))
            self.assertEqual(result["data"]["booking_phone"], "")
            self.assertFalse(result["data"]["known"])

    def test_login_accepts_only_the_signed_channel_object(self):
        ws = self._load()
        for body in (
            {"auth_data": {}, "clientId": "forged"},
            {"auth_data": {}, "phone": "+79990001122"},
            {"auth_data": {}, "chat_id": 7},
        ):
            result = asyncio.run(ws.cabinet_me_via_login_handler(_Request(body, {})))
            self.assertEqual(result["status"], 400)

    def test_consent_without_verified_binding_never_releases_pii(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.channel_proof = lambda *_a: "verified-proof"
        bridge.command = lambda *_a: {
            "linked": True,
            "known": False,
            "needs_consent": True,
            "full_name": "must not escape",
            "booking_phone": "+79990001122",
        }

        result = asyncio.run(ws.cabinet_me_handler(_Request()))

        self.assertEqual(result["status"], 403)
        self.assertEqual(result["data"]["full_name"], "")
        self.assertEqual(result["data"]["booking_phone"], "")

    def test_repeated_concurrent_reads_and_failures_leave_all_state_unchanged(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.channel_proof = lambda *_a: "verified-proof"
        bridge.command = lambda *_a: self._verified_result()
        state = {
            "clients": 9,
            "links": 4,
            "profiles": {"generation": 3},
            "consents": 11,
            "history": ["immutable"],
            "conversations": ["immutable"],
        }
        before = copy.deepcopy(state)

        async def read_many():
            return await asyncio.gather(
                *(ws.cabinet_me_handler(_Request()) for _ in range(16))
            )

        results = asyncio.run(read_many())
        self.assertTrue(all(item["status"] == 200 for item in results))
        self.assertEqual(state, before)

        bridge.command = lambda *_a: (_ for _ in ()).throw(RuntimeError("down"))
        failed = asyncio.run(ws.cabinet_me_handler(_Request()))
        self.assertEqual(failed["status"], 503)
        self.assertEqual(state, before)


if __name__ == "__main__":
    unittest.main()
