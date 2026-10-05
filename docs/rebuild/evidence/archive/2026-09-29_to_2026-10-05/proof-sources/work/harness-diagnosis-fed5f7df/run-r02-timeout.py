from pathlib import Path
import os,re,subprocess,sys,json
root=Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';w=root/'work/harness-diagnosis-fed5f7df';d=root/'outputs/harness-diagnosis-fed5f7df/r02-followup'/sys.argv[1];d.mkdir()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['NODE_MAYA_R02_OUT']=str(d)
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
env['NODE_MAYA_SHADOW_HOLD']='1'
env['NODE_MAYA_SHADOW_JEST_ARGS']=json.dumps(['--runTestsByPath','src/auth/legacy-staff-principal.http.spec.ts','-t','rejects a valid JWT for a different tenant even with the bridge credential'])
r=subprocess.run(['node',str(w/'r02-shadow-driver.cjs')],cwd=Path(sys.argv[2]) if len(sys.argv)>2 else be,env=env)
print((d/'shadow-receipt.json').read_text());raise SystemExit(r.returncode)
