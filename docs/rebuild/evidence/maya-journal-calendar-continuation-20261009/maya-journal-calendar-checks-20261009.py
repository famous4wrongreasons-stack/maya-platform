import os,sys,json,time,hashlib,subprocess,pathlib
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
base=root/'maya-saas-backend'
node='/usr/local/bin/node'
out=pathlib.Path('/private/tmp')
prefix=sys.argv[1] if len(sys.argv)>1 else 'maya-reviews-period-checks-r1-20261009'
specs=[
'src/ai-tools/ai-core.employee-journal-continuation.spec.ts',
'src/ai-tools/ai-core.employee-journal.spec.ts',
'src/ai-tools/employee-journal-read.spec.ts',
'src/ai-tools/ai-core.reviews-calendar.spec.ts',
'src/ai-tools/reviews-calendar-read.spec.ts',
'src/ai-tools/ai-core.service.spec.ts',
'src/ai-tools/ai-tool-runtime.service.spec.ts',
'src/ai-tools/ai-tool-handler.service.spec.ts',
'src/ai-tools/ai-tool-registry.service.spec.ts',
'src/ai-tools/staff-schedule-command.service.spec.ts',
'src/crm/crm.journal-source.spec.ts',
'src/crm/crm.staff-schedule-source.spec.ts',
'src/crm/adapters/yclients-journal-source.spec.ts',
'src/business-facts/appointment-period.journal-source.spec.ts',
'src/business-facts/journal-consolidation.spec.ts',
'src/analytics/operations-analytics.journal-source.spec.ts',
'src/conversation-intelligence/conversation-intelligence.service.spec.ts',
'src/conversation-intelligence/semantic-slot-normalization.spec.ts',
'src/conversation-intelligence/conversation-capability.spec.ts',
]
changed=subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=root,text=True).splitlines()
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines()
paths=sorted({p for p in changed+new if p.startswith('maya-saas-backend/') and p.endswith(('.ts','.mjs'))})
def hashes(): return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
before=hashes()
assert len(paths)==5,(len(paths),paths)
config={
'extends':str(base/'tsconfig.json'),
'compilerOptions':{'noEmit':True,'incremental':False,'types':['node','jest'],'typeRoots':[str(base/'node_modules/@types')]},
'files':[str(root/p) for p in paths if p.endswith('.ts')],'include':[],'exclude':[]}
configPath=out/(prefix+'-types.json')
configPath.write_text(json.dumps(config,indent=2)+'\n')
checks=[
('driver',[node,'--test','scripts/employee-journal-read-proof.test.mjs']),
('unit',[node,'--max-old-space-size=1536','node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',*specs,'--json','--outputFile='+str(out/(prefix+'-unit.json'))]),
('scoped-types',[node,'--max-old-space-size=1536','node_modules/typescript/bin/tsc','--noEmit','--project',str(configPath),'--incremental','false']),
('production-types',[node,'--max-old-space-size=1536','node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.build.json','--incremental','false']),
('lint',[node,'--max-old-space-size=1536','node_modules/eslint/bin/eslint.js',*[str(root/p) for p in paths if p.endswith('.ts')]]),
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
report={'contract':'maya.journal-calendar.component-checks/1','baseSha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFiles':before,'sourceUnchanged':before==after,'checks':results,'limits':['Component/unit synthetic sources only','Component checks do not establish HTTP/PG, restart, real provider/model or full MAYA acceptance','Original81 and two clarification_pending outcomes preserved; baseline ca70076b35afc4aaa299b8bfe9bb34f2954c7723']}
(out/(prefix+'-checks.json')).write_text(json.dumps(report,indent=2)+'\n')
assert before==after,'SOURCE CHANGED DURING CHECKS'
sys.exit(1 if any(r['exitCode'] for r in results) else 0)
