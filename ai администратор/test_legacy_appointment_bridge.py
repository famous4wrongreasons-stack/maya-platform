import os
import unittest
from unittest.mock import Mock, patch

import requests

import legacy_appointment_bridge as bridge


CREATE_PAYLOAD = {
    "client_id": "legacy-client:opaque",
    "client_name": "Client",
    "client_phone": "+79990001122",
    "branch_id": "42",
    "staff_id": "7",
    "service_ids": ["1", "2"],
    "start": "2026-09-01T09:00:00.000Z",
    "notify_by_sms_hours": 3,
}


def canonical_body(state="SUCCEEDED", execution_id="execution-1"):
    return {
        "contract": bridge.BRIDGE_RESULT_CONTRACT,
        "accepted": True,
        "mode": "execute",
        "tenant_resolution": "integration",
        "execution": {
            "contract": "maya.action-execution-result/1",
            "executionId": execution_id,
            "state": state,
            "safeResult": {"externalId": "record-1"},
        },
        "safe_explanation": "Операция принята.",
        "bridge_external_side_effects": 0,
    }


class FakeResponse:
    def __init__(self, status_code=200, body=None, json_error=False):
        self.status_code = status_code
        self._body = body if body is not None else {}
        self._json_error = json_error

    def json(self):
        if self._json_error:
            raise ValueError("invalid json")
        return self._body


class LegacyAppointmentBridgeTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN": "x" * 32,
                "MAYA_LEGACY_APPOINTMENT_BRIDGE_URL": "http://bridge.test/api",
                "MAYA_LEGACY_APPOINTMENT_BRIDGE_TIMEOUT_SECONDS": "2",
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()
        patch.stopall()

    def dispatch(self, *, action_class="create_appointment", payload=None, direct=None):
        return bridge.dispatch_appointment_action(
            provider="yclients",
            external_company_id="42",
            origin="webhook.chat",
            action_class=action_class,
            payload=payload or dict(CREATE_PAYLOAD),
            direct_call=direct or Mock(return_value={"success": True, "record_id": 77}),
        )

    def test_off_mode_executes_legacy_path_once(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "off"
        direct = Mock(return_value={"success": True, "record_id": 77})
        with patch.object(bridge, "_post_bridge") as post:
            result = self.dispatch(direct=direct)

        self.assertTrue(result["success"])
        direct.assert_called_once_with()
        post.assert_not_called()

    def test_shadow_executes_legacy_once_and_bridge_preview_only(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "shadow"
        direct = Mock(return_value={"success": True, "record_id": 77})
        with patch.object(
            bridge,
            "_post_bridge",
            return_value={"accepted": True, "mode": "shadow"},
        ) as post:
            result = self.dispatch(direct=direct)

        self.assertEqual(result["record_id"], 77)
        direct.assert_called_once_with()
        path, envelope = post.call_args.args
        self.assertEqual(path, "shadow")
        self.assertEqual(envelope["legacy_outcome"], {"success": True})

    def test_cutover_create_never_calls_direct_owner(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(
            bridge, "_post_bridge", return_value=canonical_body()
        ) as post:
            result = self.dispatch(direct=direct)

        self.assertTrue(result["success"])
        self.assertEqual(result["record_id"], "record-1")
        direct.assert_not_called()
        self.assertEqual(post.call_args.args[0], "execute")

    def test_repeated_python_and_two_workers_use_one_transport_alias(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        envelopes = []

        def accepted(_path, envelope):
            envelopes.append(envelope)
            return canonical_body()

        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(bridge, "_post_bridge", side_effect=accepted):
            first = self.dispatch(direct=direct)
            second = self.dispatch(direct=direct)

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertEqual(
            envelopes[0]["idempotency_key"], envelopes[1]["idempotency_key"]
        )
        self.assertEqual(envelopes[0]["requester_ref"], envelopes[1]["requester_ref"])
        direct.assert_not_called()

    def test_cutover_reschedule_and_cancel_use_typed_bridge_actions(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        captured = []

        def accepted(_path, envelope):
            captured.append(envelope)
            return canonical_body()

        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(bridge, "_post_bridge", side_effect=accepted):
            self.dispatch(
                action_class="reschedule_appointment",
                payload={
                    "external_id": "77",
                    "start": "2026-09-02T10:00:00.000Z",
                },
                direct=direct,
            )
            self.dispatch(
                action_class="cancel_appointment",
                payload={"external_id": "77"},
                direct=direct,
            )

        self.assertEqual(
            [item["action_class"] for item in captured],
            ["reschedule_appointment", "cancel_appointment"],
        )
        direct.assert_not_called()

    def test_timeout_is_unknown_and_never_falls_back(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(requests, "post", side_effect=requests.Timeout):
            result = self.dispatch(direct=direct)

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        direct.assert_not_called()

    def test_server_error_after_possible_persist_is_unknown(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        response = FakeResponse(
            503, {"error": {"code": "legacy_bridge_unavailable"}}
        )
        with patch.object(requests, "post", return_value=response):
            result = self.dispatch(direct=direct)

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["code"], "legacy_bridge_unavailable")
        direct.assert_not_called()

    def test_wrong_secret_or_tenant_rejection_never_falls_back(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        for status, code in (
            (401, "legacy_appointment_bridge_unauthorized"),
            (403, "legacy_appointment_tenant_not_found"),
        ):
            response = FakeResponse(status, {"error": {"code": code}})
            with self.subTest(status=status), patch.object(
                requests, "post", return_value=response
            ):
                result = self.dispatch(direct=direct)
                self.assertFalse(result["accepted"])
                self.assertFalse(result["unknown"])
                self.assertEqual(result["code"], code)
        direct.assert_not_called()

    def test_malformed_response_is_unknown_without_fallback(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(
            requests, "post", return_value=FakeResponse(200, json_error=True)
        ):
            result = self.dispatch(direct=direct)

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        direct.assert_not_called()

    def test_canonical_unknown_is_preserved_and_not_retried(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(
            bridge, "_post_bridge", return_value=canonical_body("UNKNOWN")
        ):
            result = self.dispatch(direct=direct)

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["execution_id"], "execution-1")
        direct.assert_not_called()

    def test_invalid_mode_fails_closed(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "surprise"
        direct = Mock(side_effect=AssertionError("direct fallback invoked"))
        with patch.object(bridge, "_post_bridge") as post:
            result = self.dispatch(direct=direct)

        self.assertEqual(result["code"], "legacy_appointment_bridge_mode_invalid")
        direct.assert_not_called()
        post.assert_not_called()

    def test_status_is_read_from_action_engine_without_reconciliation(self):
        response = FakeResponse(200, canonical_body("UNKNOWN"))
        with patch.object(requests, "get", return_value=response) as get:
            result = bridge.get_appointment_execution_status(
                provider="yclients",
                external_company_id="42",
                execution_id="execution-1",
            )

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(get.call_args.kwargs["params"]["external_company_id"], "42")


if __name__ == "__main__":
    unittest.main()
