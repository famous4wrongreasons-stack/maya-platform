"""R03 permanent native schedule boundary. AST only; no application imports."""
import ast
from pathlib import Path


def schedule_branch(tree):
    return next(n for n in ast.walk(tree) if isinstance(n, ast.If)
                and ast.unparse(n.test) == "tool_name == 'manage_staff_schedule'")


def scan_staff_schedule(root: Path, overrides=None):
    overrides = overrides or {}
    findings = []
    trees = {}
    for name in ('claude_ai.py', 'yclients.py'):
        try:
            text = overrides[name] if name in overrides else (root / name).read_text()
            trees[name] = ast.parse(text)
        except (OSError, SyntaxError):
            findings.append(name + ': required source missing or invalid')
            continue
        tree = trees[name]
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            calls = [n for n in ast.walk(fn) if isinstance(n, ast.Call)]
            body = ast.unparse(fn)
            # Catch direct and aliased PUT/request call forms, including a
            # separately assembled endpoint/payload inside the same function.
            schedule_target = any(x in body for x in ('staff/schedule', 'schedules_to_set', 'schedules_to_delete'))
            if schedule_target and any(
                isinstance(n, ast.Attribute) and n.attr in {'_put', 'put', 'request'}
                for n in ast.walk(fn)
            ):
                findings.append(name + ':' + fn.name + ': native provider schedule writer')
            if name == 'claude_ai.py' and any(
                isinstance(n, ast.Name) and n.id in {'_schedule_confirmation_verified', '_SCHEDULE_CONFIRM_RE'}
                or isinstance(n, ast.Constant) and n.value == '_schedule_confirmation_verified'
                for n in ast.walk(fn)
            ):
                findings.append(name + ':' + fn.name + ': prose/private schedule authority')
            if name == 'claude_ai.py' and any(
                isinstance(call.func, ast.Attribute) and call.func.attr == 'change_staff_day_schedule'
                for call in calls
            ):
                findings.append(name + ':' + fn.name + ': native schedule helper called')
    if 'claude_ai.py' in trees:
        try:
            branch = schedule_branch(trees['claude_ai.py'])
            allowed = ast.parse('result = staff_schedule_handoff()').body
            if ast.dump(ast.Module(body=branch.body, type_ignores=[])) != ast.dump(ast.Module(body=allowed, type_ignores=[])):
                findings.append('claude_ai.py: schedule entry must hand off without lookup or effect')
        except StopIteration:
            findings.append('claude_ai.py: schedule boundary missing')
    if 'yclients.py' in trees:
        functions = [n for n in ast.walk(trees['yclients.py']) if isinstance(n, ast.FunctionDef)
                     and n.name == 'change_staff_day_schedule']
        if len(functions) != 1:
            findings.append('yclients.py: exact legacy schedule boundary missing')
        else:
            body = functions[0].body
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                body = body[1:]
            expected = ast.parse('if apply:\n    return staff_schedule_handoff()').body[0]
            if not body or ast.dump(body[0]) != ast.dump(expected):
                findings.append('yclients.py: apply must refuse before read/cache/write')
    return findings


if __name__ == '__main__':
    import json
    import sys
    findings = scan_staff_schedule(Path(__file__).parent)
    print(json.dumps({'pass': not findings, 'findings': findings}))
    sys.exit(bool(findings))
