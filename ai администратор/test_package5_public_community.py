import ast
import hashlib
import hmac
import importlib.util
import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import canonical_public_community as bridge
import package5_public_community_runtime_guard as guard


class CommunityProof(unittest.TestCase):
    def test_complete_known_runtime_and_mutant_ratchet(self):
        root = Path(os.environ.get('MAYA_RC_PYTHON_CANDIDATE', Path(__file__).parent))
        self.assertEqual(guard.scan(root), [])
        for name, bad in [('site_engagement.py', "def extra():\n return db.execute('UPDATE site_event_comments SET status=1')\n"), ('site_community.py', 'async def process_comment(*args):\n await delegated_publish()\n')]:
            source = (root/name).read_text() + '\n' + bad
            self.assertTrue(guard.scan(root, {name:source}))

    def test_signed_source_is_separate_from_identity_authority(self):
        with patch.dict(os.environ, {'PUBLIC_COMMUNITY_GATEWAY_ID':'fixture', 'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN':'synthetic-local-community-secret'}), patch.object(bridge.time, 'time', return_value=1800000000):
            raw, headers = bridge.signed_source('comment', 'known', 'a'*64, {'text':'Текст', 'author':'Гость'}, 'stable-local-identity')
            body = json.loads(raw)
            self.assertEqual(set(body), {'sourceGatewayId','operation','publicationKey','publicationPublished','visitorSubjectHash','command','requestKey'})
            expected = hmac.new(b'synthetic-local-community-secret', ('maya.community-source/1:1800000000:'+raw).encode(), hashlib.sha256).hexdigest()
            self.assertEqual(headers['X-Community-Signature'], expected)
            self.assertNotIn('tenantId', body); self.assertNotIn('user_id', body)
            with self.assertRaises(bridge.CommunityReceiptError): bridge.signed_source('moderate', 'known', 'a'*64, {}, 'stable-local-identity')

    def test_retired_model_and_next_reply_paths_do_nothing(self):
        import asyncio
        tree = ast.parse((Path(__file__).parent/'site_community.py').read_text())
        nodes = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name in {'process_comment', 'notify_owner'}]
        namespace = {}; exec(compile(ast.Module(body=nodes,type_ignores=[]), 'retired-native-source', 'exec'), namespace)
        self.assertIsNone(asyncio.run(namespace['process_comment'](object(), 7, 'slug', 'text')))
        self.assertFalse(asyncio.run(namespace['notify_owner'](object(), 7)))

    def test_status_handler_has_no_mutation_or_startup_registration(self):
        module = guard.overlay(); tree = ast.parse('def register():\n'+''.join('    '+line+'\n' for line in module.REGISTER.splitlines()))
        text = ast.unparse(tree)
        for forbidden in ['create_task', 'on_startup', 'init_schema', 'is_admin', 'authenticate(', 'process_comment(', 'notify_owner(', 'events.record_view(']:
            self.assertNotIn(forbidden, text)
        self.assertIn('canonical.request(action, slug, visitor, command, key)', text)
        self.assertIn("action == 'status'", text)

    def test_signed_gateway_operation_cannot_be_replayed_as_another_route(self):
        import asyncio, logging, re, time
        from unittest.mock import AsyncMock
        tree = ast.parse((Path(__file__).parent/'site_community.py').read_text())
        names = {'CommunityError','digest','verify_gateway','form_token','response','register_routes'}
        nodes = [n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)) and n.name in names]
        bridge_request = AsyncMock(return_value={'contract':'maya.public-community/1','sourceScope':'a'*64,'stats':{},'comments':[]})
        namespace = {'hashlib':hashlib,'hmac':hmac,'json':json,'time':time,'re':re,'ID':re.compile('^[a-f0-9]{64}$'),'asyncio':asyncio,'logger':logging.getLogger('fixture'),'events':types.SimpleNamespace(normalize_slug=lambda value:'known' if value=='known' else None),'publications':types.SimpleNamespace(),'web':types.SimpleNamespace(json_response=lambda payload,status=200,headers=None:{'payload':payload,'status':status})}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'R09 extracted actual source initiator','exec'),namespace)
        installed={};router=types.SimpleNamespace(add_post=lambda path,handler:installed.update(handler=handler),routes=lambda:[types.SimpleNamespace(resource=types.SimpleNamespace(canonical='/api/site/posts'))]);app=types.SimpleNamespace(router=router)
        secret='synthetic-gateway-route-proof'
        modules={'config':types.SimpleNamespace(TELEGRAM_TOKEN=secret),'site_guest_chat':types.SimpleNamespace(GuestError=type('GuestError',(Exception,),{}),guest_chat=object()),'canonical_public_community':types.SimpleNamespace(request=bridge_request,CommunityReceiptError=bridge.CommunityReceiptError)}
        with patch.dict(sys.modules,modules): namespace['register_routes'](app,lambda *_:self.fail('Legacy moderator authentication invoked'))
        body={'gateway_action':'status','slug':'known','visitor':'a'*64,'network':'b'*64,'user_id':123456}
        raw=json.dumps(body);stamp=str(int(time.time()));signature=hmac.new(secret.encode(),('site-gateway-v1:'+stamp+':'+raw).encode(),hashlib.sha256).hexdigest()
        class Request:
            headers={'X-Site-Time':stamp,'X-Site-Signature':signature}
            def __init__(self,action):self.match_info={'action':action}
            async def text(self):return raw
        accepted=asyncio.run(installed['handler'](Request('status')));self.assertEqual(accepted['status'],200);self.assertEqual(bridge_request.await_count,1)
        rejected=asyncio.run(installed['handler'](Request('view')));self.assertEqual(rejected['status'],403);self.assertEqual(bridge_request.await_count,1)


if __name__ == '__main__': unittest.main()
