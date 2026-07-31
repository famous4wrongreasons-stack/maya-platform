import unittest

from business_rules import anton_salary_for_period


class AntonSalaryTests(unittest.TestCase):
    def test_period_combines_workday_fixed_pay_percent_and_day_off_pay(self):
        # 2026-07-11 is Saturday (workday), 2026-07-12 is Sunday (day off).
        result = anton_salary_for_period(
            "2026-07-11",
            "2026-07-12",
            {"2026-07-11": 40_000, "2026-07-12": 99_000},
        )

        self.assertEqual(result["workdays"], 1)
        self.assertEqual(result["days_off"], 1)
        self.assertEqual(result["base"], 3_500)
        self.assertEqual(result["pct_amount"], 2_000)
        self.assertEqual(result["total"], 5_500)

    def test_empty_month_still_returns_configured_fixed_pay(self):
        result = anton_salary_for_period("2026-07-01", "2026-07-31", {})

        self.assertEqual(result["days"], 31)
        self.assertEqual(result["workdays"] + result["days_off"], 31)
        self.assertEqual(result["pct_amount"], 0)
        self.assertEqual(result["total"], result["base"])

    def test_reversed_range_is_rejected(self):
        with self.assertRaises(ValueError):
            anton_salary_for_period("2026-07-12", "2026-07-11", {})


if __name__ == "__main__":
    unittest.main()
