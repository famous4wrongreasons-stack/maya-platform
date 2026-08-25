from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("legacy_appointment_shadow_observer.py")
SPEC = importlib.util.spec_from_file_location("organic_shadow_observer", MODULE_PATH)
assert SPEC and SPEC.loader
observer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(observer)


def observation(
    action_class: str = "create_appointment",
    identity: str = "d" * 64,
    tenant_resolution: str = "integration",
    **overrides,
):
    expected = observer.ACTION_CLASSES[action_class]
    value = {
        "event": "legacy_appointment_shadow_observation",
        "contract": observer.OBSERVATION_CONTRACT,
        "mode": "shadow",
        "tenant_ref": "a" * 64,
        "tenant_resolution": tenant_resolution,
        "origin": "webhook.chat",
        "authorization_context": dict(
            observer.AUTHORIZATION_CONTEXTS[tenant_resolution]
        ),
        "legacy_action_class": action_class,
        "preview_action_class": expected["preview_action"],
        "capability": expected["capability"],
        "capability_version": 1,
        "target_kind": "appointment",
        "target_ref_hash": "b" * 64,
        "normalized_input_hash": "c" * 64,
        "identity_fingerprint": identity,
        "request_idempotency_key_hash": "e" * 64,
        "policy_key": "appointment-policy",
        "policy_version": 1,
        "policy_decision": "ALLOW",
        "autonomy_level": "L0",
        "approval_requirement": "NONE",
        "executor_key": expected["executor"],
        "executor_version": 1,
        "legacy_outcome": {"success": True, "code": "ok", "http_status": 200},
        "preview_external_side_effects": 0,
        "bridge_external_side_effects": 0,
        "shadow_side_effects": {
            "crm_writes": 0,
            "messages": 0,
            "campaigns": 0,
        },
    }
    value.update(overrides)
    return value


def journal_record(cursor: str, value: dict):
    return {
        "__CURSOR": cursor,
        "__REALTIME_TIMESTAMP": "1787392800000000",
        "MESSAGE": observer.OBSERVATION_PREFIX
        + json.dumps(value, ensure_ascii=False),
    }


class ObserverTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.database = root / "observer.sqlite3"
        self.summary = root / "summary.json"
        self.store = observer.ObserverStore(
            self.database, self.summary, "maya-saas.service"
        )

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def test_equivalent_event_and_unobserved_classes(self):
        self.assertTrue(
            self.store.process_journal_record(journal_record("cursor-1", observation()))
        )
        summary = self.store.summary()
        self.assertEqual(
            summary["action_classes"]["create_appointment"]["verdict"],
            "EQUIVALENT",
        )
        self.assertEqual(
            summary["action_classes"]["reschedule_appointment"]["verdict"],
            "NOT OBSERVED IN PRODUCTION",
        )
        self.assertEqual(summary["shadow_side_effect_proof"]["bridge_crm_writes"], 0)

    def test_logical_duplicate_is_collapsed_but_delivery_is_counted(self):
        self.store.process_journal_record(journal_record("cursor-1", observation()))
        self.store.process_journal_record(journal_record("cursor-2", observation()))
        create = self.store.summary()["action_classes"]["create_appointment"]
        self.assertEqual(create["deliveries"], 2)
        self.assertEqual(create["unique_logical_actions"], 1)
        self.assertEqual(create["duplicates_collapsed"], 1)

    def test_journal_replay_does_not_recount_delivery(self):
        record = journal_record("cursor-1", observation())
        self.assertTrue(self.store.process_journal_record(record))
        self.assertFalse(self.store.process_journal_record(record))
        self.assertEqual(self.store.summary()["totals"]["deliveries"], 1)

    def test_restart_preserves_identity_deduplication(self):
        self.store.process_journal_record(journal_record("cursor-1", observation()))
        self.store.close()
        self.store = observer.ObserverStore(
            self.database, self.summary, "maya-saas.service"
        )
        self.store.process_journal_record(journal_record("cursor-2", observation()))
        totals = self.store.summary()["totals"]
        self.assertEqual(totals["deliveries"], 2)
        self.assertEqual(totals["unique_logical_actions"], 1)
        self.assertEqual(totals["duplicates_collapsed"], 1)

    def test_divergent_executor_blocks_equivalence(self):
        self.store.process_journal_record(
            journal_record("cursor-1", observation(executor_key="legacy.direct"))
        )
        summary = self.store.summary()
        self.assertEqual(summary["overall_verdict"], "DIVERGENT")
        self.assertEqual(
            summary["action_classes"]["create_appointment"]["verdict"],
            "DIVERGENT",
        )

    def test_nonzero_shadow_effect_is_divergent(self):
        self.store.process_journal_record(
            journal_record(
                "cursor-1",
                observation(
                    shadow_side_effects={
                        "crm_writes": 1,
                        "messages": 0,
                        "campaigns": 0,
                    }
                ),
            )
        )
        summary = self.store.summary()
        self.assertEqual(summary["overall_verdict"], "DIVERGENT")
        self.assertEqual(summary["shadow_side_effect_proof"]["bridge_crm_writes"], 1)

    def test_unknown_fields_and_pii_are_not_persisted(self):
        value = observation(
            raw_payload={"client_name": "Secret Client", "phone": "+79990001122"}
        )
        self.store.process_journal_record(journal_record("cursor-1", value))
        row = self.store.connection.execute(
            "SELECT observation_json FROM shadow_deliveries"
        ).fetchone()
        persisted = row["observation_json"]
        self.assertNotIn("Secret Client", persisted)
        self.assertNotIn("+79990001122", persisted)
        self.assertNotIn("raw_payload", persisted)

    def test_raw_identity_is_rejected_and_not_persisted(self):
        value = observation(identity="client-79990001122")
        self.store.process_journal_record(journal_record("cursor-1", value))
        row = self.store.connection.execute(
            "SELECT verdict, observation_json FROM shadow_deliveries"
        ).fetchone()
        self.assertEqual(row["verdict"], "DIVERGENT")
        self.assertNotIn("client-79990001122", row["observation_json"])

    def test_nest_logger_prefix_and_suffix_are_supported(self):
        record = journal_record("cursor-1", observation())
        record["MESSAGE"] = (
            "[Nest] 123 - LOG [LegacyAppointmentBridgeService] "
            + record["MESSAGE"]
            + "\u001b[0m"
        )
        self.assertTrue(self.store.process_journal_record(record))
        self.assertEqual(self.store.summary()["totals"]["deliveries"], 1)

    def test_journald_byte_array_message_with_ansi_is_supported(self):
        record = journal_record("cursor-1", observation())
        encoded = (
            "\u001b[32m[Nest] 123 - LOG [LegacyAppointmentBridgeService] "
            + record["MESSAGE"]
            + "\u001b[39m"
        ).encode("utf-8")
        record["MESSAGE"] = list(encoded)

        self.assertTrue(self.store.process_journal_record(record))
        self.assertEqual(self.store.summary()["totals"]["deliveries"], 1)

    def test_invalid_journald_byte_array_is_not_parsed(self):
        record = journal_record("cursor-1", observation())
        record["MESSAGE"] = [True, 999, "not-a-byte"]

        self.assertFalse(self.store.process_journal_record(record))
        self.assertEqual(self.store.summary()["totals"]["deliveries"], 0)

    def test_direct_nest_attendance_observation_is_equivalent(self):
        value = observation(
            "set_appointment_attendance",
            tenant_resolution="request_context",
            origin="nest.crm.journal",
        )
        self.assertTrue(
            self.store.process_journal_record(journal_record("cursor-1", value))
        )
        result = self.store.summary()["action_classes"]["set_appointment_attendance"]
        self.assertEqual(result["verdict"], "EQUIVALENT")

    def test_mixed_tenant_resolution_and_auth_profile_is_divergent(self):
        value = observation(
            "set_appointment_duration",
            tenant_resolution="request_context",
            authorization_context=dict(
                observer.AUTHORIZATION_CONTEXTS["integration"]
            ),
        )
        self.store.process_journal_record(journal_record("cursor-1", value))
        result = self.store.summary()["action_classes"]["set_appointment_duration"]
        self.assertEqual(result["verdict"], "DIVERGENT")

    def test_all_supported_classes_can_reach_equivalence_without_side_effects(self):
        for index, action_class in enumerate(observer.ACTION_CLASSES, start=1):
            self.store.process_journal_record(
                journal_record(
                    f"cursor-{index}",
                    observation(action_class, identity=f"{index:x}" * 64),
                )
            )
        summary = self.store.summary()
        self.assertEqual(summary["overall_verdict"], "EQUIVALENT")
        self.assertEqual(summary["shadow_side_effect_proof"]["external_actions_executed"], 0)
        self.assertFalse(summary["automatic_cutover_allowed"])


if __name__ == "__main__":
    unittest.main()
