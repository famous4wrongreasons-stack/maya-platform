"""B24 handler/active-surface tests: synthetic credentials, no network or user DB."""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

with patch.dict('sys.modules', {'requests': SimpleNamespace()}):
    import legacy_client_command_bridge as bridge
from package5_control_plane_runtime_guard import scan_runtime

ROOT = Path(__file__).parent


class WebPushBoundaryTest(unittest.TestCase):
    def setUp(self):
        modules = patch.dict('sys.modules', {'legacy_client_command_bridge': bridge})
        modules.start()
        self.addCleanup(modules.stop)
        self.source = (ROOT/'webhook_server.py').read_text()
        nodes = [n for n in ast.parse(self.source).body if isinstance(n, ast.AsyncFunctionDef) and n.name in ('push_subscribe_handler', 'push_unsubscribe_handler')]
        self.env = {'web': SimpleNamespace(Request=object, Response=object), 'asyncio': asyncio,
                    '_cabinet_response': lambda data, status=200: (status, data)}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'webhook_server.py', 'exec'), self.env)

    def request(self, data, headers=None):
        class Request:
            async def json(self): return data
        r = Request()
        r.headers = headers or {}
        return r

    def test_legacy_and_forged_identities_never_reach_registry(self):
        with patch.object(bridge, 'command', side_effect=AssertionError('Unverified registration')) as send:
            for body in ({'session_token': 'legacy', 'subscription': {}}, {'chat_id': 123}, {'phone': 'synthetic'}, {'clientId': 'forged'}, {}):
                status, value = asyncio.run(self.env['push_subscribe_handler'](self.request(body)))
                self.assertEqual(status, 409)
                self.assertFalse(value['ok'])
            send.assert_not_called()

    def test_verified_credentials_forward_only_to_registry_and_failures_are_sanitized(self):
        body = {'subscription': {'endpoint': 'synthetic-sensitive-endpoint', 'keys': {}}, 'maya_token': 'synthetic-authenticated-token'}
        with patch.object(bridge, 'command', return_value={'endpointId': 'opaque-id', 'status': 'ACTIVE', 'changed': False}) as command:
            status, response = asyncio.run(self.env['push_subscribe_handler'](self.request(body)))
            self.assertEqual(status, 200)
            self.assertEqual(response['endpointId'], 'opaque-id')
            self.assertEqual(command.call_args.args[0], 'push-subscribe')
            self.assertEqual(command.call_args.args[2], {'subscription': body['subscription']})
        for error in (RuntimeError('sensitive-endpoint-and-key'), ValueError('CLIENT_WEB_PUSH_LIMIT_EXCEEDED')):
            with patch.object(bridge, 'command', side_effect=error):
                status, response = asyncio.run(self.env['push_subscribe_handler'](self.request(body)))
                self.assertIn(status, (409, 503))
                self.assertNotIn('sensitive', str(response))
                self.assertFalse(response['ok'])

    def test_ratchet_rejects_raw_identity_send_and_plaintext_writers(self):
        self.assertEqual(scan_runtime(ROOT), [])
        marker = '    """B24 AC3: verified Client registration only; no send or legacy store."""'
        for code in ('_authed_chat_id(request, {})', '_save_master_push_subscription()',
                     'database.get_or_create_client(1)', 'import pywebpush',
                     'cursor.execute("INSERT INTO master_push_subscriptions VALUES (?)", [])'):
            changed = self.source.replace(marker, marker+'\n    '+code)
            self.assertTrue(scan_runtime(ROOT, {'webhook_server.py': changed}), code)
        for name in ('_send_master_push', '_send_client_push'):
            node = next(n for n in ast.parse(self.source).body if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
            lines = self.source.splitlines(keepends=True)
            lines.insert(node.end_lineno-1, '    webpush({})\n')
            self.assertTrue(scan_runtime(ROOT, {'webhook_server.py': ''.join(lines)}))


if __name__ == '__main__': unittest.main()
