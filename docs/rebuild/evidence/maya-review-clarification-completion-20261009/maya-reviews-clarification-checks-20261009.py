import pathlib,json,hashlib,subprocess,time,os,sys
b=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics/maya-saas-backend')
prefix=pathlib.Path(sys.argv[1]); env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG']};env.update(NODE_ENV='test',NO_COLOR='1',CI='true')
files=[f.strip() for f in subprocess.check_output(['git','diff','--name-only'],cwd=b,text=True).splitlines()]
root=b.parent
before={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files}
tests=['core-full-offline-assessment','core-full-offline-score','core-full-offline-report','core-full-offline-model','core-offline-profile','core-conversation-source','core-conversation-admission']
commands=[('unit',['--test',*[f'scripts/conversation-qualification/{f}.test.mjs' for f in tests],'scripts/reviews-period-read-proof.test.mjs']),('types',['node_modules/typescript/bin/tsc','--noEmit','--project','/private/tmp/maya-reviews-clarification-20261009-types.json','--incremental','false']),('lint',['node_modules/eslint/bin/eslint.js','test/widgets-live/core-conversation-http.probe-spec.ts','test/widgets-live/reviews-period-read-restart.probe-spec.ts'])]
checks=[]
for name,args in commands:
 start=time.time();cmd=['/usr/local/bin/node','--max-old-space-size=1536',*args];log=pathlib.Path(str(prefix)+'-'+name+'.log')
 with log.open('wb') as handle:r=subprocess.run(cmd,cwd=b,env=env,stdout=handle,stderr=subprocess.STDOUT,timeout=240)
 checks.append({'name':name,'exit':r.returncode,'seconds':round(time.time()-start,2),'command':cmd,'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()});print(name,r.returncode,flush=True)
 if r.returncode:print(log.read_text()[-7000:],flush=True)
after={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files};assert after==before
pathlib.Path(str(prefix)+'-checks.json').write_text(json.dumps({'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=b,text=True).strip(),'sourceFiles':before,'sourceUnchanged':True,'checks':checks},indent=2)+'\n')
assert all(c['exit']==0 for c in checks)
