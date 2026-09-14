"""Permanent B52 owner boundary across canonical and inventoried Python variants."""
import ast
from package5_wave_rc_guard_contracts import contract
import re
from pathlib import Path


def overlay():
    return contract("r09")


def scan(root, overrides=None):
    root = Path(root)
    sources = {p.name: p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_', 'package5_'))}
    sources.update(overrides or {})
    errors = []; expected = overlay()
    for filename, bodies in expected.BODIES.items():
        actual = {n.name:n for n in ast.parse(sources.get(filename, '')).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        if filename == 'site_community.py':
            bodies = {**bodies, 'register_routes': expected.REGISTER}
        for name, body in bodies.items():
            reference = ast.parse('async def reference():\n' + ''.join('    ' + line + '\n' for line in body.splitlines())).body[0]
            node = actual.get(name)
            if not node or ast.dump(ast.Module(body=node.body, type_ignores=[])) != ast.dump(ast.Module(body=reference.body, type_ignores=[])):
                errors.append(filename + ': ' + name + ' bypasses approved community owner')
    for filename, source in sources.items():
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and re.search(r'\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["`]?site_(?:event_(?:comments|likes|views)|guest_likes)\b', node.value, re.I):
                errors.append(filename + ': direct legacy community SQL writer')
    bridge = sources.get('canonical_public_community.py', '')
    for forbidden in ['sqlite3', 'is_admin', 'send_message', 'send_document', 'resolve_comment', 'create_task', 'user_id', 'clientId']:
        if forbidden in bridge: errors.append('canonical_public_community.py: forbidden authority/effect ' + forbidden)
    for required in ["'http://127.0.0.1:3107/api/public-community/source'", "'maya.community-source/1:'", 'sourceGatewayId', 'visitorSubjectHash', 'requestKey', 'community_receipt_unconfirmed']:
        if required not in bridge: errors.append('canonical_public_community.py: missing bound source protocol ' + required)
    return errors


if __name__ == '__main__':
    import json, sys
    errors = scan(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)
    print(json.dumps({'package':'R09', 'result':'FAIL' if errors else 'PASS', 'errors':errors})); sys.exit(bool(errors))
