import importlib
import sys
import types
import unittest
from datetime import date, timedelta


def _load_analytics():
    fake_yclients = types.ModuleType("yclients")

    class _DummyYClientsAPI:
        pass

    fake_yclients.YClientsAPI = _DummyYClientsAPI

    fake_rules = types.ModuleType("business_rules")
    fake_rules.ANTON_STAFF_ID = 11
    fake_rules.OWNER_STAFF_ID = 22
    fake_rules.salary_percent = lambda _staff_id: 0.5
    fake_rules.anton_salary_for_period = lambda *_args, **_kwargs: {"total": 0}

    sys.modules["yclients"] = fake_yclients
    sys.modules["business_rules"] = fake_rules
    sys.modules.pop("analytics", None)
    return importlib.import_module("analytics")


class _AnalyticsYClients:
    def __init__(self, snapshot):
        self.snapshot = snapshot

    def get_company_transactions(self, _from_iso, _to_iso):
        return []

    def get_company_records_snapshot(self, _from_iso, _to_iso):
        return self.snapshot

    def get_staff_payroll_summary(self, _staff_id, _from_iso, _to_iso):
        return {}

    def get_masters(self):
        return []


class AnalyticsRegressionTests(unittest.TestCase):
    def test_business_summary_counts_all_yclients_record_states(self):
        analytics = _load_analytics()
        today = date.today()
        past = (today - timedelta(days=1)).isoformat()
        future = (today + timedelta(days=1)).isoformat()
        records = [
            {"id": 1, "datetime": f"{past}T10:00:00", "attendance": 1},
            {"id": 2, "datetime": f"{past}T11:00:00", "attendance": -1},
            {"id": 3, "datetime": f"{today.isoformat()}T12:00:00", "attendance": 0},
            {"id": 4, "datetime": f"{future}T13:00:00", "attendance": 0},
            {"id": 5, "datetime": f"{future}T14:00:00", "attendance": 0, "deleted": True},
        ]
        analytics._yc = _AnalyticsYClients({
            "success": True,
            "complete": True,
            "records": records,
            "error": None,
        })

        result = analytics.business_summary(past, future)

        self.assertEqual(result["source_status"]["records"], "ok")
        self.assertTrue(result["appointments"]["complete"])
        self.assertEqual(result["appointments"]["loaded_from_yclients"], 5)
        self.assertEqual(result["appointments"]["active"], 4)
        self.assertEqual(result["appointments"]["attended"], 1)
        self.assertEqual(result["appointments"]["missed"], 1)
        self.assertEqual(result["appointments"]["pending_status"], 1)
        self.assertEqual(result["appointments"]["upcoming"], 1)
        self.assertEqual(result["appointments"]["cancelled_returned_by_api"], 1)
        self.assertEqual(result["visits"], 0)

    def test_business_summary_does_not_report_zero_when_records_are_unavailable(self):
        analytics = _load_analytics()
        analytics._yc = _AnalyticsYClients({
            "success": False,
            "complete": False,
            "records": [],
            "error": "yclients_records_unavailable",
        })

        result = analytics.business_summary("2026-08-13", "2026-08-13")

        self.assertEqual(result["source_status"]["records"], "unavailable")
        self.assertFalse(result["appointments"]["available"])
        self.assertFalse(result["appointments"]["complete"])
        self.assertEqual(result["appointments"]["error"], "yclients_records_unavailable")
        self.assertIsNone(result["appointments"]["active"])
        self.assertIsNone(result["appointments"]["loaded_from_yclients"])


if __name__ == "__main__":
    unittest.main()
