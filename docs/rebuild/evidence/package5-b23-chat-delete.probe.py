"""Run exact deployed B23 handler/helpers on synthetic history; never call production.

Usage: python3 package5-b23-chat-delete.probe.py WEBHOOK_SOURCE MEMORY_SOURCE
The source hashes must match the accompanying B22 final recheck evidence.
"""
import ast
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import types
import uuid

webhook = Path(sys.argv[1])
memory_source = Path(sys.argv[2])
source = webhook.read_text()
lines = source.splitlines(keepends=True)
names = {'chat_delete_handler', '_resolve_chat_tg_user', '_chat_request_mode',
         '_chat_effective_mode', '_chat_history_key', '_ensure_chat_history_ids',
         '_is_chat_message_id', '_new_chat_message_id', '_history_text', '_chat_history_payload'}
nodes = [n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
assert {n.name for n in nodes} == names
handler = next(n for n in nodes if n.name == 'chat_delete_handler')
handler_source = ''.join(lines[handler.lineno-1:handler.end_lineno])
assert 'client_commands' not in handler_source and 'ClientChannelLink' not in handler_source
assert hashlib.sha256(webhook.read_bytes()).hexdigest() == '6f31a5a3ca387f2e98c4e60a2b1e550d181fb8afb8ba19316ec3d922755d6bb7'

with tempfile.TemporaryDirectory(prefix='maya-b23-isolated-') as directory:
    file = Path(directory)/'synthetic-history.json'
    memory_env = {'json': json, 'os': os, 'CONVERSATIONS_FILE': str(file)}
    memory_nodes = [n for n in ast.parse(memory_source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name in ('load_conversations','save_conversations')]
    exec(compile(ast.Module(body=memory_nodes,type_ignores=[]),'deployed-memory-ast','exec'), memory_env)
    memory = types.ModuleType('memory')
    memory.load_conversations = memory_env['load_conversations']
    writes = []
    def save(data):
        writes.append(1)
        memory_env['save_conversations'](data)
    memory.save_conversations = save
    sys.modules['memory'] = memory
    # Authentication/session adapters are synthetic; no canonical Client/link exists.
    env = {'web': types.SimpleNamespace(Request=object,Response=object), 're':re, 'uuid':uuid,
           'TELEGRAM_TOKEN':'unused-synthetic', '_verify_telegram_init_data':lambda *_:None,
           '_verify_telegram_login_widget':lambda *_:None,
           'web_auth':types.SimpleNamespace(resolve_session=lambda token: {'telegram_id':101} if token=='synthetic-legacy-session' else None),
           'session_tg_user':lambda session: {'id':session['telegram_id']} if session else None,
           '_cabinet_response':lambda data,status=200:(status,data),
           '_CHAT_MESSAGE_ID_RE':re.compile(r'msg_[0-9a-f]{32}'),
           '_plain_maya_text':lambda value:value, 'normalize_chat_widget':lambda _:None}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'deployed-webhook-ast','exec'),env)
    class Request:
        headers = {}
        def __init__(self, mode):self.mode=mode
        async def json(self):return {'session_token':'synthetic-legacy-session','delete_mode':self.mode,'message_id':'msg_'+'b'*32,'mode':'client'}
    initial={'pwa:client:101':[{'id':'msg_'+'a'*32,'role':'user','content':'SYNTHETIC_PRIVATE_HISTORY'}]}
    file.write_text(json.dumps(initial))
    original=file.read_bytes()
    code, response=asyncio.run(env['chat_delete_handler'](Request('one')))
    assert code==200 and response['deleted'] is False
    assert response['messages'][0]['text']=='SYNTHETIC_PRIVATE_HISTORY'
    assert len(writes)==1
    no_match={'status':code,'deleted':response['deleted'],'privateMessagesReturned':len(response['messages']),'durableSaveCalls':len(writes)}
    file.write_text(json.dumps(initial));writes.clear()
    code,response=asyncio.run(env['chat_delete_handler'](Request('all')))
    assert code==200 and response['deleted']=='all' and json.loads(file.read_text())=={}
    assert file.read_bytes()!=original and len(writes)==1
    result={'blocker':'B23','route':'POST /api/chat/delete',
            'handlerLines':[handler.lineno,handler.end_lineno],
            'handlerSha256':hashlib.sha256(handler_source.encode()).hexdigest(),
            'activeWebhookSha256':hashlib.sha256(webhook.read_bytes()).hexdigest(),
            'memorySourceSha256':hashlib.sha256(memory_source.read_bytes()).hexdigest(),
            'verifiedClientBindingPresent':False,'syntheticLegacySessionAccepted':True,
            'noMatch':no_match,'clearAll':{'status':code,'legacyHistoryErased':True,'durableSaveCalls':len(writes)},
            'productionMutations':0,'productionEndpointInvoked':False,'providerCalls':0,
            'limitation':'Exact deployed handler/resolver/mode/key/serialization AST; synthetic session adapters and one owned temporary history file. Text formatting is identity, all message content synthetic.'}
print(json.dumps(result,indent=2))
