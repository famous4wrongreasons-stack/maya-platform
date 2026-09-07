"""B35 active-source ratchet. Reads source only; never imports bot/runtime."""
import ast
import hashlib
from pathlib import Path

# Source segments are pinned rather than Python-version-specific ast.dump output.
BOUNDARIES = {
    ('webhook_server.py', 'internal_package2_telegram_handler'): '0f984342ad4b2c1ba3b42164cae500b5780db9b6a1cf77600d9a292b63dd3b82',
    ('webhook_server.py', 'broadcast_send_to_base'): '69aaecb322ccf1ca02fdade03bcd333731ee12947689acba81dacaaaa77ab823',
    ('webhook_server.py', 'panel_broadcast_handler'): '4ee8b8e1dde2aaa7173bf97b335361f30fe48d5dc228217b9217711bc7baa8ab',
    ('bot.py', '_broadcast_execute'): '9373a78273e8be10ac33c76c13097f8c6127b006266d6e1b675131d6af9f4f83',
    ('legacy_marketing_bulk_bridge.py', 'command'): '009e26e2f4ca210cd2674606fd5cb7155a7f030c0b895afe41a24fc73d6a910b',
}


def scan_bulk_sources(root, overrides=None):
    root, overrides = Path(root), overrides or {}
    findings = []
    for (filename, name), expected in BOUNDARIES.items():
        try:
            source = overrides[filename] if filename in overrides else (root / filename).read_text()
            tree = ast.parse(source)
        except (OSError, SyntaxError):
            findings.append(f'{filename}: canonical bulk boundary unavailable')
            continue
        functions = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
        if len(functions) != 1 or hashlib.sha256(ast.get_source_segment(source, functions[0]).strip().encode()).hexdigest() != expected:
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
