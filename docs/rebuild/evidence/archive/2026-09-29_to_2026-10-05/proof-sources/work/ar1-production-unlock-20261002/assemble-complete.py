from pathlib import Path
import collections,datetime,hashlib,json,os,subprocess,time
root=Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/ar1-production-unlock-20261002';out=root/'outputs/ar1-production-unlock-20261002';r=out/'receipts';head=(work/'HEAD').read_text().strip()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
run=json.loads((r/'complete-native.orchestration.json').read_text());assert run['candidate']==head and run['exit']==0
plan=json.loads((r/'mutation-plan.json').read_text());assert plan['candidate']==head and len(plan['jobs'])==67
parts=sorted((r/'mutation-parts').glob('*.json'));assert len(parts)==67
jobs=[]
for j in plan['jobs']:
 p=r/('mutation-'+j['slot']+'.receipt.json');v=json.loads(p.read_text());assert v['candidate']==head and v['exit']==0
 assert v['seconds']<10800,(j['slot'],'outside unchanged 180-minute budget')
 jobs.append({'slot':j['slot'],'gate':j['gate'],'partition':j['partition'],'seconds':v['seconds'],'localMarginTo180Minutes':10800-v['seconds'],'receiptSha256':hashlib.sha256(p.read_bytes()).hexdigest()})
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/usr/bin:/bin'
dest=r/'mutation-receipt';assert not dest.exists()
args=['node','scripts/widgets-mutation-ci.mjs','release',str(r/'mutation-parts'),str(dest),head,''];start=time.time()
result=subprocess.run(args,cwd=be,env=env,text=True,capture_output=True);(r/'mutation-assemble.log').write_text(result.stdout+result.stderr)
receipt={'candidate':head,'name':'mutation-assemble','command':args,'cwd':str(be),'exit':result.returncode,'seconds':round(time.time()-start,2),'entry':'strict release; ordinary diagnostic assemble is inadmissible'}
(r/'mutation-assemble.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');assert result.returncode==0,result.stdout+result.stderr
counts=collections.Counter();reports=[];excluded=[]
for p in sorted(dest.glob('widgets-mutation-report-*.json')):
 v=json.loads(p.read_text());assert v['source_head']==head and v['status']=='AS-DECLARED' and v['mismatches']==0 and v['baseline_red']==[]
 assert v['assembly']['all_declared_mutants'] and v['assembly']['unrestricted_tests']
 counts.update(m['status'] for m in v['mutants']);excluded += [{'battery':m['battery'],'id':m['id'],'status':m['status'],'reason':m.get('reason')} for m in v['mutants'] if m['status'] in ['equivalent','pending']]
 reports.append({'path':str(p.relative_to(out)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'declarations':len(v['mutants']),'baselineControls':len(v['baseline_controls'])})
assert len(reports)==46 and dict(counts)=={'build-killed':353,'live-killed':180,'pending':2,'equivalent':1},counts
assert {(x['battery'],x['id']) for x in excluded if x['status']=='pending'}=={('gate6.json','M17b'),('gate6.json','M18b')}
summary={'candidate':head,'status':'PASS','parts':67,'batteries':46,'declarations':536,'applicableKills':533,'counts':dict(counts),'existingNonKillDeclarations':excluded,'restrictions':None,'baselineRed':[],'mismatches':0,'reports':reports,'localJobTimings':jobs,'historicalMutationReceiptsAdmitted':0,'certificateIssued':False,'admissionEntry':'widgets-mutation-ci.mjs release'}
(out/'COMPLETE-MUTATIONS.json').write_text(json.dumps(summary,indent=2)+'\n');print(result.stdout.strip());print(json.dumps(counts))
