"""Read exact deployed code; reproduce B24 using synthetic identities and owned SQLite.

Usage: python3 package5-b24-push-subscribe.probe.py <fresh-webhook-source>
No application config, live session, Client data, endpoint or provider is accessed.
"""
import ast
import asyncio
from datetime import datetime
import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

source = Path(sys.argv[1]).read_text()
assert hashlib.sha256(source.encode()).hexdigest() == 'fc5fedeebff6cf742bc5c9206a7fa1907d8c5a23ef62646bcaa60c46665f22be'
names = {'push_subscribe_handler', '_authed_chat_id', '_master_by_chat_id',
         '_master_staff_id', '_save_master_push_subscription', '_push_db',
         '_save_master_push_subscription_sqlite', '_list_master_push_subscriptions_sqlite'}
nodes = [n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
assert {n.name for n in nodes} == names
connections = []


def connect(*args, **kwargs):
    conn = sqlite3.connect(*args, **kwargs)
    connections.append(conn)
    return conn


class Request:
    headers = {}
    def __init__(self, body):
        self.body = body
    async def json(self):
        return self.body


with tempfile.TemporaryDirectory(prefix='maya-b24-owned-proof-') as directory:
    db_path = Path(directory)/'synthetic.sqlite'
    env = {
        'web': SimpleNamespace(Request=object, Response=object),
        '_cabinet_response': lambda data, status=200: {'status': status, 'data': data},
        'web_auth': SimpleNamespace(resolve_session=lambda token: {
            'legacy-a': {'chat_id': 700001}, 'legacy-b': {'chat_id': 700002},
        }.get(token)),
        '_verify_telegram_init_data': lambda *_: None,
        '_verify_telegram_login_widget': lambda *_: None,
        'TELEGRAM_TOKEN': '', 'WEBPUSH_VAPID_PRIVATE_KEY': '',
        'database': SimpleNamespace(list_masters=lambda: []),
        'sqlite3': SimpleNamespace(connect=connect, Row=sqlite3.Row, Connection=sqlite3.Connection),
        '_push_db_path': lambda: str(db_path), '_json': json, 'datetime': datetime,
        'logger': SimpleNamespace(error=lambda *_: None),
    }
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<exact-active-webhook>', 'exec'), env)
    subscription = {'endpoint': 'https://push.example.invalid/synthetic-endpoint',
                    'keys': {'p256dh': 'synthetic-public-key', 'auth': 'synthetic-auth'}}
    # Bare caller chat_id has no authenticated channel and is rejected.
    rejected = asyncio.run(env['push_subscribe_handler'](Request({
        'chat_id': 700001, 'subscription': subscription})))
    assert rejected['status'] == 401 and not db_path.exists()
    # Valid *legacy* session, no canonical Client or ClientChannelLink at all.
    first = asyncio.run(env['push_subscribe_handler'](Request({
        'session_token': 'legacy-a', 'subscription': subscription})))
    assert first['status'] == 200 and first['data']['ok'] and first['data']['role'] == 'client'
    conn = connect(db_path)
    before = conn.execute('SELECT telegram_chat_id, endpoint, subscription_json FROM master_push_subscriptions').fetchall()
    assert len(before) == 1 and before[0][0] == 700001
    assert before[0][1] == subscription['endpoint'] and json.loads(before[0][2]) == subscription
    repeat = asyncio.run(env['push_subscribe_handler'](Request({
        'session_token': 'legacy-a', 'subscription': subscription})))
    assert repeat['data']['ok']
    # The same endpoint is reassigned by SQL upsert to another raw legacy identity.
    second = asyncio.run(env['push_subscribe_handler'](Request({
        'session_token': 'legacy-b', 'subscription': subscription})))
    after = conn.execute('SELECT telegram_chat_id FROM master_push_subscriptions').fetchall()
    assert second['data']['ok'] and after == [(700002,)]
    assert env['_list_master_push_subscriptions_sqlite'](None, 700001) == []
    assert env['_list_master_push_subscriptions_sqlite'](None, 700002) == [subscription]
    columns = [row[1] for row in conn.execute('PRAGMA table_info(master_push_subscriptions)')]
    assert not any(c in columns for c in ['tenant_id', 'client_id', 'client_channel_link_id'])
    for connection in connections:
        connection.close()
    result = {
        'sourceSha256': hashlib.sha256(source.encode()).hexdigest(),
        'actualProductionAst': sorted(names),
        'bareForgedChatIdRejected': True,
        'legacySessionWithoutCanonicalBindingAccepted': True,
        'legacyClientRoleReturned': True,
        'durableSqliteSubscriptionCreated': True,
        'plaintextEndpointAndSubscriptionPersisted': True,
        'sameEndpointRawIdentityReassigned': True,
        'canonicalTenantClientLinkColumnsPresent': False,
        'canonicalIdentityOrCommandInvoked': False,
        'realProductionMutations': 0,
        'providerCalls': 0,
        'ownedTemporaryDatabaseRemoved': True,
    }
assert not Path(directory).exists()
print(json.dumps(result, indent=2))
