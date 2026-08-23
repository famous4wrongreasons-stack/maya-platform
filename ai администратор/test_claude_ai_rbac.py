import importlib
import json
import sys
import types
import unittest


def _load_claude_ai():
    logs = []
    admin_ids = {948205934, 339683535}

    fake_anthropic = types.ModuleType("anthropic")

    class _DummyAnthropic:
        def __init__(self, *args, **kwargs):
            pass

    fake_anthropic.Anthropic = _DummyAnthropic

    fake_httpx = types.ModuleType("httpx")

    class _DummyClient:
        def __init__(self, *args, **kwargs):
            pass

    fake_httpx.Client = _DummyClient
    fake_httpx.Response = type("Response", (), {})

    fake_ai_billing = types.ModuleType("ai_billing")
    fake_ai_billing.log_openai_usage = lambda *args, **kwargs: None
    fake_ai_billing.log_anthropic_usage = lambda *args, **kwargs: None

    fake_database = types.ModuleType("database")
    fake_database.log_tool_call = lambda *args, **kwargs: logs.append(args)
    fake_database.is_admin = lambda user_id: int(user_id) in admin_ids
    fake_database.get_master_by_chat_id = lambda user_id: None
    fake_database.get_maya_audience_stats = lambda: {
        "telegram_connected": 22,
        "identified_clients": 13,
        "marketing_consented": 14,
        "reactivation_reachable": 7,
    }

    fake_config = types.ModuleType("config")
    fake_config.PROXY_URL = ""
    fake_config.OPENAI_API_KEY = ""
    fake_config.OPENAI_BASE_URL = "https://example.test/v1"
    fake_config.OPENAI_CHAT_MODEL = "gpt-test"
    fake_config.OPENAI_FAST_MODEL = "gpt-test-fast"
    fake_config.OPENAI_TELEGRAM_CHAT_MODEL = "gpt-test-telegram"
    fake_config.OPENAI_PWA_CHAT_MODEL = "gpt-5.5-pro"
    fake_config.OPENAI_CLIENT_REASONING_EFFORT = "medium"
    fake_config.OPENAI_VOICE_CHAT_MODEL = "gpt-test-voice"
    fake_config.DEEPSEEK_API_KEY = "deepseek-test-key"
    fake_config.DEEPSEEK_BASE_URL = "https://deepseek.example.test"
    fake_config.DEEPSEEK_PROXY_URL = ""
    fake_config.DEEPSEEK_THINKING = "disabled"

    fake_identity_utils = types.ModuleType("identity_utils")

    def _resolve_ai_role(*, is_founder: bool, is_admin: bool, is_master: bool):
        if is_founder:
            return "founder"
        if is_admin:
            return "manager"
        if is_master:
            return "master"
        return "client"

    fake_identity_utils.resolve_ai_role = _resolve_ai_role

    fake_memory = types.ModuleType("memory")
    fake_memory.build_context = lambda user_id: ""

    fake_prompts = types.ModuleType("prompts")
    fake_prompts.SYSTEM_PROMPT = "test"

    fake_yclients = types.ModuleType("yclients")

    class _DummyYClientsAPI:
        def __init__(self, *args, **kwargs):
            pass

        def get_services(self, *args, **kwargs):
            return []

        def get_masters(self, *args, **kwargs):
            return [{"id": 7, "name": "Стас Мосин"}]

        def get_master_schedule_for_date(self, staff_id, date_str):
            return {
                "success": True,
                "status": "working",
                "schedule_unknown": False,
                "staff_id": staff_id,
                "date": date_str,
                "is_working": True,
                "slots": [{"from": "10:00", "to": "20:00"}],
                "hours": "10:00–20:00",
            }

        def who_works_on(self, date_str):
            return {
                "date": date_str,
                "working": [{"name": "Стас Мосин", "hours": "10:00–20:00"}],
                "off": [],
                "unknown": [],
                "schedule_unknown": False,
                "working_count": 1,
            }

        def change_staff_day_schedule(self, **kwargs):
            return {
                "success": True,
                "status": "applied" if kwargs.get("apply") else "preview",
                "staff_id": kwargs.get("staff_id"),
                "date": kwargs.get("date_str"),
                "proposed_slots": [],
            }

    fake_yclients.YClientsAPI = _DummyYClientsAPI
    fake_yclients.get_schedule_from_file = lambda *args, **kwargs: []
    fake_yclients.get_day_hours = lambda *args, **kwargs: None

    fake_owner_ai = types.ModuleType("owner_ai")
    fake_owner_ai.daily_briefing = lambda: {"date": "2026-07-08", "ok": True}
    fake_owner_ai.command_center = lambda: {
        "version": "owner_command_center_v1",
        "control_focus": {"headline": "Фокус контроля", "items": [{"title": "Контроль"}]},
        "summary": {"top_control": {"title": "Контроль"}},
        "control_queue": [{"title": "Контроль"}],
    }
    fake_owner_ai.run_autonomous_director_tick = lambda **kwargs: {
        "ok": True,
        "mode": "supervised_autopilot",
        "created_count": min(int(kwargs.get("limit") or 5), 2),
        "created": [],
        "note": "Созданы только внутренние контрольные задачи.",
    }
    fake_owner_ai.run_autopilot_supervision_tick = lambda **kwargs: {
        "ok": True,
        "mode": "internal_supervision",
        "applied_count": min(int(kwargs.get("limit") or 8), 3),
        "created_count": 1,
        "updated_count": 2,
        "note": "Внутренний контроль проведён.",
    }
    fake_owner_ai.run_execution_loop_tick = lambda **kwargs: {
        "ok": True,
        "mode": "closed_loop_control",
        "created_count": min(int(kwargs.get("limit") or 6), 2),
        "skipped_count": 0,
        "note": "Замкнутый цикл проверен.",
    }
    fake_owner_ai.run_operating_rhythm_tick = lambda **kwargs: {
        "ok": True,
        "mode": "safe_scheduler",
        "skipped": False,
        "summary": {"created_count": 1, "updated_count": 1, "safe_only": True},
        "note": "Операционный ритм выполнен.",
    }
    fake_owner_ai.create_control_task = lambda **kwargs: {
        "ok": True,
        "task_id": 7,
        "control_item": {
            "title": kwargs.get("title"),
            "status": kwargs.get("priority") or "medium",
        },
    }
    fake_owner_ai.update_control_task = lambda **kwargs: {
        "ok": True,
        "task": {
            "id": kwargs.get("task_id"),
            "status": "done" if kwargs.get("action") == "complete" else "pending",
        },
    }
    fake_owner_ai.master_performance = lambda **kwargs: {
        "top_profit_master": {"name": "Мастер 1", "profit_after_salary_rub": 26000},
        "top_gross_master": {"name": "Мастер 1", "gross_rub": 40000},
        "note": "Вклад после процента.",
    }
    fake_owner_ai.client_registry_analysis = lambda **kwargs: {
        "success": True,
        "complete": True,
        "total_cards": 4000,
        "loyal_clients": 1800,
    }
    fake_owner_ai.return_candidates = lambda **kwargs: {
        "success": True,
        "candidates": [],
    }
    fake_owner_ai.empty_windows = lambda **kwargs: {
        "success": True,
        "windows": [],
    }
    fake_owner_ai.expiring_assets = lambda **kwargs: {
        "success": True,
        "items": [],
    }
    fake_owner_ai.service_insights = lambda **kwargs: {
        "success": True,
        "services": [],
    }
    fake_owner_ai.risk_signals = lambda **kwargs: {
        "success": True,
        "risks": [],
    }
    fake_owner_ai.money_opportunities = lambda **kwargs: []
    fake_owner_ai.owner_action_payload = lambda task, **kwargs: {
        "kind": "run_job",
        "job": task,
        "label": "Запустить",
        "title": kwargs.get("title") or "Тест",
    }
    fake_growth_planner = types.ModuleType("growth_planner")
    fake_growth_planner.get_growth_plan = lambda **kwargs: {
        "version": "maya_growth_plan_v1",
        "role": kwargs.get("role"),
        "masters": [],
    }
    fake_growth_planner.set_growth_goal = lambda **kwargs: {
        "ok": True,
        "goal": {"target_rub": kwargs.get("target_rub")},
    }

    for name, module in {
        "anthropic": fake_anthropic,
        "httpx": fake_httpx,
        "ai_billing": fake_ai_billing,
        "database": fake_database,
        "config": fake_config,
        "identity_utils": fake_identity_utils,
        "memory": fake_memory,
        "prompts": fake_prompts,
        "yclients": fake_yclients,
        "owner_ai": fake_owner_ai,
        "growth_planner": fake_growth_planner,
    }.items():
        sys.modules[name] = module

    sys.modules.pop("claude_ai", None)
    mod = importlib.import_module("claude_ai")
    mod._ROLE_TOOLS_CACHED.clear()
    mod._ROLE_MODE_TOOLS_CACHED.clear()
    return mod, logs


class ClaudeAIRBACTests(unittest.TestCase):
    def test_manager_gets_only_role_aware_growth_plan(self):
        claude_ai, _ = _load_claude_ai()
        result = json.loads(claude_ai._execute_tool("get_growth_plan", {}, user_id=339683535))
        self.assertEqual(result["role"], "manager")
        self.assertTrue(claude_ai._authorize("manager", "get_growth_plan"))
        self.assertFalse(claude_ai._authorize("client", "get_growth_plan"))

    def test_founder_can_set_growth_goal(self):
        claude_ai, _ = _load_claude_ai()
        result = json.loads(claude_ai._execute_tool(
            "set_growth_goal",
            {"target_rub": 1500000, "workstations_count": 5},
            user_id=948205934,
        ))
        self.assertTrue(result["ok"])
        self.assertEqual(result["goal"]["target_rub"], 1500000)

    def test_manager_can_read_maya_audience_stats(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool("get_maya_audience_stats", {}, user_id=339683535)
        )

        self.assertEqual(result["telegram_connected"], 22)
        self.assertEqual(result["reactivation_reachable"], 7)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "get_maya_audience_stats")
        self.assertEqual(logs[-1][3], "read")
        self.assertTrue(logs[-1][4])

    def test_client_cannot_read_maya_audience_stats(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool("get_maya_audience_stats", {}, user_id=123456)
        )

        self.assertIn("error", result)
        self.assertEqual(logs[-1][1], "client")
        self.assertEqual(logs[-1][2], "get_maya_audience_stats")
        self.assertEqual(logs[-1][3], "read")
        self.assertFalse(logs[-1][4])

    def test_manager_admin_cannot_call_owner_director_tools(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(claude_ai._execute_tool("get_daily_briefing", {}, user_id=339683535))

        self.assertIn("error", result)
        self.assertTrue(logs)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "get_daily_briefing")
        self.assertFalse(logs[-1][4])

        result = json.loads(
            claude_ai._execute_tool("run_autonomous_director_tick", {"limit": 2}, user_id=339683535)
        )
        self.assertIn("error", result)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "run_autonomous_director_tick")
        self.assertFalse(logs[-1][4])

        result = json.loads(
            claude_ai._execute_tool("run_autopilot_supervision_tick", {"limit": 3}, user_id=339683535)
        )
        self.assertIn("error", result)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "run_autopilot_supervision_tick")
        self.assertFalse(logs[-1][4])

        result = json.loads(
            claude_ai._execute_tool("run_execution_loop_tick", {"limit": 2}, user_id=339683535)
        )
        self.assertIn("error", result)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "run_execution_loop_tick")
        self.assertFalse(logs[-1][4])

        result = json.loads(
            claude_ai._execute_tool("run_operating_rhythm_tick", {"force": True}, user_id=339683535)
        )
        self.assertIn("error", result)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "run_operating_rhythm_tick")
        self.assertFalse(logs[-1][4])

    def test_founder_can_prepare_salon_action_without_execution(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "salon_action",
                {"task": "reactivation", "title": "Вернуть клиентов"},
                user_id=948205934,
            )
        )

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["kind"], "run_job")
        self.assertEqual(result["job"], "reactivation")
        self.assertTrue(logs)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "salon_action")
        self.assertTrue(logs[-1][4])

    def test_founder_can_read_master_performance(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool("get_master_performance", {}, user_id=948205934)
        )

        self.assertEqual(result["top_profit_master"]["name"], "Мастер 1")
        self.assertEqual(result["top_profit_master"]["profit_after_salary_rub"], 26000)
        self.assertTrue(logs)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "get_master_performance")
        self.assertTrue(logs[-1][4])

    def test_manager_business_report_view_redacts_salary_and_profit(self):
        claude_ai, _logs = _load_claude_ai()

        result = claude_ai._manager_business_report_view({
            "total_gross": 100000,
            "salary_total": 35000,
            "profit_after_salary_total_rub": 65000,
            "masters": [
                {
                    "name": "Мастер 1",
                    "gross": 60000,
                    "salary": 21000,
                    "percent": 35,
                    "profit_after_salary_rub": 39000,
                }
            ],
        })

        self.assertEqual(result["total_gross"], 100000)
        self.assertNotIn("salary_total", result)
        self.assertNotIn("profit_after_salary_total_rub", result)
        self.assertEqual(result["masters"][0]["gross"], 60000)
        self.assertNotIn("salary", result["masters"][0])
        self.assertNotIn("profit_after_salary_rub", result["masters"][0])

    def test_founder_can_read_owner_command_center(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool("get_owner_command_center", {}, user_id=948205934)
        )

        self.assertEqual(result["version"], "owner_command_center_v1")
        self.assertEqual(result["control_focus"]["headline"], "Фокус контроля")
        self.assertEqual(result["summary"]["top_control"]["title"], "Контроль")
        self.assertEqual(result["control_queue"][0]["title"], "Контроль")
        self.assertTrue(logs)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "get_owner_command_center")
        self.assertTrue(logs[-1][4])

    def test_founder_can_create_owner_control_task(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "create_owner_control_task",
                {"title": "Проверить план-факт", "priority": "high", "due_in_days": 1},
                user_id=948205934,
            )
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["task_id"], 7)
        self.assertEqual(result["control_item"]["title"], "Проверить план-факт")
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "create_owner_control_task")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_founder_can_update_owner_control_task(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "update_owner_control_task",
                {"task_id": 7, "action": "complete", "note": "Проверено"},
                user_id=948205934,
            )
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["task"]["id"], 7)
        self.assertEqual(result["task"]["status"], "done")
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "update_owner_control_task")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_founder_can_run_autonomous_director_tick(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "run_autonomous_director_tick",
                {"limit": 2},
                user_id=948205934,
            )
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "supervised_autopilot")
        self.assertEqual(result["created_count"], 2)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "run_autonomous_director_tick")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_founder_can_run_autopilot_supervision_tick(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "run_autopilot_supervision_tick",
                {"limit": 3},
                user_id=948205934,
            )
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "internal_supervision")
        self.assertEqual(result["applied_count"], 3)
        self.assertEqual(result["created_count"], 1)
        self.assertEqual(result["updated_count"], 2)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "run_autopilot_supervision_tick")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_founder_can_run_execution_loop_tick(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "run_execution_loop_tick",
                {"limit": 2},
                user_id=948205934,
            )
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "closed_loop_control")
        self.assertEqual(result["created_count"], 2)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "run_execution_loop_tick")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_founder_can_run_operating_rhythm_tick(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "run_operating_rhythm_tick",
                {"force": True},
                user_id=948205934,
            )
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "safe_scheduler")
        self.assertFalse(result["skipped"])
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "run_operating_rhythm_tick")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_pro_model_uses_responses_api_route(self):
        claude_ai, _logs = _load_claude_ai()
        seen = {}

        def _fake_responses_completion(body):
            seen["body"] = body
            return {
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "Готово."}],
                    },
                    {
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "salon_action",
                        "arguments": json.dumps({"task": "reactivation"}),
                    },
                ],
            }

        claude_ai._responses_completion = _fake_responses_completion
        claude_ai._chat_completion = lambda _body: self.fail("Chat Completions route must not be used for -pro models")

        text, tool_uses = claude_ai._brain_turn(
            [{"role": "user", "content": "Покажи action"}],
            user_id=948205934,
            role="founder",
            mdl="gpt-5.5-pro",
            max_tokens=420,
            disabled_tools=set(),
            mode="staff",
        )

        self.assertEqual(text, "Готово.")
        self.assertEqual(len(tool_uses), 1)
        self.assertEqual(tool_uses[0].name, "salon_action")
        self.assertEqual(tool_uses[0].input, {"task": "reactivation"})
        self.assertEqual(seen["body"]["model"], "gpt-5.5-pro")
        self.assertIn("input", seen["body"])
        self.assertNotIn("messages", seen["body"])
        self.assertGreaterEqual(seen["body"]["max_output_tokens"], 2048)

    def test_client_pro_keeps_model_and_uses_medium_reasoning(self):
        claude_ai, _logs = _load_claude_ai()

        body = claude_ai._responses_body(
            [{"role": "user", "content": "Хочу записаться на стрижку"}],
            user_id=123,
            role="client",
            model="gpt-5.5-pro",
            mode="client",
        )

        self.assertEqual(body["model"], "gpt-5.5-pro")
        self.assertEqual(body["reasoning"], {"effort": "medium"})
        self.assertTrue(body["parallel_tool_calls"])

    def test_staff_pro_does_not_get_client_reasoning_override(self):
        claude_ai, _logs = _load_claude_ai()

        body = claude_ai._responses_body(
            [{"role": "user", "content": "Покажи отчёт"}],
            user_id=948205934,
            role="founder",
            model="gpt-5.5-pro",
            mode="staff",
        )

        self.assertNotIn("reasoning", body)

    def test_deepseek_pro_uses_chat_completions_without_thinking(self):
        claude_ai, _logs = _load_claude_ai()

        body = claude_ai._openai_body(
            [{"role": "user", "content": "Хочу записаться на стрижку"}],
            user_id=123,
            role="client",
            model="deepseek-v4-pro",
            mode="client",
        )

        self.assertFalse(claude_ai._uses_responses_api(body["model"]))
        self.assertIn("messages", body)
        self.assertNotIn("input", body)
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertEqual(body["max_tokens"], 1024)

    def test_deepseek_request_uses_direct_endpoint_and_separate_client(self):
        claude_ai, _logs = _load_claude_ai()
        seen = {}

        class _Response:
            status_code = 200

            @staticmethod
            def json():
                return {"choices": [{"message": {"content": "Готово."}}]}

        class _Client:
            @staticmethod
            def post(url, headers, json):
                seen.update(url=url, headers=headers, body=json)
                return _Response()

        claude_ai._deepseek_client = _Client()
        claude_ai._openai_client = object()
        data = claude_ai._chat_completion({
            "model": "deepseek-v4-flash",
            "messages": [{"role": "user", "content": "Привет"}],
        })

        self.assertEqual(data["choices"][0]["message"]["content"], "Готово.")
        self.assertEqual(seen["url"], "https://deepseek.example.test/chat/completions")
        self.assertEqual(seen["headers"]["Authorization"], "Bearer deepseek-test-key")

    def test_deepseek_tool_call_uses_existing_server_tool_loop(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._responses_completion = lambda _body: self.fail(
            "DeepSeek V4 Pro must not use OpenAI Responses API"
        )
        claude_ai._chat_completion = lambda _body: {
            "choices": [{
                "message": {
                    "content": "",
                    "tool_calls": [{
                        "id": "call_ds_1",
                        "type": "function",
                        "function": {
                            "name": "get_services",
                            "arguments": "{}",
                        },
                    }],
                }
            }],
            "usage": {},
        }

        text, tool_uses = claude_ai._brain_turn(
            [{"role": "user", "content": "Сколько стоит стрижка?"}],
            user_id=123,
            role="client",
            mdl="deepseek-v4-pro",
            max_tokens=1024,
            disabled_tools=set(),
            mode="client",
        )

        self.assertEqual(text, "")
        self.assertEqual(len(tool_uses), 1)
        self.assertEqual(tool_uses[0].name, "get_services")
        self.assertEqual(tool_uses[0].input, {})

    def test_factual_price_reply_is_blocked_when_model_skips_tool(self):
        claude_ai, _logs = _load_claude_ai()
        calls = []

        def _brain_turn(*args, **kwargs):
            calls.append("brain")
            return "Стрижка стоит 9 999 ₽.", []

        claude_ai._brain_turn = _brain_turn

        text, contact_request, action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Сколько стоит стрижка?"}],
            user_id=123,
            model="deepseek-v4-pro",
            mode="client",
        )

        self.assertEqual(calls, ["brain", "brain"])
        self.assertIn("не буду ничего додумывать", text)
        self.assertNotIn("9 999", text)
        self.assertIsNone(contact_request)
        self.assertIsNone(action)

    def test_factual_price_reply_accepts_only_numbers_from_tool_result(self):
        claude_ai, _logs = _load_claude_ai()
        turns = iter([
            ("", [claude_ai._ToolUse(id="price", name="get_services", input={})]),
            ("Мужская стрижка стоит 2 000 ₽.", []),
        ])
        claude_ai._brain_turn = lambda *args, **kwargs: next(turns)
        claude_ai._run_tool_uses = lambda *args, **kwargs: (
            [{
                "type": "tool_result",
                "tool_use_id": "price",
                "content": json.dumps({
                    "services": [{"title": "Мужская стрижка", "price": 2000}],
                }, ensure_ascii=False),
            }],
            None,
            None,
        )

        text, _contact_request, _action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Сколько стоит стрижка?"}],
            user_id=123,
            model="deepseek-v4-pro",
            mode="client",
        )

        self.assertEqual(text, "Мужская стрижка стоит 2 000 ₽.")

    def test_grounded_numeric_mismatch_fails_closed_after_tool_call(self):
        claude_ai, _logs = _load_claude_ai()
        turns = iter([
            ("", [claude_ai._ToolUse(id="price", name="get_services", input={})]),
            ("Мужская стрижка стоит 9 999 ₽.", []),
        ])
        claude_ai._brain_turn = lambda *args, **kwargs: next(turns)
        claude_ai._run_tool_uses = lambda *args, **kwargs: (
            [{
                "type": "tool_result",
                "tool_use_id": "price",
                "content": json.dumps({"price": 2000}),
            }],
            None,
            None,
        )

        text, _contact_request, _action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Сколько стоит стрижка?"}],
            user_id=123,
            model="deepseek-v4-pro",
            mode="client",
        )

        self.assertIn("не буду ничего додумывать", text)
        self.assertNotIn("9 999", text)

    def test_stream_resets_unverified_factual_text_and_fails_closed(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._stream_chat_completion = lambda _body: iter([{
            "choices": [{"delta": {"content": "Стрижка стоит 9 999 ₽."}}],
        }])

        events = list(claude_ai.get_ai_response_stream(
            [{"role": "user", "content": "Сколько стоит стрижка?"}],
            user_id=123,
            model="deepseek-v4-pro",
            mode="client",
        ))

        self.assertEqual(sum(event["type"] == "reset" for event in events), 2)
        self.assertEqual(events[-1]["type"], "meta")
        self.assertIn("не буду ничего додумывать", events[-1]["text"])
        self.assertNotIn("9 999", events[-1]["text"])

    def test_generic_client_request_sends_only_small_tool_subset(self):
        claude_ai, _logs = _load_claude_ai()

        body = claude_ai._responses_body(
            [{"role": "user", "content": "Привет, как дела?"}],
            user_id=123,
            role="client",
            model="gpt-5.5-pro",
            mode="client",
        )
        names = {tool["name"] for tool in body["tools"]}

        self.assertEqual(names, {"get_services", "get_masters", "show_chat_widget"})
        self.assertNotIn("check_birthday_promo", names)

    def test_internal_client_policy_does_not_turn_greeting_into_availability_request(self):
        claude_ai, _logs = _load_claude_ai()
        policy = (
            "\n\n[Это клиентский кабинет MAYA. Здесь отвечай про запись, услуги, "
            "мастеров и свободное время.]"
        )
        messages = [{"role": "user", "content": "Привет" + policy}]

        requirement = claude_ai._grounding_requirement(
            messages, "founder", "client", user_id=339683535,
        )
        body = claude_ai._responses_body(
            messages,
            user_id=339683535,
            role="founder",
            model="gpt-5.5-pro",
            mode="client",
        )

        self.assertIsNone(requirement)
        self.assertEqual(
            {tool["name"] for tool in body["tools"]},
            {"get_services", "get_masters", "show_chat_widget"},
        )

    def test_real_availability_request_remains_grounded_with_internal_policy(self):
        claude_ai, _logs = _load_claude_ai()
        messages = [{
            "role": "user",
            "content": (
                "Покажи ближайшее свободное окно"
                "\n\n[Это клиентский кабинет MAYA. Здесь отвечай про свободное время.]"
            ),
        }]

        requirement = claude_ai._grounding_requirement(
            messages, "founder", "client", user_id=339683535,
        )

        self.assertIsNotNone(requirement)
        self.assertEqual(requirement.domain, "booking_availability")

    def test_booking_client_request_keeps_booking_tools(self):
        claude_ai, _logs = _load_claude_ai()

        body = claude_ai._responses_body(
            [{"role": "user", "content": "Запиши меня завтра на стрижку"}],
            user_id=123,
            role="client",
            model="gpt-5.5-pro",
            mode="client",
        )
        names = {tool["name"] for tool in body["tools"]}

        self.assertIn("get_available_slots", names)
        self.assertIn("find_nearest_slots", names)
        self.assertIn("request_booking", names)
        self.assertNotIn("show_subscription_plans", names)
        self.assertNotIn("check_birthday_promo", names)

    def test_client_terminal_booking_action_avoids_second_pro_round(self):
        claude_ai, _logs = _load_claude_ai()
        calls = []

        def _brain_turn(*args, **kwargs):
            calls.append("brain")
            return "", [claude_ai._ToolUse(
                id="call_booking",
                name="request_booking",
                input={},
            )]

        claude_ai._brain_turn = _brain_turn
        claude_ai._run_tool_uses = lambda *args, **kwargs: (
            [],
            {
                "staff_id": 1,
                "staff_name": "Стас Мосин",
                "service_ids": [1],
                "service_names": ["Мужская стрижка"],
                "datetime_str": "2026-07-11T10:00:00",
            },
            None,
        )

        text, contact_request, action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Оформляй"}],
            user_id=123,
            model="gpt-5.5-pro",
            mode="client",
        )

        self.assertEqual(calls, ["brain"])
        self.assertIn("оформление", text)
        self.assertIsNotNone(contact_request)
        self.assertIsNone(action)

    def test_explicit_booking_confirmation_recovers_observed_telegram_request(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 23)
        claude_ai.yclients.get_services = lambda staff_id=None: [{
            "id": 101,
            "title": "Мужская стрижка",
        }]
        messages = [
            {
                "role": "assistant",
                "content": (
                    "Записываю тебя к Стасу Мосину на «Мужскую стрижку» "
                    "сегодня в 11:00 — оформляем?"
                ),
            },
            {"role": "user", "content": "Да"},
        ]

        tool_use = claude_ai._booking_confirmation_tool_use(
            messages,
            "client",
            set(),
            None,
        )

        self.assertIsNotNone(tool_use)
        self.assertEqual(tool_use.name, "request_booking")
        self.assertEqual(tool_use.input, {
            "staff_name": "Стас Мосин",
            "service_names": ["Мужская стрижка"],
            "datetime_str": "2026-08-23T11:00:00",
        })

    def test_booking_confirmation_does_not_guess_from_unrelated_yes(self):
        claude_ai, _logs = _load_claude_ai()
        messages = [
            {"role": "assistant", "content": "Показать цены на услуги?"},
            {"role": "user", "content": "Да"},
        ]

        tool_use = claude_ai._booking_confirmation_tool_use(
            messages,
            "client",
            set(),
            None,
        )

        self.assertIsNone(tool_use)

    def test_booking_confirmation_is_disabled_on_staff_surface(self):
        claude_ai, _logs = _load_claude_ai()
        messages = [
            {
                "role": "assistant",
                "content": (
                    "Записываю тебя к Стасу Мосину на «Мужскую стрижку» "
                    "сегодня в 11:00 — оформляем?"
                ),
            },
            {"role": "user", "content": "Да"},
        ]

        tool_use = claude_ai._booking_confirmation_tool_use(
            messages,
            "founder",
            set(),
            "staff",
        )

        self.assertIsNone(tool_use)

    def test_booking_confirmation_bypasses_model_and_emits_contact_request(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 23)
        claude_ai.yclients.get_services = lambda staff_id=None: [{
            "id": 101,
            "title": "Мужская стрижка",
        }]
        contact = {
            "staff_id": 7,
            "staff_name": "Стас Мосин",
            "service_ids": [101],
            "service_names": ["Мужская стрижка"],
            "datetime_str": "2026-08-23T11:00:00",
        }
        claude_ai._brain_turn = lambda *args, **kwargs: self.fail(
            "model must not run after an explicit server-verifiable confirmation"
        )
        claude_ai._run_tool_uses = lambda *args, **kwargs: (
            [{
                "type": "tool_result",
                "tool_use_id": "server_confirmed_booking",
                "content": json.dumps({"status": "ready"}),
            }],
            contact,
            None,
        )
        messages = [
            {
                "role": "assistant",
                "content": (
                    "Записываю тебя к Стасу Мосину на «Мужскую стрижку» "
                    "сегодня в 11:00 — оформляем?"
                ),
            },
            {"role": "user", "content": "Да"},
        ]

        text, contact_request, action = claude_ai.get_ai_response(
            messages,
            user_id=123,
            mode=None,
        )

        self.assertEqual(text, "Передаю запись на оформление.")
        self.assertEqual(contact_request, contact)
        self.assertIsNone(action)

    def test_booking_confirmation_reports_slot_rejection_without_model_claim(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 23)
        claude_ai.yclients.get_services = lambda staff_id=None: [{
            "id": 101,
            "title": "Мужская стрижка",
        }]
        claude_ai._brain_turn = lambda *args, **kwargs: self.fail(
            "model must not replace an authoritative slot rejection"
        )
        claude_ai._run_tool_uses = lambda *args, **kwargs: (
            [{
                "type": "tool_result",
                "tool_use_id": "server_confirmed_booking",
                "content": json.dumps({
                    "status": "error",
                    "error": "slot_taken",
                    "message": "11:00 уже занято. Ничего не создано.",
                }, ensure_ascii=False),
            }],
            None,
            None,
        )
        messages = [
            {
                "role": "assistant",
                "content": (
                    "Записываю тебя к Стасу Мосину на «Мужскую стрижку» "
                    "сегодня в 11:00 — оформляем?"
                ),
            },
            {"role": "user", "content": "Да"},
        ]

        text, contact_request, action = claude_ai.get_ai_response(
            messages,
            user_id=123,
            mode=None,
        )

        self.assertEqual(text, "11:00 уже занято. Ничего не создано.")
        self.assertIsNone(contact_request)
        self.assertIsNone(action)

    def test_stream_booking_confirmation_has_same_contact_request(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 23)
        claude_ai.yclients.get_services = lambda staff_id=None: [{
            "id": 101,
            "title": "Мужская стрижка",
        }]
        contact = {
            "staff_id": 7,
            "staff_name": "Стас Мосин",
            "service_ids": [101],
            "service_names": ["Мужская стрижка"],
            "datetime_str": "2026-08-23T11:00:00",
        }
        claude_ai._run_tool_uses = lambda *args, **kwargs: (
            [{
                "type": "tool_result",
                "tool_use_id": "server_confirmed_booking",
                "content": json.dumps({"status": "ready"}),
            }],
            contact,
            None,
        )
        messages = [
            {
                "role": "assistant",
                "content": (
                    "Записываю тебя к Стасу Мосину на «Мужскую стрижку» "
                    "сегодня в 11:00 — оформляем?"
                ),
            },
            {"role": "user", "content": "Да"},
        ]

        events = list(claude_ai.get_ai_response_stream(
            messages,
            user_id=123,
            mode="client",
        ))

        self.assertEqual(events, [{
            "type": "meta",
            "contact_request": contact,
            "gift_cert_action": None,
            "text": "Передаю запись на оформление.",
        }])

    def test_model_cannot_claim_booking_handoff_without_server_signal(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._brain_turn = lambda *args, **kwargs: (
            "Передаю запись на оформление: сегодня в 11:00.",
            [],
        )

        text, contact_request, action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Оформляй"}],
            user_id=123,
            mode=None,
        )

        self.assertIn("Ничего не создано", text)
        self.assertIsNone(contact_request)
        self.assertIsNone(action)

    def test_client_surface_limits_founder_to_client_tools(self):
        claude_ai, _logs = _load_claude_ai()

        names = {
            t["function"]["name"]
            for t in claude_ai._tools_for_openai("founder", mode="client")
        }

        self.assertIn("request_booking", names)
        self.assertIn("get_my_bookings", names)
        self.assertNotIn("check_birthday_promo", names)
        self.assertNotIn("get_business_report", names)
        self.assertNotIn("get_daily_briefing", names)
        self.assertNotIn("get_owner_command_center", names)
        self.assertNotIn("create_owner_control_task", names)
        self.assertNotIn("update_owner_control_task", names)
        self.assertNotIn("run_autonomous_director_tick", names)
        self.assertNotIn("run_autopilot_supervision_tick", names)
        self.assertNotIn("run_execution_loop_tick", names)
        self.assertNotIn("run_operating_rhythm_tick", names)
        self.assertNotIn("get_master_performance", names)
        self.assertNotIn("salon_action", names)

    def test_missing_surface_keeps_founder_role_tools_for_telegram(self):
        claude_ai, _logs = _load_claude_ai()

        names = {
            t["function"]["name"]
            for t in claude_ai._tools_for_openai("founder", mode=None)
        }

        self.assertIn("request_booking", names)
        self.assertIn("get_business_report", names)
        self.assertIn("get_daily_briefing", names)
        self.assertIn("get_owner_command_center", names)
        self.assertIn("create_owner_control_task", names)
        self.assertIn("update_owner_control_task", names)
        self.assertIn("run_autonomous_director_tick", names)
        self.assertIn("run_autopilot_supervision_tick", names)
        self.assertIn("run_execution_loop_tick", names)
        self.assertIn("run_operating_rhythm_tick", names)
        self.assertIn("get_master_performance", names)
        self.assertIn("salon_action", names)

    def test_staff_surface_removes_client_booking_tools_for_founder(self):
        claude_ai, _logs = _load_claude_ai()

        names = {
            t["function"]["name"]
            for t in claude_ai._tools_for_openai("founder", mode="staff")
        }

        self.assertIn("get_business_report", names)
        self.assertIn("get_daily_briefing", names)
        self.assertIn("get_owner_command_center", names)
        self.assertIn("create_owner_control_task", names)
        self.assertIn("update_owner_control_task", names)
        self.assertIn("run_autonomous_director_tick", names)
        self.assertIn("run_autopilot_supervision_tick", names)
        self.assertIn("run_execution_loop_tick", names)
        self.assertIn("run_operating_rhythm_tick", names)
        self.assertIn("salon_action", names)
        self.assertNotIn("request_booking", names)
        self.assertNotIn("find_nearest_slots", names)
        self.assertNotIn("get_my_bookings", names)
        self.assertNotIn("start_gift_cert_purchase", names)
        self.assertNotIn("show_subscription_plans", names)

    def test_founder_prompt_forbids_inferred_staff_schedule_names(self):
        claude_ai, _logs = _load_claude_ai()

        prompt = json.dumps(
            claude_ai._build_system_prompt(339683535, "founder", "staff"),
            ensure_ascii=False,
        )

        self.assertIn("today.staff_schedule.working", prompt)
        self.assertIn("слово «ты» тоже считается", prompt)
        self.assertIn("status=conflict", prompt)
        self.assertIn("infer_staff_names", prompt)

    def test_client_prompt_adds_admin_persona_after_security_core(self):
        claude_ai, _logs = _load_claude_ai()

        prompt = claude_ai._build_system_prompt(None, "client", "client")[0]["text"]

        self.assertTrue(prompt.startswith("test"))
        self.assertIn("── РОЛЬ: АДМИНИСТРАТОР ──", prompt)
        self.assertIn("request_client_contact", prompt)
        self.assertNotIn("── РОЛЬ: ДИРЕКТОР ──", prompt)
        self.assertLess(prompt.index("test"), prompt.index("── РОЛЬ: АДМИНИСТРАТОР ──"))

    def test_staff_prompt_adds_director_persona_after_security_core(self):
        claude_ai, _logs = _load_claude_ai()

        prompt = claude_ai._build_system_prompt(None, "founder", "staff")[0]["text"]

        self.assertTrue(prompt.startswith("test"))
        self.assertIn("── РОЛЬ: ДИРЕКТОР ──", prompt)
        self.assertIn("ТОЛЬКО из результатов инструментов", prompt)
        self.assertNotIn("── РОЛЬ: АДМИНИСТРАТОР ──", prompt)
        self.assertLess(prompt.index("test"), prompt.index("── РОЛЬ: ДИРЕКТОР ──"))

    def test_staff_surface_blocks_booking_tool_even_if_called_directly(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool(
                "request_booking",
                {
                    "staff_name": "Стас Мосин",
                    "service_names": ["Мужская стрижка"],
                    "datetime_str": "2026-07-08T14:00:00",
                },
                user_id=948205934,
                mode="staff",
            )
        )

        self.assertIn("error", result)
        self.assertTrue(logs)
        self.assertEqual(logs[-1][1], "founder")
        self.assertEqual(logs[-1][2], "request_booking")
        self.assertFalse(logs[-1][4])
        self.assertEqual(logs[-1][5], "surface")

    def test_founder_can_preview_staff_schedule_change(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(claude_ai._execute_tool(
            "manage_staff_schedule",
            {
                "staff_name": "Стас",
                "date": "2099-07-20",
                "action": "close_day",
                "apply": False,
            },
            user_id=948205934,
            mode="staff",
        ))

        self.assertEqual(result["status"], "preview")
        self.assertEqual(result["staff_id"], 7)
        self.assertEqual(result["staff_name"], "Стас")
        self.assertEqual(logs[-1][3], "write")
        self.assertTrue(logs[-1][4])

    def test_schedule_apply_is_ignored_without_new_user_confirmation(self):
        claude_ai, _logs = _load_claude_ai()

        result = json.loads(claude_ai._execute_tool(
            "manage_staff_schedule",
            {
                "staff_name": "Стас",
                "date": "2099-07-20",
                "action": "close_day",
                "apply": True,
            },
            user_id=948205934,
            mode="staff",
        ))

        self.assertEqual(result["status"], "preview")
        self.assertTrue(result["apply_ignored"])

    def test_schedule_confirmation_requires_prior_preview_and_new_yes(self):
        claude_ai, _logs = _load_claude_ai()
        tool_use = claude_ai._ToolUse(
            id="schedule",
            name="manage_staff_schedule",
            input={"apply": True},
        )
        messages = [
            {"role": "assistant", "content": "Стас, 2099-07-20: график был 10:00–20:00; станет день закрыт. Применить?"},
            {"role": "user", "content": "Да, применяй"},
            {"role": "assistant", "content": claude_ai._assistant_blocks("", [tool_use])},
        ]

        self.assertTrue(claude_ai._schedule_confirmation_verified(messages))

        messages[1]["content"] = "Закрой Стасу завтра"
        self.assertFalse(claude_ai._schedule_confirmation_verified(messages))

    def test_manager_cannot_change_staff_schedule(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(claude_ai._execute_tool(
            "manage_staff_schedule",
            {
                "staff_name": "Стас",
                "date": "2099-07-20",
                "action": "close_day",
            },
            user_id=339683535,
            mode="staff",
        ))

        self.assertIn("error", result)
        self.assertEqual(logs[-1][1], "manager")
        self.assertFalse(logs[-1][4])

    def test_schedule_change_tool_only_appears_in_owner_staff_surface(self):
        claude_ai, _logs = _load_claude_ai()

        staff_names = {
            tool["function"]["name"]
            for tool in claude_ai._tools_for_openai("founder", mode="staff")
        }
        client_names = {
            tool["function"]["name"]
            for tool in claude_ai._tools_for_openai("founder", mode="client")
        }

        self.assertIn("manage_staff_schedule", staff_names)
        self.assertNotIn("manage_staff_schedule", client_names)

    def test_director_prompt_requires_preview_then_confirmation(self):
        claude_ai, _logs = _load_claude_ai()

        prompt = claude_ai._build_system_prompt(948205934, "founder", "staff")[0]["text"]

        self.assertIn("manage_staff_schedule", prompt)
        self.assertIn("apply=false", prompt)
        self.assertIn("apply=true", prompt)
        self.assertIn("Применить?", prompt)

    def test_schedule_question_is_grounded_and_resolves_inflected_name(self):
        claude_ai, _logs = _load_claude_ai()
        messages = [{
            "role": "user",
            "content": "Какое расписание у Стаса Мосина 14.08.2026?",
        }]

        requirement = claude_ai._grounding_requirement(
            messages, "founder", "staff", user_id=948205934,
        )
        tool_use = claude_ai._schedule_preflight_tool_use(messages, requirement)

        self.assertIsNotNone(requirement)
        self.assertEqual(requirement.domain, "staff_schedule")
        self.assertEqual(tool_use.name, "get_master_schedule")
        self.assertEqual(tool_use.input["staff_name"], "Стас Мосин")
        self.assertEqual(tool_use.input["date"], "2026-08-14")

    def test_tomorrow_schedule_date_is_resolved_deterministically(self):
        claude_ai, _logs = _load_claude_ai()

        resolved = claude_ai._schedule_query_date(
            "Какое расписание у Стаса завтра?",
            claude_ai.date(2026, 8, 13),
        )

        self.assertEqual(resolved, claude_ai.date(2026, 8, 14))

    def test_exact_schedule_answer_bypasses_model(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._brain_turn = lambda *args, **kwargs: self.fail("model must not run")

        text, contact, action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Какое расписание у Стаса Мосина 14.08.2026?"}],
            user_id=948205934,
            mode="staff",
        )

        self.assertIn("Стас Мосин работает 10:00–20:00", text)
        self.assertIsNone(contact)
        self.assertIsNone(action)

    def test_tomorrow_schedule_answer_bypasses_model(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 13)
        claude_ai._brain_turn = lambda *args, **kwargs: self.fail("model must not run")

        text, contact, action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Какое расписание у Стаса Мосина завтра?"}],
            user_id=948205934,
            mode="staff",
        )

        self.assertIn("Завтра, 14 августа", text)
        self.assertIn("Стас Мосин работает 10:00–20:00", text)
        self.assertIsNone(contact)
        self.assertIsNone(action)

    def test_short_schedule_followup_keeps_master_context(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 13)
        messages = [
            {"role": "user", "content": "Какое расписание у Стаса Мосина?"},
            {"role": "assistant", "content": "Уточните дату."},
            {"role": "user", "content": "А завтра?"},
        ]

        requirement = claude_ai._grounding_requirement(
            messages, "founder", "staff", user_id=948205934,
        )
        tool_use = claude_ai._schedule_preflight_tool_use(messages, requirement)

        self.assertEqual(requirement.domain, "staff_schedule")
        self.assertEqual(tool_use.name, "get_master_schedule")
        self.assertEqual(tool_use.input["staff_name"], "Стас Мосин")
        self.assertEqual(tool_use.input["date"], "2026-08-14")

    def test_roster_question_does_not_turn_into_today_schedule(self):
        claude_ai, _logs = _load_claude_ai()

        requirement = claude_ai._grounding_requirement(
            [{"role": "user", "content": "Кто у нас работает в салоне?"}],
            "founder",
            "staff",
            user_id=948205934,
        )

        self.assertEqual(requirement.domain, "staff_catalog")
        self.assertEqual(requirement.tools, frozenset({"get_masters"}))

    def test_all_appointments_question_uses_business_report(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai._moscow_today = lambda: claude_ai.date(2026, 8, 13)
        messages = [{
            "role": "user",
            "content": "Сколько всего записей сегодня, включая будущие и ожидающие?",
        }]

        requirement = claude_ai._grounding_requirement(
            messages, "founder", "staff", user_id=948205934,
        )
        tool_use = claude_ai._business_preflight_tool_use(messages, requirement)

        self.assertEqual(requirement.domain, "business_analytics")
        self.assertEqual(tool_use.name, "get_business_report")
        self.assertEqual(tool_use.input, {
            "date_from": "2026-08-13",
            "date_to": "2026-08-13",
        })

    def test_successful_business_tool_blocks_false_data_denial(self):
        claude_ai, _logs = _load_claude_ai()
        replies = iter([
            ("Я не вижу список услуг в YClients.", []),
            ("В YClients сейчас нет активных услуг.", []),
        ])
        claude_ai._brain_turn = lambda *args, **kwargs: next(replies)

        text, _contact, _action = claude_ai.get_ai_response(
            [{"role": "user", "content": "Какие услуги есть?"}],
            user_id=948205934,
            mode="staff",
        )

        self.assertEqual(text, "В YClients сейчас нет активных услуг.")


if __name__ == "__main__":
    unittest.main()
