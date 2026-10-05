import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/ar1-production-unlock-20261002';out=root/'outputs/ar1-production-unlock-20261002/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


assert head == '667b687c161a03d2d5f3f508f63b8fd0beedfbd9'
results=[]
for iteration in range(1,4):
 name='requested-baselines-'+str(iteration)
 args=['node','node_modules/jest/bin/jest.js','--config','test/jest-widgets-live.json','--runInBand','--runTestsByPath','test/widgets-live/sb1-successor.live-spec.ts','test/widgets-live/f88-shape.live-spec.ts','--testNamePattern','SV2-HTTP|F88-1 |F88-2 ','--json','--outputFile='+str(out/(name+'.json'))]
 rc=run(name,be,args)
 j=json.loads((out/(name+'.json')).read_text())
 row={'iteration':iteration,'exit':rc,'passed':j['numPassedTests'],'failed':j['numFailedTests'],'tests':[{'title':a['title'],'status':a['status'],'durationMs':a['duration']} for t in j['testResults'] for a in t['assertionResults'] if a['status']!='pending']}
 results.append(row)
 assert rc==0 and row['passed']==3 and row['failed']==0,row
(out.parent/'REQUESTED-BASELINES-REPEATED.json').write_text(json.dumps({'candidate':head,'independentRepeats':results,'nativeCorpusControl':'PENDING; targeted repetitions do not replace unrestricted native baseline'},indent=2)+'\n')
