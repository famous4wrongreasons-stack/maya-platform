"""Read exact functions; run real signed auth/import/SQLite write on owned fixture only."""
import ast,asyncio,contextlib,datetime,hashlib,hmac,json,socket,sqlite3,sys,tempfile,time,types
from pathlib import Path
root=Path(sys.argv[1]);sys.path.insert(0,str(root/'ai администратор'))
socket.socket.connect=lambda *_a,**_k: (_ for _ in ()).throw(AssertionError('Live network forbidden'))
from test_chat_routing import _load_webhook_server
ws=_load_webhook_server(); synthetic_owner=900000001; synthetic_token='b34-synthetic-widget-secret'
sys.modules['config'].FOUNDER_IDS=[synthetic_owner];ws.TELEGRAM_TOKEN=synthetic_token;ws.database.is_admin=lambda _id:False
ws._cabinet_response=lambda data,status=200:{'data':data,'status':status}
sys.modules['legacy_client_command_bridge'].command=lambda *_a,**_k: (_ for _ in ()).throw(AssertionError('Unexpected canonical bridge call'))
ws.reputation.__dict__.update({'hashlib':hashlib,'database':ws.database,'anonymizer':types.SimpleNamespace(redact_pii=lambda text:text),'_SOURCES':{'yandex':'synthetic','2gis':'synthetic'}})
ws.reputation.reputation_snapshot=lambda **_: {'projection':'synthetic; excluded from writer proof'}
source_hashes={}
def functions(filename,names,env):
 source=(root/'ai администратор'/filename).read_text();tree=ast.parse(source)
 nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
 assert len(nodes)==len(names)
 source_hashes[filename]={n.name:hashlib.sha256(ast.get_source_segment(source,n).encode()).hexdigest() for n in nodes}
 exec(compile(ast.Module(body=nodes,type_ignores=[]),filename,'exec'),env)
functions('reputation.py',['_float','import_reviews'],ws.reputation.__dict__)
ws.database.__dict__.update({'contextmanager':contextlib.contextmanager,'sqlite3':sqlite3,'datetime':datetime.datetime})
# Load the real connection helper only after supplying its standard-library globals.
functions('database.py',['_db','_now','_external_reviews_ensure','upsert_external_review'],ws.database.__dict__)
functions('webhook_server.py',['panel_external_reviews_import_handler','_panel_auth','_panel_resolve_role','_verify_telegram_login_widget'],ws.__dict__)
class Request:
 headers={};app={}
 def __init__(self,body):self.body=body
 async def json(self):return self.body

def auth(owner):
 fields={'id':owner,'auth_date':int(time.time()),'first_name':'Synthetic'}
 material='\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
 fields['hash']=hmac.new(hashlib.sha256(synthetic_token.encode()).digest(),material.encode(),hashlib.sha256).hexdigest()
 return fields

async def run():
 with tempfile.TemporaryDirectory(prefix='b34-review-proof-',dir='/tmp/maya-b33-owned-20260906') as owned:
  ws.database.DB_PATH=str(Path(owned)/'reviews.sqlite');outcomes=[]
  async def submit(rating,text,credentials):
   return await ws.panel_external_reviews_import_handler(Request({'auth_data':credentials,'source':'yandex','reviews':[{'id':'synthetic-review-1','rating':rating,'text':text,'published_at':'2026-09-06'}]}))
  denied=await submit(5,'original synthetic review',{});assert denied['status']==401
  denied_role=await submit(5,'original synthetic review',auth(synthetic_owner+1));assert denied_role['status']==403
  assert not Path(ws.database.DB_PATH).exists()
  for label,rating,text in [('first',5,'original synthetic review'),('same',5,'original synthetic review'),('changed',1,'changed synthetic review')]:
   response=await submit(rating,text,auth(synthetic_owner));assert response['status']==200 and response['data']['ok']
   with sqlite3.connect(ws.database.DB_PATH) as db:
    db.row_factory=sqlite3.Row;rows=[dict(x) for x in db.execute('SELECT id,source,external_id,rating,review_text FROM external_reviews')]
    columns=[x[1] for x in db.execute('PRAGMA table_info(external_reviews)')]
   assert len(rows)==1
   outcomes.append({'request':label,'http':response['status'],'created':response['data']['import']['new'],'rows':rows})
  assert outcomes[0]['rows']==outcomes[1]['rows']
  assert outcomes[2]['rows'][0]['id']==outcomes[0]['rows'][0]['id']
  assert outcomes[2]['rows'][0]['review_text']!=outcomes[0]['rows'][0]['review_text']
  assert 'tenantId' not in columns and 'tenant_id' not in columns
  result={'blocker':'B34 / reduced A27','sourceHashes':source_hashes,'unauthenticated':401,'signedNonOwner':403,'signedOwnerSameSourceIdentity':outcomes,'tenantColumn':False,'changedEvidenceUnderSameSourceIdentity':'overwrites original row, HTTP 200; no conflict','canonicalReviewFactCalls':0,'canonicalActionExecutionCalls':0,'providerWrites':0,'networkCalls':0,'productionBusinessMutations':0,'limits':'Actual handler, widget verifier, founder-role resolver, import normalizer and SQLite writer. Synthetic founder config, empty admin registry, anonymizer for non-PII fixture, response projection and Request envelope. No HTTP server, production DB, provider or canonical backend invoked.'}
 print(json.dumps(result,indent=2))
asyncio.run(run())
