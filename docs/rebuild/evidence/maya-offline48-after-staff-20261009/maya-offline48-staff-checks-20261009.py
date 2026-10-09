import json,pathlib,subprocess,hashlib,time,sys
base=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics/maya-saas-backend')
prefix='/private/tmp/maya-offline48-staff-checks-20261009'
paths=['test/widgets-live/support/core-full-offline-fixtures.ts','test/widgets-live/support/core-full-offline-fixtures.spec.ts','test/widgets-live/core-conversation-http.probe-spec.ts']
sha=lambda:{p:hashlib.sha256((base/p).read_bytes()).hexdigest() for p in paths}
before=sha();checks=[]
for name,args in [('unit',['node_modules/jest/bin/jest.js','--config','/private/tmp/maya-offline48-staff-20261009-checks-config.json','--runInBand','--runTestsByPath',paths[1],'--json','--outputFile='+prefix+'-unit.json']),('types',['node_modules/typescript/bin/tsc','--noEmit','--project','/private/tmp/maya-offline48-staff-20261009-types.json','--incremental','false']),('lint',['node_modules/eslint/bin/eslint.js',*paths])]:
 start=time.time();log=pathlib.Path(prefix+'-'+name+'.log')
 with log.open('wb') as f:r=subprocess.run(['/usr/local/bin/node','--max-old-space-size=1536',*args],cwd=base,stdout=f,stderr=subprocess.STDOUT,timeout=480)
 checks.append({'check':name,'exitCode':r.returncode,'seconds':round(time.time()-start,3)});print(name,r.returncode,flush=True)
 if r.returncode:print(log.read_text()[-6000:],flush=True)
report={'contract':'maya.offline48.staff-fixture-checks/1','sourceFiles':before,'sourceUnchanged':sha()==before,'checks':checks}
pathlib.Path(prefix+'-report.json').write_text(json.dumps(report,indent=2)+'\n');assert report['sourceUnchanged']
sys.exit(1 if any(x['exitCode'] for x in checks) else 0)
