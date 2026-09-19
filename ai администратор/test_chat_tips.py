import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch


sys.path.insert(0, os.path.dirname(__file__))

from test_chat_routing import _load_webhook_server


class _Request:
    def __init__(self, body):
        self._body = body
        self.headers = {}
        self.app = {}

    async def json(self):
        return self._body


class ChatTipsTests(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def _load(self):
        ws = _load_webhook_server()
        ws._cabinet_response = lambda data, status=200: {"data": data, "status": status}
        return ws

    def test_tip_offer_uses_real_services_and_visit_amount(self):
        ws = self._load()
        text, amount = ws._tip_offer_details({
            "services": [
                {"title": "Мужская стрижка", "cost": 1800},
                {"title": "Моделирование бороды", "cost": "1000"},
            ],
        }, "Илья Третьяков")

        self.assertEqual(amount, 2800)
        self.assertIn("Мужская стрижка, Моделирование бороды", text)
        self.assertIn("2 800 ₽", text)
        self.assertIn("Ваш мастер — Илья Третьяков", text)

    def test_completed_visit_persists_tips_widget_with_context(self):
        ws = self._load()
        database = sys.modules["database"]
        database.find_client_by_phone = lambda _phone: {"telegram_chat_id": 777}
        calls = []

        async def fake_send(chat_id, *args, **kwargs):
            calls.append((chat_id, kwargs))
            return 1

        ws._send_client_push = fake_send
        asyncio.run(ws._offer_tip_to_client({
            "client": {"phone": "+79990000000"},
            "staff": {"id": 1461615, "name": "Стас Мосин"},
            "services": [{"title": "Мужская стрижка", "cost": 2000}],
        }, 991))

        self.assertEqual(len(calls), 1)
        chat_id, payload = calls[0]
        self.assertEqual(chat_id, 777)
        self.assertTrue(payload["persist_in_chat"])
        self.assertEqual(payload["chat_widget"], "tips")
        self.assertEqual(payload["chat_widget_data"], {
            "master_id": 1461615,
            "base_amount": 2000,
        })
        self.assertEqual(payload["chat_dedupe_key"], "tip-offer:991")

    def test_tips_widget_data_survives_history_round_trip(self):
        ws = self._load()
        item = ws._assistant_history_item(
            "Поблагодарить мастера?",
            widget="tips",
            widget_data={
                "master_id": "1461615",
                "base_amount": "2500",
                "phone": "+79990000000",
            },
        )

        message = ws._chat_history_payload([item])[0]

        self.assertEqual(item["widget_data"], {
            "master_id": 1461615,
            "base_amount": 2500,
        })
        self.assertEqual(message["widget"], "tips")
        self.assertEqual(message["widget_data"], item["widget_data"])

    def test_attendance_update_only_wakes_canonical_operational_owner(self):
        ws = self._load()
        record = {
            "id": 991,
            "datetime": "2026-07-19T15:00:00+03:00",
            "attendance": 1,
            "staff": {"id": 5, "name": "Илья"},
            "client": {},
            "services": [{"title": "Новая услуга", "cost": 1000}],
        }
        ws._yc = type("YC", (), {"get_record": lambda self, _record_id: record})()
        database = sys.modules["database"]
        database.get_record_state = lambda _record_id: {
            "staff_id": 5,
            "datetime": "2026-07-19 15:00",
            "services_sig": "старая услуга",
            "attendance": 0,
        }
        database.get_ai_advice_for_record = lambda _record_id: {}
        database.get_master_by_staff_id = lambda _staff_id: None
        ws._save_record_state = lambda *_args, **_kwargs: None
        offered = []

        async def fake_offer(_record, record_id):
            offered.append(record_id)

        ws._offer_tip_to_client = fake_offer
        # R06 owns occurrence/audience admission. Provider updates may wake it,
        # but cannot send a raw-identity tip offer or invent a delivery outcome.
        with patch("canonical_operational_alerts.trigger", new_callable=AsyncMock) as trigger:
            result = asyncio.run(ws._process_record_update(object(), 991))
        trigger.assert_awaited_once_with()
        self.assertEqual(offered, [])
        self.assertEqual(result, {"status": "canonical_event_owner_pending", "record_id": 991})

    def test_tip_sent_retires_unverified_thank_you_signal(self):
        ws = self._load()
        database = sys.modules["database"]
        saved = []
        database.save_tip = lambda **kwargs: saved.append(kwargs)
        database.is_master_muted = lambda _chat_id: False
        ws._master_by_tip_key = lambda *_args: {
            "id": 5,
            "staff_id": 5,
            "slug": "ilya",
            "name": "Илья",
        }

        async def fake_push(*_args, **_kwargs):
            return 1

        ws._send_master_push = fake_push
        response = asyncio.run(ws.tip_sent_handler(_Request({
            "master_id": 5,
            "amount": 300,
            "record_id": 991,
            "note": "Спасибо за отличный результат!",
        })))

        self.assertEqual(saved, [])
        self.assertFalse(response["data"]["ok"])
        self.assertEqual(response["data"]["error"], "tip_signal_retired")


if __name__ == "__main__":
    unittest.main()
