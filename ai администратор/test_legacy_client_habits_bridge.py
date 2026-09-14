import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch
import legacy_client_habits_bridge as bridge
import legacy_client_command_bridge as channels
from test_legacy_client_command_bridge import Request, functions_from_source

class HabitsTests(unittest.TestCase):
    def context(self):
        return bridge.request_context({'X-Telegram-InitData':'signed'}, {}, 'explicit preference', 'client')
    def test_no_phone_or_model_identity_can_make_context(self):
        for body in [{'session_token':'legacy','clientId':'fake'}, {'phone':'synthetic'}]:
            self.assertIsNone(bridge.request_context({},body,'hello','client'))
        with patch.object(bridge,'command') as call:
            self.assertFalse(bridge.remember_preference('Quiet')['saved']);self.assertEqual(bridge.read_preferences(),'');call.assert_not_called()
    def test_retry_identity_exact_text_and_overflow(self):
        @bridge.authenticated_call
        def ask():return bridge.remember_preference('😀'*201)
        with patch.object(bridge,'command',side_effect=[{'expectedGeneration':9},ValueError('CLIENT_PREFERENCES_LIMIT_EXCEEDED')]*2) as call:
            for _ in range(2):
                result=ask(_client_command_context=self.context());self.assertEqual(result['error'],'CLIENT_PREFERENCES_LIMIT_EXCEEDED');self.assertFalse(result['saved'])
        self.assertEqual(call.call_count,4);self.assertEqual(call.call_args_list[1],call.call_args_list[3]);self.assertEqual(call.call_args.args[2]['preference'],'😀'*201);self.assertIsNone(bridge._current.get())
    def test_thread_context_and_stream_cleanup(self):
        @bridge.authenticated_call
        def identify():return bridge._current.get().proof
        values=[bridge.ClientCommandContext('proof-'+str(i),'intent') for i in range(12)]
        with ThreadPoolExecutor(max_workers=4) as pool:self.assertEqual(list(pool.map(lambda c:identify(_client_command_context=c),values)),[x.proof for x in values])
        @bridge.authenticated_stream
        def stream():
            yield bridge._current.get().intent
            raise RuntimeError('synthetic')
        it=stream(_client_command_context=self.context());self.assertEqual(next(it),self.context().intent)
        with self.assertRaises(RuntimeError):next(it)
        self.assertIsNone(bridge._current.get())
    def test_actual_ai_tool_no_truncation_or_model_authority(self):
        scope=functions_from_source('claude_ai.py',{'_execute_tool'},{'json':json,'database':Mock(),'_resolve_role':lambda _:'client','_tool_risk':lambda _:'local','_authorize':lambda *_:True,'_FOUNDER_MEMORY_TOOLS':set(),'_HITL_TOOLS':set()})
        with patch.dict('sys.modules',{'anonymizer':SimpleNamespace(redact_pii=lambda v:v)}):
            with patch.object(bridge,'remember_preference',return_value={'saved':True}) as call:
                scope['_execute_tool']('remember_client_preference',{'preference':'😀'*201},123,mode='client');call.assert_called_once_with('😀'*201);self.assertNotIn('😀',str(scope['logger'].mock_calls))
            with patch.object(bridge,'remember_preference') as call:
                result=json.loads(scope['_execute_tool']('remember_client_preference',{'preference':'hello','clientId':'forged'},123,mode='client'));self.assertFalse(result['saved']);call.assert_not_called()
    def test_closed_sql_and_phone_readers(self):
        scope=functions_from_source('database.py',{'add_client_preference','get_client_preferences','get_client_preferences_by_phone'})
        with self.assertRaises(RuntimeError):scope['add_client_preference'](123,'habit')
        self.assertEqual(scope['get_client_preferences_by_phone']('phone'),'')
        with patch.object(bridge,'read_preferences',return_value='canonical'):self.assertEqual(scope['get_client_preferences'](123),'canonical')

class PhoneLinkTests(unittest.TestCase):
    def setUp(self):
        self.auth=SimpleNamespace(verify_phone_evidence=AsyncMock(return_value={'ok':True}))
        self.scope=functions_from_source('webhook_server.py',{'cabinet_link_phone_handler'},{'web_auth':self.auth,'database':Mock()})
    def call(self,body=None,headers=None):
        return asyncio.run(self.scope['cabinet_link_phone_handler'](Request(body or {'phone':'synthetic','code':'1234'},headers if headers is not None else {'Authorization':'Bearer synthetic'})))
    def test_sms_only_legacy_and_forged_identity_rejected(self):
        with patch.object(bridge,'command') as call:
            self.assertEqual(self.call({'phone':'synthetic','code':'1234','session_token':'legacy'}, {})['status'],403)
            self.assertEqual(self.call({'phone':'synthetic','code':'1234','clientId':'forged'})['status'],403)
            call.assert_not_called();self.auth.verify_phone_evidence.assert_not_called()
    def test_missing_ambiguous_binding_rejected_after_sms(self):
        for reason in ['missing','ambiguous']:
            with patch.object(bridge,'command',side_effect=ValueError(reason)):self.assertEqual(self.call()['status'],403)
        self.assertEqual(self.scope['database'].mock_calls,[])
    def test_existing_binding_has_no_contact_or_client_write(self):
        with patch.object(bridge,'command',return_value={'verified':True}) as call:
            result=self.call();self.assertEqual(result['status'],200);self.assertFalse(result['body']['phone_saved']);self.assertEqual(call.call_args.args[0],'binding');self.assertEqual(call.call_args.args[2],{})
        self.assertEqual(self.scope['database'].mock_calls,[])
    def test_consumes_exact_challenge_then_checks_binding(self):
        with patch.object(channels,'command',return_value={'linked':True}) as consume, patch.object(bridge,'command',return_value={'verified':True}):
            self.assertEqual(self.call({'phone':'synthetic','code':'1234','linking_token':'opaque'})['status'],200);self.assertEqual(consume.call_args.args[0],'consume');self.assertEqual(consume.call_args.args[2],{'token':'opaque'})
    def test_sms_verifier_has_no_session_side_effect(self):
        http=SimpleNamespace(AsyncClient=Mock());response=SimpleNamespace(status_code=200,json=lambda:{'success':True,'data':{'name':'never used'}})
        http.AsyncClient.return_value.__aenter__=AsyncMock(return_value=SimpleNamespace(post=AsyncMock(return_value=response)));http.AsyncClient.return_value.__aexit__=AsyncMock(return_value=False)
        issue=Mock(side_effect=AssertionError('no session'))
        scope=functions_from_source('web_auth.py',{'verify_phone_evidence'},{'httpx':http,'normalize_phone':lambda _:'synthetic','_yc_headers':lambda:{},'_YC_BASE':'https://synthetic.invalid','_issue_session':issue})
        self.assertEqual(asyncio.run(scope['verify_phone_evidence']('synthetic','1234')),{'ok':True,'phone_evidence_only':True});issue.assert_not_called()

if __name__=='__main__':unittest.main()
