from pathlib import Path
import copy,datetime,hashlib,importlib.util,json,subprocess
root=Path.cwd();w=root/'work/release-packaging-final-20261003';o=root/'outputs/release-packaging-final-20261003';archive=o/'receipts/suspend-invalidated/20261003-clamshell'
spec=importlib.util.spec_from_file_location('recovery',w/'suspend-recovery-validation.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
old=json.loads((archive/'widgets-mutation-part-WR-part-3-of-4.json').read_text());new=copy.deepcopy(old)
new.update(startedAt='2026-10-03T18:10:00Z',finishedAt='2026-10-03T18:30:00Z',mirror='fresh-test-mirror',jest_cache='fresh-test-cache')
execution={'candidate':old['source_head'],'startedAt':'2026-10-03T18:00:00Z','completedAt':'2026-10-03T18:31:00Z'}
events=json.loads((o/'SUSPEND-RECOVERY-PLAN.json').read_text())['powerEvents'];now=m.stamp('2026-10-03T18:32:00Z');windows=m.intervals(events,now)
assert len(windows)==1 and m.overlaps(old,windows) and not m.overlaps(new,windows)
m.replacement(old,new,execution,windows);rows=[{'case':'whole-partition fixture after full wake','result':'PASS'}]
def refused(name,mutate):
 n=copy.deepcopy(new);e=copy.deepcopy(execution);ww=list(windows);mutate(n,e,ww)
 try:m.replacement(old,n,e,ww)
 except AssertionError:rows.append({'case':name,'result':'REFUSED'});return
 raise AssertionError('Incorrectly admitted '+name)
refused('old attempt substituted',lambda n,e,w:n.update(old))
refused('candidate substituted',lambda n,e,w:n.update(source_head='0'*40))
refused('declaration hash substituted',lambda n,e,w:n.update(battery_hashes={}))
refused('only a subset of mutants',lambda n,e,w:n['partition'].update(mutant_ids=[]))
refused('filtered tests',lambda n,e,w:n['restrictions'].update(unit_tests=['one.test.ts']))
refused('baseline red',lambda n,e,w:n.update(baseline_red=['bad']))
refused('mismatch',lambda n,e,w:n.update(mismatches=1))
refused('old mirror reused',lambda n,e,w:n.update(mirror=old['mirror']))
refused('old cache reused',lambda n,e,w:n.update(jest_cache=old['jest_cache']))
refused('new suspend overlaps admitted result',lambda n,e,w:w.append((m.stamp('2026-10-03T18:20:00Z'),now)))
refused('result outside recovery window',lambda n,e,w:n.update(finishedAt='2026-10-03T18:32:00Z'))
# Regression: a worker mirror is reused across sequential parts. A shared
# directory alone must not exclude earlier valid rows, nor should time alone
# exclude an unrelated worker.
a=m.stamp('2026-10-03T17:00:00Z');b=m.stamp('2026-10-03T17:00:05Z')
invalid=[('/var/test-mirror',m.stamp('2026-10-03T16:48:42Z'),m.stamp('2026-10-03T17:56:44Z'))]
assert len(m.invalid_trace_match('/private/var/test-mirror/legacy',a,b,invalid))==1
assert m.invalid_trace_match('/private/var/test-mirror/legacy',m.stamp('2026-10-03T07:55:00Z'),m.stamp('2026-10-03T07:55:05Z'),invalid)==[]
assert m.invalid_trace_match('/private/var/other-mirror/legacy',a,b,invalid)==[]
rows += [{'case':'exact mirror plus invalidated interval excluded','result':'PASS'}, {'case':'earlier valid job in reused mirror retained','result':'PASS'}, {'case':'unrelated worker at same time retained','result':'PASS'}]
prior=json.loads((o/'receipts/reporting-attribution-original/SUSPEND-RECOVERY-ADMISSION-COUNTERFACTS.json').read_text());assert prior['actualIncompleteGateExit']!=0
r=subprocess.run(['python3',str(w/'check-host-environment.py')],cwd=root,capture_output=True,text=True)
assert r.returncode==0,r.stdout+r.stderr
host=json.loads((o/'HOST-ENVIRONMENT-CHECK.json').read_text());assert host['status']=='PASS' and not host['reexecutionRequired']
assert not (o/'CERTIFICATION-RECEIPTS.json').exists()
rows.append({'case':'actual whole-partition recovery admitted after immutable bindings validated','result':'PASS'})
(o/'SUSPEND-RECOVERY-ADMISSION-COUNTERFACTS.json').write_text(json.dumps({'candidate':old['source_head'],'status':'PASS','testSourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'validatorSha256':hashlib.sha256((w/'suspend-recovery-validation.py').read_bytes()).hexdigest(),'cases':rows,'actualIncompleteGateExit':prior['actualIncompleteGateExit'],'actualCompleteGateExit':r.returncode,'priorIncompleteProofSha256':hashlib.sha256((o/'receipts/reporting-attribution-original/SUSPEND-RECOVERY-ADMISSION-COUNTERFACTS.json').read_bytes()).hexdigest(),'syntheticCounterfactsOnly':True,'productTestsReplaced':False,'admissionStillPending':True},indent=2)+'\n')
print(json.dumps(rows))
