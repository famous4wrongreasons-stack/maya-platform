import asyncio
import os
import sys
import types
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from test_chat_routing import _load_webhook_server


class _Request:
    def __init__(self, body):
        self._body = body
        self.headers = {}

    async def json(self):
        return self._body


class ChatMessageIdTests(unittest.TestCase):
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

    def test_legacy_history_gets_unique_stable_server_ids(self):
        ws = self._load()
        duplicate_id = ws._new_chat_message_id()
        legacy = [
            {"role": "user", "content": "Привет"},
            {"id": duplicate_id, "role": "assistant", "content": "Здравствуйте"},
            {"id": duplicate_id, "role": "user", "content": "Запишите меня"},
        ]

        migrated, changed = ws._ensure_chat_history_ids(legacy)
        first_ids = [item["id"] for item in migrated]
        migrated_again, changed_again = ws._ensure_chat_history_ids(migrated)

        self.assertTrue(changed)
        self.assertFalse(changed_again)
        self.assertEqual(first_ids, [item["id"] for item in migrated_again])
        self.assertEqual(len(first_ids), len(set(first_ids)))
        self.assertTrue(all(ws._is_chat_message_id(value) for value in first_ids))
        self.assertEqual(first_ids, [item["id"] for item in ws._chat_history_payload(migrated)])

    def test_chat_response_exposes_both_turn_ids(self):
        ws = self._load()
        history = [
            ws._user_history_item("Когда можно записаться?"),
            ws._assistant_history_item("Сегодня в 18:00."),
        ]

        payload = ws._with_chat_turn_ids({"reply": "Сегодня в 18:00."}, history)

        self.assertEqual(payload["user_message_id"], history[0]["id"])
        self.assertEqual(payload["message_id"], history[1]["id"])
        self.assertEqual(payload["id"], history[1]["id"])

    def test_history_handler_persists_migrated_ids(self):
        ws = self._load()
        memory = sys.modules["memory"]
        key = ws._chat_history_key(12345, "client")
        memory._store[key] = [
            {"role": "user", "content": "Привет"},
            {"role": "assistant", "content": "Здравствуйте"},
        ]

        first = asyncio.run(ws.chat_history_handler(_Request({})))
        first_ids = [item["id"] for item in first["data"]["messages"]]
        second = asyncio.run(ws.chat_history_handler(_Request({})))
        second_ids = [item["id"] for item in second["data"]["messages"]]

        self.assertEqual(first["status"], 200)
        self.assertEqual(first_ids, second_ids)
        self.assertEqual(first_ids, [item["id"] for item in memory._store[key]])
        self.assertTrue(all(ws._is_chat_message_id(value) for value in first_ids))

    def test_history_handler_does_not_prune_messages(self):
        ws = self._load()
        memory = sys.modules["memory"]
        key = ws._chat_history_key(12345, "client")
        memory._store[key] = [
            ws._assistant_history_item(f"Сообщение {index}")
            for index in range(45)
        ]

        response = asyncio.run(ws.chat_history_handler(_Request({})))

        self.assertEqual(len(response["data"]["messages"]), 45)
        self.assertEqual(len(memory._store[key]), 45)

    def test_successful_staff_telegram_message_is_mirrored_once(self):
        ws = self._load()
        memory = sys.modules["memory"]
        database = sys.modules["database"]
        vault = {}
        fake_pii_crypto = types.ModuleType("pii_crypto")

        def _encrypt(text):
            token = f"encrypted-{len(vault) + 1}"
            vault[token] = text
            return token

        fake_pii_crypto.encrypt = _encrypt
        fake_pii_crypto.decrypt = lambda token: vault.get(token)
        sys.modules["pii_crypto"] = fake_pii_crypto
        database.get_master_by_chat_id = lambda chat_id: (
            {"telegram_chat_id": chat_id, "yclients_staff_id": 7}
            if int(chat_id) == 12345 else None
        )

        class FakeBot:
            async def send_message(self, chat_id, text, **_kwargs):
                return {"chat_id": chat_id, "text": text}

        bot = FakeBot()
        self.assertTrue(ws.install_staff_telegram_chat_mirror(bot))
        asyncio.run(bot.send_message(chat_id=12345, text="MAYA · план на сегодня"))
        asyncio.run(bot.send_message(chat_id=12345, text="MAYA · план на сегодня"))

        key = ws._chat_history_key(12345, "staff")
        self.assertEqual(len(memory._store[key]), 1)
        stored = memory._store[key][0]
        self.assertTrue(stored["protected"])
        self.assertNotIn("план на сегодня", stored["content"])
        self.assertNotIn("план на сегодня", stored["content_enc"])
        self.assertEqual(
            ws._chat_history_payload([stored])[0]["text"],
            "MAYA · план на сегодня",
        )

    def test_delete_uses_exact_server_id_even_when_text_is_duplicated(self):
        ws = self._load()
        memory = sys.modules["memory"]
        key = ws._chat_history_key(12345, "client")
        first = ws._user_history_item("Да")
        answer = ws._assistant_history_item("Продолжаем")
        latest = ws._user_history_item("Да")
        memory._store[key] = [first, answer, latest]

        response = asyncio.run(ws.chat_delete_handler(_Request({
            "delete_mode": "one",
            "message_id": first["id"],
            "role": "user",
            "text": "Да",
        })))

        remaining_ids = [item["id"] for item in memory._store[key]]
        self.assertTrue(response["data"]["deleted"])
        self.assertEqual(response["data"]["deleted_id"], first["id"])
        self.assertNotIn(first["id"], remaining_ids)
        self.assertIn(latest["id"], remaining_ids)

    def test_delete_falls_back_to_latest_role_and_text_match(self):
        ws = self._load()
        memory = sys.modules["memory"]
        key = ws._chat_history_key(12345, "client")
        oldest = ws._user_history_item("Удалить это")
        answer = ws._assistant_history_item("Хорошо")
        latest = ws._user_history_item("Удалить это")
        memory._store[key] = [oldest, answer, latest]

        response = asyncio.run(ws.chat_delete_handler(_Request({
            "delete_mode": "one",
            "message_id": "client-only-id",
            "role": "user",
            "text": "Удалить это",
        })))

        remaining_ids = [item["id"] for item in memory._store[key]]
        self.assertTrue(response["data"]["deleted"])
        self.assertEqual(response["data"]["deleted_id"], latest["id"])
        self.assertIn(oldest["id"], remaining_ids)
        self.assertNotIn(latest["id"], remaining_ids)
        self.assertTrue(all(
            ws._is_chat_message_id(item["id"])
            for item in response["data"]["messages"]
        ))

    def test_shifted_legacy_index_does_not_delete_the_wrong_message(self):
        ws = self._load()
        memory = sys.modules["memory"]
        key = ws._chat_history_key(12345, "client")
        unrelated = ws._assistant_history_item("Другое сообщение")
        target = ws._user_history_item("Нужное сообщение")
        memory._store[key] = [unrelated, target]

        response = asyncio.run(ws.chat_delete_handler(_Request({
            "delete_mode": "one",
            "message_id": 0,
            "role": "user",
            "text": "Нужное сообщение",
        })))

        remaining_ids = [item["id"] for item in memory._store[key]]
        self.assertEqual(response["data"]["deleted_id"], target["id"])
        self.assertIn(unrelated["id"], remaining_ids)
        self.assertNotIn(target["id"], remaining_ids)


if __name__ == "__main__":
    unittest.main()
