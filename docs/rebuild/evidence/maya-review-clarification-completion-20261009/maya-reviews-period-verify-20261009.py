import json,pathlib,hashlib,subprocess,sys,io,tarfile
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'manifest.json').read_text())
archive=subprocess.check_output(['git','archive',m['sourceHead'],'maya-saas-backend'],cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as t:
 for f,h in m['sourceBindings'].items():
  assert hashlib.sha256(t.extractfile('maya-saas-backend/'+f).read()).hexdigest()==h,f
checks={}
for stage in ['prepare','resume']:
 f=p/(stage+'-jest.json')
 if f.exists():
  r=json.loads(f.read_text());checks[stage]={'passed':r['numPassedTests'],'failed':r['numFailedTests'],'assertions':sum(x.get('numPassingAsserts',0) for s in r['testResults'] for x in s['assertionResults'])}
status=subprocess.run(['/opt/homebrew/opt/postgresql@16/bin/pg_ctl','-D',m['cluster'],'status'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
assert status.returncode==3,status.stdout
assert not (pathlib.Path(m['cluster'])/'postmaster.pid').exists()
r={'contract':'maya.review-calendar.exact-source-and-cleanup/1','sourceHead':m['sourceHead'],'sourceFilesVerified':len(m['sourceBindings']),'sourceBindingsDigest':m['sourceBindingsDigest'],'sourceUnchanged':m.get('sourceUnchanged'),'manifestStatus':m['status'],'stages':checks,'pgStatusExit':status.returncode,'postmasterPidAbsent':True,'manifestSha256':hashlib.sha256((p/'manifest.json').read_bytes()).hexdigest(),'limits':['Actual HTTP/auth/C9/PG; scripted planner and synthetic canonical local registry facts','No real model/provider, browser or full MAYA/C10 acceptance']}
(p/'source-and-cleanup-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
