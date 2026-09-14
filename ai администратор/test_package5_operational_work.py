import ast
import asyncio
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

import canonical_work_entry as entry
import package5_operational_work_runtime_guard as guard

ROOT = Path(os.environ.get('MAYA_R04_PROOF_ROOT', str(Path(__file__).parent)))


class Request:
    def __init__(self, body, headers=None):
        self.payload = body
        self.headers = headers or {'Authorization': 'Bearer synthetic-session'}

    async def json(self):
        return self.payload


def extract(file, names, extra=None):
    tree = ast.parse((ROOT / file).read_text())
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert len(nodes) == len(names)
    for node in nodes:
        node.returns = None
        for arg in node.args.args + node.args.kwonlyargs:
            arg.annotation = None
    scope = {'__name__': 'r04_actual_source', **(extra or {})}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), file, 'exec'), scope)
    return scope


class OperationalWorkTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.authority = patch.object(entry.canonical_staff_access, 'current', return_value={
            'userId': 'user-a', 'tenantId': 'tenant-a', 'role': 'tenant_owner', 'platform': False})
        self.authority.start()
        self.addCleanup(self.authority.stop)
        self.send = patch.object(entry, '_send', return_value={'ok': True})
        self.transport = self.send.start()
        self.addCleanup(self.send.stop)

    async def test_exact_create_forwards_session_and_unchanged_identity(self):
        req = Request({'title': 'Task', 'detail': 'Count', 'assignee_user_id': 'user-b', 'due_at': None, 'idempotency_key': 'same-key'})
        for _ in range(2):
            await entry.canonical_request(req, 'create')
        self.assertEqual(self.transport.call_count, 2)
        self.transport.assert_called_with('synthetic-session', 'create', {
            'assigneeUserId': 'user-b', 'title': 'Task', 'bodyText': 'Count', 'dueAt': None}, 'same-key')
        req.payload['title'] = 'Changed intent'
        await entry.canonical_request(req, 'create')
        self.assertEqual(self.transport.call_args.args[-1], 'same-key')
        self.assertEqual(self.transport.call_args.args[2]['title'], 'Changed intent')

    async def test_missing_current_actor_or_platform_cannot_initiate(self):
        for principal in [None, {'platform': True}]:
            with patch.object(entry.canonical_staff_access, 'current', return_value=principal):
                self.assertFalse((await entry.canonical_request(Request({}), 'list'))['ok'])
        self.transport.assert_not_called()

    async def test_no_identity_raw_ids_or_unsupported_transitions_are_admitted(self):
        cases = [('create', {}), ('complete', {'task_id': 123}),
                 ('complete', {'task_id': '123', 'action': 'done'}),
                 ('complete', {'task_id': 'canonical-inbox', 'action': 'reopen'}),
                 ('complete', {'task_id': 'canonical-inbox', 'action': 'done', 'note': 'changed'}),
                 ('create', {'assigned_to': 'admin'}), ('create', {'safe_autocreate': True}),
                 ('create', {'due_in_days': 1}), ('create', {'action_job': 'cycle'})]
        for operation, body in cases:
            if body:
                body['idempotency_key'] = 'identity-a'
            self.assertFalse((await entry.canonical_request(Request(body), operation))['ok'])
        self.transport.assert_not_called()

    async def test_inconsistent_transport_credentials_and_keys_fail_closed(self):
        req = Request({'maya_token': 'other', 'idempotency_key': 'key'})
        self.assertFalse((await entry.canonical_request(req, 'create'))['ok'])
        req = Request({'idempotency_key': 'body-key'}, {'Authorization': 'Bearer session', 'Idempotency-Key': 'header-key'})
        self.assertFalse((await entry.canonical_request(req, 'create'))['ok'])
        self.transport.assert_not_called()

    async def test_exact_completion_and_read_have_no_local_writer(self):
        await entry.canonical_request(Request({'task_id': 'canonical-inbox', 'action': 'done', 'idempotency_key': 'complete-key'}), 'complete')
        self.transport.assert_called_with('synthetic-session', 'complete', {'inboxItemId': 'canonical-inbox'}, 'complete-key')
        await entry.canonical_request(Request({}), 'list')
        self.transport.assert_called_with('synthetic-session', 'list', None, '')

    async def test_actual_native_and_scheduled_leaves_deny_without_importing_business_modules(self):
        scope = extract('owner_ai.py', guard.RETIRED)
        for name in guard.RETIRED:
            signature = __import__('inspect').signature(scope[name])
            required = {key: 'untrusted' for key, arg in signature.parameters.items() if arg.default is arg.empty}
            value = scope[name](**required)
            self.assertFalse(value['ok'])
            self.assertEqual(value['business_mutations'], 0)
        fn = extract('webhook_server.py', {'maya_operating_rhythm_loop'})['maya_operating_rhythm_loop']
        await fn(object())
        self.transport.assert_not_called()

    async def test_actual_legacy_database_leaves_never_open_a_database(self):
        scope = extract('database.py', guard.WRITERS | {'list_owner_actions', 'evaluate_due_owner_actions'}, {'sqlite3': types.SimpleNamespace()})
        for name in guard.WRITERS:
            signature = __import__('inspect').signature(scope[name])
            args = {key: 'untrusted' for key, arg in signature.parameters.items() if arg.default is arg.empty}
            with self.assertRaisesRegex(RuntimeError, 'CANONICAL_OPERATIONAL_WORK_REQUIRED'):
                scope[name](**args)
        self.assertEqual(scope['list_owner_actions'](), [])
        self.assertEqual(scope['evaluate_due_owner_actions'](), 0)


class OutcomeAndRatchetTests(unittest.TestCase):
    def test_transport_unknown_is_not_failed_or_blindly_retried(self):
        class Failure(Exception):
            pass
        client = types.SimpleNamespace(RequestException=Failure, ConnectionError=Failure)
        for response in [Mock(status_code=503), Mock(status_code=409), Mock(status_code=200)]:
            response.json.return_value = {'result': {'actionExecutionId': 'execution-a', 'targetRef': 'work-a', 'unknownApplicable': False}}
            client.request = Mock(return_value=response)
            with patch.dict(sys.modules, {'requests': client}):
                value = entry._send('session', 'create', {'title': 'Task'}, 'intent')
            self.assertEqual(client.request.call_count, 1)
            self.assertEqual(client.request.call_args.args[1], entry.BASE + '/create')
            if response.status_code == 503:
                self.assertTrue(value['unknown']); self.assertFalse(value['retry_allowed'])
            elif response.status_code == 409:
                self.assertEqual(value['error'], 'IDEMPOTENCY_CONFLICT')
            else:
                self.assertTrue(value['ok']); self.assertEqual(value['execution_id'], 'execution-a')

    def test_actual_command_center_and_daily_briefing_do_not_write_or_evaluate_journal(self):
        from test_owner_ai import _load_owner_ai
        modules = dict(sys.modules)
        try:
            owner = _load_owner_ai(reactivation_payload=None)
            sys.modules['market_intelligence'] = types.SimpleNamespace(market_snapshot=lambda **kwargs: {})
            database = sys.modules['database']
            writes = Mock(side_effect=AssertionError('A read cannot write'))
            for name in guard.WRITERS | {'evaluate_due_owner_actions', 'set_setting', 'list_owner_actions'}:
                setattr(database, name, writes)
            for _ in range(2):
                center = owner.command_center()
                brief = owner.daily_briefing()
                self.assertEqual(center['journal'], [])
                self.assertIsInstance(brief, dict)
            writes.assert_not_called()
        finally:
            for name in ['database', 'analytics', 'yclients', 'growth_planner', 'owner_ai', 'market_intelligence']:
                if name in modules:
                    sys.modules[name] = modules[name]
                else:
                    sys.modules.pop(name, None)

    def test_permanent_guard_and_negative_mutants(self):
        sources = {path.name: path.read_text() for path in ROOT.glob('*.py')
                   if not path.name.startswith(('test_', 'package5_operational_work_runtime_guard'))}
        self.assertEqual(guard.validate(sources), [])
        def mutated_function_body(source, name):
            node = next(node for node in ast.parse(source).body
                        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name)
            lines = source.splitlines(keepends=True)
            return ''.join(lines[:node.body[0].lineno - 1]) + '    asyncio.create_task(effect())\n' + ''.join(lines[node.end_lineno:])

        mutations = [
            ('other_runtime.py', "db.execute('UPDATE owner_action_journal SET status=1')"),
            ('database.py', sources['database.py'].replace("raise RuntimeError('CANONICAL_OPERATIONAL_WORK_REQUIRED')", "db.write()", 1)),
            ('owner_ai.py', sources['owner_ai.py'].replace('    journal = []  # R04:', '    journal = database.evaluate_due_owner_actions()  # R04:', 1)),
            ('webhook_server.py', mutated_function_body(sources['webhook_server.py'], 'maya_operating_rhythm_loop')),
            ('canonical_work_entry.py', sources['canonical_work_entry.py'].replace('canonical_staff_access.current()', '{}')),
            ('canonical_work_entry.py', sources['canonical_work_entry.py'].replace('def owner_required():', "def owner_required():\n    import requests\n    requests.post('https://synthetic.invalid/provider-write', json={})")),
            ('claude_ai.py', sources['claude_ai.py'] + "\nTOOLS.append({'name': 'run_execution_loop_tick'})\n"),
        ]
        for name, changed in mutations:
            self.assertTrue(changed != sources.get(name), name)
            self.assertTrue(guard.validate({**sources, name: changed}), name)


if __name__ == '__main__':
    unittest.main()
