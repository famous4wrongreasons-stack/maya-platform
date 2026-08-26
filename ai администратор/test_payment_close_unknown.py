import os
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
    def test_pay_visit_dispatches_one_canonical_action(self, dispatch):
        dispatch.return_value = {
            "success": True,
            "execution_id": "execution-1",
        }
        api = self.api()

        with patch.dict(os.environ, {"MAYA_A08_PAY_VISIT_SCOPE": "cutover"}):
            result = api.pay_visit(
                1930492386,
                200000,
                "card",
                bridge_origin="telegram.bot",
            )

        self.assertTrue(result["success"])
        dispatch.assert_called_once_with(
            provider="yclients",
            external_company_id="42",
            origin="telegram.bot",
            action_class="pay_visit",
            payload={
                "external_id": "1930492386",
                "amount_kopecks": 200000,
                "payment_method": "card",
            },
        )

    @patch("yclients.dispatch_appointment_action")
    def test_pay_visit_is_fail_closed_by_default(self, dispatch):
        api = self.api()

        with patch.dict(os.environ, {"MAYA_A08_PAY_VISIT_SCOPE": "disabled"}):
            result = api.pay_visit(
                1930492386,
                200000,
                "card",
                bridge_origin="webhook.panel",
            )

        self.assertFalse(result["success"])
        self.assertFalse(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["code"], "pay_visit_cutover_not_enabled")
        dispatch.assert_not_called()

    @patch("yclients.dispatch_appointment_action")
    def test_proof_scope_dispatches_only_the_allowlisted_record(self, dispatch):
        dispatch.return_value = {"success": True, "execution_id": "execution-1"}
        api = self.api()
        env = {
            "MAYA_A08_PAY_VISIT_SCOPE": "proof",
            "MAYA_A08_PAY_VISIT_PROOF_RECORD_IDS": "1930492386",
        }

        with patch.dict(os.environ, env):
            rejected = api.pay_visit(
                1930492387,
                200000,
                "card",
                bridge_origin="webhook.panel",
            )
            accepted = api.pay_visit(
                1930492386,
                200000,
                "card",
                bridge_origin="webhook.panel",
            )

        self.assertFalse(rejected["success"])
        self.assertEqual(rejected["code"], "pay_visit_cutover_not_enabled")
        self.assertTrue(accepted["success"])
        dispatch.assert_called_once()


if __name__ == "__main__":
    unittest.main()
