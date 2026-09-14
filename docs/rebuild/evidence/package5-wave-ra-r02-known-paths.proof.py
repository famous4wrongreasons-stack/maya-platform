"""R02 existing-path witness; AST extraction and fake dependencies only."""
import ast
import hashlib
import json
import sys
import types
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
PY = ROOT / 'ai администратор'


def extract(filename, name):
    source = (PY / filename).read_text()
    tree = ast.parse(source)
    item = next(n for n in ast.walk(tree)
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return '\n'.join(source.splitlines()[item.lineno - 1:item.end_lineno])


def compile_function(filename, name, namespace):
    exec(extract(filename, name), namespace)
    return namespace[name]


calls = []


class FakeDb:
    def _db(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params):
        calls.append(sql)
        return self

    def fetchone(self):
        return {'id': 1}

    def _now(self):
        return 'synthetic-time'


bind = compile_function('bot.py', '_bind_master_chat_direct', {'database': FakeDb()})
bind(100, 200)
assert len([s for s in calls if s.startswith('UPDATE masters_telegram')]) == 1

panel_calls = []
panel = compile_function('webhook_server.py', '_panel_resolve_role', {
    'database': types.SimpleNamespace(is_admin=lambda value: panel_calls.append(value) or True),
    'resolve_panel_role': lambda **v: 'owner' if v['is_founder'] or v['is_admin'] else 'client',
    'panel_permissions': lambda *args, **kwargs: {'owner': True},
})
with patch.dict(sys.modules, {'config': types.SimpleNamespace(FOUNDER_IDS=[])}):
    result = panel(200)
assert result['role'] == 'owner' and panel_calls == [200]

session_writes = []
issue = compile_function('web_auth.py', '_issue_session', {
    'pii_crypto': types.SimpleNamespace(hash_phone=lambda value: 'synthetic-hash'),
    'database': types.SimpleNamespace(
        find_client_by_phone=lambda value: {'telegram_chat_id': 200},
        is_admin=lambda value: True,
        get_master_by_chat_id=lambda value: None,
        create_web_session=lambda *args, **kwargs: session_writes.append(kwargs),
    ),
    '_new_token': lambda: 'synthetic-unused-token',
    'SESSION_TTL_DAYS': 30,
    '_enabled_bool': lambda value: False,
})
session = issue(phone='synthetic-phone', vk_user_id=None, yandex_user_id=None, name='')
assert session['identity']['subject_kind'] == 'staff'
assert session_writes[0]['subject_kind'] == 'staff'

print(json.dumps({
    'scope': 'Existing B40/B41 inventory paths only; not remediation acceptance',
    'witnessResult': 'KNOWN DEFECTS REPRODUCED',
    'cases': [
        {'blocker': 'B40', 'case': 'existing masters_telegram row direct rebinding',
         'observed': 'One legacy UPDATE attempted against a fake connection',
         'canonicalContractResult': 'FAIL CURRENT PATH'},
        {'blocker': 'B41', 'case': 'legacy admin alone becomes panel owner',
         'observed': 'owner result without User/Membership/session authority',
         'canonicalContractResult': 'FAIL CURRENT PATH'},
        {'blocker': 'B41', 'case': 'phone-projection plus legacy admin grants staff web session',
         'observed': 'staff web_session issued only into an in-memory fake',
         'canonicalContractResult': 'FAIL CURRENT PATH'},
    ],
    'sourceFunctionSha256': {
        f'{filename}:{name}': hashlib.sha256(extract(filename, name).encode()).hexdigest()
        for filename, name in [('bot.py', '_bind_master_chat_direct'),
                               ('webhook_server.py', '_panel_resolve_role'),
                               ('web_auth.py', '_issue_session')]
    },
    'databaseConnections': 0,
    'providerCalls': 0,
    'realMessages': 0,
    'applicationImports': 0,
}, indent=2))
