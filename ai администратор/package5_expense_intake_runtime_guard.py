"""R13 permanent B37 writer/source/reminder/report ratchet."""
import ast
from package5_wave_rc_guard_contracts import contract
import re
from pathlib import Path

def overlay():
    return contract("r13")


def scan(root,overrides=None):
    root=Path(root);sources={p.name:p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_','package5_'))};sources.update(overrides or {});errors=[]
    for filename,bodies in overlay().BODIES.items():
        nodes={n.name:n for n in ast.parse(sources[filename]).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
        for name,body in bodies.items():
            if name not in nodes or ast.dump(nodes[name])!=ast.dump(ast.parse(body).body[0]):errors.append(filename+': changed expense boundary '+name)
    retired={'add_salon_expense','get_salon_expenses','sum_salon_expenses','clear_salon_expenses','_save_anton_expenses','_parse_anton_expenses','_anton_expense_reminder_job','_anton_expense_awaiting','DAILY_EXTRA_EXPENSES'}
    for filename,source in sources.items():
        for node in ast.walk(ast.parse(source)):
            if isinstance(node,ast.Constant) and isinstance(node.value,str) and re.search(r'\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|SELECT[\s\S]+?FROM|(?:CREATE|ALTER)\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["`]?salon_expenses\b',node.value,re.I):errors.append(filename+': legacy expense SQL')
            if isinstance(node,ast.Attribute) and node.attr in retired:errors.append(filename+': retired expense helper')
            if isinstance(node,ast.Name) and node.id in retired:errors.append(filename+': retired indirect expense state/call')
    bridge=sources.get('canonical_expense_intake.py','')
    for node in ast.walk(ast.parse(bridge)):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Name) and node.func.value.id=='requests' and node.func.attr in {'post','get'}:
            expected='/api/internal/expense-intake/source' if node.func.attr=='post' else '/api/expense-intake/report-period'
            if not node.args or not isinstance(node.args[0],ast.Constant) or not str(node.args[0].value).endswith(expected):errors.append('expense bridge owns unapproved endpoint')
    if re.search(r'sqlite|\.execute\(|complete_text|send_message|send_document|asyncio\.create_task|while True',bridge):errors.append('expense initiator owns business/model/background effect')
    web=sources['webhook_server.py'];node=next(n for n in ast.parse(web).body if isinstance(n,ast.FunctionDef) and n.name=='_daily_report');body=ast.get_source_segment(web,node)
    for marker in ["expense_projection = expense_report(date_iso)","salon_exp_total = expense_projection['total']",'salon_exp_total is not None','"salon_expenses": expense_projection']:
        if marker not in body:errors.append('canonical expense projection/incompleteness missing')
    return errors

if __name__=='__main__':
    import json,sys
    errors=scan(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent);print(json.dumps({'package':'R13','result':'FAIL' if errors else 'PASS','errors':errors}));sys.exit(bool(errors))
