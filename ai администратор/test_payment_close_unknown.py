import unittest
from unittest.mock import Mock, patch

import ast
from pathlib import Path


def real_payment_api():
    # Other legacy test loaders replace sys.modules['yclients']. Compile the
    # exact two production tombstones, without importing provider/config state.
    source = Path(__file__).with_name('yclients.py').read_text()
    owner = next(n for n in ast.parse(source).body if isinstance(n, ast.ClassDef) and n.name == 'YClientsAPI')
    methods = [n for n in owner.body if isinstance(n, ast.FunctionDef) and n.name in {'pay_visit', 'set_record_paid'}]
    assert len(methods) == 2
    namespace = {}
    for method in methods:
        exec('from __future__ import annotations\n' + ast.get_source_segment(source, method), namespace)
    return type('ProductionPaymentTombstones', (), {m.name: namespace[m.name] for m in methods})


class PaymentCutoverTests(unittest.TestCase):
    def api(self):
        api = real_payment_api()()
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

    @patch("legacy_appointment_bridge.dispatch_appointment_action")
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

    @patch("legacy_appointment_bridge.dispatch_appointment_action")
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
