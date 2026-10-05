from pathlib import Path
import subprocess,json,os,re,concurrent.futures,time
root=Path.cwd();w=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002/receipts/r06-diagnosis';repo=root/'work/maya-controlled-integration'
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(repo/'maya-saas-backend/test/widgets-live/support/environment.ts').read_text())));env['NODE_OPTIONS']='--require='+str(w/'r06-child-trace.cjs')
def trial(i):
 ee={**env,'DATABASE_URL':f'[REDACTED DATABASE URL]','R06_TRACE_FILE':str(out/f'jest-child-{i}.jsonl')};t=time.time()
 with (out/f'jest-r06-{i}.log').open('w') as f:p=subprocess.run(['npx','jest','--runInBand','--forceExit','--json','--outputFile='+str(out/f'jest-r06-{i}.json'),'src/action-engine/package5-r06-operational-delivery.architecture.spec.ts'],cwd=w/f'mutation-isolated-worker-{i}/maya-saas-backend',env=ee,stdout=f,stderr=subprocess.STDOUT)
 d={'worker':i,'exit':p.returncode,'seconds':round(time.time()-t,2)};print(json.dumps(d),flush=True);return d
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:d=list(pool.map(trial,range(1,9)))
(out/'jest-comparison.json').write_text(json.dumps(d,indent=2)+'\n')
