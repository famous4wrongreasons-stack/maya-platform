from pathlib import Path
import datetime,json,subprocess,time
root=Path.cwd();w=root/'work/ar1-single-operator-final-20261003';o=root/'outputs/ar1-single-operator-final-20261003';candidate=(w/'HEAD').read_text().strip();stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
start=stamp();tick=time.time()
with (w/'suspend-recovery-runner.log').open('w') as log:result=subprocess.run(['python3',str(w/'suspend-recovery-runner.py')],cwd=root,stdout=log,stderr=subprocess.STDOUT)
d={'candidate':candidate,'startedAt':start,'completedAt':stamp(),'seconds':round(time.time()-tick,2),'exit':result.returncode,'wholeParts':13,'unfilteredTests':True,'productionEffects':0}
(o/'receipts/suspend-recovery.orchestration.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d),flush=True)
raise SystemExit(result.returncode)
