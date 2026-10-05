from pathlib import Path
import os,subprocess,json
root=Path(__file__).resolve().parents[2];backend=root/'work/widget-release/maya-saas-backend';out=root/'work/final-evidence/receipts'; evidence=root/'work/final-evidence/final-capture';evidence.mkdir(exist_ok=True)
env=dict(os.environ,DATABASE_URL='[REDACTED DATABASE URL]')
env['PATH']='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin'
for key in ['WIDGETS_EVIDENCE','WIDGETS_EVIDENCE_DIR']:env.pop(key,None)
jobs=[


 ('http',['npm','run','test:widgets:live','--','--testPathPatterns=(wr-release|e1-production-trigger|final-u-scope)','--json','--outputFile='+str(out/'http.json')],True),
 ('bin',['npm','run','test:widgets:http'],True),
 ('evidence-verify',['node','scripts/widgets-evidence-verify.mjs','--dir',str(evidence),'--u-proofs',str(root/'work/widget-release/docs/rebuild/widget-release-programme/final-evidence/u-proofs.json')],False),
]
for name,args,capture in jobs:
 runenv=dict(env)
 if capture:runenv.update(WIDGETS_EVIDENCE='1',WIDGETS_EVIDENCE_DIR=str(evidence))
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=backend,env=runenv,stdout=log,stderr=subprocess.STDOUT)
 print(json.dumps({'job':name,'exit':r.returncode}),flush=True)
 if r.returncode:raise SystemExit(r.returncode)
