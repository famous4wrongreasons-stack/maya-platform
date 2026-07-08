import sys
import types
import unittest
import json
import os
import tempfile
from unittest.mock import patch

fake_database = types.ModuleType("database")
fake_database.is_admin = lambda _user_id: False
fake_database.get_master_by_chat_id = lambda _chat_id: None
fake_database.get_client = lambda _chat_id: None
fake_database.get_client_history_cached = lambda _client_id: None
fake_database.set_client_history_cache = lambda _client_id, _history: None
fake_database.get_last_booking = lambda _chat_id: None
fake_database.get_client_preferences = lambda _chat_id: ""
fake_database.list_masters = lambda: []
sys.modules.setdefault("database", fake_database)

fake_yclients = types.ModuleType("yclients")


class _DummyYClientsAPI:
    def search_clients(self, _phone, limit=8):
        return []

    def get_client_history(self, _client_id, count=20):
        return []


fake_yclients.YClientsAPI = _DummyYClientsAPI
sys.modules.setdefault("yclients", fake_yclients)

import memory


class MemoryRegressionTests(unittest.TestCase):
    def test_load_conversations_preserves_numeric_and_pwa_surface_keys(self):
        payload = {
            "948205934": [{"role": "assistant", "content": "telegram"}],
            "pwa:client:948205934": [{"role": "assistant", "content": "client"}],
            "pwa:staff:948205934": [{"role": "assistant", "content": "staff"}],
        }

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "conversations.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)
            with patch.object(memory, "CONVERSATIONS_FILE", path):
                loaded = memory.load_conversations()

        self.assertIn(948205934, loaded)
        self.assertIn("pwa:client:948205934", loaded)
        self.assertIn("pwa:staff:948205934", loaded)
        self.assertEqual(loaded[948205934][0]["content"], "telegram")
        self.assertEqual(loaded["pwa:client:948205934"][0]["content"], "client")
        self.assertEqual(loaded["pwa:staff:948205934"][0]["content"], "staff")

    def test_normalize_history_visit_supports_raw_yclients_shape(self):
        visit = {
            "datetime": "2026-07-01T12:00:00+03:00",
            "services": [
                {"title": "Стрижка", "price": 2200},
                {"title": "Борода", "cost": 900},
            ],
            "staff": {"id": 3278920, "name": "Александр Киянский"},
        }

        got = memory.normalize_history_visit(visit)

        self.assertEqual(got["date"], "2026-07-01T12:00:00+03:00")
        self.assertEqual(got["master_id"], 3278920)
        self.assertEqual(got["master"], "Александр Киянский")
        self.assertEqual(got["staff"], {"id": 3278920, "name": "Александр Киянский"})
        self.assertEqual(got["service"], "Стрижка, Борода")
        self.assertEqual(
            got["services"],
            [
                {"title": "Стрижка", "cost": 2200},
                {"title": "Борода", "cost": 900},
            ],
        )

    def test_normalize_history_visit_preserves_service_only_cache(self):
        visit = {
            "date": "2026-06-20T15:00:00+03:00",
            "master": "Стас",
            "service": "Стрижка машинкой + фейд",
        }

        got = memory.normalize_history_visit(visit)

        self.assertEqual(got["master"], "Стас")
        self.assertIsNone(got["master_id"])
        self.assertEqual(got["service"], "Стрижка машинкой + фейд")
        self.assertEqual(
            got["services"],
            [{"title": "Стрижка машинкой + фейд", "cost": 0}],
        )

    def test_build_context_keeps_client_history_for_staff_client(self):
        history = [
            {
                "date": "2026-07-01T12:00:00+03:00",
                "services": [
                    {"title": "Тонирование головы"},
                    {"title": "Моделирование бороды"},
                    {"title": "Стрижка машинкой + фейд"},
                ],
                "staff": {"id": 3278920, "name": "Александр Киянский"},
            },
            {
                "date": "2026-06-01T12:00:00+03:00",
                "services": [{"title": "Камуфляж бороды"}],
                "staff": {"id": 1460233, "name": "Илья"},
            },
        ]
        fake_config = types.SimpleNamespace(ACTIVE_MASTER_IDS=[3278920, 1460233])

        with patch.dict(sys.modules, {"config": fake_config}):
            with patch.object(memory.database, "is_admin", return_value=False):
                with patch.object(memory.database, "get_master_by_chat_id", return_value={"id": 10}):
                    with patch.object(memory.database, "get_client", return_value={"id": 1}):
                        with patch.object(memory.database, "get_client_history_cached", return_value=history):
                            with patch.object(memory.database, "get_last_booking", return_value=None):
                                with patch.object(memory.database, "get_client_preferences", return_value=""):
                                    text = memory.build_context(948205934)

        self.assertIn("этот пользователь также бывает клиентом салона", text)
        self.assertIn("обычно ходит к Александр Киянский", text)
        self.assertIn("Тонирование головы, Моделирование бороды, Стрижка машинкой + фейд", text)
        self.assertIn("Персональные данные не упоминай.", text)

    def test_audit_dual_role_repairs_missing_cache(self):
        state = {"cache": None}
        history = [
            {
                "datetime": "2026-07-01T12:00:00+03:00",
                "services": [{"title": "Стрижка"}, {"title": "Борода"}],
                "staff": {"id": 3278920, "name": "Александр Киянский"},
            }
        ]
        fake_yc = types.SimpleNamespace(
            search_clients=lambda _phone, limit=8: [
                {"id": 104585657, "name": "Stas Mocine", "phone": "+7 962 025 9888"}
            ],
            get_client_history=lambda _client_id, count=20: history,
        )

        def _get_cache(_client_id):
            return state["cache"]

        def _set_cache(_client_id, value):
            state["cache"] = value

        with patch.object(memory.database, "list_masters", return_value=[{"telegram_chat_id": 948205934, "full_name": "Стас"}]):
            with patch.object(memory.database, "get_client", return_value={"id": 1, "phone": "+7 962 025 9888", "name": "Стас"}):
                with patch.object(memory.database, "get_client_history_cached", side_effect=_get_cache):
                    with patch.object(memory.database, "set_client_history_cache", side_effect=_set_cache):
                        with patch.object(memory.database, "is_admin", return_value=False):
                            with patch.object(memory.database, "get_master_by_chat_id", return_value={"id": 10}):
                                with patch.object(memory.database, "get_last_booking", return_value=None):
                                    with patch.object(memory.database, "get_client_preferences", return_value=""):
                                        audit = memory.audit_dual_role_client_context(yc=fake_yc, repair=True)

        self.assertFalse(audit["issues"])
        self.assertEqual(len(audit["repaired"]), 1)
        self.assertEqual(state["cache"][0]["master"], "Александр Киянский")
        self.assertEqual(state["cache"][0]["service"], "Стрижка, Борода")

    def test_audit_dual_role_does_not_alert_without_client_history(self):
        with patch.object(memory.database, "list_masters", return_value=[{"telegram_chat_id": 948205934, "full_name": "Стас"}]):
            with patch.object(memory.database, "get_client", return_value={"id": 1, "phone": "", "name": "Стас"}):
                with patch.object(memory.database, "get_client_history_cached", return_value=None):
                    with patch.object(memory.database, "is_admin", return_value=False):
                        with patch.object(memory.database, "get_master_by_chat_id", return_value={"id": 10}):
                            with patch.object(memory.database, "get_last_booking", return_value=None):
                                with patch.object(memory.database, "get_client_preferences", return_value=""):
                                    audit = memory.audit_dual_role_client_context(
                                        yc=types.SimpleNamespace(
                                            search_clients=lambda _phone, limit=8: [],
                                            get_client_history=lambda _client_id, count=20: [],
                                        ),
                                        repair=True,
                                    )

        self.assertFalse(audit["issues"])
        self.assertEqual(audit["healthy"], 1)


if __name__ == "__main__":
    unittest.main()
