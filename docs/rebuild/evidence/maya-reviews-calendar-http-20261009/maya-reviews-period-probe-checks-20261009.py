import pathlib,json,hashlib,subprocess,time,os,sys
b=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics/maya-saas-backend');out=pathlib.Path('/private/tmp');prefix=sys.argv[1]
f='test/widgets-live/reviews-period-read-restart.probe-spec.ts'; before=hashlib.sha256((b/f).read_bytes()).hexdigest()
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG']};env.update(NODE_ENV='test',NO_COLOR='1',CI='true')
checks=[]
for name,args in [('types',['node_modules/typescript/bin/tsc','--noEmit','--project','/private/tmp/maya-reviews-period-checks-r2-20261009-types.json','--incremental','false']),('lint',['node_modules/eslint/bin/eslint.js',f])]:
 start=time.time();command=['/usr/local/bin/node','--max-old-space-size=1536',*args]
 with (out/(prefix+'-'+name+'.log')).open('wb') as log:r=subprocess.run(command,cwd=b,stdout=log,stderr=subprocess.STDOUT,env=env,timeout=180)
 checks.append({'name':name,'exit':r.returncode,'seconds':time.time()-start,'command':command});print(name,r.returncode,flush=True)
 if r.returncode:print((out/(prefix+'-'+name+'.log')).read_text()[-5000:])
assert before==hashlib.sha256((b/f).read_bytes()).hexdigest()
(out/(prefix+'-checks.json')).write_text(json.dumps({'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=b,text=True).strip(),'probeSha256':before,'sourceUnchanged':True,'checks':checks},indent=2)+'\n')
assert all(c['exit']==0 for c in checks)
