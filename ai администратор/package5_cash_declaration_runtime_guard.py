"""R14 guard of all legacy SQL writers and the complete inventoried producer bodies."""
import ast
import re
from pathlib import Path


def functions(source):
    return {n.name:n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}


def calls(node):
    return {ast.unparse(n.func) for n in ast.walk(node) if isinstance(n,ast.Call)}


def scan(root,overrides=None):
    sources={p.name:p.read_text() for p in Path(root).glob('*.py') if not p.name.startswith(('test_','package5_cash_declaration_runtime_guard'))}
    sources.update(overrides or {});errors=[]
    for filename,source in sources.items():
        for n in ast.walk(ast.parse(source)):
            if isinstance(n,ast.Constant) and isinstance(n.value,str) and re.search(r'\b(?:INSERT(?:\s+OR\s+REPLACE)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?cash_log\b',n.value,re.I):
                errors.append(filename+': legacy cash SQL writer')
    bot=functions(sources['bot.py'])['cmd_kassa']
    if calls(bot)!={'confirmation_handoff','update.effective_message.reply_text'}:errors.append('kassa is not a pure confirmation handoff')
    database=functions(sources['database.py'])
    writer=database['set_cash_log'];reader=database['get_cash_log']
    if len(writer.body)!=1 or not isinstance(writer.body[0],ast.Raise) or calls(writer)!={'PermissionError'}:errors.append('cash writer not retired')
    if len(reader.body)!=1 or not isinstance(reader.body[0],ast.Return) or not isinstance(reader.body[0].value,ast.Constant) or reader.body[0].value.value is not None:errors.append('legacy cash reader authoritative')
    report=ast.unparse(functions(sources['webhook_server.py'])['_daily_report'])
    if any(term in report for term in ['get_cash_log','day_cash','_cash_received','_cash_expected','reconciled = True']):errors.append('legacy cash report authority or false reconciliation')
    if 'cash_reported = None' not in report or 'cash_declaration = report_unavailable()' not in report:errors.append('missing honest canonical unavailable projection')
    helper=ast.parse(sources['canonical_cash_declaration.py'])
    if any(isinstance(n,(ast.Call,ast.Import,ast.ImportFrom,ast.With,ast.AsyncWith)) for n in ast.walk(helper)):errors.append('cash handoff acquired execution/IO')
    return errors


if __name__=='__main__':
    import json,sys
    result=scan(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent)
    print(json.dumps({'package':'R14','result':'FAIL' if result else 'PASS','errors':result}));sys.exit(bool(result))
