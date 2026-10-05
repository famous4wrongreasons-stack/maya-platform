from pathlib import Path
import concurrent.futures,json,subprocess,time
root=Path.cwd(); work=root/'work/final-certification-2915ab8e'; out=root/'outputs/final-certification-2915ab8e'; receipts=out/'receipts'; candidate='2915ab8e7c089e2c1f39848cb795940e5267c119'
f=out/'DIAGNOSTIC-PREFLIGHT.json'
while not f.exists():time.sleep(1)
d=json.loads(f.read_text());assert d['candidate']==candidate and d['status']=='PASS' and d['kind']=='mandatory-live-assembly'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root/'work/maya-controlled-integration',text=True).strip()==candidate
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root/'work/maya-controlled-integration',text=True).strip()
def call(name,args):
 t=time.time(); print(json.dumps({'started':name}),flush=True)
 with (receipts/(name+'.orchestration.log')).open('w') as log:r=subprocess.run(['python3',str(work/args[0]),*args[1:]],cwd=root,stdout=log,stderr=subprocess.STDOUT)
 row={'candidate':candidate,'name':name,'exit':r.returncode,'seconds':round(time.time()-t,2)}
 (receipts/(name+'.orchestration.json')).write_text(json.dumps(row,indent=2)+'\n');print(json.dumps(row),flush=True);return r.returncode
jobs=[('ordinary-static',['run-baseline.py','static']),('ordinary-surfaces',['run-baseline.py','surfaces']),('ordinary-python',['run-extra.py','python']),('ordinary-after-surfaces',['run-after-surfaces.py'])]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda job:call(*job),jobs))
assert not any(results),'ordinary programme failed'
assert call('extra-l27',['launch-l27-after-ordinary.py'])==0
watchlog=(receipts/'native-watcher.orchestration.log').open('w')
watch=subprocess.Popen(['python3',str(work/'watch-isolated-mutation-reports.py')],cwd=root,stdout=watchlog,stderr=subprocess.STDOUT)
try:rc=call('complete-native',['launch-native.py'])
finally:
 (work/'stop-report-watcher').touch();watch.wait();watchlog.close()
raise SystemExit(rc)
