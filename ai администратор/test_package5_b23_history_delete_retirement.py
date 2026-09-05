"""Execute exact retired handler AST with poisoned dependencies and synthetic files."""
import ast
import asyncio
import json
from pathlib import Path
import tempfile
import sys
from types import SimpleNamespace
import unittest

from package5_control_plane_runtime_guard import scan_runtime

ROOT = Path(__file__).parent


class B23HistoryDeleteRetirementTest(unittest.TestCase):
    def test_all_identities_selectors_failures_retries_and_concurrency_are_inert(self):
        with tempfile.TemporaryDirectory(prefix='maya-b23-owned-') as directory:
            root = Path(directory)
            history = root / 'conversations.json'
            evidence = root / 'immutable-evidence.json'
            history.write_text(json.dumps({'pwa:client:synthetic': [
                {'content': 'synthetic private history', 'id': 'same'},
                {'content_enc': 'opaque-fixture', 'id': 'same'}], 'other-tenant': []}))
            evidence.write_text('{"syntheticAuditFact":"immutable"}')
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            calls = []

            def forbidden(*args, **kwargs):
                calls.append('forbidden')
                raise AssertionError('Unsupported delete accessed input/identity/history')

            class Request:
                app = property(lambda _: forbidden())
                headers = property(lambda _: forbidden())
                async def json(self):
                    return forbidden()

            env = {'web': SimpleNamespace(Request=object, Response=object),
                   '_cabinet_response': lambda data, status=200: (status, data),
                   '_resolve_chat_tg_user': forbidden, '_chat_history_key': forbidden,
                   '_chat_history_payload': forbidden, '_ensure_chat_history_ids': forbidden,
                   'load_conversations': forbidden, 'save_conversations': forbidden,
                   'database': SimpleNamespace(get_or_create_client=forbidden)}
            node = next(n for n in ast.parse((ROOT/'webhook_server.py').read_text()).body
                        if isinstance(n, ast.AsyncFunctionDef) and n.name == 'chat_delete_handler')
            exec(compile(ast.Module(body=[node], type_ignores=[]), 'webhook_server.py', 'exec'), env)

            async def exercise():
                requests = []
                for identity in ['missing', 'legacy-session', 'raw-chat-id', 'phone-only',
                                 'verified-client', 'revoked', 'wrong-tenant', 'ambiguous']:
                    for target in ['one', 'all', 'clear', 'reset', 'forged-client-history-id', None]:
                        req = Request()
                        req.synthetic_identity = identity
                        req.synthetic_target = target
                        requests.append(req)
                # The endpoint deliberately never reads these values: there is no existence oracle.
                return await asyncio.gather(*(env['chat_delete_handler'](r) for _ in range(3) for r in requests))

            responses = asyncio.run(exercise())
            self.assertEqual(len(responses), 144)
            self.assertTrue(all(r == (410, {'ok': False, 'error': 'FEATURE_NOT_AVAILABLE'}) for r in responses))
            self.assertEqual(calls, [])
            self.assertEqual({p.name: p.read_bytes() for p in root.iterdir()}, before)

    def test_ratchet_rejects_identity_write_disclosure_and_route_bypass(self):
        source = (ROOT/'webhook_server.py').read_text()
        self.assertEqual(scan_runtime(ROOT), [])
        marker = '    # p5_b23_server_history_delete_retired:'
        for code in ['await request.json()', '_resolve_chat_tg_user(request, {})',
                     'load_conversations()', 'save_conversations({})',
                     'return _cabinet_response({"messages": []}, status=410)',
                     'return _cabinet_response({"phone": "synthetic"}, status=410)',
                     'client_command("delete-history")']:
            with self.subTest(code=code):
                changed = source.replace(marker, '    '+code+'\n'+marker)
                self.assertTrue(scan_runtime(ROOT, {'webhook_server.py': changed}))
        changed = source.replace('add_post("/api/chat/delete", chat_delete_handler)',
                                 'add_post("/api/chat/delete", chat_handler)')
        self.assertTrue(scan_runtime(ROOT, {'webhook_server.py': changed}))

    def test_surface_ratchets_reject_proxy_disclosure_and_optimistic_pwa_deletion(self):
        sys.path.insert(0, str(ROOT.parent/'tools/package5'))
        from b23_surface_alignment import PROXY_CASE, verify_proxy, verify_pwa
        verify_proxy(PROXY_CASE)
        for extra in ['curl_init("/api/chat/delete");', '$payload = $input;',
                      'echo json_encode(["messages" => []]);']:
            with self.assertRaises(ValueError):
                verify_proxy(PROXY_CASE.replace('        break;', extra+'\n        break;'))
        for path in ['maya-os-site/index.html', 'сайт и приложение/app.html']:
            source = (ROOT.parent/path).read_text()
            verify_pwa(source)
            for changed in [source + "fetch('?action=chat_delete')",
                            source.replace('if (!canHideLocalChatMessage(m))', 'if (false)'),
                            source.replace('const canClearChat = !!window.__ME_SAAS_CTX &&', 'const canClearChat ='),
                            source.replace('  async function clearMayaChat() {', '  async function clearMayaChat() {\nsetMsgs([]);')]:
                with self.assertRaises(ValueError):
                    verify_pwa(changed)


if __name__ == '__main__':
    unittest.main()
