from pathlib import Path
import hashlib,json,re,shutil,subprocess
root=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
scratch=Path('/tmp/maya-time-correction-validation-20261008')
base=root/'docs/rebuild/evidence/maya-development-integration-20261006/booking-time-correction-20261008'
assert not base.exists()
base.mkdir(parents=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def dump(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
raw=[]
def record(p):
 b=p.read_bytes();raw.append({'path':str(p),'bytes':len(b),'sha256':sha(b)})
counts=['numFailedTestSuites','numFailedTests','numPassedTestSuites','numPassedTests','numPendingTestSuites','numPendingTests','numTotalTestSuites','numTotalTests']
for name in ['red-1','green-1']:
 p=scratch/name;r=json.loads((p/'report.json').read_text());j=json.loads((p/'targeted-unit.json').read_text())
 assert r['sourceStable'] and r['harnessStable'] and r['cancelled'] is None
 assert all(g['closed'] and g['groupAbsent'] for g in r['groups'].values())
 assert r['status']==('FAIL' if name=='red-1' else 'PASS')
 assert j['numFailedTests']==(1 if name=='red-1' else 0)
 assert j['numPassedTests']==(0 if name=='red-1' else 241)
 assert j['numPendingTests']==(204 if name=='red-1' else 0)
 (base/'reports').mkdir(exist_ok=True);shutil.copyfile(p/'report.json',base/'reports'/f'{name}.json')
 assertions=[]
 for suite in j['testResults']:
  for a in suite['assertionResults']:
   item={'identitySha256':sha(a['fullName'].encode()),'status':a['status']}
   if a['status']=='failed':
    text=re.sub(r'\x1b\[[0-9;]*m','', '\n'.join(a['failureMessages']))
    text=re.split(r'\n\s+at ',text)[0].rstrip()
    assert '-     "time": "15:00"' in text and '+     "time": "14:30"' in text
    item.update({'test':a['fullName'],'failureWithoutStack':text})
   assertions.append(item)
 dump(base/'jest'/f'{name}.json',{'sourceRawSha256':sha((p/'targeted-unit.json').read_bytes()),'counts':{k:j[k] for k in counts},'success':j['success'],'qualification':'Projection omits console/auth/environment payload and hashes test names except the single synthetic regression failure; red pending tests were excluded by the name filter.','assertions':assertions})
 for f in [p/'report.json',p/'targeted-unit.json',*[p/(c['name']+'.log') for c in r['commands'] if (p/(c['name']+'.log')).exists()]]:record(f)
for name in ['red-test.patch','commit-binding.json','run.mjs']:
 shutil.copyfile(scratch/name,base/name);record(scratch/name)
red=json.loads((scratch/'red-1/report.json').read_text())
assert sha((scratch/'red-test.patch').read_text().strip().encode())==red['source']['patchSha256']
green=json.loads((scratch/'green-1/report.json').read_text());binding=json.loads((scratch/'commit-binding.json').read_text())
assert git('rev-parse','HEAD').decode().strip()==binding['codeCommit']
assert sha(git('diff',binding['parent'],binding['codeCommit'],'--','maya-saas-backend').decode().strip().encode())==green['source']['patchSha256']
for f,h in green['source']['fileHashes'].items():assert sha(git('show',binding['codeCommit']+':maya-saas-backend/'+f))==h
review={'recordKind':'Root-authored faithful summary of read-only independent review; not human approval, transcript or certification','reviewer':'/root/checkpoint_review','status':'NO_NEW_CODE_OR_AUTHORITY_BLOCKERS','codeCommit':binding['codeCommit'],'findings':['Current clock alias is normalized before prior context carry in three existing personal-booking intents.','Fresh 15:00 supersedes old14:30; current conflicts reject; daypart asks for clarification while retaining corrected service/day.','Permission, confirmation, tenant/branch checks and AE remain unchanged; no new mutations.','Red reproduces wrong14:30 READ; green241tests/3suites plus types/lint/K3 pass; source and patch hashes checked; owned groups closed and absent.','FK plain recommendation is a pending product choice; identify Tenant as salon account rather than branch.'],'limits':['Scripted semantic selection, mocked timeline/catalog/runtime; real AiCore and semantic validator.','No new HTTP/PG/browser/model/provider/restart acceptance.','Reviewer made no edits and ran no tests/services.']}
dump(base/'review-summary.json',review)
dump(base/'raw-inputs.json',{'artifacts':raw,'qualification':'Hashes identify private scratch reports/logs; raw Jest and log payloads are not copied into this public package.'})
shutil.copyfile(Path(__file__),base/'build-public.py')
linked=[]
for name in ['owned-stage.mjs','loopback-only.cjs']:
 p=root/'docs/rebuild/evidence/maya-development-integration-20261006/exact-time-booking-20261008/gates/launchers'/name
 assert p.read_bytes()==(Path('/tmp/maya-exact-time-validation-20261008')/name).read_bytes()
 linked.append({'path':str(p.relative_to(root)),'sha256':sha(p.read_bytes()),'qualification':'Already committed byte-exact executed dependency; absolute scratch import paths in launcher are historical provenance, not a portable command.'})
files=[]
for p in sorted(base.rglob('*')):
 if p.is_file():files.append({'path':str(p.relative_to(base)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
docs=[]
for name in ['MAYA-BOOKING-CORRECTION-CHECKPOINT-20261008.md','MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md','MAYA-REMAINING-READINESS-DECISIONS.md','MAYA-FINAL-COMPLETION-MAP.md','MAYA-APPROVED-DOMAINS-REMAINING-GAP-MAP-20261007.md']:
 p=root/'docs/rebuild'/name;docs.append({'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
dump(base/'manifest.json',{'contract':'maya.booking-time-correction-checkpoint/1','codeCommit':binding['codeCommit'],'acceptedParent':binding['parent'],'status':'QUALIFIED_LOCAL_MECHANICS_PASS','testCount':241,'suiteCount':3,'addedRegressionCases':7,'redFailureRetained':True,'sourceBinding':binding,'files':files,'documents':docs,'linkedExecutedDependencies':linked,'documentBinding':'Document hashes bind this documentation commit, not later map revisions. Prior exact-time/unified manifests retain their historical documentation bindings.','selfExcluded':'manifest.json','limits':['No new HTTP/PG/browser/restart/model/provider acceptance.','Scripted turns do not establish natural-language quality or a success percentage.','Prior three PublicBooking FK differences remain unresolved; no DB/DDL execution in this follow-up.','FK recommendation, schedule card, initial Client trust and C10 remain separate pending choices.','No production/site/SSH/paid/push/merge action.']})
print(json.dumps({'files':len(files),'documents':len(docs),'linkedDependencies':len(linked),'rawHashes':len(raw),'codeCommit':binding['codeCommit']}))
