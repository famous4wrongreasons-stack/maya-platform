"""B27 active loyalty read entry points cannot reach legacy identity/value reads."""
import ast
from pathlib import Path


def scan_loyalty_reads(root: Path, overrides=None) -> list[str]:
    overrides = overrides or {}
    read = lambda name: overrides.get(name, (root / name).read_text())
    failures = []
    source = read('claude_ai.py')
    tree = ast.parse(source)
    targets = {'check_loyalty_balance', 'request_booking'}
    found = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.If) or not isinstance(node.test, ast.Compare):
            continue
        if not isinstance(node.test.left, ast.Name) or node.test.left.id != 'tool_name':
            continue
        values = [n.value for n in node.test.comparators if isinstance(n, ast.Constant)]
        if not values or values[0] not in targets:
            continue
        found.add(values[0])
        body = ast.Module(body=node.body, type_ignores=[])
        calls = [ast.unparse(n.func) for n in ast.walk(body) if isinstance(n, ast.Call)]
        if 'loyalty_projection' not in calls:
            failures.append(values[0] + ': verified query missing')
        for call in calls:
            if call.endswith(('.get_client', '.get_or_create_client', '.loyalty_balance', '._yc_loyalty_card', '.lazy_backfill_for_client', '.add_loyalty_transaction')):
                failures.append(values[0] + ': legacy Client/value read')
    if found != targets:
        failures.append('AI loyalty query entry points missing')
    web = ast.parse(read('webhook_server.py'))
    handler = next((n for n in web.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'internal_loyalty_snapshot_handler'), None)
    expected = ast.parse('return web.json_response({"error": "FEATURE_NOT_AVAILABLE"}, status=410)').body[0]
    body = [] if handler is None else [n for n in handler.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))]
    if len(body) != 1 or ast.dump(body[0]) != ast.dump(expected):
        failures.append('legacy raw Telegram loyalty snapshot restored')
    routes = [n for n in ast.walk(web) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr != 'add_options' and any(isinstance(a, ast.Constant) and a.value == '/api/internal/loyalty-snapshot' for a in n.args)]
    if len(routes) != 1 or not isinstance(routes[0].args[-1], ast.Name) or routes[0].args[-1].id != 'internal_loyalty_snapshot_handler':
        failures.append('legacy snapshot route bypass')
    bridge = ast.parse(read('legacy_client_command_bridge.py'))
    projection = next((n for n in bridge.body if isinstance(n, ast.FunctionDef) and n.name == 'loyalty_projection'), None)
    if projection is None:
        failures.append('canonical loyalty transport missing')
    else:
        text = ast.unparse(projection)
        if "command('loyalty-projection', context.proof, {})" not in text or 'current_context()' not in text or 'if context is None:' not in text:
            failures.append('canonical loyalty transport bypass')
        if any(term in text for term in ('database.', 'chat_id', 'phone', 'clientId', 'get_or_create')):
            failures.append('legacy transport identity fallback')
    return failures
