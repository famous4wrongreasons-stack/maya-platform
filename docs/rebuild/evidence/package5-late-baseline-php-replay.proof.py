"""Pure PHP header equivalence/parser proof and read-only archived patch validation.
No application execution: only the extracted idempotency helper is evaluated.
Full PHP relay sources are passed to syntax-only lint. No remote files are written.
"""
from pathlib import Path
import argparse,base64,datetime,hashlib,json,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--output-directory',required=True);parser.add_argument('--repository',default='/tmp/maya-b29-contour');args=parser.parse_args()
s=Path(args.output_directory).resolve();s.mkdir(parents=True,exist_ok=True);r=Path(args.repository).resolve()
ref='60e8266473882fac12fca7fe4181b6e5344b29ce'
files=['maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php','сайт и приложение/maya-native-api.php']
sha=lambda v:hashlib.sha256(v).hexdigest()
cases=[]
values=[None,'','opaque-booking-123',' different ','0',0,False,True,[],['x'],'a\r\nb','a\nb','ключ:α','x'*4097]
for value in values:
 for fallback in values:
  for key in ['Idempotency-Key','idempotency-key','IDEMPOTENCY-KEY']:
   cases.append({'headers':{key:value},'server':{'HTTP_IDEMPOTENCY_KEY':fallback}})
for value in values:
 cases.extend([{'headers':{'Idempotency-Key':value},'server':{}},{'headers':{},'server':{'HTTP_IDEMPOTENCY_KEY':value}},{'headers':{'Idempotency-Key':value,'idempotency-key':value},'server':{}}])
cases.append({'headers':{},'server':{}})
requests=[];sources=[]
for i,file in enumerate(files):
 old=subprocess.check_output(['git','-C',str(r),'show',ref+':'+file]);new=(r/file).read_bytes()
 for version,source in [('old',old),('new',new)]:
  text=source.decode();start=text.index('function maya_forwarded_idempotency_key(');end=text.index('\ntry {',start);helper=text[start:end]
  sources.append({'file':file,'version':version,'sourceSha256':sha(source),'helperSha256':sha(helper.encode())})
  literal=base64.b64encode(json.dumps(cases,ensure_ascii=False).encode()).decode()
  fixture=('<?php\n'+helper+'\n$cases=json_decode(base64_decode(\''+literal+'\'),true);$out=[];foreach($cases as $case){try{$out[]=[\'value\'=>maya_forwarded_idempotency_key($case[\'headers\'],$case[\'server\'])];}catch(InvalidArgumentException $e){$out[]=[\'error\'=>$e->getMessage()];}} echo json_encode($out);').encode()
  for php in (['8.4'] if version=='old' else ['8.4','5.6']):requests.append({'label':f'{i}-{version}-helper-{php}','php':php,'mode':'execute-pure-helper','source':base64.b64encode(fixture).decode()})
  for php in ['5.6','8.4']:requests.append({'label':f'{i}-{version}-lint-{php}','php':php,'mode':'lint','source':base64.b64encode(source).decode()})
remote="""import base64,json,subprocess
requests=REQUESTS
out={}
for x in requests:
 args=['/usr/local/bin/php'+x['php'],'-n']+(['-l'] if x['mode']=='lint' else [])
 p=subprocess.run(args,input=base64.b64decode(x['source']),capture_output=True,timeout=20)
 out[x['label']]={'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode()}
print(json.dumps(out))
""".replace('REQUESTS',repr(requests))
p=subprocess.run(['ssh','-i','/Users/stanislavmosin/.ssh/beget_deploy','-o','BatchMode=yes','-o','ConnectTimeout=20','mocine3388@prime.beget.com','python3 -'],input=remote.encode(),capture_output=True,timeout=100)
assert p.returncode==0,p.stderr.decode();out=json.loads(p.stdout);(s/'php-raw-results.json').write_text(json.dumps(out,indent=2)+'\n')
checks=[]
for i,file in enumerate(files):
 arrays=[json.loads(out[f'{i}-{version}-helper-{php}']['stdout']) for version,php in [('old','8.4'),('new','8.4'),('new','5.6')]]
 assert arrays[0]==arrays[1]==arrays[2],file
 for index,case in enumerate(cases):
  got=arrays[0][index];headers=case['headers'];server=case['server'];vals=list(headers.values())
  if len(vals)>1:expected={'error':'ambiguous_idempotency_key'}
  else:
   value=vals[0] if vals and vals[0] is not None else server.get('HTTP_IDEMPOTENCY_KEY')
   if value is not None and (not isinstance(value,str) or value=='' or '\r' in value or '\n' in value):expected={'error':'invalid_idempotency_key'}
   elif vals and server.get('HTTP_IDEMPOTENCY_KEY') is not None and (type(server['HTTP_IDEMPOTENCY_KEY'])!=type(value) or server['HTTP_IDEMPOTENCY_KEY']!=value):expected={'error':'ambiguous_idempotency_key'}
   else:expected={'value':value}
  assert got==expected,(file,index)
 for version,php in [('old','8.4'),('new','8.4'),('new','5.6')]:assert out[f'{i}-{version}-lint-{php}']['exit']==0
 assert out[f'{i}-old-lint-5.6']['exit']!=0
 checks.append({'file':file,'cases':len(cases),'sameOld84New84New56':True,'expectedContractCasesPass':True,'newLint56And84':'PASS','oldLint56NegativeControl':'EXPECTED_PARSE_FAILURE'})
patches=[]
manifest=json.loads((r/'docs/rebuild/evidence/package5-wave-ra-r01-overlay-manifest.json').read_text())
for row in manifest['overlays']:
 if row['kind']!='relay':continue
 old=subprocess.check_output(['git','-C',str(r),'show',ref+':'+row['patch']]);new=(r/row['patch']).read_bytes()
 entries={}
 for version,body in [('old',old),('new',new)]:
  p=subprocess.run(['git','apply','--unidiff-zero','--numstat','-'],cwd=s,input=body,capture_output=True)
  entries[version]={'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode(),'sha256':sha(body)}
 assert entries['old']['exit']==0 and entries['new']['exit']!=0
 check=subprocess.run(['git','apply','--unidiff-zero','--check','-'],cwd=s,input=new,capture_output=True)
 assert check.returncode!=0 and b'patch fragment without header' in check.stderr
 patches.append({'documentedApplyCheck':{'exit':check.returncode,'stderr':check.stderr.decode(),'writes':0},'file':row['patch'],'target':row['target'],'parser':entries,'manifestCandidateSha256':row['candidateSha256'],'currentSourceSha256':sha((r/row['repositorySource']).read_bytes()),'documentedCommand':manifest['patchFormat']})
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtimeCompatibility':'PASS','phpCasesPerRelay':len(cases),'totalContractComparisons':len(cases)*len(files)*3,'relayChecks':checks,'sources':sources,'archivedOverlayReplay':'FAIL','patches':patches,'newSurface':False,'productionWrites':0,'productionMessages':0,'productionBusinessProviderCalls':0,'applicationImports':0,'remoteFilesWritten':0,'databaseConnections':0}
(s/'php-replay-proof.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['sources','patches']},ensure_ascii=False))
