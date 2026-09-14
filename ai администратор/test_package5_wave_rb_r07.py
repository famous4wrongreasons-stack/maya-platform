"""R07 real-body acceptance; synthetic state only, no app/DB/provider imports."""
import ast
import asyncio
import copy
import os
import subprocess
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock, Mock, patch

ROOT = Path(os.environ.get('R07_SOURCE_ROOT', Path(__file__).resolve().parent)).resolve()
sys.path.insert(0, str(ROOT))
from canonical_retention_entry import retention_owner_required
from package5_retention_runtime_guard import scan_retention_sources


class ForbiddenEffect:
    def __getattr__(self, name):
        raise AssertionError(f'No legacy effect/read is authorized: {name}')


def extract(filename, names, scope=None):
    scope = dict(scope or {})
    body = [n for n in ast.parse((ROOT / filename).read_text()).body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert {n.name for n in body} == set(names)
    for node in body:
        node.decorator_list = []; node.returns = None
        for arg in node.args.args + node.args.kwonlyargs:
            arg.annotation = None
    exec(compile(ast.Module(body=body, type_ignores=[]), filename, 'exec'), scope)
    return scope


def replace_body(filename, name, transform):
    tree = ast.parse((ROOT / filename).read_text())
    node = next(n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    node.body = transform(copy.deepcopy(node.body))
    return ast.unparse(tree)


class RetentionAcceptance(unittest.TestCase):
    def assert_refused(self, value, job):
        self.assertEqual(value['job'], job)
        self.assertEqual(value['status'], 'not_executed')
        self.assertEqual(value['error'], 'B35_CANONICAL_OWNER_REQUIRED')
        self.assertFalse(value['ok']); self.assertTrue(value['requires_review'])
        for field in ('sent', 'renew_pushed', 'synced', 'expired', 'delivery_attempts', 'business_mutations'):
            self.assertEqual(value[field], 0)
        self.assertNotIn('campaignId', value); self.assertNotIn('actionExecutionId', value)

    def test_all_direct_producers_refuse_before_candidate_or_legacy_eligibility_read(self):
        for filename, name, job in [('reactivation.py', 'run_reactivation_job', 'reactivation'),
                                   ('cycle_reminder.py', 'run_cycle_reminder_job', 'cycle'),
                                   ('subscriptions.py', 'run_subscriptions_job', 'subscriptions')]:
            with self.subTest(job=job):
                scope = extract(filename, {name}, {'database': ForbiddenEffect(), '_yc': ForbiddenEffect(),
                    'find_dormant_clients': Mock(side_effect=AssertionError('legacy selection')),
                    'find_due_clients': Mock(side_effect=AssertionError('legacy selection')),
                    'sync_subscription_usage': Mock(side_effect=AssertionError('legacy term'))})
                self.assert_refused(asyncio.run(scope[name](ForbiddenEffect())), job)

    def test_renew_helper_rejects_all_legacy_term_shapes_before_effect(self):
        fn = extract('subscriptions.py', {'_send_renew_push'}, {'database': ForbiddenEffect(), '_yc': ForbiddenEffect()})['_send_renew_push']
        # B57 active/unexpired/unchanged usage and early-return inputs are blocked
        # before their former eligibility branch; no old row existence asserted.
        original = {'id': 101, 'client_id': 301, 'status': 'active', 'visits_used': 1,
                    'started_at': '2099-01-01', 'expires_at': '2099-01-30', 'renew_reminder_sent_at': None}
        client = {'id': 301, 'telegram_chat_id': 909, 'phone': '+70000000000'}
        for override in ({}, {'visits_used': 0}, {'status': 'expired'}, {'client_id': 302},
                         {'tenantId': 'wrong'}, {'successorId': 'term2'}, {'expires_at': '2000-01-01'}):
            with self.subTest(override=override):
                sub = {**original, **override}; before = copy.deepcopy(sub)
                self.assert_refused(asyncio.run(fn(ForbiddenEffect(), sub, client, {'code': 'legacy'})), 'subscriptions')
                self.assertEqual(sub, before)

    def test_repeat_concurrent_and_restart_style_calls_never_admit_legacy_campaign(self):
        async def run_batch():
            fn = extract('reactivation.py', {'run_reactivation_job'})['run_reactivation_job']
            return await asyncio.gather(*(fn(ForbiddenEffect()) for _ in range(24)))
        first, restarted = asyncio.run(run_batch()), asyncio.run(run_batch())
        for result in first + restarted:
            self.assert_refused(result, 'reactivation')
        first[0]['sent'] = 999
        self.assertEqual(first[1]['sent'], 0); self.assertEqual(restarted[0]['sent'], 0)

    def test_scheduled_entries_reach_only_the_retired_producer(self):
        for module, wrapper, target, job in [('reactivation', '_reactivation_job', 'run_reactivation_job', 'reactivation'),
                                            ('subscriptions', '_subscriptions_job', 'run_subscriptions_job', 'subscriptions')]:
            producer = extract(module + '.py', {target})[target]
            entry = extract('bot.py', {wrapper}, {module: types.SimpleNamespace(**{target: producer})})[wrapper]
            self.assert_refused(asyncio.run(entry(ForbiddenEffect())), job)

    def test_manual_commands_require_staff_and_only_explain_review(self):
        for name in ('cmd_cycle_now', 'cmd_reactivation_now', 'cmd_subscriptions_now'):
            for allowed in (False, True):
                with self.subTest(name=name, allowed=allowed):
                    authority = types.SimpleNamespace(is_admin=Mock(return_value=allowed))
                    update = types.SimpleNamespace(effective_user=types.SimpleNamespace(id=7), message=types.SimpleNamespace(reply_text=AsyncMock()))
                    fn = extract('bot.py', {name}, {'canonical_staff_access': authority})[name]
                    asyncio.run(fn(update, ForbiddenEffect()))
                    authority.is_admin.assert_called_once_with(7)
                    update.message.reply_text.assert_awaited_once()
                    reply = update.message.reply_text.call_args.args[0]
                    self.assertIn('Рассылка не отправлена' if allowed else 'только для администраторов', reply)
                    self.assertNotIn('Готово', reply)

    def test_panel_and_chat_refuse_raw_and_forged_approval_without_job_effect(self):
        class Request:
            def __init__(self, body): self.json = AsyncMock(return_value=body)
        scope = extract('webhook_server.py', {'panel_job_run_handler', '_run_owner_job_from_chat'},
                        {'_cabinet_response': lambda value, status=200: (status, value),
                         'database': ForbiddenEffect(), 'asyncio': ForbiddenEffect()})
        for job in ('cycle', 'reactivation', 'subscriptions'):
            for payload in ({'job': job}, {'job': job, 'confirmed': True, 'text': 'yes', 'role': 'owner',
                'chat_id': 7, 'phone': '+70000000000', 'clientIds': ['raw'], 'tenantId': 'wrong',
                'campaignId': 'forged', 'intentHash': 'forged', 'proof': 'revoked'}):
                for allowed in (False, True):
                    principal = Mock(return_value=allowed)
                    with patch.dict(sys.modules, {
                        'canonical_staff_access': types.SimpleNamespace(current=principal),
                        'canonical_work_entry': types.SimpleNamespace(owner_required=Mock(side_effect=AssertionError('wrong owner'))),
                    }):
                        request = Request(payload)
                        status, result = asyncio.run(scope['panel_job_run_handler'](request))
                        self.assertEqual(status, 410 if allowed else 403)
                        if allowed: self.assert_refused(result, job)
                        else: request.json.assert_not_awaited()
                        status, result = asyncio.run(scope['_run_owner_job_from_chat'](ForbiddenEffect(), 7, job))
                        self.assertEqual(status, 410 if allowed else 403)
                        if allowed: self.assert_refused(result, job)
                        self.assertEqual(principal.call_args.args, (7,))

    def test_renew_marker_is_retired_without_database_access(self):
        fn = extract('database.py', {'mark_subscription_renew_pushed'}, {'_db': Mock(side_effect=AssertionError('SQL'))})['mark_subscription_renew_pushed']
        with self.assertRaisesRegex(RuntimeError, '^B35_CANONICAL_OWNER_REQUIRED$'): fn(101)

    def test_unknown_job_cannot_expand_retention_contract(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported retention entry'): retention_owner_required('birthday')

    def test_existing_birthday_projection_exclusion_is_not_activated(self):
        yc = Mock(); yc.get_client_bookings.return_value = [{'id': 1, 'client_id': 301}]
        fn = extract('birthday.py', {'_client_yclients_id'}, {'_yc': yc})['_client_yclients_id']
        self.assertIsNone(fn('synthetic-phone')); yc.get_client_bookings.assert_called_once_with('synthetic-phone')

    def test_active_source_closure_guard(self):
        self.assertEqual(scan_retention_sources(ROOT), [])

    def test_bulk_guard_loads_own_sibling_by_path_without_ambient_imports(self):
        # B13 loads the guard by absolute path from outside the Python directory.
        # Isolated mode also excludes PYTHONPATH/current-directory conveniences.
        script = '''import importlib.util
import pathlib
import sys
import types
root = pathlib.Path(sys.argv[1]).resolve()
assert all(pathlib.Path(p).resolve() != root for p in sys.path if p)
spec = importlib.util.spec_from_file_location('bulk_by_path', root / 'package5_bulk_runtime_guard.py')
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)
assert bulk.scan_bulk_sources(root) == []
# An ambient module must not replace the sibling guard or hide a real bypass.
sys.modules['package5_retention_runtime_guard'] = types.SimpleNamespace(scan_retention_sources=lambda *_: [])
source = (root / 'reactivation.py').read_text()
anchor = '    from canonical_retention_entry import retention_owner_required'
assert source.count(anchor) == 1
mutated = source.replace(anchor, '    await app.bot.send_message(chat_id=7, text="bypass")\\n' + anchor)
findings = bulk.scan_bulk_sources(root, {'reactivation.py': mutated})
assert any('reactivation.py:run_reactivation_job' in item for item in findings), findings
'''
        result = subprocess.run(
            [sys.executable, '-I', '-B', '-c', script, str(ROOT)],
            cwd=ROOT.parent, capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_guard_rejects_mutated_real_producer_effects_and_false_refusal(self):
        snippets = ["await app.bot.send_message(chat_id=7,text='x')", "await _send_client_push(7, 'x')",
            'database.log_reactivation_sent(7)', 'audience = database.list_telegram_clients()',
            'asyncio.create_task(deliver(app))', "if app.approved:\n    await app.bot.send_message(chat_id=7,text='x')",
            "try:\n    await app.bot.send_message(chat_id=7,text='x')\nexcept Exception:\n    await _send_client_push(7, 'x')",
            "f = getattr(app.bot, 'send_message')\nawait f(chat_id=7,text='x')"]
        for filename, name in [('reactivation.py', 'run_reactivation_job'), ('cycle_reminder.py', 'run_cycle_reminder_job'),
                               ('subscriptions.py', 'run_subscriptions_job'), ('subscriptions.py', '_send_renew_push')]:
            for snippet in snippets:
                with self.subTest(filename=filename, name=name, mutation=snippet):
                    changed = replace_body(filename, name, lambda body: ast.parse(snippet).body + body)
                    self.assertTrue(scan_retention_sources(ROOT, {filename: changed}))
            changed = replace_body(filename, name, lambda body: body + ast.parse(snippets[0]).body)
            self.assertTrue(scan_retention_sources(ROOT, {filename: changed}))

    def test_guard_rejects_mutated_real_dispatch_and_renewal_sink(self):
        for filename, name, snippet in [
            ('bot.py', 'cmd_cycle_now', 'await cycle_reminder.run_cycle_reminder_job(context.application)'),
            ('bot.py', '_reactivation_job', 'await app.bot.send_message(chat_id=7,text="x")'),
            ('webhook_server.py', 'panel_job_run_handler', 'asyncio.create_task(deliver(request))'),
            ('webhook_server.py', '_run_owner_job_from_chat', 'database.set_setting("last_job", job)'),
            ('database.py', 'mark_subscription_renew_pushed', 'database.execute("UPDATE subscriptions SET renew_reminder_sent_at=1")'),
        ]:
            with self.subTest(name=name):
                changed = replace_body(filename, name, lambda body: ast.parse(snippet).body + body)
                self.assertTrue(scan_retention_sources(ROOT, {filename: changed}))

    def test_guard_rejects_helper_effect_route_rebind_and_birthday_activation(self):
        changed = replace_body('canonical_retention_entry.py', 'retention_owner_required', lambda body: ast.parse('deliver(job)').body + body)
        self.assertTrue(scan_retention_sources(ROOT, {'canonical_retention_entry.py': changed}))
        original = (ROOT / 'webhook_server.py').read_text()
        changed = original.replace('"/api/panel/job/run", panel_job_run_handler', '"/api/panel/job/run", legacy_sender', 1)
        self.assertNotEqual(original, changed)
        self.assertTrue(scan_retention_sources(ROOT, {'webhook_server.py': changed}))
        original = (ROOT / 'bot.py').read_text()
        self.assertTrue(scan_retention_sources(ROOT, {'bot.py': original + '\ncmd_cycle_now = unsafe_sender\n'}))
        original = (ROOT / 'birthday.py').read_text()
        changed = original.replace('(b.get("client") or {}).get("id")', 'b.get("client_id")', 1)
        self.assertNotEqual(original, changed)
        self.assertTrue(scan_retention_sources(ROOT, {'birthday.py': changed}))


if __name__ == '__main__': unittest.main()
