"""Pure bounded R03 source transformation; no app imports or publication.

CLI requires an exact baseline hash and writes a separate new candidate.
Canonical and hash-matched deployed sources keep every unrelated byte.
"""
import argparse
import ast
import hashlib
from pathlib import Path


def once(source, before, after):
    if source.count(before) != 1:
        raise ValueError('Expected exact R03 source anchor')
    return source.replace(before, after)


def transform_claude(source):
    tree = ast.parse(source)
    lines = source.splitlines(True)
    functions = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    tool = functions['_execute_tool']
    branch = next(n for n in ast.walk(tool) if isinstance(n, ast.If)
                  and ast.unparse(n.test) == "tool_name == 'manage_staff_schedule'")
    edits = [(branch.body[0].lineno - 1, branch.body[-1].end_lineno,
              '            # R03: legacy identity/history cannot authorize an A15 write.\n'
              '            result = staff_schedule_handoff()\n')]
    confirmation = functions['_schedule_confirmation_verified']
    edits.append((confirmation.lineno - 1, confirmation.end_lineno, ''))
    rounds = functions['_run_tool_uses']
    injected = next(n for n in ast.walk(rounds) if isinstance(n, ast.If)
                    and ast.unparse(n.test) == "tool_use.name == 'manage_staff_schedule'")
    edits.append((injected.lineno - 1, injected.end_lineno, ''))
    regex = next(n for n in tree.body if isinstance(n, ast.Assign)
                 and any(isinstance(t, ast.Name) and t.id == '_SCHEDULE_CONFIRM_RE' for t in n.targets))
    edits.append((regex.lineno - 1, regex.end_lineno, ''))
    for start, end, replacement in sorted(edits, reverse=True):
        lines[start:end] = [replacement]
    source = ''.join(lines)
    source = once(source, 'import canonical_staff_access\n',
                  'import canonical_staff_access\nfrom canonical_staff_schedule_entry import staff_schedule_handoff\n')
    source = once(source,
        '            "Предварительно показать или применить изменение живого графика мастера в YClients: "\n'
        '            "закрыть запись на день, сократить/изменить часы смены или поставить перерыв. "\n'
        '            "Первый вызов ВСЕГДА делай с apply=false и покажи владельцу мастера, дату и новые интервалы. "\n'
        '            "Только после отдельного явного подтверждения владельца вызывай повторно с apply=true. "\n'
        '            "Инструмент не переносит и не удаляет записи; при конфликте изменение блокируется."',
        '            "Открыть существующее подтверждение изменения графика в приложении MAYA. "\n'
        '            "Этот старый чат не меняет график: apply и подтверждение текстом не дают права записи. "\n'
        '            "Верни пользователю ссылку из результата; не объявляй изменение выполненным."')
    source = once(source,
        '                    "description": "false для предпросмотра; true только после отдельного подтверждения владельца",',
        '                    "description": "Устаревший параметр; не запускает изменение. Подтверждение доступно в приложении MAYA.",')
    start = source.index('УПРАВЛЕНИЕ ГРАФИКОМ:\n')
    end = source.index('\nНИКОГДА НЕ ПАСУЙ:', start)
    source = source[:start] + ('УПРАВЛЕНИЕ ГРАФИКОМ:\n'
        'Для изменения графика используй manage_staff_schedule и верни ссылку в MAYA.\n'
        'Предпросмотр и точное подтверждение выполняются после входа в приложение.\n'
        'apply и ответ «да» в этом старом чате не запускают изменение.\n'
        'Не объявляй график изменённым и не предлагай повторить старый вызов.\n') + source[end:]
    marker = '        raw = tool_result.get("content") if isinstance(tool_result, dict) else None\n'
    source = once(source, marker,
        '        if tool_use.name == "manage_staff_schedule":\n'
        '            # Stale preview/applied/error payloads cannot manufacture an A15 outcome.\n'
        '            return staff_schedule_handoff()["message"]\n' + marker)
    tree = ast.parse(source)
    terminal = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_schedule_terminal_text')
    loop = next(n for n in terminal.body if isinstance(n, ast.For))
    status = next(n for n in loop.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'status' for t in n.targets))
    lines = source.splitlines(True)
    lines[status.lineno - 1:loop.body[-1].end_lineno] = []
    result = ''.join(lines)
    ast.parse(result)
    return result


def transform_yclients(source):
    source = once(source, 'import requests\n',
                  'import requests\nfrom canonical_staff_schedule_entry import staff_schedule_handoff\n')
    source = once(source,
        '        """Preview or apply one safe schedule change for a staff member.\n\n'
        '        Supported actions: close_day, set_hours and set_break. Existing future\n'
        '        records are checked before the PUT and are never moved or deleted here.\n'
        '        """\n',
        '        """Read-only legacy preview; A15 owns every schedule mutation."""\n'
        '        if apply:\n'
        '            # R03: refuse before lookup, cache mutation or provider dispatch.\n'
        '            return staff_schedule_handoff()\n')
    source = once(source,
        '        if apply:\n'
        '            # Confirmation may arrive minutes after the preview; re-read live state.\n'
        '            self._clear_staff_day_caches(int(staff_id), date_str)\n', '')
    tree = ast.parse(source)
    function = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'change_staff_day_schedule')
    read_only = next(n for n in function.body if isinstance(n, ast.If) and ast.unparse(n.test) == 'not apply')
    lines = source.splitlines(True)
    lines[read_only.lineno - 1:function.end_lineno] = ['        return preview\n']
    result = ''.join(lines)
    ast.parse(result)
    return result


TRANSFORMS = {'claude_ai.py': transform_claude, 'yclients.py': transform_yclients}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name', choices=TRANSFORMS)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('sha256')
    args = parser.parse_args()
    data = args.source.read_bytes()
    assert hashlib.sha256(data).hexdigest() == args.sha256, 'Unexpected source baseline'
    assert args.output.resolve() != args.source.resolve()
    result = TRANSFORMS[args.name](data.decode())
    with args.output.open('x') as output:
        output.write(result)
    print(hashlib.sha256(result.encode()).hexdigest())
