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
    fake_subscriptions = types.ModuleType("subscriptions")
    fake_subscriptions.PLANS = [
        {"title": "Стрижка", "prices": {"senior": 3300, "top": 3700}},
        {"title": "Комплекс", "prices": {"senior": 5200, "top": 6000}},
        {"title": "Борода", "prices": {"senior": 1700, "top": 2100}},
    ]

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
        "subscriptions": fake_subscriptions,
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

    def test_client_greeting_gets_warm_shortcut_without_ai_or_booking_lookup(self):
        ws = _load_webhook_server()

        reply, action = ws._client_chat_shortcut("Привет")

        self.assertIn("Рада вас видеть", reply)
        self.assertIn("записью", reply)
        self.assertIsNone(action)

    def test_certificate_chat_uses_only_shop_denominations(self):
        ws = _load_webhook_server()

        reply, action = ws._direct_shop_action("Какие сертификаты можно купить?")

        self.assertEqual(action["type"], "open_certs")
        self.assertIn("2 000, 3 000 и 5 000 ₽", reply)
        self.assertNotIn("10 000", reply)

    def test_invalid_certificate_amount_is_rejected_with_real_catalog(self):
        ws = _load_webhook_server()

        reply, action = ws._direct_shop_action("Хочу сертификат на 10 000 рублей")

        self.assertEqual(action["type"], "open_certs")
        self.assertIn("Сертификата на 10 000 ₽ в магазине нет", reply)
        self.assertIn("2 000, 3 000 и 5 000 ₽", reply)

    def test_subscription_chat_uses_shop_catalog_prices(self):
        ws = _load_webhook_server()

        reply, action = ws._direct_shop_action("Покажи абонементы и цены")

        self.assertEqual(action["type"], "open_subs")
        self.assertIn("«Стрижка» — 3 300 ₽ у старшего / 3 700 ₽ у топ-мастера", reply)
        self.assertIn("«Комплекс» — 5 200 ₽ у старшего / 6 000 ₽ у топ-мастера", reply)
        self.assertIn("«Борода» — 1 700 ₽ у старшего / 2 100 ₽ у топ-мастера", reply)
        self.assertNotIn("10 000", reply)

    def test_combined_shop_question_lists_both_catalogs(self):
        ws = _load_webhook_server()

        reply, action = ws._direct_shop_action(
            "Какие абонементы и сертификаты есть?"
        )

        self.assertEqual(action["type"], "open_shop")
        self.assertIn("«Стрижка» — 3 300 ₽", reply)
        self.assertIn("Сертификаты: 2 000, 3 000 и 5 000 ₽", reply)
        self.assertNotIn("10 000", reply)

    def test_usual_master_is_the_master_from_the_latest_visit(self):
        ws = _load_webhook_server()

        result = ws._usual_master([
            {"master_id": 22, "master": "Последний мастер"},
            {"master_id": 11, "master": "Частый мастер"},
            {"master_id": 11, "master": "Частый мастер"},
        ])

        self.assertEqual(result, {"id": 22, "name": "Последний мастер"})

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

    def test_compound_today_schedule_question_answers_bookings_money_and_upsell(self):
        ws = _load_webhook_server()
        owner_ai = sys.modules["owner_ai"]
        owner_ai.business_snapshot = lambda: {
            "booked_today": 21,
            "priced_records": 20,
            "unpriced_records": 1,
            "booked_service_revenue_rub": 41900,
            "expected_revenue_rub": 44000,
            "upsell_potential_rub": 3600,
            "forecast_high_rub": 47600,
            "historical_addon_attach_rate_pct": 30,
            "historical_avg_addon_rub": 600,
        }
        question = (
            "Окей спасибо! Что там по расписанию на сегодня, сколько реально "
            "записей, на какие суммы и сколько реально можно заработать, "
            "если апсейлить мощно?"
        )

        self.assertTrue(ws._owner_today_commercial_intent(question))
        reply = ws._owner_today_commercial_reply(
            948205934,
            question,
            mode="staff",
        )

        self.assertIn("Записей: 21", reply)
        self.assertIn("41 900 ₽", reply)
        self.assertIn("44 000 ₽", reply)
        self.assertIn("3 600 ₽", reply)
        self.assertIn("47 600 ₽", reply)
        self.assertIn("прогноз не является уже полученной выручкой", reply)
        self.assertNotIn("Ваша личная статистика", reply)

    def test_compound_today_schedule_question_is_owner_only(self):
        ws = _load_webhook_server()
        question = (
            "Что по расписанию на сегодня, сколько записей и сколько "
            "можно заработать на допродажах?"
        )

        self.assertIsNone(ws._owner_today_commercial_reply(
            948205934,
            question,
            mode="client",
        ))

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

    def test_gross_profit_typo_uses_one_deterministic_company_formula(self):
        ws = _load_webhook_server()
        fake_analytics = types.ModuleType("analytics")
        requested_periods = []
        def _resolve_period(period, date_from=None, date_to=None):
            requested_periods.append(period)
            return "2026-07-01", "2026-07-17", "этот месяц"
        fake_analytics.resolve_period = _resolve_period
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "salary_total": 278850,
            "masters": [{"name": "Илья Третьяков", "gross": 173000}],
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Валовая потбыль",
            mode="staff",
        )

        self.assertIn("Точную валовую прибыль бизнеса", reply)
        self.assertIn("корректно назвать нельзя", reply)
        self.assertIn("343 650 ₽", reply)
        self.assertIn("622 500 ₽", reply)
        self.assertIn("278 850 ₽", reply)
        self.assertIn("не выдаю за валовую прибыль", reply)
        self.assertNotIn("Илья Третьяков", reply)
        self.assertNotIn("лидер", reply.lower())
        self.assertEqual(requested_periods, ["month"])

    def test_salon_gross_profit_is_not_routed_to_master_ranking(self):
        ws = _load_webhook_server()
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "salary_total": 278850,
            "masters": [{"name": "Илья Третьяков", "gross": 173000}],
        }
        sys.modules["analytics"] = fake_analytics
        question = "Какая у нас в салоне валовая прибыль в текущем месяце"

        self.assertFalse(ws._business_master_analytics_intent(question))
        reply = ws._staff_financial_analytics_reply(
            948205934,
            question,
            mode="staff",
        )

        self.assertIn("343 650 ₽", reply)
        self.assertNotIn("Илья Третьяков", reply)

    def test_short_amount_followup_inherits_previous_gross_profit_metric(self):
        ws = _load_webhook_server()
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "salary_total": 278850,
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Сумму мне назови",
            mode="staff",
            history=[{
                "role": "user",
                "content": "Какая у нас в салоне валовая прибыль в текущем месяце",
            }],
        )

        self.assertIn("343 650 ₽", reply)

    def test_typo_amount_followup_inherits_previous_profit_metric(self):
        ws = _load_webhook_server()
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "salary_total": 278850,
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Сумму мнеиназови",
            mode="staff",
            history=[{
                "role": "user",
                "content": "Какая у нас в салоне валовая прибыль в текущем месяце",
            }],
        )

        self.assertIn("343 650 ₽", reply)

    def test_standalone_general_followup_switches_personal_revenue_to_business(self):
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
            "Общая",
            mode="staff",
            history=[{
                "role": "user",
                "content": "Выручка за месяц",
            }],
        )

        self.assertIn("Общая статистика бизнеса", reply)
        self.assertIn("622 500 ₽", reply)
        self.assertNotIn("99 400 ₽", reply)
        self.assertNotIn("Ваша личная статистика", reply)

    def test_bare_profit_inherits_recent_user_period(self):
        ws = _load_webhook_server()
        fake_analytics = types.ModuleType("analytics")
        requested_periods = []
        def _resolve_period(period, date_from=None, date_to=None):
            requested_periods.append(period)
            return "2026-07-13", "2026-07-17", "эта неделя"
        fake_analytics.resolve_period = _resolve_period
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 100000,
            "salary_total": 40000,
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Валовая прибыль",
            mode="staff",
            history=[{
                "role": "user",
                "content": "Покажи выручку бизнеса за эту неделю",
            }],
        )

        self.assertEqual(requested_periods, ["week"])
        self.assertIn("60 000 ₽", reply)

    def test_net_profit_is_not_invented_without_complete_expenses(self):
        ws = _load_webhook_server()
        fake_analytics = types.ModuleType("analytics")
        fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
            "2026-07-01",
            "2026-07-17",
            "этот месяц",
        )
        fake_analytics.business_summary = lambda frm, to, include_top=False: {
            "source_status": {"transactions": "ok", "records": "ok"},
            "total_gross": 622500,
            "salary_total": 278850,
        }
        sys.modules["analytics"] = fake_analytics

        reply = ws._staff_financial_analytics_reply(
            948205934,
            "Назови чистую прибыль салона за месяц",
            mode="staff",
        )

        self.assertIn("корректно назвать нельзя", reply)
        self.assertIn("не буду выдавать неполную сумму", reply)
        self.assertIn("343 650 ₽", reply)

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

    def test_client_loyalty_offer_defers_service_until_slot_is_checked(self):
        ws = _load_webhook_server()
        mem = sys.modules["memory"]
        db = sys.modules["database"]
        db.get_client = lambda _chat_id: {
            "id": 25,
            "phone": "+79990000000",
        }
        db.loyalty_balance = lambda _client_id: 600
        fake_loyalty = types.ModuleType("loyalty")
        fake_loyalty._yc_loyalty_card = lambda _phone: {"balance": 600}
        fake_loyalty.lazy_backfill_for_client = lambda _client_id, _phone: None
        fake_loyalty.loyalty_spend_summary = lambda _balance: {
            "affordable_services": [
                {"id": 1, "title": "Патчи", "price": 100},
                {"id": 2, "title": "Массаж", "price": 450},
            ],
        }
        sys.modules["loyalty"] = fake_loyalty

        first = ws._ensure_client_loyalty_chat_offer(948205934)
        second = ws._ensure_client_loyalty_chat_offer(948205934)

        self.assertTrue(first)
        self.assertFalse(second)
        history = mem.load_conversations().get("pwa:client:948205934") or []
        self.assertEqual(len(history), 1)
        self.assertIn("600 баллов", history[0]["content"])
        self.assertIn("проверю оставшееся окно", history[0]["content"])
        self.assertNotIn("Массаж — 450 баллов", history[0]["content"])
        self.assertEqual(history[0]["widget"], "book")
        self.assertEqual(history[0]["action"]["type"], "open_booking")

    def test_loyalty_booking_rechecks_combined_slot_and_spends_once(self):
        ws = _load_webhook_server()
        db = sys.modules["database"]
        ws._authed_chat_id = lambda _request, _body: 948205934
        ws._client_record_response = lambda payload, status=200: {
            "data": payload, "status": status,
        }
        ws.config.ACTIVE_MASTER_IDS = [3278920]
        db.get_client = lambda _chat_id: {
            "id": 25, "name": "Клиент", "phone": "+79990000000",
        }
        db.get_notify_prefs_by_chat_id = lambda _chat_id: {}
        calls = {"reserve": 0, "release": 0, "create": 0, "save": 0}
        db.reserve_loyalty_points = lambda **_kwargs: (
            calls.__setitem__("reserve", calls["reserve"] + 1)
            or {"ok": True, "state": "reserved", "balance": 500}
        )
        db.release_loyalty_reservation = lambda **_kwargs: calls.__setitem__(
            "release", calls["release"] + 1
        )
        db.save_booking = lambda *_args, **_kwargs: calls.__setitem__(
            "save", calls["save"] + 1
        )

        class FakeYClients:
            def get_services(self, _staff_id):
                return [
                    {"id": 10, "title": "Мужская стрижка"},
                    {"id": 11, "title": "Патчи"},
                ]

            def get_available_slots(self, _staff_id, _date, service_ids):
                self.checked_service_ids = list(service_ids)
                return [{"time": "12:00", "datetime": f"{_date}T12:00:00"}]

            def create_booking(self, **kwargs):
                calls["create"] += 1
                self.created = kwargs
                return {"success": True, "record_id": 7001}

        fake_yc = FakeYClients()
        ws._yc = fake_yc
        fake_loyalty = types.ModuleType("loyalty")
        fake_loyalty.current_care_service = lambda _title, _catalog: {
            "id": 11, "title": "Патчи", "price": 100,
        }
        fake_loyalty.lazy_backfill_for_client = lambda *_args: None
        fake_loyalty.apply_redemption_for_booking = lambda **kwargs: {
            "total_points": 100,
            "remaining": 500,
            "reservation_id": kwargs.get("reservation_id"),
        }
        sys.modules["loyalty"] = fake_loyalty

        day = (ws.datetime.now() + ws.timedelta(days=1)).strftime("%Y-%m-%d")

        class Request:
            headers = {}

            async def json(self):
                return {
                    "staff_id": 3278920,
                    "service_ids": [10, 11],
                    "datetime": day + "T12:00:00",
                    "loyalty_service_id": 11,
                    "loyalty_service_title": "Патчи",
                    "request_id": "booking_test_01",
                }

        response = asyncio.run(ws.client_book_with_loyalty_handler(Request()))

        self.assertEqual(response["status"], 200)
        self.assertEqual(response["data"]["spent_points"], 100)
        self.assertEqual(fake_yc.checked_service_ids, [10, 11])
        self.assertEqual(calls, {"reserve": 1, "release": 0, "create": 1, "save": 1})

    def test_loyalty_booking_never_spends_when_addon_does_not_fit(self):
        ws = _load_webhook_server()
        db = sys.modules["database"]
        ws._authed_chat_id = lambda _request, _body: 948205934
        ws._client_record_response = lambda payload, status=200: {
            "data": payload, "status": status,
        }
        ws.config.ACTIVE_MASTER_IDS = [3278920]
        db.get_client = lambda _chat_id: {
            "id": 25, "name": "Клиент", "phone": "+79990000000",
        }
        called = {"reserve": False, "release": False, "create": False}
        db.reserve_loyalty_points = lambda **_kwargs: (
            called.__setitem__("reserve", True)
            or {"ok": True, "state": "reserved", "balance": 500}
        )
        db.release_loyalty_reservation = lambda **_kwargs: called.__setitem__(
            "release", True
        )

        class FakeYClients:
            def get_services(self, _staff_id):
                return [
                    {"id": 10, "title": "Мужская стрижка"},
                    {"id": 11, "title": "Патчи"},
                ]

            def get_available_slots(self, _staff_id, _date, _service_ids):
                return [{"time": "13:00", "datetime": f"{_date}T13:00:00"}]

            def create_booking(self, **_kwargs):
                called["create"] = True
                return {"success": True, "record_id": 7002}

        ws._yc = FakeYClients()
        fake_loyalty = types.ModuleType("loyalty")
        fake_loyalty.current_care_service = lambda _title, _catalog: {
            "id": 11, "title": "Патчи", "price": 100,
        }
        fake_loyalty.lazy_backfill_for_client = lambda *_args: None
        sys.modules["loyalty"] = fake_loyalty
        day = (ws.datetime.now() + ws.timedelta(days=1)).strftime("%Y-%m-%d")

        class Request:
            headers = {}

            async def json(self):
                return {
                    "staff_id": 3278920,
                    "service_ids": [10, 11],
                    "datetime": day + "T12:00:00",
                    "loyalty_service_id": 11,
                    "loyalty_service_title": "Патчи",
                    "request_id": "booking_test_02",
                }

        response = asyncio.run(ws.client_book_with_loyalty_handler(Request()))

        self.assertEqual(response["status"], 409)
        self.assertEqual(response["data"]["code"], "slot_taken")
        self.assertEqual(called, {"reserve": True, "release": True, "create": False})

    def test_loyalty_booking_retry_returns_finalized_record_before_slot_check(self):
        ws = _load_webhook_server()
        db = sys.modules["database"]
        ws._authed_chat_id = lambda _request, _body: 948205934
        ws._client_record_response = lambda payload, status=200: {
            "data": payload, "status": status,
        }
        ws.config.ACTIVE_MASTER_IDS = [3278920]
        db.get_client = lambda _chat_id: {
            "id": 25, "name": "Клиент", "phone": "+79990000000",
        }
        db.reserve_loyalty_points = lambda **_kwargs: {
            "ok": True,
            "state": "finalized",
            "record_id": 7003,
            "points": 100,
            "balance": 500,
        }
        called = {"slots": False, "create": False}

        class FakeYClients:
            def get_services(self, _staff_id):
                return [
                    {"id": 10, "title": "Мужская стрижка"},
                    {"id": 11, "title": "Патчи"},
                ]

            def get_available_slots(self, *_args):
                called["slots"] = True
                return []

            def create_booking(self, **_kwargs):
                called["create"] = True
                return {"success": True, "record_id": 9999}

        ws._yc = FakeYClients()
        fake_loyalty = types.ModuleType("loyalty")
        fake_loyalty.current_care_service = lambda _title, _catalog: {
            "id": 11, "title": "Патчи", "price": 100,
        }
        fake_loyalty.lazy_backfill_for_client = lambda *_args: None
        sys.modules["loyalty"] = fake_loyalty
        day = (ws.datetime.now() + ws.timedelta(days=1)).strftime("%Y-%m-%d")

        class Request:
            headers = {}

            async def json(self):
                return {
                    "staff_id": 3278920,
                    "service_ids": [10, 11],
                    "datetime": day + "T12:00:00",
                    "loyalty_service_id": 11,
                    "loyalty_service_title": "Патчи",
                    "request_id": "booking_test_03",
                }

        response = asyncio.run(ws.client_book_with_loyalty_handler(Request()))

        self.assertEqual(response["status"], 200)
        self.assertEqual(response["data"]["record_id"], 7003)
        self.assertTrue(response["data"]["idempotent"])
        self.assertEqual(called, {"slots": False, "create": False})

    def test_repeat_booking_offer_is_grounded_and_deduplicated(self):
        ws = _load_webhook_server()
        mem = sys.modules["memory"]
        db = sys.modules["database"]
        db.get_client = lambda _chat_id: {"id": 25, "phone": "+79990000000"}
        mem.get_usual_booking = lambda _chat_id, warm=False: {
            "master_id": 3278920,
            "master_name": "Александр Киянский",
            "service_text": "Мужская стрижка, Борода",
            "service_ids": [10, 11],
            "service_names": ["Мужская стрижка", "Борода"],
            "visit_date": "2026-07-01T12:00:00+03:00",
            "source": "yclients_history",
        }
        ws._yc.get_client_bookings = lambda *_args, **_kwargs: []

        first = ws._ensure_client_repeat_booking_offer(948205934)
        second = ws._ensure_client_repeat_booking_offer(948205934)

        self.assertTrue(first)
        self.assertFalse(second)
        history = mem.load_conversations().get("pwa:client:948205934") or []
        self.assertEqual(len(history), 1)
        self.assertIn("Вам как в прошлый раз", history[0]["content"])
        self.assertEqual(history[0]["action"]["type"], "repeat_booking")

    def test_repeat_booking_offer_is_suppressed_for_upcoming_visit(self):
        ws = _load_webhook_server()
        mem = sys.modules["memory"]
        db = sys.modules["database"]
        db.get_client = lambda _chat_id: {"id": 25, "phone": "+79990000000"}
        mem.get_usual_booking = lambda _chat_id, warm=False: {
            "master_id": 3278920,
            "master_name": "Александр Киянский",
            "service_text": "Мужская стрижка",
            "service_ids": [10],
            "service_names": ["Мужская стрижка"],
            "visit_date": "2026-07-01T12:00:00+03:00",
            "source": "yclients_history",
        }
        ws._yc.get_client_bookings = lambda *_args, **_kwargs: [{
            "datetime": "2099-01-01T12:00:00+03:00",
            "attendance": 0,
        }]

        offered = ws._ensure_client_repeat_booking_offer(948205934)

        self.assertFalse(offered)
        self.assertFalse(mem.load_conversations().get("pwa:client:948205934"))

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

    def test_yes_after_repeat_offer_returns_prefilled_booking_widget(self):
        ws = _load_webhook_server()
        sys.modules["memory"].get_usual_booking = lambda _chat_id, warm=False: {
            "master_id": 3278920,
            "master_name": "Александр Киянский",
            "service_text": "Мужская стрижка, Борода",
            "service_ids": [10, 11],
            "service_names": ["Мужская стрижка", "Борода"],
        }
        history = [{
            "role": "assistant",
            "content": "Вам как в прошлый раз?",
            "action": {"type": "repeat_booking"},
        }]

        result = ws._client_repeat_booking_decision(948205934, "Да", history)

        self.assertEqual(result["widget"], "book")
        self.assertTrue(result["widget_data"]["repeat_booking"])
        self.assertEqual(result["widget_data"]["master_id"], "3278920")
        self.assertEqual(result["widget_data"]["service_ids"], ["10", "11"])
        self.assertIn("Выберите только дату и время", result["reply"])

    def test_natural_confirmation_after_repeat_offer_is_supported(self):
        ws = _load_webhook_server()
        sys.modules["memory"].get_usual_booking = lambda _chat_id, warm=False: {
            "master_id": 3278920,
            "master_name": "Александр Киянский",
            "service_text": "Мужская стрижка",
            "service_ids": [10],
            "service_names": ["Мужская стрижка"],
        }
        history = [{
            "role": "assistant",
            "content": "Вам как в прошлый раз?",
            "action": {"type": "repeat_booking"},
        }]

        for answer in ("Ага", "Давай так", "То же самое"):
            with self.subTest(answer=answer):
                result = ws._client_repeat_booking_decision(
                    948205934,
                    answer,
                    history,
                )
                self.assertEqual(result["widget"], "book")
                self.assertTrue(result["widget_data"]["repeat_booking"])

    def test_plain_yes_without_repeat_offer_is_not_intercepted(self):
        ws = _load_webhook_server()

        self.assertIsNone(ws._client_repeat_booking_decision(
            948205934,
            "Да",
            [{"role": "assistant", "content": "Хотите сертификат?"}],
        ))

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
