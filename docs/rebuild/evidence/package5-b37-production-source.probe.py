"""Read-only source/launcher metadata; never imports app code or opens a DB."""
import ast,hashlib,json,subprocess,datetime,re
from pathlib import Path
root=Path('/home/botadmin/barbershop-bot')
selected={'bot.py':{'_anton_expense_reminder_job','handle_message','_save_anton_expenses','cmd_rashod'},'database.py':{'add_salon_expense','clear_salon_expenses'}}
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionMessages':0,'productionBusinessMutations':0,'inspection':'read-only source/launcher metadata','release':str(Path('/opt/maya-saas/current').resolve()),'functions':{},'sourceHashes':{}}
for name,names in selected.items():
 p=root/name;source=p.read_text();tree=ast.parse(source);result['sourceHashes'][name]=hashlib.sha256(p.read_bytes()).hexdigest()
 for n in tree.body:
  if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names:
   segment=ast.get_source_segment(source,n)
   result['functions'][name+':'+n.name]={'line':n.lineno,'sha256':hashlib.sha256(segment.encode()).hexdigest(),'source':segment,'calls':sorted({ast.unparse(x.func) for x in ast.walk(n) if isinstance(x,ast.Call)})}
 if name=='bot.py':
  result['registeredInSource']=any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='add_job' and n.args and ast.unparse(n.args[0])=='_anton_expense_reminder_job' for n in ast.walk(tree))
  resolver=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_bot_anton_chat_id')
  result['recipientResolver']={'line':resolver.lineno,'sha256':hashlib.sha256(ast.get_source_segment(source,resolver).encode()).hexdigest(),'readsLegacySetting':any(isinstance(n,ast.Call) and ast.unparse(n.func)=='database.get_setting' for n in ast.walk(resolver)),'hasNumericFallback':any(isinstance(n,ast.Return) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,int) for n in ast.walk(resolver))}
state={k:subprocess.check_output(['systemctl','show','barbershop-bot','-p',k,'--value'],text=True).strip() for k in ['MainPID','ActiveState','ActiveEnterTimestamp']}
logs=subprocess.check_output(['sudo','-n','journalctl','-u','barbershop-bot','--since',state['ActiveEnterTimestamp'],'--no-pager','-o','json'],text=True)
messages=[json.loads(line).get('MESSAGE','') for line in logs.splitlines() if line.startswith('{')]
state['expenseJobRegisteredAtCurrentStart']=any(isinstance(m,str) and 'Added job "_anton_expense_reminder_job"' in m for m in messages)
state['schedulerStarted']=any(isinstance(m,str) and 'Scheduler started' in m for m in messages)
result['service']=state
print(json.dumps(result,ensure_ascii=False,indent=2))
