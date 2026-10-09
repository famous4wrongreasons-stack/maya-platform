import os,sys,json,time,hashlib,subprocess,pathlib
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
base=root/'maya-saas-backend'
node='/usr/local/bin/node'
out=pathlib.Path('/private/tmp')
prefix='maya-public-company-final-20261009'
specs=[
'src/ai-tools/ai-core.public-company.spec.ts',
'src/ai-tools/ai-tool-handler.service.spec.ts',
'src/ai-tools/ai-tool-runtime.service.spec.ts',
'src/ai-tools/public-consultation-presentation.spec.ts',
'src/crm/crm.company-profile-source.spec.ts',
'src/crm/adapters/yclients-company-profile-source.spec.ts',
'src/ai-tools/ai-core.service.spec.ts',
'src/ai-tools/ai-core.employee-journal.spec.ts',
'src/ai-tools/ai-core.employee-schedule.spec.ts',
'src/crm/crm.service.spec.ts',
'src/crm/adapters/yclients-crm.adapter.spec.ts',
]
changed=subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=root,text=True).splitlines()
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines()
paths=sorted({p for p in changed+new if p.startswith('maya-saas-backend/src/') and p.endswith('.ts')})
def hashes(): return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
before=hashes()
assert len(paths)==13,(len(paths),paths)
config={
'extends':str(base/'tsconfig.json'),
'compilerOptions':{'noEmit':True,'incremental':False,'types':['node','jest'],'typeRoots':[str(base/'node_modules/@types')]},
'files':[str(base/p) for p in specs[:6]],'include':[],'exclude':[]}
configPath=out/(prefix+'-types.json')
configPath.write_text(json.dumps(config,indent=2)+'\n')
checks=[
('unit',[node,'--max-old-space-size=1536','node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',*specs,'--json','--outputFile='+str(out/(prefix+'-unit.json'))]),
('scoped-types',[node,'--max-old-space-size=1536','node_modules/typescript/bin/tsc','--noEmit','--project',str(configPath),'--incremental','false']),
('production-types',[node,'--max-old-space-size=1536','node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.build.json','--incremental','false']),
('lint',[node,'--max-old-space-size=1536','node_modules/eslint/bin/eslint.js',*[str(root/p) for p in paths]]),
('diff-check',['git','diff','--check','--',*[str(root/p) for p in paths]])]
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','LC_ALL']}
env.update({'NODE_ENV':'test','NO_COLOR':'1','CI':'true'})
results=[]
for name,cmd in checks:
 start=time.time()
 with (out/(prefix+'-'+name+'.log')).open('wb') as log:
  result=subprocess.run(cmd,cwd=base,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=480)
 results.append({'check':name,'exitCode':result.returncode,'seconds':round(time.time()-start,3),'command':cmd,'log':prefix+'-'+name+'.log'})
 print(name,result.returncode,flush=True)
 if result.returncode:
  print((out/(prefix+'-'+name+'.log')).read_text()[-5000:],flush=True)
after=hashes()
report={'contract':'maya.public-company.component-checks/1','baseSha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFiles':before,'sourceUnchanged':before==after,'checks':results,'limits':['Component/unit synthetic sources only','No public-company HTTP/PG, restart, live provider/model or A17 activation proof','Previous journal/full48 source binding stays 4f88e8178e337d9f4d4b6740acbce1685e97a92e']}
(out/(prefix+'-checks.json')).write_text(json.dumps(report,indent=2)+'\n')
assert before==after,'SOURCE CHANGED DURING CHECKS'
sys.exit(1 if any(r['exitCode'] for r in results) else 0)
