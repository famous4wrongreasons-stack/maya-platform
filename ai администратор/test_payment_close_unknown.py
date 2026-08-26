import unittest
from unittest.mock import Mock, patch

from yclients import YClientsAPI


class PaymentCutoverTests(unittest.TestCase):
    def api(self):
        api = object.__new__(YClientsAPI)
        api.company_id = 42
        return api

    def test_legacy_fake_payment_path_is_a_write_free_tombstone(self):
        api = self.api()
        api._put = Mock()
        api.create_finance_transaction = Mock()

        result = api.set_record_paid(1930492386, True, "card")

        self.assertFalse(result["success"])
        self.assertFalse(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["code"], "legacy_fake_payment_removed")
        api._put.assert_not_called()
        api.create_finance_transaction.assert_not_called()

    @patch("yclients.dispatch_appointment_action")
    def test_pay_visit_is_provider_deferred_and_never_dispatches(self, dispatch):
        api = self.api()

        result = api.pay_visit(
            1930492386,
            200000,
            "card",
            bridge_origin="telegram.bot",
        )

        self.assertFalse(result["success"])
        self.assertFalse(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(
            result["code"], "visit_payment_write_provider_contract_deferred"
        )
        dispatch.assert_not_called()

    @patch("yclients.dispatch_appointment_action")
    def test_legacy_cutover_flags_cannot_reenable_payment_write(self, dispatch):
        api = self.api()

        first = api.pay_visit(
            1930492386,
            200000,
            "card",
            bridge_origin="webhook.panel",
        )
        second = api.pay_visit(
            1930492386,
            200000,
            "card",
            bridge_origin="webhook.panel",
        )

        self.assertEqual(
            first["code"], "visit_payment_write_provider_contract_deferred"
        )
        self.assertEqual(second["code"], first["code"])
        dispatch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
