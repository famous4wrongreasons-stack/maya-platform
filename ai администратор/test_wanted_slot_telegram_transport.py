"""Run the actual protected bridge function and allowlists; no bot import or network."""
import ast
import asyncio
import hmac
import json
from pathlib import Path
import re
import types
import unittest
from unittest.mock import AsyncMock


class WantedSlotTelegramTransportTests(unittest.TestCase):
    def setUp(self):
        source = (Path(__file__).parent / 'webhook_server.py').read_text()
        tree = ast.parse(source)
        names = {'_PACKAGE2_TELEGRAM_MESSAGE_TYPES', '_PACKAGE2_TELEGRAM_PARSE_MODES'}
        nodes = [node for node in tree.body if
                 isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in names for target in node.targets)
                 or isinstance(node, ast.AsyncFunctionDef) and node.name == 'internal_package2_telegram_handler']
        self.scope = {
            'hmac': hmac, '_json': json, 're': re,
            '_MAYA_INBOX_BRIDGE_TOKEN': 'synthetic-proof-token',
            'web': types.SimpleNamespace(Request=object, Response=object, HTTPNotFound=PermissionError,
                                         json_response=lambda body, status=200: (status, body)),
        }
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'protected-bridge-source', 'exec'), self.scope)
        self.send = AsyncMock(return_value=types.SimpleNamespace(message_id=123))
        bot = type('Bot', (), {'_maya_original_send_message_for_chat_mirror': self.send})()
        self.body = {
            'telegram_chat_id': '91010', 'message_type': 'wanted_slot_available',
            'source_event_id': 'wanted-slot-delivery:synthetic-identity',
            'title': 'Освободилось время',
            'body_text': 'Запрошенное вами время освободилось. Откройте запись, чтобы проверить актуальность слота.',
        }
        self.request = types.SimpleNamespace(
            headers={'X-Maya-Inbox-Bridge': 'synthetic-proof-token'},
            app={'bot_app': types.SimpleNamespace(bot=bot)},
            json=AsyncMock(return_value=self.body),
        )

    def run_handler(self):
        return asyncio.run(self.scope['internal_package2_telegram_handler'](self.request))

    def test_canonical_wanted_slot_type_reaches_exactly_one_transport_send(self):
        self.assertEqual(self.run_handler(), (200, {'message_id': '123'}))
        self.send.assert_awaited_once()
        self.assertEqual(self.send.await_args.kwargs['chat_id'], 91010)
        self.assertEqual(self.send.await_args.kwargs['text'], self.body['body_text'])

    def test_unknown_type_is_refused_without_send(self):
        self.body['message_type'] = 'caller_invented_message'
        self.assertEqual(self.run_handler(), (400, {'error': 'invalid_request'}))
        self.send.assert_not_awaited()

    def test_missing_bridge_auth_is_refused_without_send(self):
        self.request.headers = {}
        with self.assertRaises(PermissionError):
            self.run_handler()
        self.send.assert_not_awaited()

    def test_malformed_recipient_is_refused_without_send(self):
        self.body['telegram_chat_id'] = 'not-an-address'
        self.assertEqual(self.run_handler(), (400, {'error': 'invalid_request'}))
        self.send.assert_not_awaited()

    def test_lost_provider_response_is_not_retried_or_reported_as_success(self):
        self.send.side_effect = TimeoutError('synthetic lost response')
        with self.assertRaises(TimeoutError):
            self.run_handler()
        self.send.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
