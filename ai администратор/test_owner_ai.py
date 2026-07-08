import importlib
import json
import sys
import types
import unittest


def _load_owner_ai(*, reactivation_payload: dict | None):
    fake_analytics = types.ModuleType("analytics")
    fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
        "2026-06-09",
        "2026-07-08",
        "last 30",
    )
    fake_analytics.business_summary = lambda *args, **kwargs: {"avg_check": 2000}
    fake_analytics.business_pulse = lambda *args, **kwargs: {
        "health": "ok",
        "metrics": {
            "gross": {"value": 120000, "delta": -5000, "delta_pct": -4},
            "visits": {"value": 60, "delta": 6, "delta_pct": 11},
            "avg_check": {"value": 2000, "delta": 100, "delta_pct": 5},
        },
        "anomaly": None,
    }
    fake_analytics.top_services = lambda date_from, date_to, limit=12: (
        [
            {"title": "Стрижка", "count": 20, "sum": 40000},
            {"title": "Борода", "count": 5, "sum": 10000},
        ]
        if date_from == "2026-06-09"
        else [
            {"title": "Стрижка", "count": 18, "sum": 36000},
            {"title": "Борода", "count": 9, "sum": 18000},
        ]
    )

    fake_database = types.ModuleType("database")
    fake_database.dashboard_metrics = lambda days=30: {
        "subscriptions": {"expiring_soon": 2, "active": 9}
    }
    fake_database.active_sold_gift_certs = lambda: {"count": 1, "value_rub": 10000}
    fake_database.get_setting = lambda key, default=None: (
        json.dumps(reactivation_payload, ensure_ascii=False)
        if key == "reactivation_last" and reactivation_payload is not None
        else default
    )
    fake_database.list_owner_actions = lambda limit=8: [
        {
            "id": 1,
            "source": "owner_os",
            "job": "cycle",
            "title": "Подогреть спрос",
            "status": "done",
            "created_at": "2026-07-07T10:00:00",
            "summary": {"sent": 3},
        }
    ][:limit]

    fake_yclients = types.ModuleType("yclients")

    class _FakeYClientsAPI:
        def get_working_masters(self, day):
            return [
                {"id": 1, "name": "Мастер 1", "is_working": True},
                {"id": 2, "name": "Мастер 2", "is_working": True},
            ]

        def get_company_records(self, start_date, end_date):
            return [{"staff_id": 1}, {"staff_id": 1}]

    fake_yclients.YClientsAPI = _FakeYClientsAPI

    sys.modules["analytics"] = fake_analytics
    sys.modules["database"] = fake_database
    sys.modules["yclients"] = fake_yclients
    sys.modules.pop("owner_ai", None)
    mod = importlib.import_module("owner_ai")
    mod._avg_cache.update(val=None, ts=0.0)
    return mod


class OwnerAITests(unittest.TestCase):
    def test_owner_action_payload_is_card_only(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        payload = owner_ai.owner_action_payload("reactivation", potential_rub=12000)

        self.assertEqual(payload["kind"], "run_job")
        self.assertEqual(payload["job"], "reactivation")
        self.assertEqual(payload["potential_rub"], 12000)
        self.assertNotIn("execute", payload)
        self.assertIsNone(owner_ai.owner_action_payload("unknown"))

    def test_return_candidates_empty_state_does_not_invent_money(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        result = owner_ai.return_candidates()

        self.assertIsNone(result["count"])
        self.assertNotIn("potential_return_revenue_rub", result)
        self.assertEqual(result["action"], "reactivation")
        self.assertIn("Ещё не считалось", result["note"])

    def test_daily_briefing_ranks_money_and_prepares_action_card(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        brief = owner_ai.daily_briefing()

        self.assertEqual(brief["today"]["booked"], 2)
        self.assertEqual(brief["today"]["avg_check_rub"], 2000)
        self.assertEqual(brief["today"]["expected_revenue_rub"], 4000)
        self.assertEqual(brief["today"]["free_capacity_today"], 14)
        self.assertEqual(brief["top_priority"]["type"], "empty_windows")
        self.assertEqual(brief["top_priority"]["potential_rub"], 28000)
        self.assertTrue(brief["top_priority"]["estimate"])
        self.assertEqual(brief["top_action"]["kind"], "run_job")
        self.assertEqual(brief["top_action"]["job"], "cycle")
        self.assertIn("оценка", brief["note"].lower())

    def test_command_center_builds_stable_owner_os_contract(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        center = owner_ai.command_center()

        self.assertEqual(center["version"], "owner_command_center_v1")
        self.assertTrue(center["read_only"])
        self.assertIn(center["status"], {"ok", "warn", "risk"})
        self.assertGreater(center["summary"]["money_at_stake_rub"], 0)
        self.assertEqual(center["summary"]["booked_today"], 2)
        self.assertEqual(center["summary"]["free_capacity_today"], 14)
        keys = {section["key"] for section in center["sections"]}
        self.assertEqual(
            {"today", "money", "risks", "clients", "services", "actions", "journal"},
            keys,
        )
        self.assertTrue(center["next_best_actions"])
        self.assertEqual(center["journal"][0]["job"], "cycle")
        self.assertEqual(center["next_best_actions"][0]["kind"], "run_job")
        self.assertNotIn("execute", center["next_best_actions"][0])

    def test_command_center_survives_one_block_failure(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        def boom():
            raise RuntimeError("assets unavailable")

        owner_ai.expiring_assets = boom
        center = owner_ai.command_center()

        self.assertEqual(center["version"], "owner_command_center_v1")
        self.assertTrue(center["errors"])
        self.assertIn("clients", {section["key"] for section in center["sections"]})
        self.assertIn(center["status"], {"warn", "risk"})

    def test_expiring_assets_counts_only_sold_certificates(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        assets = owner_ai.expiring_assets()

        self.assertEqual(assets["subscriptions_expiring_7d"], 2)
        self.assertEqual(assets["gift_certs_active_count"], 1)
        self.assertEqual(assets["gift_certs_active_value_rub"], 10000)
        self.assertIn("ПРОДАННЫЕ", assets["note"])


if __name__ == "__main__":
    unittest.main()
