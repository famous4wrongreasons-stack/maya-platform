import json,subprocess,concurrent.futures
from pathlib import Path
p=Path('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/package5-rc-policy-approved-20260908');files=sorted(json.loads((p/'final-ratchet-files.json').read_text()));assert len(files)==93 and len(set(files))==93
batches=[files[n::4]for n in range(4)];(p/'final-ratchet-batch-plan.json').write_text(json.dumps({'sameTests':True,'excludedTests':0,'batches':batches},indent=2)+'\n')
def run(item):
 n,paths=item;out=p/f'final-ratchets-batch{n+1}.json'
 with(p/f'final-ratchets-batch{n+1}.txt').open('w')as log:
  r=subprocess.run(['/usr/local/bin/node','node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',*paths,'--json','--outputFile='+str(out)],stdout=log,stderr=subprocess.STDOUT,timeout=500)
 x={'batch':n+1,'exitCode':r.returncode,'suites':len(paths)}
 if r.returncode==0:
  j=json.loads(out.read_text());assert j['success']and len(j['testResults'])==len(paths);assert {Path(t['name']).resolve()for t in j['testResults']}=={Path(t).resolve()for t in paths};x['tests']=j['numPassedTests']
 print(json.dumps(x),flush=True);return x
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(run,enumerate(batches)))
(p/'final-ratchet-batch-results.json').write_text(json.dumps(results,indent=2)+'\n');assert all(r['exitCode']==0 for r in results)
