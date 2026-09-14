"""Permanent R04 guard over known operational writers, reads and initiators."""
import ast
from pathlib import Path
import re

WRITERS = {'_ensure_owner_action_journal', 'create_owner_action', 'link_owner_control_task_action',
           'finish_owner_action', 'update_owner_control_task', 'mark_owner_control_task_delivery',
           'update_owner_assignment_work_state', 'evaluate_owner_action'}
RETIRED = {'create_control_task', 'update_control_task', 'update_staff_task', 'run_operating_rhythm_tick',
           'run_execution_loop_tick', 'run_autonomous_director_tick', 'run_autopilot_supervision_tick'}
TOOLS = {'create_owner_control_task', 'update_owner_control_task', 'run_operating_rhythm_tick',
         'run_execution_loop_tick', 'run_autonomous_director_tick', 'run_autopilot_supervision_tick'}


def functions(source):
    return {node.name: node for node in ast.parse(source).body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}


def body(source, name):
    node = functions(source)[name]
    return '\n'.join(source.splitlines()[node.body[0].lineno - 1:node.end_lineno])


def validate(sources):
    errors = []
    for name, source in sources.items():
        if re.search(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["\x27`]?owner_action_journal\b', source, re.I):
            errors.append(name + ': parallel operational journal writer/schema')
    db = sources['database.py']
    for name in WRITERS:
        node = functions(db)[name]
        if len(node.body) != 1 or not isinstance(node.body[0], ast.Raise) or 'CANONICAL_OPERATIONAL_WORK_REQUIRED' not in body(db, name):
            errors.append('database.py:' + name + ': retired writer callable')
    for name in ['list_owner_actions', 'evaluate_due_owner_actions']:
        if any(isinstance(n, ast.Call) for n in ast.walk(functions(db)[name])):
            errors.append('database.py:' + name + ': read invokes side effect')
    owner = sources['owner_ai.py']
    for name in RETIRED:
        if body(owner, name).strip() != 'import canonical_work_entry\n    return canonical_work_entry.owner_required()':
            errors.append('owner_ai.py:' + name + ': unsupported owner command')
    for name in ['command_center', 'daily_briefing']:
        value = body(owner, name)
        if re.search(r'(evaluate_due_owner_actions|evaluate_owner_action|list_owner_actions|create_owner_action|set_setting)\s*\(', value):
            errors.append('owner_ai.py:' + name + ': read mutates or promotes legacy work')
    webhook = sources['webhook_server.py']
    for name in ['panel_job_run_handler', '_run_owner_job_from_chat']:
        value = body(webhook, name)
        if ('canonical_staff_access.current(' not in value or 'owner_required()' not in value
                or re.search(r'(create_task|set_setting|create_owner_action|finish_owner_action|importlib|_PANEL_JOBS)\b', value)):
            errors.append('webhook_server.py:' + name + ': generic background effect')
    for name, op in [('panel_control_create_handler', 'create'), ('panel_control_update_handler', 'complete'),
                     ('panel_staff_task_update_handler', 'complete'), ('panel_staff_tasks_handler', 'list')]:
        if body(webhook, name).strip() != f"import canonical_work_entry\n    return await canonical_work_entry.handle(request, {op!r})":
            errors.append('webhook_server.py:' + name + ': owner adapter bypass')
    for name in ['panel_action_evaluate_handler', 'panel_autonomy_tick_handler',
                 'panel_autopilot_supervision_handler', 'panel_execution_loop_handler', '_deliver_owner_control_assignment']:
        value = body(webhook, name)
        if 'canonical_work_entry.owner_required()' not in value or re.search(r'(database\.|owner_ai\.|_push_|create_task|send_message)', value):
            errors.append('webhook_server.py:' + name + ': unsupported mutation/fanout')
    if any(isinstance(n, ast.Call) for n in ast.walk(functions(webhook)['maya_operating_rhythm_loop'])):
        errors.append('webhook_server.py: scheduled operational effect')
    for node in ast.walk(ast.parse(sources['claude_ai.py'])):
        if isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values):
                if isinstance(key, ast.Constant) and key.value == 'name' and isinstance(value, ast.Constant) and value.value in TOOLS:
                    errors.append('claude_ai.py: unsupported tool declaration ' + value.value)
    entry = sources['canonical_work_entry.py']
    entry_functions = functions(entry)
    pure = entry_functions['owner_required']
    if (len(pure.body) != 1 or not isinstance(pure.body[0], ast.Return)
            or not isinstance(pure.body[0].value, ast.Dict)
            or any(isinstance(n, (ast.Call, ast.Import, ast.ImportFrom)) for n in ast.walk(pure))):
        errors.append('canonical_work_entry.py: retired helper must be pure')
    assignments = {}
    for node in ast.parse(entry).body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assignments[target.id] = assignments.get(target.id, 0) + 1
            if not isinstance(node.value, ast.Constant):
                errors.append('canonical_work_entry.py: effectful module initialization')
        elif not isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef)):
            if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)):
                errors.append('canonical_work_entry.py: effectful module initialization')
    if assignments != {'BASE': 1, 'MESSAGE': 1}:
        errors.append('canonical_work_entry.py: mutable destination or helper authority')
    send_calls = {ast.unparse(n.func) for n in ast.walk(entry_functions['_send']) if isinstance(n, ast.Call)}
    allowed_send_calls = {'requests.request', 'requests.ConnectionError', 'response.json', 'isinstance',
                          'value.get', 'execution.get', 'owner_required'}
    if not send_calls <= allowed_send_calls:
        errors.append('canonical_work_entry.py: unreviewed effect inside canonical transport')
    for required in ["BASE = 'http://127.0.0.1:3107/api/operational-work'", 'canonical_staff_access.current()',
                     'canonical_staff_access.bearer(request.headers, body)', "'Idempotency-Key'", 'IDEMPOTENCY_CONFLICT', 'canonical_outcome_unresolved']:
        if required not in entry:
            errors.append('canonical_work_entry.py: missing canonical request boundary ' + required)
    if re.search(r'(database\.|yclients\.|\.send_message\(|time\.sleep\(|uuid4\()', entry):
        errors.append('canonical_work_entry.py: parallel owner/effect/identity')
    return errors


def scan_operational_work(root, overrides=None):
    root = Path(root)
    sources = {path.name: path.read_text() for path in root.glob('*.py')
               if not path.name.startswith(('test_', 'package5_operational_work_runtime_guard'))}
    sources.update(overrides or {})
    return validate(sources)


def check(root=None):
    root = Path(root) if root else Path(__file__).parent
    sources = {path.name: path.read_text() for path in root.glob('*.py')
               if not path.name.startswith(('test_', 'package5_operational_work_runtime_guard'))}
    errors = scan_operational_work(root)
    if errors:
        raise RuntimeError('\n'.join(errors))
    return {'package': 'R04', 'blocker': 'B42', 'status': 'PASS', 'python_sources': len(sources)}


if __name__ == '__main__':
    import json
    print(json.dumps(check()))
