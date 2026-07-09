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

    fake_config = types.ModuleType("config")
    fake_config.PROXY_URL = ""
    fake_config.OPENAI_API_KEY = ""
    fake_config.OPENAI_BASE_URL = "https://example.test/v1"
    fake_config.OPENAI_CHAT_MODEL = "gpt-test"
    fake_config.OPENAI_FAST_MODEL = "gpt-test-fast"
    fake_config.OPENAI_TELEGRAM_CHAT_MODEL = "gpt-test-telegram"
    fake_config.OPENAI_VOICE_CHAT_MODEL = "gpt-test-voice"

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

    fake_yclients.YClientsAPI = _DummyYClientsAPI
    fake_yclients.get_schedule_from_file = lambda *args, **kwargs: []
    fake_yclients.get_day_hours = lambda *args, **kwargs: None

    fake_owner_ai = types.ModuleType("owner_ai")
    fake_owner_ai.daily_briefing = lambda: {"date": "2026-07-08", "ok": True}
    fake_owner_ai.command_center = lambda: {
        "version": "owner_command_center_v1",
        "summary": {"top_control": {"title": "Контроль"}},
        "control_queue": [{"title": "Контроль"}],
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
    fake_owner_ai.master_performance = lambda: {
        "top_profit_master": {"name": "Мастер 1", "profit_after_salary_rub": 26000},
        "top_gross_master": {"name": "Мастер 1", "gross_rub": 40000},
        "note": "Вклад после процента.",
    }
    fake_owner_ai.owner_action_payload = lambda task, **kwargs: {
        "kind": "run_job",
        "job": task,
        "label": "Запустить",
        "title": kwargs.get("title") or "Тест",
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
    }.items():
        sys.modules[name] = module

    sys.modules.pop("claude_ai", None)
    mod = importlib.import_module("claude_ai")
    mod._ROLE_TOOLS_CACHED.clear()
    mod._ROLE_MODE_TOOLS_CACHED.clear()
    return mod, logs


class ClaudeAIRBACTests(unittest.TestCase):
    def test_manager_admin_cannot_call_owner_director_tools(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(claude_ai._execute_tool("get_daily_briefing", {}, user_id=339683535))

        self.assertIn("error", result)
        self.assertTrue(logs)
        self.assertEqual(logs[-1][1], "manager")
        self.assertEqual(logs[-1][2], "get_daily_briefing")
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

    def test_founder_can_read_owner_command_center(self):
        claude_ai, logs = _load_claude_ai()

        result = json.loads(
            claude_ai._execute_tool("get_owner_command_center", {}, user_id=948205934)
        )

        self.assertEqual(result["version"], "owner_command_center_v1")
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

    def test_client_surface_limits_founder_to_client_tools(self):
        claude_ai, _logs = _load_claude_ai()

        names = {
            t["function"]["name"]
            for t in claude_ai._tools_for_openai("founder", mode="client")
        }

        self.assertIn("request_booking", names)
        self.assertIn("get_my_bookings", names)
        self.assertNotIn("get_business_report", names)
        self.assertNotIn("get_daily_briefing", names)
        self.assertNotIn("get_owner_command_center", names)
        self.assertNotIn("create_owner_control_task", names)
        self.assertNotIn("update_owner_control_task", names)
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
        self.assertIn("salon_action", names)
        self.assertNotIn("request_booking", names)
        self.assertNotIn("find_nearest_slots", names)
        self.assertNotIn("get_my_bookings", names)
        self.assertNotIn("start_gift_cert_purchase", names)
        self.assertNotIn("show_subscription_plans", names)

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


if __name__ == "__main__":
    unittest.main()
