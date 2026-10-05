from pathlib import Path
import concurrent.futures, hashlib, json, os, re, shutil, subprocess, time
root=Path.cwd(); repo=root/'work/maya-controlled-integration'; be=repo/'maya-saas-backend'
out=root/'outputs/harness-diagnosis-fed5f7df/m13-followup/final-formatted'; out.mkdir(exist_ok=True); work=root/'work/m13-admission-diagnosis'
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']}; env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
spec='src/widgets/owner-ports/commit-booking.adapter.spec.ts'
patch=subprocess.check_output(['git','diff','--',spec],cwd=be)
assert patch and subprocess.check_output(['git','diff','--name-only'],cwd=be,text=True).strip()=='maya-saas-backend/'+spec
patchhash=hashlib.sha256(patch).hexdigest(); (out/'FINAL-TEST-REPAIR.patch').write_bytes(patch)
mutant=next(m for m in json.loads((be/'test/widgets-live/mutations/gate13.json').read_text()) if m['id']=='M13-U13C-11')
mirror=work/'final-exact-mutant-formatted';assert not mirror.exists()
shutil.copytree(be,mirror,ignore=shutil.ignore_patterns('node_modules','dist','coverage','.git','.env*','*.tsbuildinfo'));(mirror/'node_modules').symlink_to(be/'node_modules',target_is_directory=True)
path=mirror/mutant['file'];text=path.read_text();assert text.count(mutant['find'])==1;path.write_text(text.replace(mutant['find'],mutant['replace']))
jest=str(be/'node_modules/jest/bin/jest.js')
jobs=[('final-test',be,['node',jest,'--runInBand','--runTestsByPath',spec,'--json','--outputFile='+str(out/'final-test.json')],0),
 ('final-mutant',mirror,['node',jest,'--runInBand','--runTestsByPath',spec,'--json','--outputFile='+str(out/'final-mutant.json')],1),
 ('final-lint',be,['node',str(be/'node_modules/eslint/bin/eslint.js'),spec],0),
 ('final-typecheck',be,['npm','run','typecheck'],0)]
def run(job):
 name,cwd,args,want=job;started=time.time()
 with (out/(name+'.log')).open('w') as log:rc=subprocess.run(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT).returncode
 record={'name':name,'sourceCandidate':'dc3a26806b273631e8c6150acfa3e9cacdde91a1','uncommittedHarnessOnly':True,'patchSha256':patchhash,'exit':rc,'expectedExit':want,'seconds':round(time.time()-started,3),'scope':'Pre-commit diagnostic, not final certification'}
 report=out/(name+'.json')
 if report.exists():
  data=json.loads(report.read_text());record.update({'passed':data['numPassedTests'],'failed':data['numFailedTests'],'reportSha256':hashlib.sha256(report.read_bytes()).hexdigest()})
 (out/(name+'.receipt.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
 assert rc==want,name
 return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(run,jobs))
(out/'FINAL-TEST-REPAIR.json').write_text(json.dumps({'checks':records,'productChanges':0,'timeoutChanges':0},indent=2)+'\n')
