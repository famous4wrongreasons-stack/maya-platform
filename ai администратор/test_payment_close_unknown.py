import unittest
from unittest.mock import Mock, patch

from yclients import YClientsAPI


def record(*, paid=False):
    return {
        "id": 1930492386,
        "staff_id": 7,
        "datetime": "2026-08-26T10:00:00+03:00",
        "seance_length": 3600,
        "attendance": 1,
        "paid_full": 1 if paid else 0,
        "payment_status": 1 if paid else 0,
        "visit_id": 1683879333,
        "client": {"id": 11, "phone": "+70000000000", "name": "Client"},
        "services": [
            {"id": 22, "cost": 2000, "cost_to_pay": 0 if paid else 2000}
        ],
        "comment": "",
    }


class PaymentCloseUnknownTests(unittest.TestCase):
    def api(self):
        opaque_ref = patch(
            "yclients.opaque_mutation_reference",
            return_value="legacy-field:close:test",
        )
        opaque_ref.start()
        self.addCleanup(opaque_ref.stop)
        api = object.__new__(YClientsAPI)
        api.company_id = 42
        api.cash_account_id = 1
        api.cashless_account_id = 2
        api._put = Mock(return_value={"success": True})
        api._observe_residual_appointment_outcome = Mock(return_value=True)
        return api

    def test_exact_unlinked_provider_transaction_is_found(self):
        api = self.api()
        tx = {
            "id": 1665037146,
            "amount": "2000.00",
            "record_id": 0,
            "visit_id": 0,
            "comment": "Оплата записи #1930492386: card",
        }
        api._get = Mock(return_value={"data": [tx]})

        result = api._find_payment_transaction(
            comment="Оплата записи #1930492386: card",
            amount=2000,
            start_date="2026-08-24",
            end_date="2026-08-27",
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["transaction"], tx)

    def test_transaction_lookup_failure_is_not_treated_as_empty(self):
        api = self.api()
        api._get = Mock(side_effect=RuntimeError("temporary provider failure"))

        result = api._find_payment_transaction(
            comment="Оплата записи #1930492386: card",
            amount=2000,
            start_date="2026-08-24",
            end_date="2026-08-27",
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "payment_reconciliation_unavailable")

    def test_provider_unlinked_transaction_is_unknown_and_not_created_again(self):
        api = self.api()
        tx = {
            "id": 1665037146,
            "amount": 2000,
            "record_id": 0,
            "visit_id": 0,
            "comment": "Оплата записи #1930492386: card",
        }
        api.get_record = Mock(side_effect=[record(), record(), record()])
        api._find_payment_transaction = Mock(
            return_value={"success": True, "transaction": tx}
        )
        api.create_finance_transaction = Mock()

        result = api.set_record_paid(1930492386, True, "card")

        self.assertFalse(result["success"])
        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["code"], "provider_payment_unlinked")
        self.assertEqual(result["transaction_id"], 1665037146)
        api.create_finance_transaction.assert_not_called()
        api._observe_residual_appointment_outcome.assert_called_once()

    def test_reconciliation_failure_fails_closed_before_dispatch(self):
        api = self.api()
        api.get_record = Mock(side_effect=[record(), record()])
        api._find_payment_transaction = Mock(
            return_value={"success": False, "error": "unavailable"}
        )
        api.create_finance_transaction = Mock()

        result = api.set_record_paid(1930492386, True, "cash")

        self.assertTrue(result["unknown"])
        self.assertEqual(result["code"], "payment_reconciliation_unavailable")
        api.create_finance_transaction.assert_not_called()

    def test_new_transaction_that_does_not_close_visit_becomes_unknown(self):
        api = self.api()
        api.get_record = Mock(side_effect=[record(), record(), record()])
        api._find_payment_transaction = Mock(
            return_value={"success": True, "transaction": None}
        )
        api.create_finance_transaction = Mock(
            return_value={
                "success": True,
                "transaction": {"id": 99, "comment": "payment"},
            }
        )

        result = api.set_record_paid(1930492386, True, "card")

        self.assertTrue(result["unknown"])
        self.assertEqual(result["code"], "provider_payment_unlinked")
        api.create_finance_transaction.assert_called_once()

    def test_confirmed_visit_remains_successful(self):
        api = self.api()
        api.get_record = Mock(side_effect=[record(), record(paid=True)])
        api._find_payment_transaction = Mock()
        api.create_finance_transaction = Mock()
        api._observe_sensitive_appointment_action = Mock(return_value=True)

        result = api.set_record_paid(1930492386, True, "card")

        self.assertTrue(result["success"])
        api._find_payment_transaction.assert_not_called()
        api.create_finance_transaction.assert_not_called()
        api._observe_sensitive_appointment_action.assert_called_once()


if __name__ == "__main__":
    unittest.main()
