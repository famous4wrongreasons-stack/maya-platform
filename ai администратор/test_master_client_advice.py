from test_support_canonical_principal import verified_request
import json
import os
import sys
import types
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from test_claude_ai_rbac import _load_claude_ai


class MasterClientAdviceTests(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def test_generic_client_advice_request_requires_real_work_records(self):
        claude_ai, _logs = _load_claude_ai()

        requirement = claude_ai._grounding_requirement(
            [{"role": "user", "content": "Дай мне советы по клиентам на сегодня"}],
            "master",
            "staff",
            user_id=12345,
        )

        self.assertIsNotNone(requirement)
        self.assertEqual(requirement.domain, "personal_work_records")
        self.assertEqual(requirement.tools, frozenset({"get_my_work_records"}))

    @verified_request('staff', 12345, staff_id=7)
    def test_work_records_include_saved_pii_free_advice(self):
        claude_ai, _logs = _load_claude_ai()
        claude_ai.database.get_master_by_chat_id = lambda _chat_id: {
            "yclients_staff_id": 7,
        }
        claude_ai.database.get_ai_advice_for_record = lambda _record_id: {
            "advice_text": "Раньше выбирал уход за бородой — можно спокойно напомнить.",
        }
        claude_ai.yclients.get_records_for_master = lambda *_args: [{
            "id": 77,
            "datetime": "2026-07-20T12:30:00",
            "attendance": 0,
            "client": {"id": 991, "name": "Скрытое имя"},
            "services": [{"title": "Мужская стрижка", "cost": 2000}],
        }]
        claude_ai.yclients.get_services = lambda *_args: []
        fake_anonymizer = types.ModuleType("anonymizer")
        fake_anonymizer.redact_pii = lambda text: text
        fake_masters_ai = types.ModuleType("masters_ai")
        fake_masters_ai.historical_addon_opportunity = lambda *_args, **_kwargs: None
        sys.modules["anonymizer"] = fake_anonymizer
        sys.modules["masters_ai"] = fake_masters_ai

        result = json.loads(claude_ai._execute_tool(
            "get_my_work_records",
            {"date": "2026-07-20"},
            user_id=12345,
            mode="staff",
        ))

        self.assertEqual(result["count"], 1)
        self.assertIn("уход за бородой", result["records"][0]["advice"])
        self.assertEqual(result["records"][0]["client"], "клиент")
        self.assertNotIn("Скрытое имя", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
