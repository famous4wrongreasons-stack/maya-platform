import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    "package5_control_plane_runtime_guard",
    ROOT / "package5_control_plane_runtime_guard.py",
)
guard = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = guard
SPEC.loader.exec_module(guard)


class Package5ControlPlaneRuntimeGuardTest(unittest.TestCase):
    def test_active_source_is_protected(self):
        self.assertEqual([], guard.scan_runtime(ROOT))

    def _web_bypass(self, function_name: str, needle: str):
        source = (ROOT / "webhook_server.py").read_text(encoding="utf-8")
        functions = guard._functions(source, "webhook_server.py")
        original = functions[function_name]
        injected = source.replace(original, original + "\n    " + needle + "\n", 1)
        findings = guard.scan_runtime(ROOT, {"webhook_server.py": injected})
        symbols = {needle.split("(", 1)[0], "panel_manager_ids"}
        self.assertTrue(any(any(symbol in item.detail for symbol in symbols) for item in findings), findings)

    def test_direct_staff_writer_fails(self):
        self._web_bypass("panel_team_handler", "database.set_cashier_role(1, True)")

    def test_raw_manager_authority_fails(self):
        self._web_bypass("_panel_resolve_role", 'database.get_setting("panel_manager_ids")')

    def test_direct_goal_writer_fails(self):
        self._web_bypass("panel_plan_target_handler", 'database.set_setting("owner_daily_target_rub", "1")')

    def test_god_tenant_writer_fails(self):
        self._web_bypass("god_subscribers_handler", 'database.add_maya_tenant("x", plan="pro", mrr=1)')

    def test_later_pwa_control_plane_writer_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            (temp_root / "later_route.py").write_text(
                'database.set_maya_tenant_status(1, "active")\n', encoding="utf-8"
            )
            overrides = {
                name: (ROOT / name).read_text(encoding="utf-8")
                for name in ("webhook_server.py", "database.py", "growth_planner.py")
            }
            findings = guard.scan_runtime(temp_root, overrides)
        self.assertTrue(any(item.check == "later_pwa_module" for item in findings), findings)


if __name__ == "__main__":
    unittest.main()
