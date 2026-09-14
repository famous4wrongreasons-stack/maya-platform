"""B35 local composition: real signed handler/SQLite readers; synthetic eligibility and Telegram.

Usage: python3 probe.py /tmp/maya-b29-contour [child fixture-path]
No HTTP server or real provider is invoked. No production data is loaded.
"""
import ast, asyncio, contextlib, datetime, hashlib, hmac, json, socket
import sqlite3, subprocess, sys, tempfile, time, types
from pathlib import Path

root = Path(sys.argv[1]); source_root = root / 'ai администратор'
sys.path.insert(0, str(source_root))
socket.socket.connect = lambda *_a, **_k: (_ for _ in ()).throw(AssertionError('Live network forbidden'))
from test_chat_routing import _load_webhook_server
ws = _load_webhook_server()
owner = 900000001; recipient = 900000002; token = 'b35-synthetic-widget-secret'
sys.modules['config'].FOUNDER_IDS = [owner]
ws.TELEGRAM_TOKEN = token
ws.database.is_admin = lambda _id: False
ws._cabinet_response = lambda data, status=200: {'data': data, 'status': status}
ws._panel_bg_tasks = set()
hashes = {}

def load(filename, names, env):
    source = (source_root / filename).read_text(); tree = ast.parse(source)
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert len(nodes) == len(names)
    hashes[filename] = {n.name: {'line': n.lineno, 'sha256': hashlib.sha256(ast.get_source_segment(source, n).encode()).hexdigest()} for n in nodes}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), filename, 'exec'), env)

load('webhook_server.py', ['_panel_auth', '_panel_resolve_role', '_verify_telegram_login_widget',
    '_panel_broadcast_recipients', 'panel_broadcast_handler', 'broadcast_send_to_base',
    '_send_client_push'], ws.__dict__)
ws._push_preview_body = lambda text: text
ws.database.__dict__.update(contextmanager=contextlib.contextmanager, sqlite3=sqlite3,
    datetime=datetime.datetime, timedelta=datetime.timedelta,
    pii_crypto=types.SimpleNamespace(decrypt=lambda value: value), _json_np=json)
load('database.py', ['_db', '_now', '_client_row_to_dict', 'list_telegram_clients',
    '_canonical_delivery_consent_for_client', 'has_marketing_consent',
    '_preference_delivery_subject', 'get_notify_prefs', 'has_saved_notify_prefs',
    '_marketing_last_ensure', 'set_marketing_last_sent', 'marketing_sent_within'], ws.database.__dict__)
bridge = sys.modules['legacy_client_command_bridge']
bridge.requests = types.SimpleNamespace(RequestException=RuntimeError)
load('legacy_client_command_bridge.py', ['delivery_consent'], bridge.__dict__)
pref = types.ModuleType('legacy_client_preferences_bridge')
pref.requests = types.SimpleNamespace(RequestException=RuntimeError)
sys.modules['legacy_client_preferences_bridge'] = pref
load('legacy_client_preferences_bridge.py', ['delivery_read', 'delivery_preferences'], pref.__dict__)
eligibility = {'linked': True}; reads = []

def command(operation, proof, payload):
    assert proof == '' and payload == {'telegramSubject': str(recipient)}
    assert operation in {'delivery-consent', 'delivery-read'}
    reads.append(operation)
    if not eligibility['linked']:
        return {'linked': False, 'marketing': False}
    if operation == 'delivery-consent':
        return {'linked': True, 'privacy': True, 'marketing': True, 'marketing_decided': True}
    return {'linked': True, 'prefs': {'marketing': True}, 'quietNow': False}

bridge.command = command; pref.command = command
# These are explicit synthetic responses at the canonical eligibility service
# boundary. This proof does not replace/claim to test its Client/link resolver.

class Bot:
    def __init__(self, dbpath, lose_response=False):
        self.dbpath = dbpath; self.lose_response = lose_response
    async def send_message(self, chat_id, text, **kwargs):
        assert chat_id == recipient
        with contextlib.closing(sqlite3.connect(self.dbpath)) as db:
            db.execute('INSERT INTO provider_operations(recipient,text) VALUES (?,?)', (chat_id, text)); db.commit()
        if self.lose_response:
            self.lose_response = False
            raise TimeoutError('synthetic provider committed; response lost')
        return types.SimpleNamespace(message_id=1)

class Request:
    headers = {}
    def __init__(self, body, bot):
        self.body = body; self.app = {'bot_app': types.SimpleNamespace(bot=bot)}
    async def json(self):
        return self.body

def auth(subject):
    fields = {'id': subject, 'auth_date': int(time.time()), 'first_name': 'Synthetic'}
    material = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
    fields['hash'] = hmac.new(hashlib.sha256(token.encode()).digest(), material.encode(), hashlib.sha256).hexdigest()
    return fields

def count(path):
    with contextlib.closing(sqlite3.connect(path)) as db:
        return db.execute('SELECT COUNT(*) FROM provider_operations').fetchone()[0]

async def submit(path, credentials=None, lost=False):
    return await ws.panel_broadcast_handler(Request({'auth_data': auth(owner) if credentials is None else credentials,
        'mode': 'send', 'text': 'Synthetic campaign'}, Bot(path, lost)))

async def child(path):
    ws.database.DB_PATH = str(path)
    result = await submit(path)
    assert result['status'] == 200 and result['data']['summary']['sent'] == 1
    assert not ws._panel_bg_tasks
    print(json.dumps({'status': result['status'], 'providerOperations': count(path)}))

async def run():
    with tempfile.TemporaryDirectory(prefix='maya-b35-broadcast-') as directory:
        path = Path(directory) / 'owned.sqlite'; ws.database.DB_PATH = str(path)
        with contextlib.closing(sqlite3.connect(path)) as db:
            db.executescript('CREATE TABLE clients(id INTEGER PRIMARY KEY, telegram_chat_id INTEGER, name_enc TEXT, phone_enc TEXT);'
                             'CREATE TABLE provider_operations(id INTEGER PRIMARY KEY, recipient INTEGER, text TEXT);')
            db.execute('INSERT INTO clients VALUES (1,?,?,?)', (recipient, 'Synthetic', 'synthetic-phone')); db.commit()
        unauth = await submit(path, {}); nonowner = await submit(path, auth(owner + 99))
        assert unauth['status'] == 401 and nonowner['status'] == 403 and count(path) == 0
        eligibility['linked'] = False
        denied = await submit(path); assert not denied['data']['ok'] and count(path) == 0
        eligibility['linked'] = True
        first = await submit(path); assert first['data']['summary']['sent'] == 1 and count(path) == 1
        repeat = await submit(path); assert repeat['data']['summary']['sent'] == 1 and count(path) == 2
        concurrent = await asyncio.gather(*[submit(path) for _ in range(4)])
        assert all(x['data']['summary']['sent'] == 1 for x in concurrent) and count(path) == 6
        lost = await submit(path, lost=True)
        assert lost['status'] == 200 and lost['data']['ok'] and lost['data']['summary']['errors'] == 1 and count(path) == 7
        retry = await submit(path); assert retry['data']['summary']['sent'] == 1 and count(path) == 8
        restarted = subprocess.run([sys.executable, __file__, str(root), 'child', str(path)], text=True, capture_output=True)
        assert restarted.returncode == 0, restarted.stderr
        restart = json.loads(restarted.stdout); assert restart['providerOperations'] == 9
        await asyncio.sleep(0)
        assert not ws._panel_bg_tasks
        result = {'blocker': 'B35 / Package 2 A14 bulk communication bypass discovered in Package 5 full Final Gate',
            'sourceHashes': hashes, 'unauthenticated': unauth['status'], 'signedNonOwner': nonowner['status'],
            'unlinkedEligibilitySends': 0, 'signedOwnerFirst': first, 'identicalRepeat': repeat,
            'concurrentIdenticalRequests': 4, 'concurrentProviderOperations': 4,
            'committedButLostResponse': lost, 'retryAfterLostResponse': retry,
            'freshProcessReplay': restart, 'totalSyntheticProviderOperations': 9,
            'canonicalCallsObserved': sorted(set(reads)), 'canonicalExecutionOrDeliveryCommandCalls': 0,
            'canonicalBulkAudienceEquivalenceCalls': 0, 'networkCalls': 0,
            'productionMessages': 0, 'productionProviderMutations': 0,
            'ownedTemporaryDatabaseRemoved': True, 'ownedTasksRemaining': 0,
            'limits': 'Actual signed-widget verifier, founder role resolver, route, broadcast loop, SQLite recipient/throttle readers/writer and delivery wrappers. Synthetic founder config, empty admin registry, response/Request envelope, decrypted non-PII fixture and positive/negative canonical consent/preferences service responses. Telegram is an owned SQLite provider double including committed/lost response. No production data/config, live HTTP server, canonical Client resolver or real provider invoked.'}
    print(json.dumps(result, indent=2))

asyncio.run(child(Path(sys.argv[3])) if len(sys.argv) > 2 and sys.argv[2] == 'child' else run())
