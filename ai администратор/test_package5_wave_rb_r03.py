"""Actual-source R03 proof without importing application/config/provider modules."""
import ast
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from canonical_staff_schedule_entry import staff_schedule_handoff
from package5_staff_schedule_guard import scan_staff_schedule, schedule_branch

ROOT = Path(__file__).parent


class Trap:
    def __getattr__(self, name):
        raise AssertionError('Business dependency reached: ' + name)

    def __call__(self, *args, **kwargs):
        raise AssertionError('Business effect attempted')


def provider_leaf():
    tree = ast.parse((ROOT / 'yclients.py').read_text())
    fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'change_staff_day_schedule')
    namespace = {'staff_schedule_handoff': staff_schedule_handoff, 'datetime': Trap(), 'logger': Trap()}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[])), 'actual_schedule_leaf', 'exec'), namespace)
    return namespace[fn.name]


def native_entry():
    branch = schedule_branch(ast.parse((ROOT / 'claude_ai.py').read_text()))
    fn = ast.parse('def invoke(tool_input):\n    return None').body[0]
    fn.body = [*branch.body, ast.Return(value=ast.Name(id='result', ctx=ast.Load()))]
    namespace = {'staff_schedule_handoff': staff_schedule_handoff, 'yclients': Trap(), '_resolve_staff_id': Trap()}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[])), 'actual_schedule_initiator', 'exec'), namespace)
    return namespace['invoke']


class R03ScheduleBoundary(unittest.TestCase):
    def test_provider_apply_refuses_before_any_lookup_even_for_forged_targets(self):
        fn = provider_leaf()
        for staff, day, action in [(7, '2099-07-20', 'close_day'), (-1, 'invalid', 'set_break'), ('other-tenant', None, 'set_hours')]:
            self.assertEqual(fn(Trap(), staff, day, action, apply=True), staff_schedule_handoff())

    def test_model_apply_history_flag_and_invented_identity_never_authorize(self):
        fn = native_entry()
        for payload in [{}, {'apply': True}, {'_schedule_confirmation_verified': True, 'apply': True},
                        {'tenantId': 'other', 'userId': 'owner', 'staff_id': 7, 'company_id': 1},
                        {'approval_id': 'invented', 'status': 'APPROVED', 'idempotencyKey': 'same-key'}]:
            self.assertEqual(fn(payload), staff_schedule_handoff())

    def test_concurrent_and_restarted_legacy_calls_create_no_outcome(self):
        calls = [native_entry() for _ in range(2)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda n: calls[n % 2]({'apply': True, '_schedule_confirmation_verified': True}), range(24)))
        self.assertTrue(all(result == staff_schedule_handoff() for result in results))
        self.assertNotIn('executionId', results[0])

    def test_stale_applied_preview_and_unknown_payloads_cannot_claim_an_outcome(self):
        tree = ast.parse((ROOT / 'claude_ai.py').read_text())
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_schedule_terminal_text')
        namespace = {'staff_schedule_handoff': staff_schedule_handoff, 'json': Trap()}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), 'actual_schedule_terminal', 'exec'), namespace)
        for state in ['applied', 'preview', 'failed', 'UNKNOWN']:
            result = namespace[fn.name]([SimpleNamespace(name='manage_staff_schedule', input={})],
                                        [{'content': json.dumps({'status': state, 'success': True})}])
            self.assertEqual(result, staff_schedule_handoff()['message'])

    def test_permanent_guard_accepts_current_exact_sources(self):
        self.assertEqual(scan_staff_schedule(ROOT), [])

    def test_guard_rejects_writers_delegation_and_private_confirmation(self):
        ai = (ROOT / 'claude_ai.py').read_text()
        provider = (ROOT / 'yclients.py').read_text()
        mutations = [
            {'claude_ai.py': ai.replace('result = staff_schedule_handoff()', 'result = yclients.change_staff_day_schedule(apply=True)')},
            {'claude_ai.py': ai.replace('result = staff_schedule_handoff()', 'result = dispatch_hidden_schedule_write(tool_input)')},
            {'claude_ai.py': ai.replace('result = staff_schedule_handoff()', 'result = tool_input.get("_schedule_confirmation_verified")')},
            {'yclients.py': provider.replace('return staff_schedule_handoff()', 'self._put("company/x/staff/schedule", {}); return staff_schedule_handoff()')},
            {'yclients.py': provider + '\ndef resurrect(api):\n    sender = api._put\n    sender("company/x/staff/schedule", {})\n'},
        ]
        for mutation in mutations:
            with self.subTest(source=next(iter(mutation))):
                self.assertTrue(scan_staff_schedule(ROOT, mutation))


if __name__ == '__main__':
    unittest.main()
