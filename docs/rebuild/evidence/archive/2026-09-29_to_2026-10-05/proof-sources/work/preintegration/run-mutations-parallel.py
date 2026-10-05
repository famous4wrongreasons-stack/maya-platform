from pathlib import Path
import subprocess, json, re, os, time
root=Path(__file__).resolve().parents[2]; backend=root/'work/widget-release/maya-saas-backend'; out=root/'work/preintegration/receipts/mutations';out.mkdir(exist_ok=True)
node=Path('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin')
env=dict(os.environ,PATH=str(node)+':/opt/homebrew/bin:/usr/bin:/bin',DATABASE_URL='[REDACTED DATABASE URL]');env.pop('WIDGETS_EVIDENCE',None);env.pop('WIDGETS_EVIDENCE_DIR',None)
previous=json.load(open(root/'work/receipts/backend-full.json'))
priority=['WR','H-harness','6','7','13','12','11','P-mint']
files=sorted((backend/'test/widgets-live/mutations').glob('gate*.json'),key=lambda p: (priority.index(p.stem[4:]) if p.stem[4:] in priority else 99,p.name))
import queue, threading, concurrent.futures
progress=json.load(open(out/'progress.json'));lock=threading.Lock();jobs=queue.Queue()
for f in files:
 if f.stem[4:] not in ['WR','H-harness','6','7']:jobs.put(f)
def run_one(f,backend):
 gate=f.stem[4:];decl=json.loads(f.read_text())
 killers=sorted({k if isinstance(k,str) else k['test'] for m in decl for k in m.get('killers',[])})
 prefixes=[k for k in killers if k not in ['k3','typecheck:widgets-live']]
 pattern='(?:^|\\s)(?:'+'|'.join(re.escape(k) for k in prefixes)+')(?=$|[^A-Za-z0-9_.-])' if prefixes else 'NO_JEST_KILLER_DECLARED'
 unit_files=[]
 for suite in previous['testResults']:
  if any(any(t['title']==k or (t['title'].startswith(k) and len(t['title'])>len(k) and not re.match('[A-Za-z0-9_.-]',t['title'][len(k)])) for k in prefixes) for t in suite['assertionResults']):
   unit_files.append(re.escape(suite['name'].split('/src/')[1]))
 paths='('+'|'.join(unit_files)+')' if unit_files else 'widgets/'
 args=[str(node/'node'),'scripts/widgets-mutation-battery.mjs','--gate',gate,'--unit-filter',pattern,'--live-filter',pattern,'--unit-tests',paths,'--out',str(out/(gate+'.json'))]
 start=time.monotonic()
 with (out/(gate+'.log')).open('w') as log:r=subprocess.run(args,cwd=backend,env=env,stdout=log,stderr=subprocess.STDOUT)
 receipt=json.load(open(out/(gate+'.json'))) if (out/(gate+'.json')).exists() else {}
 row={'gate':gate,'returncode':r.returncode,'seconds':round(time.monotonic()-start,1),'status':receipt.get('status'),'mutants':len(receipt.get('mutants',[])),'mismatches':receipt.get('mismatches'),'baseline_red':receipt.get('baseline_red'),'restricted':True}
 with lock:
  progress.append(row);(out/'parallel-progress.json').write_text(json.dumps(progress,indent=2)+'\n');print(json.dumps(row),flush=True)

def worker(i):
 be=backend if i==0 else root/f'work/preintegration/mutation-worker-{i}/maya-saas-backend'
 if i==0:
  while not (out/'7.json').exists():time.sleep(2)
  r=json.load(open(out/'7.json'))
  with lock:
   progress.append({'gate':'7','returncode':0 if r['status']=='AS-DECLARED' else 1,'status':r['status'],'mutants':len(r['mutants']),'mismatches':r['mismatches'],'baseline_red':r['baseline_red'],'restricted':True})
   (out/'parallel-progress.json').write_text(json.dumps(progress,indent=2)+'\n')
  time.sleep(1)
 while True:
  try:f=jobs.get_nowait()
  except queue.Empty:return
  run_one(f,be)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 list(pool.map(worker,range(3)))
print('DONE',flush=True)
