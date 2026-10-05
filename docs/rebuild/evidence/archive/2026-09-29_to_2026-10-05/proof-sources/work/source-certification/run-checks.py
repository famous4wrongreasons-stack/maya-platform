import os,sys,json,re,subprocess,time,concurrent.futures,pathlib
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2')
repo=root/'work/maya-controlled-integration'; be=repo/'maya-saas-backend'; out=root/'outputs/source-certification/receipts';out.mkdir(parents=True,exist_ok=True)
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env=os.environ.copy();env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env['NODE_ENV']='test'
s=(be/'test/widgets-live/support/environment.ts').read_text();pairs=re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",s);env.update(dict(pairs))
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
ev=out/'evidence';ev.mkdir(exist_ok=True)
def run(name,cwd,args,extra={}):
 e={**env,**extra};t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env=e,stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':sha,'name':name,'command':args,'cwd':str(cwd.relative_to(repo)),'exit':r.returncode,'seconds':round(time.time()-t,2)}
 (out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode
def backend():
 return run('backend',be,['npm','test','--','--runInBand','--json','--outputFile='+str(out/'backend.json')])
def live():
 run('widgets-live',be,['npm','run','test:widgets:live','--','--json','--outputFile='+str(out/'widgets-live.json')],{'WIDGETS_EVIDENCE':'1','WIDGETS_EVIDENCE_DIR':str(ev)})
 if run('build',be,['npm','run','build'])==0:
  run('http-bin',be,['npm','run','test:widgets:http'],{'WIDGETS_EVIDENCE':'1','WIDGETS_EVIDENCE_DIR':str(ev)})
  run('release-binary',be,['npm','run','test:widgets:release-binary','--','--json','--outputFile='+str(out/'release-binary.json')])
 run('evidence-verifier',be,['node','scripts/widgets-evidence-verify.mjs','--dir',str(ev),'--audit','../docs/rebuild/widget-release-programme/approved-release/current-audit.json','--u-proofs','../docs/rebuild/widget-release-programme/approved-release/u-proofs.json'])
def static():
 for name,args in [('npm-audit',['npm','audit','--omit=dev','--audit-level=high','--json']),('prisma-validate',['npx','prisma','validate']),('typecheck',['npm','run','typecheck']),('scripts-typecheck',['npm','run','typecheck:scripts']),('live-typecheck',['npm','run','typecheck:widgets-live']),('lint',['npm','run','lint']),('k3',['node','scripts/k3-gateway-check.mjs']),('mutation-inventory',['node','--test','scripts/widgets-mutation-ci.test.mjs']),('contract-compile',['npx','tsc','--noEmit','--project','tsconfig.widget-contract.json']),('contract-check',['node','scripts/widget-contract-check.mjs']),('e2e',['npm','run','test:e2e','--','--runInBand']),('events-live',['npm','run','test:events:live'])]:run(name,be,args,{'DATABASE_URL':'[REDACTED DATABASE URL]'} if name=='events-live' else {})
def surfaces():
 shell=repo/'maya-chat-shell';carrier=repo/'maya-carrier-react'
 for name,args in [('runtime-check',['node','build.mjs','--check','--no-baseline']),('runtime-build',['npm','run','build']),('runtime-self-test',['npm','run','self-test']),('runtime-typecheck',['npm','run','typecheck']),('runtime-test',['npm','test']),('icons',['node','brand/make-icons.mjs','--check'])]:run(name,shell,args)
 for name,args in [('carrier-typecheck',['npm','run','typecheck']),('carrier-build',['npm','run','build']),('carrier-test',['npm','test'])]:run(name,carrier,args)
 run('k5-exit',repo,['bash','docs/rebuild/evidence/maya-chat-first-ux/k5-exit-gate.sh'])
 run('source-carrier',be,['npx','jest','--config','test/jest-widgets-live.json','--runInBand','--testRegex','widgets-live/source-carrier.probe-spec.ts$'],{'GITHUB_SOURCE_PROBE_OUT':str(out/'source-carrier-observations.json')})
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for r in pool.map(lambda f:f(),[backend,live,static,surfaces]):pass
