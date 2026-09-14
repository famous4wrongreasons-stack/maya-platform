import json
import unittest
from unittest import mock

import webhook_server


class _Request:
    headers = {}

    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


class PanelVisitPaymentTests(unittest.IsolatedAsyncioTestCase):
    async def test_owner_payment_is_deferred_without_provider_or_local_writes(self):
        request = _Request({"record_id": 77, "method": "card"})

        with mock.patch.object(
            webhook_server, "_panel_auth", return_value={"id": 11}
        ), mock.patch.object(
            webhook_server,
            "_panel_resolve_role",
            return_value={"role": "owner"},
        ), mock.patch.object(
            webhook_server, "_panel_record_guard", new=mock.AsyncMock()
        ) as record_guard, mock.patch.object(
            webhook_server._yc, "get_record"
        ) as get_record, mock.patch.object(
            webhook_server._yc,
            "pay_visit",
        ) as pay_visit, mock.patch.object(
            webhook_server.database, "mark_payment_done"
        ) as mark_payment_done:
            response = await webhook_server.panel_journal_pay_handler(request)

        payload = json.loads(response.text)
        self.assertEqual(response.status, 503)
        self.assertEqual(
            payload["error"], "visit_payment_write_provider_contract_deferred"
        )
        self.assertEqual(payload["manual_handoff"], "yclients")
        self.assertFalse(payload["retry_allowed"])
        record_guard.assert_not_awaited()
        get_record.assert_not_called()
        pay_visit.assert_not_called()
        mark_payment_done.assert_not_called()

    async def test_master_payment_is_also_deferred_without_dispatch(self):
        request = _Request({"record_id": 77, "method": "cash"})

        with mock.patch.object(
            webhook_server, "_panel_auth", return_value={"id": 12}
        ), mock.patch.object(
            webhook_server,
            "_panel_resolve_role",
            return_value={"role": "master", "staff_id": 9},
        ), mock.patch.object(
            webhook_server, "_panel_record_guard", new=mock.AsyncMock()
        ) as record_guard, mock.patch.object(
            webhook_server._yc, "get_record"
        ) as get_record, mock.patch.object(
            webhook_server._yc,
            "pay_visit",
        ) as pay_visit, mock.patch.object(
            webhook_server.database, "mark_payment_done"
        ) as mark_payment_done:
            response = await webhook_server.panel_journal_pay_handler(request)

        payload = json.loads(response.text)
        self.assertEqual(response.status, 503)
        self.assertEqual(payload["manual_handoff"], "yclients")
        record_guard.assert_not_awaited()
        get_record.assert_not_called()
        pay_visit.assert_not_called()
        mark_payment_done.assert_not_called()


if __name__ == "__main__":
    unittest.main()
