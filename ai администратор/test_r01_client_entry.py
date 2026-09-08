"""Permanent R01 negative proof: execute real native function ASTs without bot imports.

No config, DB, provider, app or Telegram module is imported. Every business
dependency is a trap, and the only allowed operation is a synthetic reply.
"""
import ast
import asyncio
import json
import logging
import os
import re
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent
BOT = ast.parse((ROOT / 'bot.py').read_text())
HELPER = (ROOT / 'legacy_client_entry.py').read_text()
LEAVES = [
    'cmd_start', 'cmd_client', 'handle_contact', '_request_contact_share',
    '_start_contact_flow', '_handle_contact_input', '_show_confirm',
    '_finalize_booking', '_show_my_bookings', '_handle_cancel_record_request',
    '_handle_cancel_record_confirm', '_handle_freed_slot_accept',
    '_handle_freed_slot_decline', '_build_dossier', '_dossier_chat_id',
    '_get_ai_response_async',
]


class Trap:
    def __getattr__(self, name):
        raise AssertionError('Business dependency reached: ' + name)

    def __call__(self, *args, **kwargs):
        raise AssertionError('Business dependency called')


class LegacyStaffPredicateOnly(Trap):
    """Allow the still-independent R02 predicate in the R01-only commit proof."""
    def is_admin(self, *_):
        return False


def real_functions(*names):
    namespace = {'APP_URL': 'https://app.synthetic.test/', 'database': Trap(),
                 'yc': Trap(), 'get_ai_response': Trap(), 'warm_client_history_cache_for_phone': Trap(),
                 'asyncio': Trap(), 'conversations': Trap(), 'booking_flow': Trap(),
                 're': re, 'logger': logging.getLogger(__name__)}
    exec(compile(HELPER, str(ROOT / 'legacy_client_entry.py'), 'exec'), namespace)
    selected = []
    for node in BOT.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            # R02 decorators are independently proved; test the actual R01 body.
            node.decorator_list = []
            selected.append(node)
    assert len(selected) == len(names), 'Every guarded entry must exist'
    module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *selected], type_ignores=[])
    ast.fix_missing_locations(module)
    exec(compile(module, str(ROOT / 'bot.py'), 'exec'), namespace)
    return namespace


def fixture():
    message = SimpleNamespace(reply_text=AsyncMock(), contact=None)
    query = SimpleNamespace(edit_message_text=AsyncMock(), answer=AsyncMock(),
                            from_user=SimpleNamespace(id=17), message=message)
    update = SimpleNamespace(effective_message=message, message=message,
                             effective_user=SimpleNamespace(
                                 id=17, first_name='Test', last_name='', username='tester'
                             ), callback_query=query)
    context = SimpleNamespace(bot=SimpleNamespace(send_message=AsyncMock()), args=[])
    return update, context, query


class R01NativeClientEntry(unittest.IsolatedAsyncioTestCase):
    def test_maintenance_handoff_keeps_client_entry_read_only(self):
        ns = real_functions()
        with patch.dict(os.environ, {"MAYA_PWA_MAINTENANCE_MODE": "true"}):
            message = ns['client_handoff_message'](ns['APP_URL'])
        self.assertIn('ведутся технические работы', message)
        self.assertIn('сообщения и отчёты', message)
        self.assertIn(ns['APP_URL'], message)

    async def test_each_old_native_leaf_has_no_business_effect(self):
        ns = real_functions(*LEAVES)
        update, context, query = fixture()
        cases = {
            'cmd_start': (update, context), 'cmd_client': (update, context),
            'handle_contact': (update, context),
            '_request_contact_share': (context, 17),
            '_start_contact_flow': (context, 17, {'staff_id': 'forged'}),
            '_handle_contact_input': (update, context, 17, 'raw phone', {'stage': 'phone'}),
            '_show_confirm': (context, 17), '_finalize_booking': (context, 17, query),
            '_show_my_bookings': (update, context, 17),
            '_handle_cancel_record_request': (context, query, 123),
            '_handle_cancel_record_confirm': (context, query, 123),
            '_handle_freed_slot_accept': (context, query, 'freed_book_7_209901011000'),
            '_handle_freed_slot_decline': (context, query),
            '_build_dossier': (123, 'untrusted', '+79990000000', 17),
            '_dossier_chat_id': ('+79990000000',),
            '_get_ai_response_async': ([{'role': 'user', 'content': 'book'}], 17, update),
        }
        for name, args in cases.items():
            with self.subTest(entry=name):
                result = await ns[name](*args)
                if name == '_get_ai_response_async':
                    self.assertEqual(result, (ns['client_handoff_message'](ns['APP_URL']), None, None))
                if name == '_dossier_chat_id':
                    self.assertIsNone(result)
        replies = [*update.message.reply_text.call_args_list,
                   *query.edit_message_text.call_args_list,
                   *context.bot.send_message.call_args_list]
        self.assertTrue(replies)
        for reply in replies:
            self.assertIn(ns['APP_URL'], str(reply))

    async def test_missing_foreign_and_own_contact_all_require_canonical_binding(self):
        ns = real_functions('handle_contact')
        for subject in [None, 99, 17]:
            with self.subTest(contactUserId=subject):
                update, context, _ = fixture()
                update.message.contact = SimpleNamespace(user_id=subject, phone_number='+79990000000')
                await ns['handle_contact'](update, context)
                update.message.reply_text.assert_awaited_once_with(ns['client_handoff_message'](ns['APP_URL']))

    async def test_native_app_nonce_creates_login_session_without_client_resolution(self):
        ns = real_functions('cmd_start')
        update, context, _ = fixture()
        context.args = ['app_abcdefgh12345678']

        calls = []
        ns['web_auth'] = SimpleNamespace(_new_token=lambda: 'session-token')
        ns['normalize_tg_user'] = lambda value: {
            'display_name': value['first_name'], 'first_name': value['first_name'],
            'last_name': value['last_name'], 'username': value['username'],
        }
        ns['database'] = SimpleNamespace(
            create_web_session=lambda *args, **kwargs: calls.append(('session', args, kwargs)),
            applogin_authorize=lambda *args: calls.append(('authorize', args)) or True,
            revoke_web_session=lambda token: calls.append(('revoke', token)),
        )

        await ns['cmd_start'](update, context)

        self.assertEqual([item[0] for item in calls], ['session', 'authorize'])
        self.assertEqual(calls[0][2]['subject_kind'], 'client')
        self.assertNotIn('client_id', calls[0][2])
        self.assertEqual(calls[1][1], ('abcdefgh12345678', 17, 'session-token'))
        update.message.reply_text.assert_awaited_once_with(
            '✅ Вход подтверждён. Вернитесь в MAYA — приложение завершит вход автоматически.'
        )

    async def test_invalid_or_expired_native_app_nonce_never_leaves_live_session(self):
        ns = real_functions('cmd_start')
        update, context, _ = fixture()
        context.args = ['app_invalid!']
        ns['database'] = Trap()
        ns['web_auth'] = Trap()
        await ns['cmd_start'](update, context)
        self.assertIn('устарела', update.message.reply_text.await_args.args[0])

        update, context, _ = fixture()
        context.args = ['app_abcdefgh12345678']
        calls = []
        ns['web_auth'] = SimpleNamespace(_new_token=lambda: 'orphan-token')
        ns['normalize_tg_user'] = lambda _: {}
        ns['database'] = SimpleNamespace(
            create_web_session=lambda *args, **kwargs: calls.append('session'),
            applogin_authorize=lambda *args: calls.append('authorize') or False,
            revoke_web_session=lambda token: calls.append(('revoke', token)),
        )
        await ns['cmd_start'](update, context)
        self.assertEqual(calls, ['session', 'authorize', ('revoke', 'orphan-token')])
        self.assertIn('устарела', update.message.reply_text.await_args.args[0])

    async def test_old_cards_after_restart_stop_before_parsing_or_logging(self):
        ns = real_functions('handle_callback')
        callbacks = ['booking_confirm', 'booking_cancel', 'contact_self', 'contact_other',
                     'cancel_confirm_yes', 'cancel_confirm_no', 'cancel_rec_yes_123',
                     'cancel_rec_123', 'cancel_rec_no', 'freed_book_7_209901011000',
                     'freed_book_invalid', 'freed_decline', 'loy_redeem_untrusted',
                     'whatsnew_dismiss', 'dossier_123', 'dossierc_456']
        for data in callbacks:
            with self.subTest(callback=data):
                update, context, query = fixture()
                query.data = data
                await ns['handle_callback'](update, context)
                query.edit_message_text.assert_awaited_once_with(ns['client_handoff_message'](ns['APP_URL']))

    async def test_personal_message_never_enters_legacy_memory_or_ai(self):
        ns = real_functions('process_message')
        ns.update({'_drop_expired_flows': lambda _: None,
                   'reviews': SimpleNamespace(handle_negative_comment=AsyncMock(return_value=False)),
                   '_admin_busy_in_flow': lambda _: False,
                   '_detect_master_self_intro': lambda _: None,
                   '_is_commands_request': lambda _: False,
                   'canonical_staff_access': SimpleNamespace(is_admin=lambda _: False),
                   'database': LegacyStaffPredicateOnly(),
                   'MASTER_MENU_BUTTONS': set()})
        for text in ['📅 Мои записи', '✂️ Записаться', '🪙 Баллы', 'my phone is untrusted', 'book as usual']:
            update, context, _ = fixture()
            await ns['process_message'](update, context, text)
            update.message.reply_text.assert_awaited_once_with(ns['client_handoff_message'](ns['APP_URL']))

    def test_no_native_client_mutation_or_ai_call_can_be_reintroduced(self):
        forbidden = {'database.update_client', 'yc.create_booking', 'yc.cancel_booking',
                     'get_ai_response', 'claude_ai.get_ai_response', 'warm_client_history_cache_for_phone'}
        offenders = [ast.unparse(node.func) for node in ast.walk(BOT)
                     if isinstance(node, ast.Call) and ast.unparse(node.func) in forbidden]
        self.assertEqual(offenders, [])
        allowed_auth_calls = {
            'database.create_web_session', 'database.applogin_authorize',
            'database.revoke_web_session', 'web_auth._new_token',
        }
        for name in LEAVES:
            node = next(n for n in BOT.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
            for call in [n for n in ast.walk(node) if isinstance(n, ast.Call)]:
                if name == 'cmd_start' and ast.unparse(call.func) in allowed_auth_calls:
                    continue
                self.assertNotIn(ast.unparse(call.func).split('.')[0],
                                 ['database', 'yc', 'requests', 'get_ai_response', 'save_conversations'])

        cmd_start = next(n for n in BOT.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'cmd_start')
        auth_calls = {ast.unparse(n.func) for n in ast.walk(cmd_start) if isinstance(n, ast.Call)
                      and ast.unparse(n.func).split('.')[0] in {'database', 'web_auth'}}
        self.assertEqual(auth_calls, allowed_auth_calls)
        self.assertFalse(any('client' in call.lower() for call in auth_calls))

    def test_legacy_transport_rejects_native_client_before_even_resolving_mode(self):
        source = ast.parse((ROOT / 'legacy_appointment_bridge.py').read_text())
        nodes = [n for n in source.body if isinstance(n, ast.FunctionDef) and
                 n.name in {'dispatch_appointment_action', '_rejected_result'}]
        ns = {'bridge_mode': Trap(), '_envelope': Trap(), '_post_bridge': Trap()}
        module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *nodes], type_ignores=[])
        ast.fix_missing_locations(module)
        exec(compile(module, 'legacy_appointment_bridge.py', 'exec'), ns)
        for action in ['create_appointment', 'cancel_appointment', 'reschedule_appointment']:
            result = ns['dispatch_appointment_action'](provider='yclients', external_company_id='wrong',
                                                     origin='telegram.bot', action_class=action, payload={})
            self.assertFalse(result['accepted'])
            self.assertFalse(result['retry_allowed'])
            self.assertEqual(result['code'], 'verified_client_channel_required')


if __name__ == '__main__':
    unittest.main()
