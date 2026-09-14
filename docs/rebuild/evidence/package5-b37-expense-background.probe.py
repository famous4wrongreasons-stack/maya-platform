"""Execute selected exact deployed functions locally with synthetic transports and SQLite :memory:."""
import ast,asyncio,hashlib,json,sqlite3,sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

source=json.loads(Path(sys.argv[1]).read_text())
assert source['registeredInSource'] and source['service']['expenseJobRegisteredAtCurrentStart']
assert source['service']['ActiveState']=='active'
log=SimpleNamespace(error=lambda *args:None)
messages=[]; replies=[]; awaiting=set(); timeout=False
async def send_message(**kwargs):
    assert kwargs['chat_id']==101010 # synthetic, no production recipient loaded
    messages.append('synthetic-effect')
    if timeout: raise TimeoutError('synthetic response lost after boundary')
async def reply_text(*args,**kwargs): replies.append('synthetic-reply')
conn=sqlite3.connect(':memory:')
conn.execute('CREATE TABLE salon_expenses(id INTEGER PRIMARY KEY, date TEXT,item TEXT,amount INTEGER,source TEXT,created_at TEXT)')
db_globals={'_db':lambda:conn,'_now':lambda:'synthetic','__builtins__':__builtins__}
code_globals={'Application':object,'Update':object,'ContextTypes':SimpleNamespace(DEFAULT_TYPE=object),'ANTON_CHAT_ID':101010,'_anton_expense_awaiting':awaiting,'logger':log,'asyncio':asyncio,'date':date,'_parse_anton_expenses':lambda text:[{'item':'synthetic supplies','amount':500}],'_fmt_rub_spaces':str,'__builtins__':__builtins__}
executed={}
for key in ['database.py:add_salon_expense','database.py:clear_salon_expenses','bot.py:_save_anton_expenses','bot.py:_anton_expense_reminder_job','bot.py:handle_message','bot.py:cmd_rashod']:
    item=source['functions'][key]; assert hashlib.sha256(item['source'].encode()).hexdigest()==item['sha256']
    tree=ast.parse(item['source']);assert len(tree.body)==1
    exec(compile(tree,'exact-production:'+key,'exec'),db_globals if key.startswith('database') else code_globals)
    executed[key]=item['sha256']
code_globals['database']=SimpleNamespace(add_salon_expense=db_globals['add_salon_expense'],clear_salon_expenses=db_globals['clear_salon_expenses'])
async def irrelevant(*args): raise AssertionError('unexpected normal chat route')
code_globals['process_message']=irrelevant
app=SimpleNamespace(bot=SimpleNamespace(send_message=send_message))
update=SimpleNamespace(effective_user=SimpleNamespace(id=101010),message=SimpleNamespace(text='synthetic supplies 500',reply_text=reply_text))
async def main():
    global timeout
    job=code_globals['_anton_expense_reminder_job']
    await job(app); await job(app)
    await asyncio.gather(job(app),job(app))
    awaiting.clear();timeout=True;await job(app);unknownHasDurableReceipt=False;assert not awaiting
    timeout=False;await job(app)
    assert len(messages)==6
    await code_globals['handle_message'](update,None)
    assert conn.execute('SELECT count(*) FROM salon_expenses').fetchone()[0]==1
    await code_globals['_save_anton_expenses'](update,'same synthetic input')
    rows=conn.execute('SELECT count(*) FROM salon_expenses').fetchone()[0];assert rows==2
    update.message.text='/rashod'
    await code_globals['cmd_rashod'](update,None)
    deleted=rows-conn.execute('SELECT count(*) FROM salon_expenses').fetchone()[0];assert deleted==2
    print(json.dumps({'status':'CONFIRMED_BLOCKER','executedFunctionHashes':executed,'cases':{'firstAndRepeatedAndConcurrentAndLostResponseRetry':{'syntheticTelegramEffects':len(messages),'canonicalAdmissionCalls':0,'canonicalUserMembershipAuthIdentityBindings':0,'durableUnknownReceipt':unknownHasDurableReceipt},'replyAfterReminder':{'legacyExpenseRowsAfterRepeatedInput':rows,'canonicalExpenseActions':0,'tenantQualification':False},'rashodWithoutCanonicalAuthority':{'deletedSyntheticPeriodRows':deleted}},'newDatabase':'SQLite :memory: only; closed after proof','oldDatabasesTouched':0,'productionMessages':0,'productionBusinessProviderMutations':0},indent=2))
try:asyncio.run(main())
finally:conn.close()
