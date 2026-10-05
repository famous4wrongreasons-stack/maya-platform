import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


assert (be/'dist/src/bootstrap/configure-http-app.js').is_file()
assert run('runtime-full',repo/'maya-chat-shell',['npm','test'])==0
subprocess.run(['python3',str(work/'run-extra.py'),'node24'],cwd=root,check=True)
subprocess.run(['python3',str(work/'check-ci-postconditions.py')],cwd=root,check=True)
(out.parent/'HARNESS-RUNTIME-ORDER.json').write_text(json.dumps({'candidate':head,'status':'PASS','cause':'Initial runtime ran before backend dist; mandatory backend ValidationPipe parity skipped explicitly on both Node versions.','priorReports':'receipts/attempts/prebuild-runtime','repair':'Complete Node22 and Node24 runtime reruns after exact-candidate build; strict skip audit now requires exactly seven optional API skips; ValidationPipe parity must pass.','productCodeChanged':False,'timeoutsChanged':False},indent=2)+'\n')
subprocess.run(['python3',str(work/'index-fresh-artifacts.py')],cwd=root,check=True)
import shutil,datetime
shutil.copyfile(out.parent/'ARTIFACT-HASH-PARITY.json',out.parent/'INITIAL-ARTIFACT-HASH-PARITY.json')
(out.parent/'INITIAL-SNAPSHOT-PROVENANCE.json').write_text(json.dumps({'candidate':head,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'After all current component and browser proofs including ordered smoke/runtime reruns; before unrestricted native mutations.'},indent=2)+'\n')
subprocess.run(['python3',str(work/'run-complete-native.py')],cwd=root,check=True)
subprocess.run(['python3',str(work/'finish-programme.py')],cwd=root,check=True)
