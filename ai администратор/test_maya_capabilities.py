import importlib
import json
import sys
import types
import unittest


def _load_module():
    store = {}
    fake_config = types.ModuleType("config")
    fake_config.FOUNDER_IDS = [948205934]
    fake_database = types.ModuleType("database")
    fake_database.get_setting = lambda key, default=None: store.get(key, default)
    fake_database.set_setting = lambda key, value: store.__setitem__(key, value)
    sys.modules["config"] = fake_config
    sys.modules["database"] = fake_database
    sys.modules.pop("maya_capabilities", None)
    return importlib.import_module("maya_capabilities"), store


class MayaCapabilitiesTests(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def test_self_history_is_enabled_by_default(self):
        capabilities, _ = _load_module()

        self.assertTrue(capabilities.is_enabled(
            capabilities.CLIENT_SELF_VISIT_HISTORY
        ))

    def test_founder_can_disable_and_enable_capability(self):
        capabilities, store = _load_module()

        disabled = capabilities.set_enabled(
            capabilities.CLIENT_SELF_VISIT_HISTORY,
            False,
            actor_id=948205934,
        )
        self.assertFalse(disabled["enabled"])
        self.assertFalse(capabilities.is_enabled(
            capabilities.CLIENT_SELF_VISIT_HISTORY
        ))
        payload = json.loads(store["maya_capability:client_self_visit_history"])
        self.assertEqual(payload["changed_by"], 948205934)

        capabilities.set_enabled(
            capabilities.CLIENT_SELF_VISIT_HISTORY,
            True,
            actor_id=948205934,
        )
        self.assertTrue(capabilities.is_enabled(
            capabilities.CLIENT_SELF_VISIT_HISTORY
        ))

    def test_non_founder_and_unknown_capability_are_rejected(self):
        capabilities, _ = _load_module()

        with self.assertRaises(PermissionError):
            capabilities.set_enabled(
                capabilities.CLIENT_SELF_VISIT_HISTORY,
                False,
                actor_id=123456789,
            )
        with self.assertRaises(KeyError):
            capabilities.is_enabled("arbitrary_database_access")


if __name__ == "__main__":
    unittest.main()
