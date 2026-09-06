"""Local-only Final Gate probe: real chat handler/context/finalizer, synthetic LLM.

Input contains synthetic signed widget credentials from the owned backend fixture.
No application database or live transport is used. Output contains no credentials.
"""
import asyncio
import ast
import hashlib
import json
import logging
from pathlib import Path
import socket
import sys
import types

root = Path(sys.argv[1])
sys.path.insert(0, str(root / 'ai администратор'))
params = json.load(sys.stdin)
socket.socket.connect = lambda *_a, **_k: (_ for _ in ()).throw(AssertionError('Live network forbidden'))
from test_chat_routing import _load_webhook_server

ws = _load_webhook_server()
ws.TELEGRAM_TOKEN = params['token']
errors = []
ws.logger.error = lambda *args, **kwargs: errors.append(str(args))
ws._cabinet_response = lambda data, status=200: {'data': data, 'status': status}
sys.modules['anonymizer'].redact_pii = lambda text: text
bridge = sys.modules['legacy_client_command_bridge']
# Execute the real pure channel transport serializer; delivery is captured below.
transport_source = (root / 'ai администратор/legacy_client_command_bridge.py').read_text()
serializer = next(n for n in ast.parse(transport_source).body if isinstance(n, ast.FunctionDef) and n.name == 'channel_proof')
exec(compile(ast.Module(body=[serializer], type_ignores=[]), 'actual-channel-proof', 'exec'), bridge.__dict__)
bridge.json = json

calls = []
acceptances = []
order = []
def command(operation, proof, payload):
    if operation == 'status':
        return {'linked': True, 'privacy': True, 'marketing_decided': True}
    if operation == 'booking-confirmation':
        acceptances.append(payload)
        order.append('receipt')
        return {'confirmationId': payload['id']}
    assert operation == 'chat-appointment-create'
    assert json.loads(json.loads(proof)['credential']) == params['widget']
    calls.append(payload)
    return {'execution': {'state': 'SUCCEEDED', 'executionId': 'transport-placeholder'}}
bridge.command = command

model = types.ModuleType('claude_ai')
model.OPENAI_PWA_CHAT_MODEL = 'synthetic-model'
model.VOICE_CLAUDE_MODEL = 'synthetic-model'
contexts = []
variants = iter([params['start'], params['start'], params['changedStart']] * 2)
def get_ai_response(_history, **kwargs):
    context = kwargs['_client_command_context']
    assert context is not None
    assert order[-1] == 'receipt'
    order.append('model')
    contexts.append(context.confirmation_id)
    assert _history[0]['content'] == params['confirmation']['sourceContext']
    return '', {'staff_id': params['staffId'], 'service_ids': params['serviceIds'],
                'datetime_str': next(variants), 'staff_name': 'Synthetic staff',
                'service_names': ['Synthetic service']}, None
model.get_ai_response = get_ai_response
def stream(history, **kwargs):
    reply, contact, gift = get_ai_response(history, **kwargs)
    yield {'type': 'meta', 'text': reply, 'contact_request': contact, 'gift_cert_action': gift}
model.get_ai_response_stream = stream
voice = types.ModuleType('voice')
voice.is_enabled = lambda: False
sys.modules['voice'] = voice
class StreamResponse:
    def __init__(self, **kwargs): self.events = []
    def enable_chunked_encoding(self): pass
    async def prepare(self, request): pass
    async def write(self, value): self.events.append(json.loads(value.decode().removeprefix('data: ').strip()))
    async def write_eof(self): pass
ws.web.StreamResponse = StreamResponse
sys.modules['claude_ai'] = model
requests = types.ModuleType('requests')
requests.post = lambda *_a, **_k: (_ for _ in ()).throw(AssertionError('Unexpected transport'))
sys.modules['requests'] = requests

statement = params['confirmation']['sourceStatement']
class Request:
    headers = {}
    async def json(self):
        return {'message': statement, 'mode': 'client', 'auth_data': params['widget'], 'booking_confirmation': params['confirmation']}

async def main():
    responses = []
    for _ in range(3):
        response = await ws.chat_handler(Request())
        assert response['status'] == 200, response
        responses.append(response)
    for _ in range(3):
        streamed = await ws.chat_stream_handler(Request())
        assert isinstance(streamed, StreamResponse), streamed
        assert any(e.get('type') == 'done' for e in streamed.events), streamed.events
    assert len(calls) == 6 and len(contexts) == 6, (len(calls), len(contexts), errors, responses)
    assert len(set(contexts)) == 1
    assert calls[0] == calls[1]
    assert calls[0]['confirmationId'] == calls[2]['confirmationId']
    assert acceptances == [params['confirmation']] * 6
    assert order == ['receipt', 'model'] * 6
    assert calls[0]['start'] != calls[2]['start']
    print(json.dumps({'actualChatHandler': True, 'actualStreamHandler': True, 'actualRequestContext': True,
        'actualFinalizer': True, 'actualPythonWidgetVerifier': True,
        'sameUserStatementAndContext': True, 'sameModelResultSameKey': True,
        'changedModelResultKeepsConfirmation': True, 'receiptBeforeModel': True, 'sourceContextReplayed': True, 'payloads': calls,
        'stubs': ['LLM response', 'history memory', 'consent read (backend rechecked)',
                  'bridge HTTP transport/result projection', 'aiohttp response'],
        'productionMutations': 0}, indent=2))

logging.disable(logging.CRITICAL)
asyncio.run(main())
