from pathlib import Path
import datetime,hashlib,json,tempfile,time
root=Path.cwd();work=root/'work/ar1-production-unlock-20261002';out=root/'outputs/ar1-production-unlock-20261002';r=out/'receipts';candidate=(work/'HEAD').read_text().strip()
seen=set();dest=r/'native-progress-diagnostics';dest.mkdir(exist_ok=True)
while not (r/'complete-native.orchestration.json').exists():
 for i in range(1,9):
  key=hashlib.sha1(str(work/f'mutation-isolated-worker-{i}/maya-saas-backend').encode()).hexdigest()[:10]
  for step in ['unit','live']:
   p=Path(tempfile.gettempdir())/f'widgets-mutation-{step}-{key}.json'
   try:
    stat=p.stat();signature=(i,step,stat.st_mtime_ns,stat.st_size)
    if signature in seen:continue
    d=json.loads(p.read_text());seen.add(signature)
    if not isinstance(d.get('startTime'),(int,float)):continue
    failures=[{'source':t['name'],'title':a['fullName'],'message':a.get('failureMessages')} for t in d.get('testResults',[]) for a in t.get('assertionResults',[]) if a.get('status')=='failed']
    suites=[{'source':t['name'],'message':t.get('message')} for t in d.get('testResults',[]) if t.get('status')=='failed' and not t.get('assertionResults')]
    result={'candidate':candidate,'worker':i,'step':step,'startTime':d['startTime'],'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':d.get('numPassedTests'),'failed':d.get('numFailedTests'),'success':d.get('success'),'failures':failures,'suiteFailures':suites,'admission':'DIAGNOSTIC ONLY; may be an intentional mutant or neutraliser. Canonical final reports alone classify and admit it.'}
    (dest/f'{i}-{step}-{d["startTime"]}.json').write_text(json.dumps(result,indent=2)+'\n')
   except (FileNotFoundError,json.JSONDecodeError):pass
 time.sleep(2)
