import importlib
import os
import sys
import types
import unittest


sys.path.insert(0, os.path.dirname(__file__))


def _load_webhook_server():
    fake_aiohttp = types.ModuleType("aiohttp")
    fake_web = types.ModuleType("aiohttp.web")
    fake_web.json_response = lambda data=None, status=200, **kwargs: {"data": data, "status": status}
    fake_web.Response = type("Response", (), {})
    fake_web.Request = type("Request", (), {})
    fake_web.StreamResponse = type("StreamResponse", (), {})
    fake_aiohttp.web = fake_web

    fake_telegram = types.ModuleType("telegram")
    fake_telegram.InlineKeyboardButton = type("InlineKeyboardButton", (), {})
    fake_telegram.InlineKeyboardMarkup = type("InlineKeyboardMarkup", (), {})
    fake_telegram_ext = types.ModuleType("telegram.ext")
    fake_telegram_ext.Application = type("Application", (), {})

    fake_config = types.ModuleType("config")
    fake_config.WEBHOOK_SECRET = "secret"
    fake_config.WEBHOOK_PORT = 8080
    fake_config.TELEGRAM_TOKEN = "token"
    fake_config.FOUNDER_IDS = [948205934]

    fake_database = types.ModuleType("database")
    fake_database.get_setting = lambda key, default=None: default
    fake_database.get_master_by_chat_id = lambda _tg_id: None
    fake_database.is_admin = lambda tg_id: int(tg_id) == 948205934

    fake_yclients = types.ModuleType("yclients")

    class _DummyYClientsAPI:
        def __init__(self, *args, **kwargs):
            pass

        def get_masters(self):
            return []

    fake_yclients.YClientsAPI = _DummyYClientsAPI

    fake_voice_guard = types.ModuleType("voice_guard")
    fake_voice_guard.CLARIFY_REPEAT_TEXT = "Повторите, пожалуйста."
    fake_voice_guard.should_clarify_transcript = lambda *args, **kwargs: False

    sys.modules.pop("identity_utils", None)
    fake_identity_utils = importlib.import_module("identity_utils")

    stubs = {
        "aiohttp": fake_aiohttp,
        "aiohttp.web": fake_web,
        "telegram": fake_telegram,
        "telegram.ext": fake_telegram_ext,
        "ai_billing": types.ModuleType("ai_billing"),
        "anonymizer": types.ModuleType("anonymizer"),
        "config": fake_config,
        "cutmatch": types.ModuleType("cutmatch"),
        "database": fake_database,
        "lead_alerts": types.ModuleType("lead_alerts"),
        "masters_ai": types.ModuleType("masters_ai"),
        "memory": types.ModuleType("memory"),
        "subscriptions": types.ModuleType("subscriptions"),
        "web_auth": types.ModuleType("web_auth"),
        "yukassa_api": types.ModuleType("yukassa_api"),
        "identity_utils": fake_identity_utils,
        "voice_guard": fake_voice_guard,
        "yclients": fake_yclients,
    }
    for name, module in stubs.items():
        sys.modules[name] = module

    sys.modules.pop("webhook_server", None)
    return importlib.import_module("webhook_server")


class ChatRoutingTests(unittest.TestCase):
    def test_master_profit_question_is_not_client_team_shortcut(self):
        ws = _load_webhook_server()

        question = "Кто из мастеров приносит больше всего прибыли?"
        short_question = "Кто приносит больше всего прибыли?"
        screenshot_question = "Кто из мастеров зарабатывает больше всех"

        self.assertTrue(ws._business_master_analytics_intent(question))
        self.assertTrue(ws._business_master_analytics_intent(short_question))
        self.assertTrue(ws._business_master_analytics_intent(screenshot_question))
        self.assertIsNone(ws._client_chat_shortcut(question))
        self.assertIsNone(ws._client_chat_shortcut(short_question))
        self.assertIsNone(ws._client_chat_shortcut(screenshot_question))
        self.assertFalse(ws._allow_client_chat_shortcuts({"mode": "staff"}, 948205934, question))

    def test_founder_master_profit_question_returns_numeric_analytics(self):
        ws = _load_webhook_server()

        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-06-09",
            "2026-07-08",
            "последние 30 дней",
        )
        fake_analytics.business_summary = lambda frm, to: {
            "masters": [
                {
                    "name": "Илья Третьяков",
                    "gross": 240000,
                    "salary": 96000,
                    "visits": 60,
                    "avg_check": 4000,
                    "is_owner": False,
                },
                {
                    "name": "Алексей Дарма",
                    "gross": 180000,
                    "salary": 72000,
                    "visits": 45,
                    "avg_check": 4000,
                    "is_owner": False,
                },
            ]
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._owner_master_profit_reply(
            948205934,
            "Кто из мастеров приносит больше всего прибыли?",
            mode="staff",
        )

        self.assertIn("Илья Третьяков", reply)
        self.assertIn("240 000 ₽", reply)
        self.assertIn("марже", reply)
        self.assertNotIn("Команда:", reply)

    def test_founder_client_surface_blocks_master_profit_question(self):
        ws = _load_webhook_server()

        question = "Кто приносит больше всего прибыли?"

        self.assertIsNone(ws._owner_master_profit_reply(948205934, question, mode="client"))
        reply = ws._client_business_scope_reply(question)
        self.assertIn("клиентском кабинете", reply)
        self.assertNotIn("Команда:", reply)

    def test_client_surface_blocks_gross_profit_question(self):
        ws = _load_webhook_server()

        reply = ws._client_business_scope_reply("Дай валовую прибыль за месяц")

        self.assertIn("клиентском кабинете", reply)
        self.assertIn("не показываю", reply)

    def test_staff_mode_payload_is_not_trusted_for_plain_client(self):
        ws = _load_webhook_server()

        self.assertEqual(ws._chat_effective_mode({"mode": "staff"}, 123456789), "client")
        self.assertEqual(ws._chat_effective_mode({"mode": "staff"}, 948205934), "staff")

    def test_staff_surface_blocks_client_booking_intent(self):
        ws = _load_webhook_server()

        reply = ws._staff_booking_scope_reply("Запиши меня на стрижку завтра к Илье")

        self.assertIn("рабочем чате", reply)
        self.assertIn("кабинет клиента", reply)

    def test_staff_surface_does_not_block_work_records_question(self):
        ws = _load_webhook_server()

        self.assertIsNone(ws._staff_booking_scope_reply("Сколько у меня записей сегодня?"))
        self.assertIsNone(ws._staff_booking_scope_reply("Кто ко мне придёт завтра?"))


if __name__ == "__main__":
    unittest.main()
