"""Read-only Stage 1 source assessment; no application imports, DB or network.

Executes only existing pure identity/history helpers with synthetic text.
It does not implement the proposed confirmation protocol or schema.
"""
import ast
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import sys
import types
import uuid

root = Path(sys.argv[1]).resolve()
python_root = root / 'ai администратор'
webhook = (python_root / 'webhook_server.py').read_text()
context_source = (python_root / 'legacy_client_habits_bridge.py').read_text()
helpers = ['_new_chat_message_id', '_is_chat_message_id', '_user_history_item',
           '_ensure_chat_history_ids', '_with_chat_turn_ids']
tree = ast.parse(webhook)
nodes = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
scope = {'uuid': uuid, '_CHAT_MESSAGE_ID_RE': re.compile(r'^msg_[0-9a-f]{32}$'),
         '_plain_maya_text': lambda text: text}
exec(compile(ast.Module(body=[nodes[name] for name in helpers], type_ignores=[]),
             'existing-pure-chat-helpers', 'exec'), scope)
first = scope['_user_history_item']('Подтверждаю запись')
retry = scope['_user_history_item']('Подтверждаю запись')
assert first['id'] != retry['id']
retained, changed = scope['_ensure_chat_history_ids']([first])
assert not changed and retained[0]['id'] == first['id']
assert set(first) == {'id', 'role', 'content'}

context_tree = ast.parse(context_source)
selected = [n for n in context_tree.body
            if isinstance(n, (ast.ClassDef, ast.FunctionDef)) and
            n.name in ['ClientCommandContext', 'request_context']]
transport = types.ModuleType('legacy_client_command_bridge')
transport.channel_proof = lambda _headers, _body: 'synthetic-proof'
sys.modules[transport.__name__] = transport
context_scope = {'dataclass': dataclass, 'hashlib': hashlib}
exec(compile(ast.Module(body=selected, type_ignores=[]), 'existing-context', 'exec'), context_scope)
same = [context_scope['request_context']({}, {}, 'Подтверждаю запись', 'client') for _ in range(2)]
assert same[0].intent == same[1].intent
assert set(same[0].__dict__) == {'proof', 'intent'}

schema = (root / 'maya-saas-backend/prisma/schema.prisma').read_text()
def model(name):
    return re.search(r'^model ' + name + r' \{\n(.*?)^\}', schema, re.M | re.S).group(1)
assert re.search(r'^\s+actionExecutionId\s+String\s*$', model('ActionExecutionIdempotencyBinding'), re.M)
assert re.search(r'^\s+actorUserId\s+String\s*$', model('AiBrainSession'), re.M)
assert 'confirmationReceiptJson' in model('AiOnboardingDraft')
ai_source = (python_root / 'claude_ai.py').read_text()
ai_tree = ast.parse(ai_source)
preflight = next(n for n in ai_tree.body if isinstance(n, ast.FunctionDef) and n.name == '_booking_confirmation_tool_use')
assert any(isinstance(n, ast.keyword) and n.arg == 'id' and
           isinstance(n.value, ast.Constant) and n.value.value == 'server_confirmed_booking'
           for n in ast.walk(preflight))

paths = ['ai администратор/webhook_server.py', 'ai администратор/legacy_client_habits_bridge.py',
         'ai администратор/legacy_client_command_bridge.py', 'ai администратор/claude_ai.py',
         'ai администратор/memory.py', 'сайт и приложение/app.html',
         'maya-saas-backend/prisma/schema.prisma',
         'maya-saas-backend/src/onboarding/ai-confirmation-receipt.service.ts',
         'maya-saas-backend/src/ai-tools/dto/ai-core-chat.dto.ts',
         'maya-saas-backend/src/ai-tools/ai-core.service.ts']
print(json.dumps({
    'assessment': 'B33 EXISTING DURABLE CONFIRMATION FOUNDATION SUFFICIENT: NO',
    'existingHistoryIdRetainedWhenRereadingStoredItem': True,
    'reprocessingSameUserTextAllocatesDifferentHistoryIds': True,
    'historyItemHasTenantClientConfirmationBinding': False,
    'requestContextFields': ['proof', 'intent'],
    'sameWordsAcrossDistinctEventsHaveSameContextIntent': True,
    'confirmationPreflightToolId': 'constant server_confirmed_booking; not an event identifier',
    'b31BindingRequiresExistingActionExecution': True,
    'aiBrainSessionRequiresActorUserId': True,
    'onboardingReceiptStorageExistsButIsDifferentContract': True,
    'sourceHashes': {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths},
    'webhookSourceAnchors': {name: nodes[name].lineno for name in helpers +
                           ['chat_handler', 'chat_stream_handler', '_finalize_booking_for_chat']},
    'applicationModulesImported': 0, 'databasesAccessed': 0, 'networkCalls': 0,
    'runtimeChanges': 0, 'schemaChanges': 0, 'productionMutations': 0,
}, indent=2))
