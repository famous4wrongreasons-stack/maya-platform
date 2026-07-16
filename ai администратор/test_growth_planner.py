import unittest
from datetime import date

import growth_planner


class ClientSegmentationTests(unittest.TestCase):
    def test_segments_use_personal_cycle_and_future_booking(self):
        clients = [
            {"id": 1, "last_visit_date": "2026-06-01"},
            {"id": 2, "last_visit_date": "2026-03-01"},
            {"id": 3, "last_visit_date": "2024-01-01"},
            {"id": 4, "last_visit_date": "2025-01-01"},
        ]
        records = []
        for client_id, days in {
            1: ["2026-04-01", "2026-05-01", "2026-06-01"],
            2: ["2026-01-01", "2026-02-01", "2026-03-01"],
        }.items():
            records.extend({
                "datetime": f"{day}T10:00:00",
                "client": {"id": client_id},
                "attendance": 1,
            } for day in days)
        records.append({
            "datetime": "2026-07-20T10:00:00",
            "client": {"id": 4},
            "attendance": 0,
        })

        result = growth_planner.segment_client_base(
            clients,
            records,
            as_of=date(2026, 7, 12),
            avg_check_rub=2500,
        )

        self.assertEqual(result["active_clients"], 2)
        self.assertEqual(result["recoverable_clients"], 1)
        self.assertEqual(result["lost_clients"], 1)
        self.assertEqual(result["recoverable_revenue_potential_rub"], 500)
        self.assertFalse(result["contains_personal_data"])


class CapacityTests(unittest.TestCase):
    def test_capacity_is_limited_by_workstations(self):
        masters = [{"id": 1, "name": "One"}, {"id": 2, "name": "Two"}]
        schedules = {
            1: [{"date": "2026-07-12", "is_working": True,
                 "slots": [{"from": "10:00", "to": "21:00"}]}],
            2: [{"date": "2026-07-12", "is_working": True,
                 "slots": [{"from": "10:00", "to": "21:00"}]}],
        }
        one_chair = growth_planner.calculate_capacity(
            masters=masters,
            schedules=schedules,
            period_start="2026-07-12",
            period_end="2026-07-12",
            workstations_count=1,
            service_minutes=60,
        )
        two_chairs = growth_planner.calculate_capacity(
            masters=masters,
            schedules=schedules,
            period_start="2026-07-12",
            period_end="2026-07-12",
            workstations_count=2,
            service_minutes=60,
        )
        self.assertEqual(one_chair["physical_capacity_visits"], 11)
        self.assertEqual(two_chairs["physical_capacity_visits"], 22)
        self.assertEqual(one_chair["workstations_source"], "owner_setting")


class RoleViewTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = {
            "generated_at": "2026-07-12T08:00:00",
            "as_of": "2026-07-12",
            "status": "warn",
            "period": {"from": "2026-07-01", "to": "2026-07-31"},
            "goal": {"committed_target_rub": 1000000},
            "plan_fact": {"actual_rub": 300000, "projected_rub": 500000, "progress_pct": 30},
            "capacity": {"theoretical_max_gross_rub": 1500000},
            "client_segments": {"recoverable_clients": 12},
            "masters": [
                {"staff_id": 7, "name": "Master", "progress_pct": 80, "status": "warn"},
            ],
        }

    def test_manager_sees_only_execution(self):
        view = growth_planner.manager_view(self.snapshot)
        self.assertIn("masters", view)
        self.assertNotIn("capacity", view)
        self.assertNotIn("client_segments", view)

    def test_master_sees_only_self(self):
        view = growth_planner.master_view(self.snapshot, 7)
        self.assertEqual(view["master"]["staff_id"], 7)
        self.assertNotIn("goal", view)
        self.assertNotIn("masters", view)

    def test_morning_messages_follow_role_scope(self):
        owner_message = growth_planner.render_owner_morning_message(self.snapshot)
        manager_message = growth_planner.render_manager_morning_message(
            growth_planner.manager_view(self.snapshot)
        )
        self.assertIn("потолок", owner_message.lower())
        self.assertIn("база", owner_message.lower())
        self.assertIn("план команды", manager_message.lower())
        self.assertNotIn("клиент", manager_message.lower())
        self.assertNotIn("физический максимум", manager_message.lower())


if __name__ == "__main__":
    unittest.main()
