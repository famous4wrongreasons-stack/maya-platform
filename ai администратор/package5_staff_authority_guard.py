"""Permanent R02 actor-authority ratchet. No application imports or DB access."""
from __future__ import annotations
import ast
from pathlib import Path
import re

FILES = ('bot.py', 'webhook_server.py', 'claude_ai.py', 'memory.py', 'web_auth.py', 'database.py', 'canonical_staff_access.py')
DELEGATES = {
    ('bot.py', '_is_staff_chat_id'): 'canonical_staff_access.is_staff',
    ('webhook_server.py', '_panel_resolve_role'): 'canonical_staff_access.panel_role',
    ('claude_ai.py', '_resolve_role'): 'canonical_staff_access.ai_role',
}
TOMBSTONES = {'database.py': ('add_admin', 'create_master_with_bind_code', 'reset_master_bind_code', 'bind_master', 'unbind_master'),
              'bot.py': ('_bind_master_chat_direct',)}


def scan_staff_authority(root: Path, overrides=None):
    overrides = overrides or {}
    findings = []
    trees = {}
    sources = {}
    for name in FILES:
        path = root / name
        if name not in overrides and not path.is_file():
            findings.append(name + ': required authority surface missing')
            continue
        source = overrides.get(name, path.read_text() if path.is_file() else '')
        sources[name] = source
        try:
            tree = trees[name] = ast.parse(source, filename=name)
        except SyntaxError:
            findings.append(name + ': invalid Python')
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                call = ast.unparse(node.func)
                if name not in {'database.py', 'canonical_staff_access.py'} and call == 'database.is_admin':
                    findings.append(f'{name}:{node.lineno}: raw admin authority')
                if name in {'bot.py', 'claude_ai.py', 'memory.py'} and call == 'database.get_master_by_chat_id':
                    findings.append(f'{name}:{node.lineno}: raw staff authority')
                if name == 'bot.py' and call == 'database.add_admin':
                    findings.append(f'{name}:{node.lineno}: native admin grant')
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                sql = ' '.join(node.value.upper().split())
                if re.search(r'\bINSERT(?: OR IGNORE| OR REPLACE)? INTO ADMINS\b', sql) or re.search(r'\bUPDATE MASTERS_TELEGRAM SET TELEGRAM_CHAT_ID\b', sql):
                    findings.append(f'{name}:{node.lineno}: direct staff/admin authority write')
        for fn in tree.body:
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            actor = fn.name.startswith('cmd_') or fn.name in {'handle_message', '_resolve_role', '_panel_resolve_role', '_god_gate', '_issue_session'}
            if actor:
                for node in ast.walk(fn):
                    if isinstance(node, ast.Name) and node.id in {'FOUNDER_IDS', 'ANTON_CHAT_ID', 'INITIAL_ADMIN_IDS', 'VK_STAFF_CHAT_MAP', 'YANDEX_STAFF_CHAT_MAP'}:
                        findings.append(f'{name}:{node.lineno}: raw designated identity grants authority')
    for (name, fn), call in DELEGATES.items():
        nodes = [n for n in trees.get(name, ast.Module(body=[], type_ignores=[])).body if isinstance(n, ast.FunctionDef) and n.name == fn]
        if len(nodes) != 1 or not any(isinstance(n, ast.Call) and ast.unparse(n.func) == call for n in ast.walk(nodes[0])):
            findings.append(f'{name}:{fn}: canonical delegation missing')
    for name, functions in TOMBSTONES.items():
        for fn in functions:
            nodes = [n for n in trees.get(name, ast.Module(body=[], type_ignores=[])).body if isinstance(n, ast.FunctionDef) and n.name == fn]
            statements = [n for n in nodes[0].body if not isinstance(n, ast.Expr) or not isinstance(n.value, ast.Constant)] if len(nodes) == 1 else []
            if not statements or not isinstance(statements[-1], ast.Raise) or any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) for n in ast.walk(nodes[0])):
                findings.append(f'{name}:{fn}: retired authority writer executable')
    web = trees.get('webhook_server.py')
    if web and not any(isinstance(n, ast.Call) and ast.unparse(n.func) == 'web.Application' and any(k.arg == 'middlewares' and 'canonical_staff_access.middleware' in ast.unparse(k.value) for k in n.keywords) for n in ast.walk(web)):
        findings.append('webhook_server.py: canonical admission middleware absent')
    session = trees.get('web_auth.py')
    if session:
        fn = next((n for n in session.body if isinstance(n, ast.FunctionDef) and n.name == '_issue_session'), None)
        text = ast.unparse(fn) if fn else ''
        if any(x in text for x in ['find_client_by_phone', 'STAFF_CHAT_MAP', 'get_master_by_chat_id', 'subject_kind = \'staff\'']):
            findings.append('web_auth.py:_issue_session: legacy staff session promotion')
    if not sources.get('canonical_staff_access.py') or 'scope[\'active\'] = False' not in sources['canonical_staff_access.py']:
        findings.append('canonical_staff_access.py: request authority lifetime not bounded')
    authority = sources.get('canonical_staff_access.py', '')
    for marker in ["scope.get('owner_task') is not task", "scope.get('owner_thread') != threading.get_ident()",
                   "scope['parent']['active']", 'canonical_principal_callback_already_used']:
        if marker not in authority:
            findings.append('canonical_staff_access.py: request/thread authority isolation missing')
    if 'canonical_staff_access.synchronous_request_callback(_producer)' not in sources.get('webhook_server.py', ''):
        findings.append('webhook_server.py: unbounded staff SSE authority transfer')
    return findings


if __name__ == '__main__':
    import json
    import sys
    result = scan_staff_authority(Path(__file__).parent)
    print(json.dumps({'pass': not result, 'findings': result}))
    sys.exit(bool(result))
