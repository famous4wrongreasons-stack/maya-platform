import asyncio
import copy
import json
import os
import sys
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from test_chat_routing import _load_webhook_server


class _Request:
    def __init__(self, body=None):
        self._body = body or {}
        self.headers = {"X-Telegram-InitData": "verified-init-data"}

    async def json(self):
        return self._body


class Package5B15ChatHistoryTest(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def _load(self):
        ws = _load_webhook_server()
        ws._resolve_chat_tg_user = lambda _request, _body: {"id": 12345}
        ws._chat_effective_mode = lambda _body, _chat_id: "client"
        ws._cabinet_response = lambda data, status=200: {"data": data, "status": status}
        return ws

    @staticmethod
    def _state_bytes(memory):
        return json.dumps(memory._store, sort_keys=True, ensure_ascii=False).encode()

    def test_verified_link_returns_history_without_any_business_write(self):
        ws = self._load()
        memory = sys.modules["memory"]
        database = sys.modules["database"]
        key = ws._chat_history_key(12345, "client")
        memory._store[key] = [
            {"role": "user", "content": "Привет"},
            {"role": "assistant", "content": "Историческая рекомендация"},
        ]
        before = self._state_bytes(memory)
        memory.save_conversations = lambda _value: self.fail("read wrote history")
        database.get_or_create_client = lambda *_a, **_k: self.fail("read created Client")
        ws._ensure_client_loyalty_chat_offer = lambda *_a: self.fail("read created loyalty offer")
        ws._ensure_client_repeat_booking_offer = lambda *_a: self.fail("read created repeat offer")

        result = asyncio.run(ws.chat_history_handler(_Request()))

        self.assertEqual(result["status"], 200)
        self.assertEqual([item["id"] for item in result["data"]["messages"]], [0, 1])
        self.assertEqual(self._state_bytes(memory), before)

    def test_repeated_and_concurrent_reads_are_byte_equivalent(self):
        ws = self._load()
        memory = sys.modules["memory"]
        key = ws._chat_history_key(12345, "client")
        memory._store[key] = [
            {"role": "user", "content": "Повтори"},
            {"role": "assistant", "content": "Без записи"},
        ]
        before = self._state_bytes(memory)

        async def read_many():
            return await asyncio.gather(
                *(ws.chat_history_handler(_Request()) for _ in range(8))
            )

        results = asyncio.run(read_many())

        self.assertTrue(all(item["status"] == 200 for item in results))
        self.assertTrue(all(item["data"] == results[0]["data"] for item in results))
        self.assertEqual(self._state_bytes(memory), before)

    def test_missing_or_ambiguous_verified_client_link_fails_closed(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        memory = sys.modules["memory"]
        before = self._state_bytes(memory)
        bridge.command = lambda *_args: {
            "linked": False,
            "privacy": False,
            "client_link_required": True,
        }

        result = asyncio.run(ws.chat_history_handler(_Request()))

        self.assertEqual(result["status"], 403)
        self.assertEqual(result["data"]["error"], "verified_client_link_required")
        self.assertEqual(self._state_bytes(memory), before)

    def test_phone_or_payload_client_id_cannot_replace_channel_proof(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        memory = sys.modules["memory"]
        before = self._state_bytes(memory)
        bridge.channel_proof = lambda *_args: (_ for _ in ()).throw(
            ValueError("verified_channel_required")
        )

        result = asyncio.run(
            ws.chat_history_handler(
                _Request({"phone": "+79990000000", "clientId": "forged"})
            )
        )

        self.assertEqual(result["status"], 403)
        self.assertEqual(self._state_bytes(memory), before)

    def test_privacy_consent_is_checked_by_canonical_status(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        bridge.command = lambda *_args: {
            "linked": True,
            "privacy": False,
            "client_link_required": False,
        }

        result = asyncio.run(ws.chat_history_handler(_Request()))

        self.assertEqual(result["status"], 403)
        self.assertEqual(result["data"]["error"], "needs_consent")

    def test_canonical_identity_outage_does_not_fall_back_to_legacy(self):
        ws = self._load()
        bridge = sys.modules["legacy_client_command_bridge"]
        memory = sys.modules["memory"]
        before = copy.deepcopy(memory._store)
        bridge.command = lambda *_args: (_ for _ in ()).throw(
            RuntimeError("client_bridge_unavailable")
        )

        result = asyncio.run(ws.chat_history_handler(_Request()))

        self.assertEqual(result["status"], 503)
        self.assertEqual(result["data"]["error"], "chat_history_unavailable")
        self.assertEqual(memory._store, before)

    def test_retired_read_offer_hooks_have_no_side_effect(self):
        ws = self._load()
        memory = sys.modules["memory"]
        before = self._state_bytes(memory)

        self.assertFalse(ws._ensure_client_loyalty_chat_offer(12345))
        self.assertFalse(ws._ensure_client_repeat_booking_offer(12345))
        self.assertEqual(self._state_bytes(memory), before)


if __name__ == "__main__":
    unittest.main()
