from pathlib import Path
import os,re,subprocess,json,time
root=Path.cwd();be=root/'work/maya-controlled-integration/maya-saas-backend';out=root/'outputs/ar1-single-operator-20261003/receipts';out.mkdir(exist_ok=True)
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
env['DATABASE_URL']='[REDACTED DATABASE URL]'

head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=be,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=be,text=True).strip()
env.update({'NODE_ENV':'production','CLIENT_IDENTITY_HASH_SECRET':'[REDACTED]','CORS_ALLOWED_ORIGINS':'capacitor://localhost','AUTH_TRUST_PROXY':'127.0.0.1','PHONE_LOGIN_ENABLED':'false','EMAIL_LOGIN_ENABLED':'false','SWAGGER_ENABLED':'false','AI_CORE_PROVIDER':'safe'})
for name,args in [('isolated-production-preflight',['node','dist/scripts/release-preflight.js']),('isolated-structural-schema',['npx','prisma','migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code'])]:
 t=time.time()
 with (out/(name+'.log')).open('w') as f:r=subprocess.run(args,cwd=be,env=env,stdout=f,stderr=subprocess.STDOUT)
 d={'candidate':head,'name':name,'exit':r.returncode,'command':args,'seconds':round(time.time()-t,2),'scope':'guarded isolated replay DB; no production connection or real effects'}
 (out/(name+'.receipt.json')).write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d),flush=True);assert r.returncode==0,name
