import unittest
from datetime import datetime

import master_briefing
import masters_ai


class HistoricalUpsellTests(unittest.TestCase):
    def test_only_service_from_client_history_can_be_selected(self):
        history = [{
            "date": "2026-06-10",
            "services": [{"title": "Массаж головы", "cost": 700}],
        }]
        current = {"services": [{"title": "Мужская стрижка", "cost": 2200}]}
        catalog = [
            {"title": "Массаж головы", "price_min": 800},
            {"title": "Тонирование", "price_min": 3000},
        ]
        result = masters_ai.historical_addon_opportunity(history, current, catalog)
        self.assertEqual(result["title"], "Массаж головы")
        self.assertEqual(result["price_rub"], 800)
        self.assertTrue(result["historical_only"])

    def test_implied_service_is_not_offered(self):
        history = [{
            "date": "2026-06-10",
            "services": [{"title": "Окантовка контура", "cost": 500}],
        }]
        current = {"services": [{"title": "Мужская стрижка", "cost": 2200}]}
        self.assertIsNone(masters_ai.historical_addon_opportunity(history, current, []))

    def test_no_history_means_no_money_opportunity(self):
        current = {"services": [{"title": "Мужская стрижка", "cost": 2200}]}
        self.assertIsNone(masters_ai.historical_addon_opportunity([], current, []))


class MasterDayForecastTests(unittest.TestCase):
    def test_delivery_completion_respects_available_channels(self):
        self.assertTrue(master_briefing.delivery_is_complete(
            {"telegram": True, "push": False},
            has_telegram=True,
            has_push=False,
        ))
        self.assertFalse(master_briefing.delivery_is_complete(
            {"telegram": True, "push": False},
            has_telegram=True,
            has_push=True,
        ))
        self.assertTrue(master_briefing.delivery_is_complete(
            {"telegram": True, "push": True},
            has_telegram=True,
            has_push=True,
        ))

    def test_forecast_sums_booked_and_historical_potential(self):
        records = [{
            "id": 10,
            "datetime": "2026-07-11T10:00:00",
            "client": {"id": 7, "name": "Алексей П."},
            "services": [{"title": "Мужская стрижка", "cost": 2200}],
            "attendance": 0,
        }]
        histories = {7: [{
            "date": "2026-06-01",
            "services": [{"title": "Тонирование", "cost": 1800}],
        }]}
        forecast = master_briefing.build_day_forecast(
            staff_id=1,
            master_name="Мастер",
            target_date="2026-07-11",
            records=records,
            histories_by_client=histories,
            salary_percent=0.5,
            service_catalog=[{"title": "Тонирование", "price_min": 2000}],
        )
        self.assertEqual(forecast["records_count"], 1)
        self.assertEqual(forecast["booked_revenue_rub"], 2200)
        self.assertEqual(forecast["booked_master_income_rub"], 1100)
        self.assertEqual(forecast["upsell_potential_revenue_rub"], 2000)
        self.assertEqual(forecast["potential_total_master_income_rub"], 2100)
        self.assertEqual(forecast["opportunities"][0]["client_label"], "Алексей")
        self.assertIn("Исторический потенциал: +1 000 ₽ тебе", master_briefing.render_master_day_push(forecast))

    def test_canceled_records_are_ignored(self):
        forecast = master_briefing.build_day_forecast(
            staff_id=1,
            master_name="Мастер",
            target_date="2026-07-11",
            records=[{
                "attendance": -1,
                "services": [{"title": "Стрижка", "cost": 2200}],
            }],
            histories_by_client={},
            salary_percent=0.5,
        )
        self.assertEqual(forecast["records_count"], 0)
        self.assertEqual(forecast["booked_revenue_rub"], 0)

    def test_schedule_window_targets_tomorrow(self):
        self.assertEqual(
            master_briefing.scheduled_brief_date(datetime(2026, 7, 10, 19, 5)),
            "2026-07-11",
        )
        self.assertIsNone(master_briefing.scheduled_brief_date(datetime(2026, 7, 10, 12, 0)))


if __name__ == "__main__":
    unittest.main()
