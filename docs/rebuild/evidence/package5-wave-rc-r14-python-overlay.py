"""R14 bounded legacy cash writer/read reconciliation removal."""
import ast
from pathlib import Path


def replace(source,name,replacement):
    nodes=[n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name]
    if len(nodes)!=1:raise ValueError('R14 exact base function required '+name)
    node=nodes[0];lines=source.splitlines(keepends=True)
    result=''.join(lines[:node.lineno-1])+replacement.strip()+'\n\n'+''.join(lines[node.end_lineno:]);ast.parse(result);return result


def transform(name,source):
    if name=='bot.py':
        source=replace(source,'cmd_kassa','''async def cmd_kassa(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from canonical_cash_declaration import confirmation_handoff
    await update.effective_message.reply_text(confirmation_handoff())''')
    elif name=='database.py':
        source=replace(source,'set_cash_log','''def set_cash_log(date: str, total_till: int, day_cash: int, entered_by=None) -> None:
    raise PermissionError('canonical_cash_declaration_confirmation_required')''')
        source=replace(source,'get_cash_log','''def get_cash_log(date: str) -> dict | None:
    # Legacy history remains an archive, never a current verified observation.
    return None''')
    elif name=='webhook_server.py':
        tree=ast.parse(source);node=next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name=='_daily_report')
        start=next(n for n in node.body if isinstance(n,ast.Try) and 'database.get_cash_log' in ast.unparse(n))
        end=next(n for n in node.body if isinstance(n,ast.If) and isinstance(n.test,ast.Name) and n.test.id=='_cl')
        lines=source.splitlines(keepends=True)
        source=''.join(lines[:start.lineno-1])+"    # R14: this legacy report has no confirmed canonical branch scope.\n    cash_reported = None\n    from canonical_cash_declaration import report_unavailable\n    cash_declaration = report_unavailable()\n"+''.join(lines[end.end_lineno:])
        owned=source[source.index('def _daily_report('):]
        old='"cash_reported": cash_reported,'
        if owned.count(old)!=1:raise ValueError('R14 exact cash report projection required')
        source=source.replace(old,old+'\n        "cash_declaration": cash_declaration,',1)
    else:raise ValueError('R14 unknown artifact')
    ast.parse(source);return source


def apply(directory,helper):
    directory=Path(directory)
    staged={name:transform(name,(directory/name).read_text()) for name in ['bot.py','database.py','webhook_server.py']}
    for name,content in staged.items():(directory/name).write_text(content)
    (directory/'canonical_cash_declaration.py').write_text(Path(helper).read_text())


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('helper');args=p.parse_args();apply(args.directory,args.helper)
