import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    "package4_value_runtime_guard", ROOT / "package4_value_runtime_guard.py"
)
guard = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = guard
SPEC.loader.exec_module(guard)


class Package4ValueRuntimeGuardTest(unittest.TestCase):
    def test_active_source_is_protected(self):
        self.assertEqual([], guard.scan_runtime(ROOT))

    def _assert_synthetic_bypass_fails(self, filename: str, needle: str):
        source = (ROOT / filename).read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as tmp:
            extra = Path(tmp) / "later_production_route.py"
            extra.write_text(needle + "\n", encoding="utf-8")
            # Required files are supplied as overrides; the added module proves
            # that later top-level PWA code remains in the scan surface.
            overrides = {
                name: (ROOT / name).read_text(encoding="utf-8")
                for name in ("webhook_server.py", "loyalty.py", "database.py")
            }
            findings = guard.scan_runtime(Path(tmp), overrides)
        self.assertTrue(findings, source[:0])
        symbol = needle.split("(", 1)[0]
        self.assertTrue(any(symbol in item.detail for item in findings), findings)

    def test_rc_whole_handoff_rejects_an_added_aliased_writer(self):
        source = (ROOT / "webhook_server.py").read_text()
        import ast
        node = next(n for n in ast.parse(source).body
                    if isinstance(n, ast.AsyncFunctionDef) and n.name == "_process_record_delete")
        lines = source.splitlines(keepends=True)
        lines.insert(node.body[0].lineno - 1, "    alias_writer(record_id)\n")
        findings = guard.scan_runtime(ROOT, {"webhook_server.py": ''.join(lines)})
        self.assertTrue(any(f.check == "pwa_handler" and "_process_record_delete" in f.detail for f in findings))

    def test_later_direct_pwa_loyalty_write_fails(self):
        self._assert_synthetic_bypass_fails(
            "webhook_server.py", "database.reserve_loyalty_points(client_id=1, points=1, request_id='x')"
        )

    def test_later_direct_pwa_gift_write_fails(self):
        self._assert_synthetic_bypass_fails(
            "webhook_server.py", "database.save_gift_certificate('x', 1, 'x', 'x')"
        )

    def test_later_direct_pwa_refund_fails(self):
        self._assert_synthetic_bypass_fails(
            "webhook_server.py", "loyalty.refund_for_cancelled_record(1)"
        )

    def test_direct_writer_inside_guarded_route_fails(self):
        source = (ROOT / "webhook_server.py").read_text(encoding="utf-8")
        injected = source.replace(
            'logger.warning("p4_03_legacy_mutation_disabled:redeem_legacy_loyalty")',
            'database.reserve_loyalty_points(client_id=1, points=1, request_id="x")\n'
            '    logger.warning("p4_03_legacy_mutation_disabled:redeem_legacy_loyalty")',
            1,
        )
        findings = guard.scan_runtime(ROOT, {"webhook_server.py": injected})
        self.assertTrue(
            any(
                item.check == "pwa_handler"
                and "client_book_with_loyalty_handler" in item.detail
                for item in findings
            ),
            findings,
        )


if __name__ == "__main__":
    unittest.main()
