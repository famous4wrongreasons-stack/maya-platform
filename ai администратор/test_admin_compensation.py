import unittest

from business_rules import anton_salary_for_period
from yclients import YClientsAPI


class AntonSalaryTests(unittest.TestCase):
    def test_period_uses_confirmed_yclients_accrual(self):
        result = anton_salary_for_period(
            "2026-07-01",
            "2026-07-31",
            {"verified": True, "accrued": 54_160, "paid": 0},
        )

        self.assertTrue(result["verified"])
        self.assertEqual(result["source"], "yclients_payroll")
        self.assertEqual(result["total"], 54_160)
        self.assertEqual(result["salary"], 54_160)

    def test_zero_accrual_is_still_verified(self):
        result = anton_salary_for_period(
            "2026-07-09", "2026-07-09", {"verified": True, "accrued": 0, "paid": 0}
        )

        self.assertTrue(result["verified"])
        self.assertEqual(result["total"], 0)

    def test_missing_payroll_fails_closed_without_estimate(self):
        result = anton_salary_for_period("2026-07-01", "2026-07-31")

        self.assertFalse(result["verified"])
        self.assertIsNone(result["total"])

    def test_reversed_range_is_rejected(self):
        with self.assertRaises(ValueError):
            anton_salary_for_period("2026-07-12", "2026-07-11", {})


class YClientsPayrollTests(unittest.TestCase):
    def test_summary_reads_yclients_income_without_recalculating(self):
        api = object.__new__(YClientsAPI)
        api.company_id = 503759
        api._get = lambda endpoint, params=None: {
            "success": True,
            "data": {
                "total_sum": {"income": "54160", "expense": "12000", "balance": "0"}
            },
        }

        result = api.get_staff_payroll_summary(1461625, "2026-07-01", "2026-07-31")

        self.assertTrue(result["verified"])
        self.assertEqual(result["accrued"], 54_160)
        self.assertEqual(result["paid"], 12_000)

    def test_summary_rejects_incomplete_payload(self):
        api = object.__new__(YClientsAPI)
        api.company_id = 503759
        api._get = lambda endpoint, params=None: {"success": True, "data": {}}

        with self.assertRaises(ValueError):
            api.get_staff_payroll_summary(1461625, "2026-07-01", "2026-07-31")


if __name__ == "__main__":
    unittest.main()
