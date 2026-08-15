import hashlib
import hmac
import importlib
import os
import unittest
from unittest.mock import patch


class MayaRecoveryBridgeTests(unittest.TestCase):
    def _load(self):
        with patch.dict(
            os.environ,
            {
                "MAYA_INBOX_BRIDGE_TOKEN": "bridge-secret-at-least-32-characters",
                "MAYA_RECOVERY_ATTRIBUTION_SECRET": "recovery-secret-at-least-32-characters",
            },
            clear=False,
        ):
            import maya_recovery_bridge

            return importlib.reload(maya_recovery_bridge)

    def test_subject_ref_matches_backend_contract(self):
        bridge = self._load()
        expected = hmac.new(
            b"recovery-secret-at-least-32-characters",
            b"maya-recovery-subject:v1:79991234567",
            hashlib.sha256,
        ).hexdigest()

        self.assertEqual(bridge._subject_ref("8 (999) 123-45-67"), expected)
        self.assertEqual(bridge._subject_ref("999 123-45-67"), expected)

    def test_explicit_international_number_keeps_its_country_code(self):
        bridge = self._load()

        self.assertEqual(
            bridge._normalized_phone_digits("+380 50 123 45 67"),
            "380501234567",
        )

    def test_event_id_is_stable_and_contains_no_source_identifier(self):
        bridge = self._load()
        first = bridge._external_event_id("cycle", "client-42:2026-08-15")
        second = bridge._external_event_id("cycle", "client-42:2026-08-15")

        self.assertEqual(first, second)
        self.assertNotIn("client-42", first)
        self.assertTrue(first.startswith("cycle:"))


if __name__ == "__main__":
    unittest.main()
