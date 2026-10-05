import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-705d57cd';out=root/'outputs/final-certification-705d57cd/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
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

if mode=='events':
 check('events-live',be,['npm','run','test:events:live'],{'DATABASE_URL':'[REDACTED DATABASE URL]'})
elif mode=='frontend-ci':
 check('frontend-inline',repo,['node','scripts/verify-frontend-bundles.mjs','сайт и приложение/app.html','сайт и приложение/maya-admin.html','сайт и приложение/maya-start.html','сайт и приложение/oauth-callback.html'])
 check('prepublication-contracts',repo,['node','scripts/verify-prepublication-contracts.mjs'])
 check('prepublication-counterfactuals',repo,['node','--test','scripts/verify-prepublication-contracts.test.mjs'])
elif mode=='smoke':
 ex={'DATABASE_URL':'[REDACTED DATABASE URL]','HTTP_SMOKE_PORT':'33741'}
 for name,args in [('synthetic-smoke-migration',['npx','prisma','migrate','deploy']),('synthetic-smoke-seed',['npm','run','prisma:seed']),('platform-http-smoke',['npm','run','test:http'])]:check(name,be,args,ex)
elif mode=='node24':
 ex={'PATH':'/usr/local/bin:'+env['PATH']};sh=repo/'maya-chat-shell'
 for name,args in [('node24-runtime-check',['node','build.mjs','--check','--no-baseline']),('node24-runtime-selftest',['node','build.mjs','--self-test']),('node24-runtime-typecheck',['node','build.mjs','--typecheck']),('node24-icons',['node','brand/make-icons.mjs','--check'])]:check(name,sh,args,ex)
 check('node24-runtime-full',sh,['node','--test','conformance.test.mjs',*[str(p.relative_to(sh)) for p in sorted((sh/'test').glob('*.test.mjs'))]],ex)
elif mode=='python':
 env.update({'OPENAI_API_KEY': '[REDACTED TEST FIXTURE]','PII_ENCRYPTION_KEY': '[REDACTED TEST FIXTURE]','TELEGRAM_TOKEN': '[REDACTED TEST FIXTURE]','WEBHOOK_SECRET': '[REDACTED TEST FIXTURE]','YCLIENTS_PARTNER_TOKEN': '[REDACTED TEST FIXTURE]','YCLIENTS_USER_TOKEN': '[REDACTED TEST FIXTURE]'})
 py='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin/python'
 check('python-compile',repo,[py,'-m','compileall','ai администратор'])
 check('legacy-python-full',repo,[py,'-u','-m','unittest','discover','-v','-s','ai администратор','-p','test_*.py'],{'PYTHONDONTWRITEBYTECODE':'1'})
