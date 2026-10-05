from pathlib import Path
import os,subprocess,time
root=Path(__file__).resolve().parents[2]
env=dict(os.environ)
env['PATH']='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin'
while True:
 r=subprocess.run(['ps','-p','27200','-o','command='],capture_output=True,text=True)
 if r.returncode or 'widget-release/maya-saas-backend/node_modules/.bin/jest' not in r.stdout:break
 time.sleep(5)
out=root/'work/sb1-v2/final-receipts'
print('Starting final backend regression at clean eb200c98',flush=True)
with (out/'backend.log').open('w') as f:
 r=subprocess.run(['npm','run','test:backend','--','--runInBand','--json','--outputFile='+str(out/'backend.json')],cwd=root/'work/widget-release/maya-saas-backend',env=env,stdout=f,stderr=subprocess.STDOUT)
print('backend exit',r.returncode,flush=True)
raise SystemExit(r.returncode)
