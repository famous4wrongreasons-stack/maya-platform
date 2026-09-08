"""Exact B37 source/ledger/report retirement for both inventoried Python variants."""
import ast
import re
from pathlib import Path

BODIES={
 'bot.py': {
 '_parse_anton_expenses': "def _parse_anton_expenses(*args, **kwargs):\n    raise PermissionError('canonical_expense_card_validation_required')",
 '_save_anton_expenses': "async def _save_anton_expenses(*args, **kwargs):\n    raise PermissionError('confirmed_P407_expense_owner_required')",
 '_anton_expense_reminder_job': "async def _anton_expense_reminder_job(*args, **kwargs):\n    raise PermissionError('ExpenseReminderRun_A13_owner_required')",
 'cmd_rashod': "async def cmd_rashod(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    from canonical_expense_intake import initiate\n    await initiate(update)",
 'handle_message': "async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    from canonical_expense_intake import expense_reply, initiate\n    if expense_reply(update.effective_message):\n        await initiate(update)\n        return\n    await process_message(update, context, update.message.text)",
 },
 'database.py': {name:f"def {name}(*args, **kwargs):\n    raise PermissionError('canonical_P407_expense_owner_required')" for name in ['add_salon_expense','get_salon_expenses','sum_salon_expenses','clear_salon_expenses']},
 'webhook_server.py':{},
}

def transform(name,source):
    if name not in BODIES:raise ValueError('R13 unexpected file')
    for function,replacement in BODIES[name].items():
        nodes=[n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==function]
        if len(nodes)!=1:raise ValueError('Exact B37 function required: '+function)
        n=nodes[0];lines=source.splitlines(keepends=True);source=''.join(lines[:n.lineno-1])+replacement+'\n\n'+''.join(lines[n.end_lineno:])
    if name=='bot.py':
        tree=ast.parse(source);ranges=[]
        for n in ast.walk(tree):
            if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='add_job' and any(isinstance(a,ast.Name) and a.id=='_anton_expense_reminder_job' for a in n.value.args):ranges.append((n.lineno,n.end_lineno))
            if isinstance(n,(ast.Assign,ast.AnnAssign)) and '_anton_expense_awaiting' in ast.get_source_segment(source,n):ranges.append((n.lineno,n.end_lineno))
        if len(ranges)!=2:raise ValueError('Exact old reminder registration/state required')
        lines=source.splitlines(keepends=True)
        for lo,hi in sorted(ranges,reverse=True):lines[lo-1:hi]=[]
        source=''.join(lines)
    elif name=='database.py':
        source,count=re.subn(r'            -- Расходы по салону, которые присылает ассистент Антон.*?ON salon_expenses \(date\);\n','            -- R13: legacy expense DDL retired; historical rows are never migrated.\n',source,count=1,flags=re.S)
        if count!=1:raise ValueError('Exact old expense DDL required')
    else:
        source=source.replace('    "native_feedback_invitation",','    "native_feedback_invitation",\n    "weekly_expense_reminder",',1)
        source,count=re.subn(r'# Дополнительные расходы — учитываем КАЖДЫЙ день.*?DAILY_EXTRA_EXPENSES = \[.*?\]\n','# R13: unconfirmed fixed daily expense constants retired.\n',source,count=1,flags=re.S)
        if count!=1:raise ValueError('Exact fixed expense constants required')
        start=source.index('    # ── Дополнительные расходы (каждый день) ──');end=source.index('    # Предварительная выплата за неделю',start)
        source=source[:start]+'''    # R13: canonical recorded Expense totals and explicit period declaration.
    from canonical_expense_intake import expense_report
    expense_projection = expense_report(date_iso)
    salon_exp_items = expense_projection['items']
    salon_exp_total = expense_projection['total']
    expenses_total = (salary_total_val + anton_total + salon_exp_total
                      if salon_exp_total is not None and anton_total is not None else None)

'''+source[end:]
        source=source.replace('        "extra": extra_total,                     # − фикс. доп.расходы\n','')
        source=source.replace('        "extra_expenses": {"items": extra_items, "total": extra_total},','        "extra_expenses": {"items": [], "total": None, "source": "retired_fixed_constants"},')
        source=source.replace('        "salon_expenses": {"items": salon_exp_items, "total": salon_exp_total},','        "salon_expenses": expense_projection,')
        old='rep = await asyncio.to_thread(_daily_report, d)'
        if source.count(old)!=1:raise ValueError('Exact daily read invocation required')
        source=source.replace(old,'rep = await asyncio.to_thread(canonical_staff_access.synchronous_request_callback(lambda: _daily_report(d)))')
    ast.parse(source)
    return source

def apply(directory,helper):
    directory=Path(directory);changed={name:transform(name,(directory/name).read_text()) for name in BODIES}
    for name,source in changed.items():(directory/name).write_text(source)
    (directory/'canonical_expense_intake.py').write_text(Path(helper).read_text())

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('helper');a=p.parse_args();apply(a.directory,a.helper)
