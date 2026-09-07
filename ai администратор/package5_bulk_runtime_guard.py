"""B35 active-source ratchet. Reads source only; never imports bot/runtime."""
import ast
import hashlib
from pathlib import Path

BOUNDARIES = {
    ('webhook_server.py', 'internal_package2_telegram_handler'): '5da8d4b28b9cadca235709cbe77475cd3d759b4adc871d03770ed1cecb97b47a',
    ('webhook_server.py', 'broadcast_send_to_base'): '08a70428b0506a3c174a7fc0a3fb722c38a2945a0002fafe35345490ece3c305',
    ('webhook_server.py', 'panel_broadcast_handler'): 'b00f7c3e06bd5147ee1a58a8dae96db24973cc851a337fe597bfded6caa48ce0',
    ('bot.py', '_broadcast_execute'): '50008bb3ab224cd01fbec45ba416df3f3363d55d28cc4798f27ed175a13dc0b5',
    ('legacy_marketing_bulk_bridge.py', 'command'): 'a2a33cadb993bded24574b5868a4a0ffd9b768d4d60cd26c05ebec8b5f0d039c',
}


def scan_bulk_sources(root, overrides=None):
    root, overrides = Path(root), overrides or {}
    findings = []
    for (filename, name), expected in BOUNDARIES.items():
        try:
            tree = ast.parse(overrides[filename] if filename in overrides else (root / filename).read_text())
        except (OSError, SyntaxError):
            findings.append(f'{filename}: canonical bulk boundary unavailable')
            continue
        functions = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
        if len(functions) != 1 or hashlib.sha256(ast.dump(functions[0], include_attributes=False).encode()).hexdigest() != expected:
            findings.append(f'{filename}:{name}: reviewed bulk initiator/retirement contract changed')
    source = overrides.get('webhook_server.py')
    if source is None:
        source = (root / 'webhook_server.py').read_text()
    tree = ast.parse(source)
    routes = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'add_post' and any(isinstance(a, ast.Constant) and a.value == '/api/panel/broadcast' for a in n.args)]
    if len(routes) != 1 or not any(isinstance(a, ast.Name) and a.id == 'panel_broadcast_handler' for a in routes[0].args):
        findings.append('panel broadcast route is not bound to the canonical initiator')
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == '_panel_broadcast_recipients':
            findings.append('legacy chat-id audience selector restored')
        if isinstance(node, ast.Call) and ((isinstance(node.func, ast.Name) and node.func.id == 'broadcast_send_to_base') or (isinstance(node.func, ast.Attribute) and node.func.attr == 'broadcast_send_to_base')):
            findings.append('retired raw chat-id bulk producer is reachable')
    return findings
