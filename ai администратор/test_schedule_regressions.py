import importlib
import json
import os
import sys
import tempfile
import types
import unittest
from datetime import date


def _load_yclients_module():
    fake_requests = types.ModuleType("requests")

    class _DummyReqExc(Exception):
        pass

    fake_requests.Timeout = _DummyReqExc
    fake_requests.RequestException = _DummyReqExc
    fake_requests.get = lambda *args, **kwargs: None
    fake_requests.post = lambda *args, **kwargs: None
    fake_requests.put = lambda *args, **kwargs: None
    fake_requests.delete = lambda *args, **kwargs: None

    fake_config = types.ModuleType("config")
    fake_config.YCLIENTS_BASE_URL = "https://example.test/api/v1"
    fake_config.YCLIENTS_PARTNER_TOKEN = "partner"
    fake_config.YCLIENTS_USER_TOKEN = "user"
    fake_config.YCLIENTS_COMPANY_ID = 1
    fake_config.YCLIENTS_CASH_ACCOUNT_ID = 10
    fake_config.YCLIENTS_CASHLESS_ACCOUNT_ID = 11
    fake_config.ACTIVE_MASTER_IDS = [7]

    sys.modules["requests"] = fake_requests
    sys.modules["config"] = fake_config
    sys.modules.pop("yclients", None)
    return importlib.import_module("yclients")


def _load_claude_module():
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

    fake_database = types.ModuleType("database")
    fake_database.log_tool_call = lambda *args, **kwargs: None
    fake_database.is_admin = lambda _user_id: False
    fake_database.get_master_by_chat_id = lambda _user_id: None

    fake_config = types.ModuleType("config")
    fake_config.PROXY_URL = ""
    fake_config.OPENAI_API_KEY = ""
    fake_config.OPENAI_BASE_URL = "https://example.test/v1"
    fake_config.OPENAI_CHAT_MODEL = "gpt-test"
    fake_config.OPENAI_FAST_MODEL = "gpt-test-fast"
    fake_config.OPENAI_TELEGRAM_CHAT_MODEL = "gpt-test-telegram"
    fake_config.OPENAI_VOICE_CHAT_MODEL = "gpt-test-voice"

    fake_identity_utils = types.ModuleType("identity_utils")
    fake_identity_utils.resolve_ai_role = lambda **kwargs: "client"

    fake_memory = types.ModuleType("memory")
    fake_memory.build_context = lambda _user_id: ""

    fake_prompts = types.ModuleType("prompts")
    fake_prompts.SYSTEM_PROMPT = "test"

    fake_yclients = types.ModuleType("yclients")

    class _DummyYClientsAPI:
        def __init__(self, *args, **kwargs):
            pass

        def get_available_slots(self, *args, **kwargs):
            return []

    fake_yclients.YClientsAPI = _DummyYClientsAPI
    fake_yclients.get_schedule_from_file = lambda *args, **kwargs: []
    fake_yclients.get_day_hours = lambda *args, **kwargs: None

    sys.modules["anthropic"] = fake_anthropic
    sys.modules["httpx"] = fake_httpx
    sys.modules["ai_billing"] = fake_ai_billing
    sys.modules["database"] = fake_database
    sys.modules["config"] = fake_config
    sys.modules["identity_utils"] = fake_identity_utils
    sys.modules["memory"] = fake_memory
    sys.modules["prompts"] = fake_prompts
    sys.modules["yclients"] = fake_yclients
    sys.modules.pop("claude_ai", None)
    return importlib.import_module("claude_ai")


class ScheduleRegressionTests(unittest.TestCase):
    def test_schedule_reference_distinguishes_off_from_missing_master(self):
        yclients = _load_yclients_module()
        payload = {
            "updated": "2026-07-01",
            "masters": {
                "Илья Третьяков": {
                    "weekly": {"чт": None},
                    "overrides": {},
                },
            },
        }
        fd, path = tempfile.mkstemp(suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(payload, stream, ensure_ascii=False)
            yclients.SCHEDULE_FILE = path

            off = yclients.get_schedule_reference(
                "Илья Третьяков", date(2026, 7, 16)
            )
            missing = yclients.get_schedule_reference(
                "Другой мастер", date(2026, 7, 16)
            )

            self.assertTrue(off["configured"])
            self.assertFalse(off["is_working"])
            self.assertIsNone(off["hours"])
            self.assertFalse(missing["configured"])
            self.assertIsNone(missing["is_working"])
        finally:
            os.unlink(path)

    def test_working_masters_rejects_schedule_row_for_another_date(self):
        yclients = _load_yclients_module()
        api = yclients.YClientsAPI(company_id=1, user_token="user", partner_token="partner")
        api.get_masters = lambda: [{"id": 7, "name": "Мастер"}]
        api.get_staff_schedule = lambda *args, **kwargs: [{
            "date": "2026-07-15",
            "is_working": 1,
            "slots": [{"from": "10:00", "to": "21:00"}],
        }]

        rows = api.get_working_masters("2026-07-16")

        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0]["is_working"])
        self.assertTrue(rows[0]["schedule_unknown"])

    def test_get_available_slots_filters_overlap_with_real_records(self):
        yclients = _load_yclients_module()
        yclients._day_records_cache.clear()

        api = yclients.YClientsAPI(company_id=1, user_token="user", partner_token="partner")
        api._get = lambda endpoint, params=None: {
            "data": [
                {
                    "time": "12:30",
                    "datetime": "2026-07-06T12:30:00+03:00",
                    "seance_length": 3600,
                },
                {
                    "time": "13:00",
                    "datetime": "2026-07-06T13:00:00+03:00",
                    "seance_length": 3600,
                },
                {
                    "time": "13:30",
                    "datetime": "2026-07-06T13:30:00+03:00",
                    "seance_length": 3600,
                },
                {
                    "time": "14:00",
                    "datetime": "2026-07-06T14:00:00+03:00",
                    "seance_length": 3600,
                },
            ]
        }
        api.get_records_for_master = lambda staff_id, start_date, end_date, max_pages=25: [
            {
                "id": 1001,
                "datetime": "2026-07-06T13:00:00+03:00",
                "seance_length": 3600,
                "deleted": False,
            }
        ]

        got = api.get_available_slots(7, "2026-07-06")

        self.assertEqual([slot["time"] for slot in got], ["14:00"])

    def test_request_booking_recheck_rejects_time_missing_in_live_slots(self):
        claude_ai = _load_claude_module()
        claude_ai.yclients.get_available_slots = lambda staff_id, date, service_ids=None: [
            {"time": "12:00", "datetime": "2026-07-06T12:00:00+03:00", "seance_length": 3600},
            {"time": "14:00", "datetime": "2026-07-06T14:00:00+03:00", "seance_length": 3600},
        ]

        err = claude_ai._recheck_requested_slot(
            1461615,
            "Стас Мосин",
            [7572285],
            "2026-07-06T13:00:00+03:00",
        )

        self.assertIsNotNone(err)
        self.assertEqual(err["error"], "slot_taken")
        self.assertIn("13:00", err["message"])
        self.assertIn("12:00, 14:00", err["message"])

    def test_get_client_bookings_prefers_exact_client_id_lookup(self):
        yclients = _load_yclients_module()

        api = yclients.YClientsAPI(company_id=1, user_token="user", partner_token="partner")
        api.search_clients = lambda query, limit=8: [
            {"id": 104585657, "name": "Заеду в Озон", "phone": "+79620259888"}
        ]

        seen_params = []

        def _fake_get(endpoint, params=None):
            seen_params.append((endpoint, params or {}))
            return {
                "data": [
                    {
                        "id": 9001,
                        "datetime": "2026-07-06T13:00:00+03:00",
                        "attendance": 0,
                        "client": {
                            "id": 104585657,
                            "name": "Заеду в Озон",
                            "phone": "",
                        },
                        "staff": {"id": 1460233, "name": "Илья Третьяков"},
                        "services": [{"title": "Мужская стрижка"}],
                    }
                ]
            }

        api._get = _fake_get

        got = api.get_client_bookings("79620259888", days_back=1, days_ahead=7)

        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["record_id"], 9001)
        self.assertEqual(got[0]["client_id"], 104585657)
        self.assertEqual(got[0]["master"], "Илья Третьяков")
        self.assertTrue(any((params or {}).get("client_id") == 104585657 for _, params in seen_params))

    def test_get_client_bookings_falls_back_to_phone_scan(self):
        yclients = _load_yclients_module()

        api = yclients.YClientsAPI(company_id=1, user_token="user", partner_token="partner")
        api.search_clients = lambda query, limit=8: []
        api._get = lambda endpoint, params=None: {
            "data": [
                {
                    "id": 9002,
                    "datetime": "2026-07-06T18:00:00+03:00",
                    "attendance": 1,
                    "client": {
                        "id": 77,
                        "name": "Стас",
                        "phone": "79620259888",
                    },
                    "staff": {"id": 1461615, "name": "Стас Мосин"},
                    "services": [{"title": "Мужская стрижка"}],
                }
            ]
        }

        got = api.get_client_bookings("+7 962 025-98-88", days_back=1, days_ahead=7)

        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["record_id"], 9002)
        self.assertEqual(got[0]["client_name"], "Стас")


if __name__ == "__main__":
    unittest.main()
