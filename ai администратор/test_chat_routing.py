import importlib
import asyncio
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
    fake_telegram_error = types.ModuleType("telegram.error")
    fake_telegram_error.Forbidden = type("Forbidden", (Exception,), {})
    fake_telegram_error.BadRequest = type("BadRequest", (Exception,), {})
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
    fake_database.has_valid_consent_by_chat_id = lambda _chat_id: True

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

    fake_memory = types.ModuleType("memory")
    _conversations_store = {}
    fake_memory.get_usual_booking = lambda _chat_id, warm=False: None
    fake_memory.load_conversations = lambda: {
        k: [dict(item) if isinstance(item, dict) else item for item in v]
        for k, v in _conversations_store.items()
    }
    def _save_conversations(data):
        _conversations_store.clear()
        for k, v in (data or {}).items():
            _conversations_store[k] = [dict(item) if isinstance(item, dict) else item for item in (v or [])]
    fake_memory.save_conversations = _save_conversations
    fake_memory._store = _conversations_store

    stubs = {
        "aiohttp": fake_aiohttp,
        "aiohttp.web": fake_web,
        "telegram": fake_telegram,
        "telegram.error": fake_telegram_error,
        "telegram.ext": fake_telegram_ext,
        "ai_billing": types.ModuleType("ai_billing"),
        "anonymizer": types.ModuleType("anonymizer"),
        "config": fake_config,
        "cutmatch": types.ModuleType("cutmatch"),
        "database": fake_database,
        "lead_alerts": types.ModuleType("lead_alerts"),
        "master_briefing": types.ModuleType("master_briefing"),
        "masters_ai": types.ModuleType("masters_ai"),
        "memory": fake_memory,
        "owner_ai": types.ModuleType("owner_ai"),
        "reputation": types.ModuleType("reputation"),
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
    def setUp(self):
        # _load_webhook_server подменяет реальные модули заглушками в sys.modules;
        # без отката заглушки утекают в следующие тест-модули (test_reputation
        # падал на mock.patch("reputation.database...") при общем прогоне).
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

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

    def test_founder_daily_business_question_uses_verified_shortcut(self):
        ws = _load_webhook_server()
        owner_ai = sys.modules["owner_ai"]
        owner_ai.daily_briefing = lambda: {"date": "2026-07-16"}
        owner_ai.format_daily_briefing = lambda brief: (
            "Проверенная сводка: Стас Мосин — выходной; "
            "Илья Третьяков — нужна сверка."
        )

        reply = ws._owner_daily_briefing_reply(
            948205934,
            "Маюш, что у нас по бизнесу сегодня?",
            mode="staff",
        )

        self.assertIn("Стас Мосин — выходной", reply)
        self.assertIn("Илья Третьяков — нужна сверка", reply)

    def test_linked_founder_revenue_defaults_to_personal_on_staff_surface(self):
        ws = _load_webhook_server()
        sys.modules["database"].get_master_by_chat_id = lambda _tg_id: {
            "yclients_staff_id": 1461615,
            "full_name": "Владелец",
            "can_redeem": True,
        }
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "cash": {"sum": 253100},
            "card": {"sum": 369400},
            "visits": 300,
            "avg_check": 2075,
            "masters": [{
                "staff_id": 1461615,
                "gross": 99400,
                "salary": 99400,
                "percent": 100,
                "visits": 46,
                "avg_check": 2161,
                "is_owner": True,
            }],
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Выручка за месяц",
            mode="staff",
        )

        self.assertIn("Ваша личная статистика", reply)
        self.assertIn("99 400 ₽", reply)
        self.assertNotIn("622 500 ₽", reply)
        self.assertNotIn("100%", reply)
        self.assertIn("Зарплату владельца не приравниваю", reply)

    def test_explicit_business_revenue_uses_company_total(self):
        ws = _load_webhook_server()
        sys.modules["database"].get_master_by_chat_id = lambda _tg_id: {
            "yclients_staff_id": 1461615,
            "full_name": "Владелец",
            "can_redeem": True,
        }
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "cash": {"sum": 253100},
            "card": {"sum": 369400},
            "visits": 300,
            "avg_check": 2075,
            "masters": [{
                "staff_id": 1461615,
                "gross": 99400,
                "visits": 46,
                "avg_check": 2161,
                "is_owner": True,
            }],
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Покажи выручку бизнеса за месяц по всем сотрудникам",
            mode="staff",
        )

        self.assertIn("Общая статистика бизнеса", reply)
        self.assertIn("622 500 ₽", reply)
        self.assertIn("300", reply)
        self.assertNotIn("Ваша личная статистика", reply)

    def test_revenue_growth_advice_is_not_replaced_by_fact_snapshot(self):
        ws = _load_webhook_server()

        self.assertFalse(ws._staff_fact_analytics_intent(
            "Как увеличить выручку за месяц?",
        ))

    def test_unavailable_yclients_transactions_never_render_zero_revenue(self):
        ws = _load_webhook_server()
        sys.modules["database"].get_master_by_chat_id = lambda _tg_id: {
            "yclients_staff_id": 1461615,
            "full_name": "Владелец",
            "can_redeem": True,
        }
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "unavailable", "records": "ok"},
            "total_gross": 0,
            "masters": [],
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Выручка за месяц",
            mode="staff",
        )

        self.assertIn("не отдал финансовые операции", reply)
        self.assertNotIn("0 ₽", reply)

    def test_daily_business_shortcut_is_not_available_on_client_surface(self):
        ws = _load_webhook_server()

        reply = ws._owner_daily_briefing_reply(
            948205934,
            "Что у нас по бизнесу сегодня?",
            mode="client",
        )

        self.assertIsNone(reply)

    def test_manager_staff_surface_does_not_receive_master_profit_salary(self):
        ws = _load_webhook_server()
        sys.modules["database"].get_setting = lambda key, default=None: (
            "123456789" if key == "panel_manager_ids" else default
        )

        reply = ws._owner_master_profit_reply(
            123456789,
            "Кто из мастеров приносит больше всего прибыли?",
            mode="staff",
        )

        self.assertIn("только владельцу", reply)
        self.assertNotIn("Илья Третьяков", reply)
        self.assertNotIn("240 000 ₽", reply)

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

    def test_pwa_chat_history_key_is_split_by_surface(self):
        ws = _load_webhook_server()

        self.assertEqual(ws._chat_history_key(948205934, "client"), "pwa:client:948205934")
        self.assertEqual(ws._chat_history_key(948205934, "staff"), "pwa:staff:948205934")
        self.assertNotEqual(
            ws._chat_history_key(948205934, "client"),
            ws._chat_history_key(948205934, "staff"),
        )

    def test_client_push_can_be_mirrored_into_pwa_chat_history(self):
        ws = _load_webhook_server()
        mem = sys.modules["memory"]

        stored = ws._store_assistant_message_in_chat(
            948205934,
            "Запись подтверждена ✅",
            mode="client",
            action={"type": "open_cabinet", "label": "Мои записи"},
            dedupe_key="record:create:1",
        )

        self.assertTrue(stored)
        history = mem.load_conversations().get("pwa:client:948205934") or []
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["role"], "assistant")
        self.assertEqual(history[0]["action"]["type"], "open_cabinet")
        self.assertEqual(history[0]["dedupe_key"], "record:create:1")

        stored_again = ws._store_assistant_message_in_chat(
            948205934,
            "Запись подтверждена ✅",
            mode="client",
            action={"type": "open_cabinet", "label": "Мои записи"},
            dedupe_key="record:create:1",
        )

        self.assertFalse(stored_again)
        history = mem.load_conversations().get("pwa:client:948205934") or []
        self.assertEqual(len(history), 1)

    def test_marketing_broadcast_is_mirrored_into_client_chat(self):
        ws = _load_webhook_server()
        mem = sys.modules["memory"]
        db = sys.modules["database"]
        db.list_telegram_clients = lambda: [
            {"id": 1, "name": "Стас", "telegram_chat_id": 948205934},
        ]
        db.has_marketing_consent = lambda _cid: True
        db.get_notify_prefs = lambda _cid: {}
        db.has_saved_notify_prefs = lambda _cid: False
        db.marketing_sent_within = lambda _cid, _days: False
        db.set_marketing_last_sent = lambda _cid: None

        sent = []

        class _FakeBot:
            async def send_message(self, chat_id, text, parse_mode=None):
                sent.append((chat_id, text, parse_mode))

        ws.WEBPUSH_VAPID_PRIVATE_KEY = ""
        result = asyncio.run(ws.broadcast_send_to_base(_FakeBot(), "Привет, {name}! Новая акция."))

        self.assertEqual(result["sent"], 1)
        self.assertEqual(sent[0][0], 948205934)
        self.assertIn("Стас", sent[0][1])

        history = mem.load_conversations().get("pwa:client:948205934") or []
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["role"], "assistant")
        self.assertIn("Привет, Стас! Новая акция.", history[0]["content"])

    def test_staff_surface_blocks_client_booking_intent(self):
        ws = _load_webhook_server()

        reply = ws._staff_booking_scope_reply("Запиши меня на стрижку завтра к Илье")

        self.assertIn("рабочем чате", reply)
        self.assertIn("кабинет клиента", reply)

    def test_staff_surface_does_not_block_work_records_question(self):
        ws = _load_webhook_server()

        self.assertIsNone(ws._staff_booking_scope_reply("Сколько у меня записей сегодня?"))
        self.assertIsNone(ws._staff_booking_scope_reply("Кто ко мне придёт завтра?"))

    def test_booking_start_always_asks_for_service_first(self):
        ws = _load_webhook_server()

        reply, action = ws._client_chat_shortcut("Записаться")

        self.assertEqual(reply, "Конечно. На какую услугу вас записать?")
        self.assertIsNone(action)

    def test_client_ai_error_keeps_booking_available(self):
        ws = _load_webhook_server()

        reply, action = ws._chat_temporary_error("client")

        self.assertIn("временно недоступна", reply)
        self.assertNotIn("мозг", reply.lower())
        self.assertEqual(action["type"], "open_booking")
        self.assertEqual(action["screen"], "book")

    def test_staff_ai_error_does_not_open_client_booking(self):
        ws = _load_webhook_server()

        reply, action = ws._chat_temporary_error("staff")

        self.assertIn("временно недоступна", reply)
        self.assertIsNone(action)

    def test_regular_master_phrase_resolves_from_server_history(self):
        ws = _load_webhook_server()
        sys.modules["memory"].get_usual_booking = lambda _chat_id, warm=False: {
            "master_id": 3278920,
            "master_name": "Александр Киянский",
            "service_text": "Мужская стрижка",
        }

        reply, action = ws._client_usual_booking_shortcut(
            948205934,
            "Запиши меня к моему постоянному мастеру на мужскую стрижку",
        )

        self.assertIn("Александр Киянский", reply)
        self.assertIn("На какой день и время", reply)
        self.assertIsNone(action)

    def test_regular_master_without_service_asks_for_service(self):
        ws = _load_webhook_server()
        sys.modules["memory"].get_usual_booking = lambda _chat_id, warm=False: {
            "master_id": 3278920,
            "master_name": "Александр Киянский",
            "service_text": "Мужская стрижка, Борода",
        }

        reply, _ = ws._client_usual_booking_shortcut(
            948205934,
            "Запиши меня к моему постоянному мастеру",
        )

        self.assertIn("Александр Киянский", reply)
        self.assertIn("На какую услугу", reply)

    def test_regular_master_question_does_not_invent_a_master(self):
        ws = _load_webhook_server()

        reply, action = ws._client_usual_booking_shortcut(
            948205934,
            "Кто мой постоянный мастер?",
        )

        self.assertIn("не вижу", reply)
        self.assertIsNone(action)

    def test_regular_master_intent_supports_natural_variants(self):
        ws = _load_webhook_server()
        for phrase in (
            "запиши к моему мастеру",
            "хочу к своему барберу",
            "давай как обычно",
            "запиши к тому же мастеру",
        ):
            self.assertRegex(phrase, ws._USUAL_MASTER_INTENT_RE)


if __name__ == "__main__":
    unittest.main()
