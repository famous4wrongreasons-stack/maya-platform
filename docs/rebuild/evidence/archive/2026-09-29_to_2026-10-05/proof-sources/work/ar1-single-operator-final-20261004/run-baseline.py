import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/ar1-single-operator-final-20261004';out=root/'outputs/ar1-single-operator-final-20261004/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode

import sys
mode=sys.argv[1]
def check(name,cwd,args,extra={}):
 if run(name,cwd,args,extra):raise SystemExit(1)
if mode=='backend':
 check('backend-full',be,['npm','test','--','--runInBand','--json','--outputFile='+str(out/'backend-full.json')])
elif mode=='static':
 for name,args in [('npm-audit',['npm','audit','--omit=dev','--audit-level=high','--json']),('prisma-validate',['npx','prisma','validate']),('backend-typecheck',['npm','run','typecheck']),('scripts-typecheck',['npm','run','typecheck:scripts']),('live-typecheck',['npm','run','typecheck:widgets-live']),('lint',['npm','run','lint']),('k3',['node','scripts/k3-gateway-check.mjs']),('mutation-ci-integrity',['node','--test','scripts/widgets-mutation-ci.test.mjs']),('mutation-inventory',['node','scripts/widgets-mutation-battery.mjs','--dry-run','--out',str(out/'mutation-inventory.json')]),('contract-compile',['npx','tsc','--noEmit','--project','tsconfig.widget-contract.json']),('contract-check',['node','scripts/widget-contract-check.mjs']),('e2e',['npm','run','test:e2e','--','--runInBand'])]:check(name,be,args)
elif mode=='surfaces':
 sh=repo/'maya-chat-shell';ca=repo/'maya-carrier-react'
 for name,args in [('runtime-hash-check',['node','build.mjs','--check','--no-baseline']),('runtime-self-test',['npm','run','self-test']),('runtime-typecheck',['npm','run','typecheck']),('runtime-full',['npm','test']),('ns1-16-step',['node','test/ns1-roundtrip-probe.mjs']),('l27-17-step',['node','test/l27-terminal-outcome-probe.mjs']),('icons',['node','brand/make-icons.mjs','--check'])]:check(name,sh,args)
 for name,args in [('carrier-typecheck',['npm','run','typecheck']),('carrier-full',['npm','test'])]:check(name,ca,args)
 check('k5-exit',repo,['bash','docs/rebuild/evidence/maya-chat-first-ux/k5-exit-gate.sh'])
 check('k15-census',repo,['node','docs/rebuild/evidence/maya-chat-first-ux/k15-bundle-census.mjs','--json'])
 check('k1-dossier',repo,['node','docs/rebuild/evidence/maya-chat-first-ux/k1/k1-dossier-check.mjs'])
elif mode=='live':
 ev=out/'evidence';ev.mkdir(exist_ok=True);ex={'WIDGETS_EVIDENCE':'1','WIDGETS_EVIDENCE_DIR':str(ev)}
 check('widgets-live-full',be,['npm','run','test:widgets:live','--','--json','--outputFile='+str(out/'widgets-live-full.json')],ex)
 check('http-bin',be,['npm','run','test:widgets:http'],ex)
 check('release-binary',be,['npm','run','test:widgets:release-binary','--','--json','--outputFile='+str(out/'release-binary.json')],ex)
 check('evidence-verifier',be,['node','scripts/widgets-evidence-verify.mjs','--dir',str(ev),'--audit','../docs/rebuild/widget-release-programme/approved-release/current-audit.json','--u-proofs','../docs/rebuild/widget-release-programme/approved-release/u-proofs.json'])
