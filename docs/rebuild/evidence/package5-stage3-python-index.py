"""Offline scheduling-mechanic index of acquired, redacted Python source."""
import ast
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
out = {'method': 'AST only; no application imports or function evaluation', 'files': [], 'sites': []}
pattern = re.compile(r'(^|\.)(add_job|scheduled_job|create_task|ensure_future|run_in_executor|run_repeating|run_daily|call_later|call_at|call_soon|Timer|Thread|Process|sleep|Popen|run_pending|run_forever|run_polling|start_webhook_server|run_webhook_only_fallback|system|popen)$|Scheduler$|CronTrigger$|IntervalTrigger$')


class Visitor(ast.NodeVisitor):
    def __init__(self, name):
        self.name, self.owner = name, '<module>'

    def row(self, node, kind, expression):
        out['sites'].append({'file': self.name, 'line': node.lineno,
                             'owner': self.owner, 'kind': kind, 'expression': expression[:1000]})

    def visit_FunctionDef(self, node):
        previous = self.owner
        self.owner = node.name if previous == '<module>' else previous + '.' + node.name
        for d in node.decorator_list:
            if re.search('schedul|cron|period|repeat|task', ast.unparse(d), re.I):
                self.row(d, 'decorator', ast.unparse(d))
        self.generic_visit(node)
        self.owner = previous

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Call(self, node):
        call = ast.unparse(node.func)
        if pattern.search(call):
            # All values here are code in already redacted source, not runtime data.
            self.row(node, 'call', ast.unparse(node))
        self.generic_visit(node)

    def visit_While(self, node):
        self.row(node, 'loop', 'while ' + ast.unparse(node.test))
        self.generic_visit(node)


for p in sorted(root.glob('*.py')):
    source = p.read_text()
    try:
        tree = ast.parse(source)
        error = None
    except SyntaxError as e:
        error = str(e)
    out['files'].append({'file': p.name, 'redactedSourceSha256': hashlib.sha256(source.encode()).hexdigest(), 'parseError': error})
    if error is None:
        Visitor(p.name).visit(tree)
print(json.dumps(out, ensure_ascii=False, indent=2))
