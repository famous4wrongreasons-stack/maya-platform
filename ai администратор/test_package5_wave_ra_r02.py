import ast
import asyncio
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import canonical_staff_access as access
from package5_staff_authority_guard import scan_staff_authority

ROOT = Path(__file__).parent


def principal(**changes):
    value = dict(contract='maya.canonical-staff-principal/1', userId='user-a', tenantId='tenant-a',
                membershipId='membership-a', role='tenant_owner', platform=False,
                telegramId='100', authIdentityId='identity-a', staffId=None,
                externalStaffId=None, businessMutations=0)
    value.update(changes)
    return value


def extracted(filename, name, namespace):
    source = (ROOT / filename).read_text()
    node = next(n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    exec('from __future__ import annotations\n' + ast.get_source_segment(source, node), namespace)
    return namespace[name]


class Request:
    method = 'POST'
    can_read_body = True
    def __init__(self, path='/api/panel/me', body=None, headers=None):
        self.path = path
        self.body = body or {}
        self.headers = headers or {}
    async def json(self):
        return self.body


class Response:
    def __init__(self, body, status=200):
        self.body, self.status = body, status


class AuthorityTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.aiohttp = patch.dict(sys.modules, {'aiohttp': types.SimpleNamespace(web=types.SimpleNamespace(json_response=Response))})
        self.aiohttp.start()
        self.addCleanup(self.aiohttp.stop)

    async def test_raw_channel_legacy_session_and_missing_auth_deny_before_handler(self):
        handler = Mock()
        for body, headers in [({}, {}), ({'session_token': 'legacy'}, {}),
                              ({'auth_data': {'id': 100}}, {'X-Telegram-InitData': 'signed'})]:
            result = await access.middleware(Request(body=body, headers=headers), handler)
            self.assertEqual(403, result.status)
        handler.assert_not_called()

    async def test_valid_owner_exact_channel_and_context_cleanup(self):
        async def handler(request):
            self.assertEqual('user-a', access.current(100)['userId'])
            self.assertTrue(access.is_admin(100))
            self.assertFalse(access.is_admin(200))
            return Response({'ok': True})
        with patch.object(access, 'read_principal', return_value=principal()):
            response = await access.middleware(Request(headers={'Authorization': 'Bearer jwt'}), handler)
        self.assertEqual(200, response.status)
        self.assertIsNone(access.current())

    async def test_next_request_revalidates_revocation_and_never_caches_chat(self):
        async def handler(request):
            return Response({'ok': True})
        with patch.object(access, 'read_principal', side_effect=[principal(), ValueError('revoked')]) as read:
            request = Request(headers={'Authorization': 'Bearer jwt'})
            self.assertEqual(200, (await access.middleware(request, handler)).status)
            self.assertEqual(403, (await access.middleware(request, handler)).status)
            self.assertEqual(2, read.call_count)

    async def test_missing_identity_never_fabricates_legacy_chat_id(self):
        p = principal(); p.update(telegramId=None, authIdentityId=None)
        with patch.object(access, 'read_principal', return_value=p):
            self.assertEqual(403, (await access.middleware(Request(headers={'Authorization': 'Bearer jwt'}), Mock())).status)

    async def test_tenant_owner_cannot_enter_god(self):
        with patch.object(access, 'read_principal', return_value=principal()):
            result = await access.middleware(Request('/api/god/health', headers={'Authorization': 'Bearer jwt'}), Mock())
            self.assertEqual(403, result.status)

    async def test_unresolved_or_revoked_staff_projection_denies_before_legacy_handler(self):
        for path in ['/api/panel/master/overview', '/api/chat', '/api/chat/stream', '/api/chat/history']:
            handler = Mock()
            with patch.object(access, 'read_principal', return_value=principal(role='staff', staffId='staff-a', externalStaffId=None)):
                result = await access.middleware(Request(path, {'mode': 'staff'}, {'Authorization': 'Bearer jwt'}), handler)
                self.assertEqual(403, result.status)
                self.assertEqual('canonical_staff_projection_required', result.body['error'])
            handler.assert_not_called()

    async def test_live_canonical_staff_projection_preserves_exact_self_view(self):
        async def handler(request):
            role = access.panel_role(100)
            self.assertEqual('master', role['role'])
            self.assertEqual('777', role['staff_id'])
            self.assertEqual('staff-a', role['canonical_staff_id'])
            self.assertFalse(access.is_admin(100))
            self.assertEqual('777', access.master_projection(100)['yclients_staff_id'])
            return Response({'ok': True})
        with patch.object(access, 'read_principal', return_value=principal(role='staff', staffId='staff-a', externalStaffId='777')):
            result = await access.middleware(Request(headers={'Authorization': 'Bearer jwt'}), handler)
            self.assertEqual(200, result.status)

    async def test_platform_can_enter_god_without_fake_telegram_identity(self):
        p = principal(); p.update(role='platform_owner', platform=True, membershipId=None, telegramId=None, authIdentityId=None)
        async def handler(request):
            self.assertTrue(access.is_platform())
            self.assertIsNone(access.panel_user())
            return Response({'ok': True})
        with patch.object(access, 'read_principal', return_value=p):
            result = await access.middleware(Request('/api/god/health', headers={'Authorization': 'Bearer jwt'}), handler)
            self.assertEqual(200, result.status)

    async def test_exception_and_inherited_background_context_cannot_reuse_authority(self):
        release = asyncio.Event()
        tasks = []
        async def later():
            await release.wait()
            return access.is_admin(100)
        async def handler(request):
            tasks.append(asyncio.create_task(later()))
            raise RuntimeError('handler stopped')
        with patch.object(access, 'read_principal', return_value=principal()):
            with self.assertRaises(RuntimeError):
                await access.middleware(Request(headers={'Authorization': 'Bearer jwt'}), handler)
        release.set()
        self.assertEqual([False], await asyncio.gather(*tasks))
        self.assertIsNone(access.current())

    async def test_child_task_denied_while_parent_active_and_explicit_sync_adapter_is_single_use(self):
        async def child():
            return access.is_admin(100)
        async def handler(request):
            self.assertFalse(await asyncio.create_task(child()))
            self.assertFalse(await asyncio.to_thread(access.is_admin, 100))
            callback = access.synchronous_request_callback(lambda: access.is_admin(100))
            self.assertTrue(await asyncio.to_thread(callback))
            with self.assertRaises(ValueError):
                await asyncio.to_thread(callback)
            return Response({'ok': True})
        with patch.object(access, 'read_principal', return_value=principal()):
            self.assertEqual(200, (await access.middleware(Request(headers={'Authorization': 'Bearer jwt'}), handler)).status)

    async def test_all_inventoried_http_staff_families_require_admission(self):
        for path in ['/api/panel/team_chat/send', '/api/panel/team_chat/fetch', '/api/panel/team_chat/delete',
                     '/api/panel/team_chat/upload_auth', '/api/panel/journal', '/api/god/health',
                     '/api/chat', '/api/chat/stream', '/api/chat/history']:
            result = await access.middleware(Request(path, {'mode': 'staff'}), Mock())
            self.assertEqual(403, result.status, path)

    async def test_concurrent_requests_do_not_share_actor_and_body_token_is_canonical(self):
        both = asyncio.Event()
        entered = []
        async def handler(request):
            p = access.current()
            entered.append(p['userId'])
            if len(entered) == 2:
                both.set()
            await both.wait()
            self.assertEqual(request.body['maya_token'], access.current()['userId'])
            self.assertFalse(access.is_admin(300))
            return Response({'ok': True})
        with patch.object(access, 'read_principal', side_effect=lambda credential: principal(userId=credential)) as read:
            results = await asyncio.gather(*[
                access.middleware(Request(body={'maya_token': actor}), handler)
                for actor in ['user-a', 'user-b']])
        self.assertEqual([200, 200], [r.status for r in results])
        self.assertEqual(2, read.call_count)
        self.assertIsNone(access.current())

    def test_native_grant_tombstones_never_touch_database(self):
        database = Mock()
        for file, name in [('bot.py', '_bind_master_chat_direct'), ('database.py', 'add_admin'), ('database.py', 'unbind_master')]:
            fn = extracted(file, name, {'database': database})
            with self.assertRaisesRegex(RuntimeError, 'canonical_crm_staff_access_required'):
                fn(100, 200) if name == '_bind_master_chat_direct' else fn(100)
        self.assertEqual([], database.mock_calls)

    def test_phone_and_social_maps_cannot_promote_legacy_session(self):
        writes = []
        db = types.SimpleNamespace(create_web_session=lambda *args, **kwargs: writes.append(kwargs))
        fn = extracted('web_auth.py', '_issue_session', {
            'database': db, 'pii_crypto': types.SimpleNamespace(hash_phone=lambda _: 'synthetic-hash'),
            '_new_token': lambda: 'synthetic-session', 'SESSION_TTL_DAYS': 30,
            'config': types.SimpleNamespace(VK_STAFF_CHAT_MAP={200: 100}, YANDEX_STAFF_CHAT_MAP={'ya': 100})})
        result = fn(phone='synthetic-phone', vk_user_id=200, yandex_user_id='ya', name='')
        self.assertFalse(result['identity']['is_staff'])
        self.assertIsNone(writes[0]['chat_id'])
        self.assertEqual('client', writes[0]['subject_kind'])

    def test_conflicting_credentials_deny_and_raw_native_has_no_role(self):
        with self.assertRaises(ValueError):
            access.bearer({'Authorization': 'Bearer one'}, {'maya_token': 'two'})
        self.assertFalse(access.is_admin(100))
        self.assertEqual('client', access.ai_role(100))
        self.assertIsNone(access.master_projection(100))

    def test_guard_accepts_source_and_rejects_each_violation_class(self):
        self.assertEqual([], scan_staff_authority(ROOT))
        samples = {
            'bot.py': ['def reintroduced_grant():\n    database.add_admin(100)\n',
                       'def cmd_reintroduced():\n    return uid == ANTON_CHAT_ID\n',
                       'def reintroduced_role():\n    return database.is_admin(100)\n',
                       'def reintroduced_sql(conn):\n    conn.execute("UPDATE masters_telegram SET telegram_chat_id = 100")\n'],
            'web_auth.py': ['def cmd_map():\n    return VK_STAFF_CHAT_MAP\n'],
        }
        for file, snippets in samples.items():
            for snippet in snippets:
                source = (ROOT / file).read_text() + '\n' + snippet
                self.assertTrue(scan_staff_authority(ROOT, {file: source}), snippet)
        source = (ROOT / 'webhook_server.py').read_text().replace('middlewares=[canonical_staff_access.middleware]', 'middlewares=[]')
        self.assertTrue(scan_staff_authority(ROOT, {'webhook_server.py': source}))


if __name__ == '__main__':
    unittest.main()
