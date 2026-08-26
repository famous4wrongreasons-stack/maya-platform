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
    async def test_owner_payment_loads_provider_record_before_deriving_amount(self):
        request = _Request({"record_id": 77, "method": "card"})
        provider_record = {"services": [{"cost": 2_000}]}

        with mock.patch.object(
            webhook_server, "_panel_auth", return_value={"id": 11}
        ), mock.patch.object(
            webhook_server,
            "_panel_resolve_role",
            return_value={"role": "owner"},
        ), mock.patch.object(
            webhook_server,
            "_panel_record_guard",
            new=mock.AsyncMock(return_value=(None, None)),
        ), mock.patch.object(
            webhook_server._yc, "get_record", return_value=provider_record
        ) as get_record, mock.patch.object(
            webhook_server._yc,
            "pay_visit",
            return_value={"success": True, "already_paid": False},
        ) as pay_visit, mock.patch.object(
            webhook_server.database, "mark_payment_done"
        ) as mark_payment_done:
            response = await webhook_server.panel_journal_pay_handler(request)

        payload = json.loads(response.text)
        self.assertEqual(response.status, 200)
        self.assertTrue(payload["ok"])
        get_record.assert_called_once_with(77)
        pay_visit.assert_called_once_with(
            77,
            200_000,
            "card",
            bridge_origin="webhook.panel",
        )
        mark_payment_done.assert_called_once_with(77, "card", 2_000)

    async def test_master_payment_reuses_guarded_provider_record(self):
        request = _Request({"record_id": 77, "method": "cash"})
        guarded_record = {"services": [{"price": 1_500}]}

        with mock.patch.object(
            webhook_server, "_panel_auth", return_value={"id": 12}
        ), mock.patch.object(
            webhook_server,
            "_panel_resolve_role",
            return_value={"role": "master", "staff_id": 9},
        ), mock.patch.object(
            webhook_server,
            "_panel_record_guard",
            new=mock.AsyncMock(return_value=(guarded_record, None)),
        ), mock.patch.object(
            webhook_server._yc, "get_record"
        ) as get_record, mock.patch.object(
            webhook_server._yc,
            "pay_visit",
            return_value={"success": True, "already_paid": False},
        ) as pay_visit, mock.patch.object(
            webhook_server.database, "mark_payment_done"
        ):
            response = await webhook_server.panel_journal_pay_handler(request)

        self.assertEqual(response.status, 200)
        get_record.assert_not_called()
        pay_visit.assert_called_once_with(
            77,
            150_000,
            "cash",
            bridge_origin="webhook.panel",
        )


if __name__ == "__main__":
    unittest.main()
