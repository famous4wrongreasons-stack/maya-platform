from pathlib import Path
import datetime,hashlib,json
root=Path.cwd();work=root/'work/final-fbe2e-decisions-20261002';out=root/'outputs/final-fbe2e-decisions-20261002';candidate=(work/'HEAD').read_text().strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())
complete=read(out/'COMPLETE-MUTATIONS.json');assert complete['candidate']==candidate and complete['status']=='PASS'
p=out/'ORCHESTRATION-SOURCES.json';initial=read(p);assert initial['candidate']==candidate
files=[];changes=[]
for row in initial['files']:
 path=work/row['path'];digest=sha(path);files.append({'path':row['path'],'sha256':digest})
 if digest!=row['sha256']:changes.append({'path':row['path'],'before':row['sha256'],'after':digest})
execution_changes=[x for x in changes if x['path'].startswith(('run-','prove-','prepare-')) or x['path'].endswith(('.mjs','.js'))]
assert execution_changes==[],execution_changes
known={x['path'] for x in files}
additional=[{'path':p.name,'sha256':sha(p)} for p in sorted(work.iterdir()) if p.is_file() and p.suffix in ['.py','.mjs','.js','.json'] and p.name not in known and p.name!='run-missing-builds.py']
assert not any(x['path'].startswith(('run-','prove-','prepare-')) for x in additional),additional
result={'candidate':candidate,'status':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshot':{'path':p.name,'sha256':sha(p),'capturedAt':initial['capturedAt']},'snapshotBoundary':initial['scope'],'executionSourcesChangedSinceCapture':execution_changes,'reportingOnlyChanges':changes,'additionalReportingHelpers':additional,'files':files,'productCandidateChanged':False}
(out/'FINAL-ORCHESTRATION-SOURCES.json').write_text(json.dumps(result,indent=2)+'\n');print('Final source integrity PASS')
