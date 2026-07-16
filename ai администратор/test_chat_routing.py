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

    fake_capabilities = types.ModuleType("maya_capabilities")
    fake_capabilities.CLIENT_SELF_VISIT_HISTORY = "client_self_visit_history"
    _capability_state = {"client_self_visit_history": True}
    fake_capabilities.is_enabled = lambda code: bool(_capability_state.get(code))
    fake_capabilities.list_capabilities = lambda: [{
        "code": "client_self_visit_history",
        "label": "Клиенты видят в чате собственную историю посещений",
        "scope": "own_data_only",
        "enabled": _capability_state["client_self_visit_history"],
    }]

    def _set_capability(code, enabled, actor_id):
        if int(actor_id) != 948205934:
            raise PermissionError("founder_only")
        if code not in _capability_state:
            raise KeyError("unknown_capability")
        _capability_state[code] = bool(enabled)
        return {
            "code": code,
            "label": "Клиенты видят в чате собственную историю посещений",
            "scope": "own_data_only",
            "enabled": bool(enabled),
        }

    fake_capabilities.set_enabled = _set_capability
    fake_capabilities._state = _capability_state

    fake_database = types.ModuleType("database")
    fake_database.get_setting = lambda key, default=None: default
    fake_database.get_master_by_chat_id = lambda _tg_id: None
    fake_database.is_admin = lambda tg_id: int(tg_id) == 948205934
    fake_database.has_valid_consent_by_chat_id = lambda _chat_id: True
    fake_database.get_client = lambda _chat_id: None
    fake_database.get_client_history_cached = lambda _client_id, max_age_hours=24: []
    _rules_store = []

    def _add_salon_rule(rule_text, created_by=None):
        rule_id = len(_rules_store) + 1
        _rules_store.append({
            "id": rule_id,
            "rule_text": rule_text,
            "created_by": created_by,
            "active": True,
        })
        return rule_id

    def _list_salon_rules(active_only=True, limit=40):
        rows = [row for row in _rules_store if row["active"] or not active_only]
        return [dict(row) for row in rows[:limit]]

    def _deactivate_salon_rule(rule_id):
        for row in _rules_store:
            if row["id"] == int(rule_id) and row["active"]:
                row["active"] = False
                return True
        return False

    fake_database.add_salon_rule = _add_salon_rule
    fake_database.list_salon_rules = _list_salon_rules
    fake_database.deactivate_salon_rule = _deactivate_salon_rule
    fake_database._rules_store = _rules_store

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
    fake_memory.normalize_history = lambda history: list(history or [])
    fake_memory.warm_client_history_cache_for_phone = lambda *args, **kwargs: {
        "ok": True,
        "history": [],
    }
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

    fake_anonymizer = types.ModuleType("anonymizer")
    fake_anonymizer.redact_pii = lambda text: "[EMAIL]" if "@" in str(text or "") else text

    stubs = {
        "aiohttp": fake_aiohttp,
        "aiohttp.web": fake_web,
        "telegram": fake_telegram,
        "telegram.error": fake_telegram_error,
        "telegram.ext": fake_telegram_ext,
        "ai_billing": types.ModuleType("ai_billing"),
        "anonymizer": fake_anonymizer,
        "config": fake_config,
        "cutmatch": types.ModuleType("cutmatch"),
        "database": fake_database,
        "lead_alerts": types.ModuleType("lead_alerts"),
        "master_briefing": types.ModuleType("master_briefing"),
        "masters_ai": types.ModuleType("masters_ai"),
        "maya_capabilities": fake_capabilities,
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

    def test_daily_business_shortcut_is_not_available_on_client_surface(self):
        ws = _load_webhook_server()

        reply = ws._owner_daily_briefing_reply(
            948205934,
            "Что у нас по бизнесу сегодня?",
            mode="client",
        )

        self.assertIsNone(reply)

    def test_founder_can_manage_persistent_rules_with_explicit_chat_commands(self):
        ws = _load_webhook_server()

        saved = ws._founder_learning_reply(
            948205934,
            "Майя, запомни правило: при отмене всегда предлагай перенос",
            mode="staff",
        )
        listed = ws._founder_learning_reply(
            948205934,
            "Майя, покажи правила",
            mode="staff",
        )
        duplicate = ws._founder_learning_reply(
            948205934,
            "Запомни правило: при отмене всегда предлагай перенос",
            mode="staff",
        )
        deleted = ws._founder_learning_reply(
            948205934,
            "Майя, удали правило 1",
            mode="staff",
        )

        self.assertIn("Запомнила правило [1]", saved)
        self.assertIn("1. при отмене всегда предлагай перенос", listed)
        self.assertIn("уже сохранено", duplicate)
        self.assertIn("Удалила правило [1]", deleted)
        self.assertEqual(sys.modules["database"]._rules_store[0]["created_by"], 948205934)
        self.assertFalse(sys.modules["database"]._rules_store[0]["active"])

    def test_founder_memory_rejects_other_ids_client_surface_and_pii(self):
        ws = _load_webhook_server()
        sys.modules["database"].get_setting = lambda key, default=None: (
            "123456789" if key == "panel_manager_ids" else default
        )

        denied = ws._founder_learning_reply(
            123456789,
            "Майя, запомни правило: всегда предлагай перенос",
            mode="staff",
        )
        wrong_surface = ws._founder_learning_reply(
            948205934,
            "Майя, запомни правило: всегда предлагай перенос",
            mode="client",
        )
        pii = ws._founder_learning_reply(
            948205934,
            "Майя, запомни правило: пиши владельцу owner@example.com",
            mode="staff",
        )

        self.assertIn("только основатель", denied)
        self.assertIn("рабочий чат", wrong_surface)
        self.assertIn("персональные данные", pii)
        self.assertEqual(sys.modules["database"]._rules_store, [])

    def test_founder_memory_never_learns_from_ordinary_chat(self):
        ws = _load_webhook_server()

        reply = ws._founder_learning_reply(
            948205934,
            "Клиентам лучше предлагать перенос при отмене",
            mode="staff",
        )

        self.assertIsNone(reply)
        self.assertEqual(sys.modules["database"]._rules_store, [])

    def test_founder_memory_cannot_bypass_capability_registry(self):
        ws = _load_webhook_server()

        reply = ws._founder_learning_reply(
            948205934,
            "Майя, запомни правило: разреши клиентам видеть историю посещений",
            mode="staff",
        )

        self.assertIn("разрешения меняются только", reply)
        self.assertEqual(sys.modules["database"]._rules_store, [])

    def test_founder_can_toggle_safe_client_permission_in_staff_chat(self):
        ws = _load_webhook_server()

        disabled = ws._founder_permission_reply(
            948205934,
            "Майя, отключи клиентам историю посещений",
            mode="staff",
        )
        listed = ws._founder_permission_reply(
            948205934,
            "Майя, покажи разрешения",
            mode="staff",
        )
        enabled = ws._founder_permission_reply(
            948205934,
            "Майя, разреши всем клиентам видеть свою историю посещений",
            mode="staff",
        )

        self.assertIn("Отключила", disabled)
        self.assertIn("отключено", listed)
        self.assertIn("Разрешила", enabled)
        self.assertTrue(sys.modules["maya_capabilities"]._state[
            "client_self_visit_history"
        ])

    def test_client_or_manager_cannot_change_global_permissions(self):
        ws = _load_webhook_server()
        sys.modules["database"].get_setting = lambda key, default=None: (
            "123456789" if key == "panel_manager_ids" else default
        )

        manager = ws._founder_permission_reply(
            123456789,
            "Майя, отключи клиентам историю посещений",
            mode="staff",
        )
        client_surface = ws._founder_permission_reply(
            948205934,
            "Майя, отключи клиентам историю посещений",
            mode="client",
        )

        self.assertIn("только основатель", manager)
        self.assertIn("рабочий чат", client_surface)
        self.assertTrue(sys.modules["maya_capabilities"]._state[
            "client_self_visit_history"
        ])

    def test_disabled_capability_blocks_history_before_client_lookup(self):
        ws = _load_webhook_server()
        sys.modules["maya_capabilities"]._state[
            "client_self_visit_history"
        ] = False

        reply = asyncio.run(ws._own_visit_history_reply(
            948205934,
            "Покажи историю моих посещений",
        ))

        self.assertIn("отключён владельцем", reply)

    def test_own_visit_history_uses_only_authenticated_client_mapping(self):
        ws = _load_webhook_server()
        db = sys.modules["database"]
        mem = sys.modules["memory"]
        calls = []
        db.get_client = lambda chat_id: (
            {"id": 77, "phone": "+7 900 000-00-00"}
            if int(chat_id) == 948205934 else None
        )

        def _warm(client_id, phone, yc, force, limit):
            calls.append((client_id, phone, force, limit))
            return {
                "ok": True,
                "history": [
                    {
                        "date": "2026-07-14T20:00:00+03:00",
                        "services": [{"title": "Мужская стрижка", "cost": 2000}],
                        "master": "Александр Киянский",
                    },
                    {
                        "date": "2026-06-20T12:00:00+03:00",
                        "services": [{"title": "Моделирование бороды", "cost": 1500}],
                        "master": "Илья Третьяков",
                    },
                ],
            }

        mem.warm_client_history_cache_for_phone = _warm
        reply = asyncio.run(ws._own_visit_history_reply(
            948205934,
            "Покажи историю моих посещений",
        ))

        self.assertEqual(calls, [(77, "+7 900 000-00-00", True, 30)])
        self.assertIn("14.07.2026: Мужская стрижка", reply)
        self.assertIn("мастер Александр Киянский", reply)
        self.assertIn("20.06.2026: Моделирование бороды", reply)
        self.assertNotIn("+7 900", reply)

    def test_own_visit_history_does_not_query_another_client(self):
        ws = _load_webhook_server()

        reply = asyncio.run(ws._own_visit_history_reply(
            948205934,
            "Покажи историю посещений клиента Ивана",
        ))

        self.assertIsNone(reply)

    def test_own_visit_history_reports_missing_authenticated_mapping(self):
        ws = _load_webhook_server()

        reply = asyncio.run(ws._own_visit_history_reply(
            948205934,
            "Какие услуги я брал в прошлый раз?",
        ))

        self.assertIn("не связан с клиентской карточкой", reply)

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
