from pathlib import Path
import subprocess,json,time,datetime,hashlib
root=Path.cwd();work=root/'work/final-fbe2e-decisions-20261002';out=root/'outputs/final-fbe2e-decisions-20261002';r=out/'receipts';head=(work/'HEAD').read_text().strip()
main=json.loads((r/'main-programme-status.json').read_text());assert main['candidate']==head and all(x==0 for x in main['exits'])
l27=json.loads((r/'l27-runtime-mutations.json').read_text());assert l27['candidate']==head and l27['status']=='PASS'
assert not (r/'complete-native.orchestration.json').exists()
start=datetime.datetime.now(datetime.timezone.utc).isoformat();tick=time.time()
print('Starting unrestricted final corpus for '+head,flush=True)
code=subprocess.run(['python3',str(work/'run-all-mutations-isolated.py')],cwd=root).returncode
row={'candidate':head,'startedAt':start,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seconds':round(time.time()-tick,2),'exit':code,'restrictions':None,'historicalReceiptsAdmitted':0}
(r/'complete-native.orchestration.json').write_text(json.dumps(row,indent=2)+'\n')
raise SystemExit(code)
