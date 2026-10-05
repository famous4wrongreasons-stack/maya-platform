from pathlib import Path
import json,time,hashlib,tempfile,datetime,subprocess,re
root=Path(__file__).resolve().parents[2];work=Path(__file__).resolve().parent;out=root/'outputs/final-certification-dc3a2680/receipts/mutation-diagnostics';out.mkdir(exist_ok=True)
repo=root/'work/maya-controlled-integration';seen={};sources=[('unused',work/'unused')]+[(str(i),work/('mutation-isolated-worker-'+str(i))/'maya-saas-backend') for i in range(1,9)]
while not (work/'stop-report-watcher').exists():
 for label,source in sources:
  key=hashlib.sha1(str(source).encode()).hexdigest()[:10]
  for step in ['live','unit']:
   p=Path(tempfile.gettempdir())/('widgets-mutation-'+step+'-'+key+'.json')
   try:
    stat=p.stat();signature=(stat.st_mtime_ns,stat.st_size)
    if seen.get(str(p))==signature:continue
    raw=p.read_bytes();data=json.loads(raw)
   except (FileNotFoundError,PermissionError,json.JSONDecodeError):continue
   seen[str(p)]=signature
   failures=[]
   for test in data.get('testResults',[]):
    for a in test.get('assertionResults',[]):
     if a.get('status')=='failed':failures.append({k:a.get(k) for k in ['fullName','title','failureMessages']})
    if test.get('status')=='failed' and not test.get('assertionResults'):failures.append({'suite':test.get('name'),'message':test.get('message')})
   record={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'worker':label,'step':step,'reportSha256':hashlib.sha256(raw).hexdigest(),'source':str(source),'startTime':data.get('startTime'),'success':data.get('success'),'passed':data.get('numPassedTests'),'failed':data.get('numFailedTests'),'pending':data.get('numPendingTests'),'failures':failures}
   name=label+'-'+step+'-'+str(data.get('startTime',stat.st_mtime_ns))+'.json'
   (out/name).write_text(json.dumps(record,indent=2)+'\n')
   print(json.dumps({k:record[k] for k in ['worker','step','success','passed','failed']}),flush=True)
 time.sleep(.05)
