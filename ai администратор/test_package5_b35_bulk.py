"""B35 initiator regressions: no database import or network/provider I/O."""
import ast
import asyncio
import importlib.util
import json
import hmac
import re
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, AsyncMock, patch

ROOT = Path(__file__).resolve().parent


def extracted(path, names, scope):
    tree = ast.parse((ROOT / path).read_text())
    body = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for node in body:
        node.decorator_list = []
        node.returns = None
        for arg in node.args.args:
            arg.annotation = None
    exec(compile(ast.Module(body=body, type_ignores=[]), path, 'exec'), scope)
    return scope


class BulkInitiatorTests(unittest.TestCase):
    def test_protected_transport_preserves_known_rejection_and_unknown_without_retry(self):
        errors = types.SimpleNamespace(BadRequest=type('BadRequest', (Exception,), {}), Forbidden=type('Forbidden', (Exception,), {}))
        scope = extracted('webhook_server.py', {'internal_package2_telegram_handler'}, {
            'hmac': hmac, '_json': json, 're': re, '_MAYA_INBOX_BRIDGE_TOKEN': 'synthetic',
            '_PACKAGE2_TELEGRAM_MESSAGE_TYPES': {'marketing_broadcast'}, '_PACKAGE2_TELEGRAM_PARSE_MODES': set(),
            'web': types.SimpleNamespace(json_response=lambda body, status=200: (status, body), HTTPNotFound=RuntimeError),
        })
        original = AsyncMock()
        bot = type('Bot', (), {'_maya_original_send_message_for_chat_mirror': original})()
        class Request:
            headers = {'X-Maya-Inbox-Bridge': 'synthetic'}
            app = {'bot_app': types.SimpleNamespace(bot=bot)}
            async def json(self):
                return {'telegram_chat_id': 7, 'message_type': 'marketing_broadcast', 'source_event_id': 'b35:logical', 'title': 'MAYA', 'body_text': 'Approved text', 'contract': 'maya.bulk-telegram-transport/1'}
        with patch.dict(sys.modules, {'telegram.error': errors}):
            for error in (errors.BadRequest(), errors.Forbidden()):
                original.reset_mock(); original.side_effect = error
                result = asyncio.run(scope['internal_package2_telegram_handler'](Request()))
                self.assertEqual(result, (400, {'error': 'B35_TELEGRAM_REJECTED'}))
                original.assert_awaited_once()
            original.reset_mock(); original.side_effect = TimeoutError('lost provider response')
            with self.assertRaises(TimeoutError):
                asyncio.run(scope['internal_package2_telegram_handler'](Request()))
            original.assert_awaited_once()
            original.reset_mock(); original.side_effect = None; original.return_value = types.SimpleNamespace(message_id=123)
            self.assertEqual(asyncio.run(scope['internal_package2_telegram_handler'](Request())), (200, {'message_id': '123'}))
            original.assert_awaited_once()

    def test_active_source_guard_rejects_restored_direct_owner(self):
        from package5_bulk_runtime_guard import scan_bulk_sources
        self.assertEqual(scan_bulk_sources(ROOT), [])
        original = (ROOT / 'webhook_server.py').read_text()
        changed = original.replace('raise RuntimeError("B35_CANONICAL_OWNER_APPROVAL_REQUIRED_USE_PANEL")', 'await bot.send_message(chat_id=7, text=text)', 1)
        self.assertTrue(scan_bulk_sources(ROOT, {'webhook_server.py': changed}))

    def test_old_producer_has_no_delivery(self):
        scope = extracted('webhook_server.py', {'broadcast_send_to_base'}, {})
        with self.assertRaisesRegex(RuntimeError, 'B35_CANONICAL_OWNER_APPROVAL_REQUIRED'):
            asyncio.run(scope['broadcast_send_to_base'](object(), 'text'))
        flow = {7: {'text': 'old approval'}}
        scope = extracted('bot.py', {'_broadcast_execute'}, {'broadcast_flow': flow})
        result = asyncio.run(scope['_broadcast_execute'](object(), 7))
        self.assertEqual(result['sent'], 0)
        self.assertNotIn(7, flow)

    def test_panel_transmits_same_identity_and_owner_proof(self):
        command = Mock(return_value={'campaignId': 'original', 'state': 'UNRESOLVED'})
        proof = Mock(return_value='owner-proof')
        scope = extracted('webhook_server.py', {'panel_broadcast_handler'}, {
            'asyncio': asyncio, '_cabinet_response': lambda body, status=200: (status, body),
        })
        class Request:
            headers = {'Authorization': 'Bearer synthetic'}
            async def json(self):
                return {'mode': 'resume', 'campaignId': 'original', 'intentHash': 'approved'}
        with patch.dict(sys.modules, {
            'legacy_client_command_bridge': types.SimpleNamespace(channel_proof=proof),
            'legacy_marketing_bulk_bridge': types.SimpleNamespace(command=command),
        }):
            result = asyncio.run(scope['panel_broadcast_handler'](Request()))
            self.assertEqual(result[0], 200)
            command.assert_called_once_with('resume', 'owner-proof', {'campaignId': 'original', 'intentHash': 'approved'})
            command.side_effect = RuntimeError('unknown')
            result = asyncio.run(scope['panel_broadcast_handler'](Request()))
            self.assertEqual(result[0], 503)
            self.assertEqual(result[1]['error'], 'B35_OUTCOME_UNKNOWN_RESUME_SAME_CAMPAIGN')

    def test_bridge_no_implicit_retry_or_legacy_identity(self):
        requests = types.SimpleNamespace(post=Mock(), Timeout=type('Timeout', (Exception,), {}), ConnectionError=type('ConnectionError', (Exception,), {}))
        with patch.dict(sys.modules, {'requests': requests, 'config': types.SimpleNamespace(YCLIENTS_COMPANY_ID='bound')}), patch.dict(os.environ, {'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN': 'synthetic'}):
            spec = importlib.util.spec_from_file_location('b35_test_bridge', ROOT / 'legacy_marketing_bulk_bridge.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            with self.assertRaisesRegex(ValueError, 'CANONICAL_OWNER_SESSION_REQUIRED'):
                module.command('confirm', json.dumps({'type': 'telegram_widget', 'credential': 'legacy'}), {})
            requests.post.assert_not_called()
            requests.post.side_effect = requests.Timeout()
            payload = {'campaignId': 'original', 'intentHash': 'approved'}
            with self.assertRaisesRegex(RuntimeError, 'UNKNOWN_RESUME_SAME_CAMPAIGN'):
                module.command('resume', json.dumps({'type': 'maya_jwt', 'credential': 'synthetic'}), payload)
            requests.post.assert_called_once()
            self.assertEqual(requests.post.call_args.kwargs['json']['payload'], payload)


if __name__ == '__main__':
    unittest.main()
