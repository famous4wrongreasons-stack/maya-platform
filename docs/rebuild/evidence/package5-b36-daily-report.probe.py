"""Fresh-gate probe: source extraction, synthetic recipients/report/provider, no I/O."""
import ast,asyncio,hashlib,json,logging,sys,types
from pathlib import Path
from unittest.mock import patch
ROOT=Path(sys.argv[1]).resolve()
SOURCE_META=json.loads(ROOT.read_text()) if ROOT.is_file() else {}
def source_text(filename):
 if not SOURCE_META:return (ROOT/filename).read_text()
 return '\n\n'.join(v['source'] for k,v in SOURCE_META.items() if k.split(':')[0]==filename)+'\n'
trace=[];attempts=[];mode='accepted';sources={}
def extract(filename,names,scope):
 text=source_text(filename);tree=ast.parse(text);nodes=[]
 for n in tree.body:
  if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names:
   sources[filename+':'+n.name]={'line':SOURCE_META.get(filename+':'+n.name,{}).get('line',n.lineno),'sha256':hashlib.sha256(ast.get_source_segment(text,n).encode()).hexdigest()}
   n.returns=None
   for a in n.args.args:n.args.args[n.args.args.index(a)].annotation=None
   nodes.append(n)
 assert len(nodes)==len(names)
 exec(compile(ast.Module(body=nodes,type_ignores=[]),filename,'exec'),scope)
 return scope
async def observed(**kw):trace.append('post-send-shadow')
async def canonical(**kw):
 trace.append('canonical-bridge-unavailable')
 raise ConnectionError('synthetic canonical bridge unavailable')
bridge=types.SimpleNamespace(observe_legacy_telegram_send=observed,publish_inbox_item=canonical)
class Bot:
 async def send_message(self,*a,**kw):
  attempts.append({'recipient':'synthetic-owner','outcome':'accepted-then-lost' if mode=='unknown' else 'accepted'})
  trace.append('provider-send')
  if mode=='unknown':raise TimeoutError('synthetic provider accepted; response lost')
  return types.SimpleNamespace(message_id=len(attempts))
logger=logging.getLogger('b36-probe');logger.addHandler(logging.NullHandler());logger.propagate=False
scope=extract('webhook_server.py',{'install_staff_telegram_chat_mirror','_send_client_push'},dict(asyncio=asyncio,logger=logger,_TELEGRAM_CHAT_MIRROR_BOT_IDS=set(),_COMMUNICATION_SHADOW_TASKS=set(),_is_staff_chat_recipient=lambda _:False))
webhook=types.SimpleNamespace(_daily_report=lambda _:{'cash':{'count':0,'sum':0},'card':{'count':0,'sum':0},'total_gross':0},_send_client_push=scope['_send_client_push'])
database=types.SimpleNamespace(list_admins=lambda:[7],set_setting=lambda *a:trace.append('local-report-timestamp'))
job=extract('bot.py',{'_daily_report_job','_fmt_rub'},dict(asyncio=asyncio,logger=logger,database=database))['_daily_report_job']
async def run():
 global mode
 bot=Bot();assert scope['install_staff_telegram_chat_mirror'](bot)
 app=types.SimpleNamespace(bot=bot);cases=[]
 for name,value,n in [('first','accepted',1),('identical-repeat','accepted',1),('concurrent-same-date','accepted',4),('accepted-response-lost','unknown',1),('repeat-after-unknown','accepted',1)]:
  mode=value;start=len(attempts);trace.clear()
  await asyncio.gather(*(job(app) for _ in range(n)));await asyncio.sleep(0)
  seq=list(trace);assert len(attempts)-start==n,(name,attempts)
  assert seq.index('provider-send')<seq.index('canonical-bridge-unavailable')
  cases.append({'case':name,'providerOperations':len(attempts)-start,'firstProviderBeforeCanonical':True,'canonicalBridgeUnavailable':True,'trace':seq})
 return cases
with patch.dict(sys.modules,{'webhook_server':webhook,'maya_inbox_bridge':bridge,'telegram':types.SimpleNamespace(InlineKeyboardButton=lambda *a,**k:None,InlineKeyboardMarkup=lambda *a,**k:None)}),patch('socket.create_connection',side_effect=AssertionError('network forbidden')):
 cases=asyncio.run(run())
print(json.dumps({'status':'REPRODUCED','boundary':'A12 daily report producer outside Action Engine / Communication Delivery','sourceFunctions':sources,'cases':cases,'syntheticProviderOperations':len(attempts),'canonicalAdmissionsBeforeFirstSend':0,'productionMessages':0,'productionBusinessProviderMutations':0,'limitations':['Report builder, admin recipient source and bridge availability are explicit fixtures.','Actual daily report producer, formatter, installed post-send mirror and retired push helper are executed.','No live SDK, database, business endpoint or real recipient is used.']},indent=2))
