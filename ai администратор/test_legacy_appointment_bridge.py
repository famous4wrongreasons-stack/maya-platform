import os
import unittest
from unittest.mock import patch

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


def shadow_body(execution_id="execution-shadow-1"):
    return {
        "contract": bridge.BRIDGE_RESULT_CONTRACT,
        "accepted": True,
        "mode": "shadow",
        "tenant_resolution": "integration",
        "execution": {
            "contract": "maya.action-execution-preview/1",
            "executionId": execution_id,
            "state": "PLANNED",
        },
        "safe_explanation": "Shadow observation accepted.",
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

    def dispatch(self, *, action_class="create_appointment", payload=None, origin="webhook.chat"):
        return bridge.dispatch_appointment_action(
            provider="yclients",
            external_company_id="42",
            origin=origin,
            action_class=action_class,
            payload=payload or dict(CREATE_PAYLOAD),
        )

    def test_off_and_shadow_modes_fail_closed_after_cutover(self):
        for mode in ("off", "shadow"):
            os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = mode
            with self.subTest(mode=mode), patch.object(bridge, "_post_bridge") as post:
                result = self.dispatch()
                self.assertEqual(
                    result["code"], "legacy_appointment_bridge_mode_invalid"
                )
                post.assert_not_called()

    def test_cutover_create_uses_execute_route(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        with patch.object(
            bridge, "_post_bridge", return_value=canonical_body()
        ) as post:
            result = self.dispatch()

        self.assertTrue(result["success"])
        self.assertEqual(result["record_id"], "record-1")
        self.assertEqual(post.call_args.args[0], "execute")
        self.assertNotIn("legacy_outcome", post.call_args.args[1])

    def test_repeated_python_and_two_workers_use_one_transport_alias(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        envelopes = []

        def accepted(_path, envelope):
            envelopes.append(envelope)
            return canonical_body()

        with patch.object(bridge, "_post_bridge", side_effect=accepted):
            first = self.dispatch()
            second = self.dispatch()

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertEqual(
            envelopes[0]["idempotency_key"], envelopes[1]["idempotency_key"]
        )
        self.assertEqual(envelopes[0]["requester_ref"], envelopes[1]["requester_ref"])

    def test_cutover_reschedule_and_cancel_use_typed_bridge_actions(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        captured = []

        def accepted(_path, envelope):
            captured.append(envelope)
            return canonical_body()

        with patch.object(bridge, "_post_bridge", side_effect=accepted):
            self.dispatch(
                action_class="reschedule_appointment",
                payload={
                    "external_id": "77",
                    "start": "2026-09-02T10:00:00.000Z",
                },
            )
            self.dispatch(
                action_class="cancel_appointment",
                payload={"external_id": "77"},
            )

        self.assertEqual(
            [item["action_class"] for item in captured],
            ["reschedule_appointment", "cancel_appointment"],
        )

    def test_timeout_is_unknown_and_never_falls_back(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        with patch.object(requests, "post", side_effect=requests.Timeout):
            result = self.dispatch()

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])

    def test_server_error_after_possible_persist_is_unknown(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        response = FakeResponse(
            503, {"error": {"code": "legacy_bridge_unavailable"}}
        )
        with patch.object(requests, "post", return_value=response):
            result = self.dispatch()

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["code"], "legacy_bridge_unavailable")

    def test_wrong_secret_or_tenant_rejection_never_falls_back(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        for status, code in (
            (401, "legacy_appointment_bridge_unauthorized"),
            (403, "legacy_appointment_tenant_not_found"),
        ):
            response = FakeResponse(status, {"error": {"code": code}})
            with self.subTest(status=status), patch.object(
                requests, "post", return_value=response
            ):
                result = self.dispatch()
                self.assertFalse(result["accepted"])
                self.assertFalse(result["unknown"])
                self.assertEqual(result["code"], code)

    def test_malformed_response_is_unknown_without_fallback(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        with patch.object(
            requests, "post", return_value=FakeResponse(200, json_error=True)
        ):
            result = self.dispatch()

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])

    def test_canonical_unknown_is_preserved_and_not_retried(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        with patch.object(
            bridge, "_post_bridge", return_value=canonical_body("UNKNOWN")
        ):
            result = self.dispatch()

        self.assertTrue(result["unknown"])
        self.assertFalse(result["retry_allowed"])
        self.assertEqual(result["execution_id"], "execution-1")

    def test_invalid_mode_fails_closed(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "surprise"
        with patch.object(bridge, "_post_bridge") as post:
            result = self.dispatch()

        self.assertEqual(result["code"], "legacy_appointment_bridge_mode_invalid")
        post.assert_not_called()

    def test_missing_origin_fails_closed(self):
        os.environ["MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE"] = "cutover"
        with patch.object(bridge, "_post_bridge") as post:
            result = self.dispatch(origin=None)

        self.assertEqual(result["code"], "legacy_appointment_bridge_origin_missing")
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

    def test_residual_observer_posts_only_to_shadow_with_zero_effects(self):
        captured = []

        def accepted(path, envelope):
            captured.append((path, envelope))
            return shadow_body()

        with patch.object(bridge, "_post_bridge", side_effect=accepted):
            observed = bridge.observe_residual_appointment_action(
                provider="yclients",
                external_company_id="42",
                origin="legacy.residual_appointment",
                action_class="set_appointment_attendance",
                payload={"external_id": "77", "attendance_code": 1},
                legacy_outcome={
                    "success": True,
                    "code": "legacy_write_succeeded",
                    "unsafe": {"phone": "+79990001122"},
                },
            )

        self.assertTrue(observed)
        self.assertEqual(captured[0][0], "shadow")
        self.assertEqual(
            captured[0][1]["legacy_outcome"],
            {"success": True, "code": "legacy_write_succeeded"},
        )

    def test_residual_observer_rejects_non_shadow_or_effectful_result(self):
        for body in (
            canonical_body(),
            {**shadow_body(), "bridge_external_side_effects": 1},
            {**shadow_body(), "accepted": False},
        ):
            with self.subTest(body=body), patch.object(
                bridge, "_post_bridge", return_value=body
            ):
                observed = bridge.observe_residual_appointment_action(
                    provider="yclients",
                    external_company_id="42",
                    origin="legacy.residual_appointment",
                    action_class="set_appointment_duration",
                    payload={"external_id": "77", "duration_seconds": 3600},
                    legacy_outcome={"success": True},
                )
                self.assertFalse(observed)

    def test_residual_observer_identity_is_stable_across_restart(self):
        envelopes = []

        def accepted(_path, envelope):
            envelopes.append(envelope)
            return shadow_body()

        kwargs = {
            "provider": "yclients",
            "external_company_id": "42",
            "origin": "legacy.residual_appointment",
            "action_class": "set_appointment_services",
            "payload": {"external_id": "77", "service_ids": ["1", "2"]},
            "legacy_outcome": {"success": True},
        }
        with patch.object(bridge, "_post_bridge", side_effect=accepted):
            self.assertTrue(bridge.observe_residual_appointment_action(**kwargs))
            self.assertTrue(bridge.observe_residual_appointment_action(**kwargs))

        self.assertEqual(
            envelopes[0]["idempotency_key"], envelopes[1]["idempotency_key"]
        )
        self.assertEqual(envelopes[0]["requester_ref"], envelopes[1]["requester_ref"])

    def test_sensitive_mutation_reference_is_stable_and_contains_no_plaintext(self):
        value = {"name": "Sensitive Name", "phone": "+79990001122"}
        first = bridge.opaque_mutation_reference(value, "client_identity")
        second = bridge.opaque_mutation_reference(value, "client_identity")

        self.assertEqual(first, second)
        self.assertTrue(first.startswith("legacy-field:client_identity:"))
        self.assertNotIn("Sensitive Name", first)
        self.assertNotIn("79990001122", first)


if __name__ == "__main__":
    unittest.main()
