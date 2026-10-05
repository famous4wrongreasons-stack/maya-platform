from pathlib import Path
import os,subprocess,json
root=Path(__file__).resolve().parents[2];backend=root/'work/widget-release/maya-saas-backend';out=root/'work/sb1-v2/final-receipts'; evidence=root/'work/sb1-v2/final-evidence';evidence.mkdir(exist_ok=True)
env=dict(os.environ,DATABASE_URL='[REDACTED DATABASE URL]')
env['PATH']='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin'
for key in ['WIDGETS_EVIDENCE','WIDGETS_EVIDENCE_DIR']:env.pop(key,None)
jobs=[
 ('widgets',['npm','run','test:widgets:live','--','--json','--outputFile='+str(out/'widgets.json')],False),
 ('http',['npm','run','test:widgets:live','--','--testPathPatterns=(wr-release|e1-production-trigger)','--json','--outputFile='+str(out/'http.json')],True),
 ('bin',['npm','run','test:widgets:http'],True),
 ('evidence-verify',['node','scripts/widgets-evidence-verify.mjs','--dir',str(evidence)],False),
]
for name,args,capture in jobs:
 runenv=dict(env)
 if capture:runenv.update(WIDGETS_EVIDENCE='1',WIDGETS_EVIDENCE_DIR=str(evidence))
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=backend,env=runenv,stdout=log,stderr=subprocess.STDOUT)
 print(json.dumps({'job':name,'exit':r.returncode}),flush=True)
 if r.returncode:raise SystemExit(r.returncode)
