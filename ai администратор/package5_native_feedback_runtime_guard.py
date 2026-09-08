"""Permanent B47 ratchet: known leaves are retired as complete functions."""
import ast
from package5_wave_rc_guard_contracts import contract
import re
from pathlib import Path


def functions(source):
    return {n.name: n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}


def expected():
    return contract("r08")


def scan(root, overrides=None):
    root = Path(root)
    sources = {p.name: p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_', 'package5_'))}
    sources.update(overrides or {})
    errors = []
    for filename, bodies in expected().BODIES.items():
        actual = functions(sources[filename])
        for name, body in bodies.items():
            target = actual.get(name)
            reference = ast.parse('async def reference():\n' + ''.join('    ' + line + '\n' for line in body.splitlines())).body[0]
            if not target or ast.dump(ast.Module(body=target.body, type_ignores=[])) != ast.dump(ast.Module(body=reference.body, type_ignores=[])):
                errors.append(filename + ': ' + name + ' retired native authority changed')
    for filename, source in sources.items():
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if re.search(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?review_requests\b', node.value, re.I):
                    errors.append(filename + ': legacy feedback SQL writer')
            if isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Constant) and node.slice.value == 'pending_review_comment_id':
                errors.append(filename + ': next-message feedback authority')
    actual = functions(sources['webhook_server.py']).get('client_native_feedback_handler')
    reference = ast.parse(expected().HANDLER).body[0]
    if not actual or ast.dump(actual) != ast.dump(reference):
        errors.append('Client feedback initiator differs from verified-channel contract')
    bridge = functions(sources['legacy_client_command_bridge.py'])['command']
    text = ast.unparse(bridge)
    for operation in ['feedback-projection', 'feedback-response', 'feedback-withdraw']:
        if operation not in text:
            errors.append('missing canonical feedback operation: ' + operation)
    return errors


if __name__ == '__main__':
    import json, sys
    errors = scan(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)
    print(json.dumps({'package': 'R08', 'result': 'FAIL' if errors else 'PASS', 'errors': errors}))
    sys.exit(bool(errors))
