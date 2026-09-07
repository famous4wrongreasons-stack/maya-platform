"""R07 active-source closure ratchet. AST/source reads only, no app imports/IO.

Closed entries have an exact effect-free body, not an early-return marker over
old sends. Manual replies are protocol guidance only. The helper is recursively
checked as pure; scheduler/HTTP/chat routes are bound to these closed entries.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path

PRODUCERS = {
    ('reactivation.py', 'run_reactivation_job'): 'reactivation',
    ('cycle_reminder.py', 'run_cycle_reminder_job'): 'cycle',
    ('subscriptions.py', '_send_renew_push'): 'subscriptions',
    ('subscriptions.py', 'run_subscriptions_job'): 'subscriptions',
}
MANUAL = {'cmd_reactivation_now': 'reactivation', 'cmd_cycle_now': 'cycle',
          'cmd_subscriptions_now': 'subscriptions'}
SCHEDULED = {'_reactivation_job': ('reactivation', 'run_reactivation_job'),
             '_subscriptions_job': ('subscriptions', 'run_subscriptions_job')}
BIRTHDAY_EXCLUDED = {
    ('birthday.py', '_client_yclients_id'): {'19da47fb358d11192f42c440f5cdae34a308e50106cdf4cfceb7b103f6252611'},
    ('yclients.py', 'get_client_bookings'): {'0dd5e2c7b538e3ca8cb5c1e7d085621e6f87a7d7e746b998b95fe2e90a79ddae'},
    ('birthday.py', 'run_birthday_job'): {
        '559f671fd80326176516ef424da41c5aa832db7508513fb52690657d965a1449',
        '06c8d58c7648c4a6b0a69af808fafa1c422a76b60a295664a45db71c3e1155bd',
    },
}


def _body(node):
    body = node.body
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
        body = body[1:]
    return body


def _shape(body):
    return ast.dump(ast.Module(body=body, type_ignores=[]), include_attributes=False)


def _same_body(node, expected):
    # Defaults/decorators can run outside the protected body; refuse those too.
    return (not node.decorator_list and not node.args.defaults and not any(node.args.kw_defaults)
            and _shape(_body(node)) == _shape(ast.parse(expected).body))


def scan_retention_sources(root, overrides=None):
    root, overrides = Path(root), overrides or {}
    findings, sources, trees = [], {}, {}

    def function(filename, name):
        if filename not in trees:
            sources[filename] = overrides[filename] if filename in overrides else (root / filename).read_text()
            trees[filename] = ast.parse(sources[filename])
        found = [n for n in ast.walk(trees[filename]) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
        if len(found) != 1:
            raise ValueError(f'{filename}:{name}: missing or duplicate boundary')
        return found[0]

    def expect(filename, name, expected):
        try:
            if not _same_body(function(filename, name), expected):
                findings.append(f'{filename}:{name}: R07 complete call closure/dominance changed')
        except (OSError, SyntaxError, ValueError) as error:
            findings.append(str(error))

    for (filename, name), job in PRODUCERS.items():
        expect(filename, name, f'from canonical_retention_entry import retention_owner_required\nreturn retention_owner_required({job!r})')
    expect('database.py', 'mark_subscription_renew_pushed', "raise RuntimeError('B35_CANONICAL_OWNER_REQUIRED')")
    for name, job in MANUAL.items():
        expect('bot.py', name, f'''user_id = update.effective_user.id
if not canonical_staff_access.is_admin(user_id):
    await update.message.reply_text("Команда только для администраторов.")
    return
from canonical_retention_entry import retention_owner_required
await update.message.reply_text(retention_owner_required({job!r})["message"])
''')
    for name, (module, target) in SCHEDULED.items():
        expect('bot.py', name, f'return await {module}.{target}(app)')
    expect('webhook_server.py', 'panel_job_run_handler', '''import canonical_staff_access
import canonical_work_entry
from canonical_retention_entry import retention_owner_required
if not canonical_staff_access.current():
    return _cabinet_response({'error': 'canonical_staff_session_required'}, status=403)
try:
    body = await request.json()
except Exception:
    body = {}
job = body.get('job') if isinstance(body, dict) else None
value = retention_owner_required(job) if job in {'reactivation', 'cycle', 'subscriptions'} else canonical_work_entry.owner_required()
return _cabinet_response(value, status=410)
''')
    expect('webhook_server.py', '_run_owner_job_from_chat', '''import canonical_staff_access
import canonical_work_entry
from canonical_retention_entry import retention_owner_required
if not canonical_staff_access.current(chat_id):
    return _cabinet_response({'error': 'canonical_staff_session_required'}, status=403)
value = retention_owner_required(job) if job in {'reactivation', 'cycle', 'subscriptions'} else canonical_work_entry.owner_required()
return _cabinet_response(value, status=410)
''')
    try:
        helper = function('canonical_retention_entry.py', 'retention_owner_required')
        tree = trees['canonical_retention_entry.py']
        body = _body(helper)
        expected_check = ast.parse("if job not in {'reactivation', 'cycle', 'subscriptions'}:\n    raise ValueError('Unsupported retention entry')").body
        valid = (len(_body(tree)) == 1 and len(body) == 2 and not helper.decorator_list
                 and not helper.args.defaults and not any(helper.args.kw_defaults)
                 and _shape(body[:1]) == _shape(expected_check) and isinstance(body[1], ast.Return)
                 and isinstance(body[1].value, ast.Dict))
        values = {}
        if valid:
            for key, value in zip(body[1].value.keys, body[1].value.values):
                if not isinstance(key, ast.Constant) or key.value in values:
                    valid = False
                    break
                if isinstance(value, ast.Constant):
                    values[key.value] = value.value
                elif isinstance(value, ast.Name) and value.id == 'job' and key.value == 'job':
                    values[key.value] = '<job>'
                else:
                    valid = False
        expected = {'ok': False, 'job': '<job>', 'status': 'not_executed',
                    'error': 'B35_CANONICAL_OWNER_REQUIRED', 'disabled': 'canonical_action_engine_required',
                    'canonical_owner': 'B35', 'requires_review': True,
                    **dict.fromkeys(('sent', 'renew_pushed', 'synced', 'expired', 'candidates', 'blocked', 'errors',
                                     'delivery_attempts', 'business_mutations'), 0)}
        valid = valid and isinstance(values.pop('message', None), str) and values == expected
        if not valid:
            findings.append('canonical_retention_entry.py: refusal helper is not pure or truthful')
    except (OSError, SyntaxError, ValueError, AttributeError) as error:
        findings.append(str(error))

    # The master inventory excludes birthday only under this exact composed
    # flat-record/nested-client mismatch. Any repair requires canonical review.
    for (filename, name), hashes in BIRTHDAY_EXCLUDED.items():
        try:
            node = function(filename, name)
            segment = ast.get_source_segment(sources[filename], node)
            if hashlib.sha256(segment.encode()).hexdigest() not in hashes:
                findings.append(f'{filename}:{name}: excluded birthday shape/producer changed')
        except (OSError, SyntaxError, ValueError) as error:
            findings.append(str(error))

    # Fence fixed entry registration and late rebinding, not just body markers.
    try:
        for filename, names in {'bot.py': set(MANUAL) | set(SCHEDULED),
                                'reactivation.py': {'run_reactivation_job'},
                                'cycle_reminder.py': {'run_cycle_reminder_job'},
                                'subscriptions.py': {'run_subscriptions_job', '_send_renew_push'},
                                'webhook_server.py': {'panel_job_run_handler', '_run_owner_job_from_chat'}}.items():
            for node in ast.walk(trees[filename]):
                if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id in names:
                    findings.append(f'{filename}:{node.id}: protected entry rebound')
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    if any((alias.asname or alias.name) in names for alias in node.names):
                        findings.append(f'{filename}: protected entry import shadowing')
        bot = trees['bot.py']
        for command, handler in [('reactivation_now', 'cmd_reactivation_now'), ('cycle_now', 'cmd_cycle_now'),
                                 ('subscriptions_now', 'cmd_subscriptions_now')]:
            registrations = [n for n in ast.walk(bot) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                             and n.func.id == 'CommandHandler' and n.args and isinstance(n.args[0], ast.Constant)
                             and n.args[0].value == command]
            if len(registrations) != 1 or not any(isinstance(a, ast.Name) and a.id == handler for a in registrations[0].args[1:]):
                findings.append(f'bot.py:{command}: fixed command bypasses protected entry')
        for job, handler in [('reactivation', '_reactivation_job'), ('subscriptions', '_subscriptions_job')]:
            registrations = [n for n in ast.walk(bot) if isinstance(n, ast.Call)
                             and isinstance(n.func, ast.Attribute) and n.func.attr == 'add_job'
                             and any(k.arg == 'id' and isinstance(k.value, ast.Constant) and k.value.value == job for k in n.keywords)]
            if len(registrations) != 1 or not registrations[0].args or not isinstance(registrations[0].args[0], ast.Name) or registrations[0].args[0].id != handler:
                findings.append(f'bot.py:{job}: fixed scheduler bypasses protected entry')
        route = [n for n in ast.walk(trees['webhook_server.py']) if isinstance(n, ast.Call)
                 and isinstance(n.func, ast.Attribute) and n.func.attr == 'add_post'
                 and any(isinstance(a, ast.Constant) and a.value == '/api/panel/job/run' for a in n.args)]
        if len(route) != 1 or not any(isinstance(a, ast.Name) and a.id == 'panel_job_run_handler' for a in route[0].args):
            findings.append('webhook_server.py: panel job route bypasses protected entry')
    except (KeyError, AttributeError):
        findings.append('R07 registered closure unavailable')
    return findings


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    result = scan_retention_sources(args.root)
    print(json.dumps({'guard': 'R07/B46/B57', 'findings': result}, ensure_ascii=False))
    raise SystemExit(bool(result))
