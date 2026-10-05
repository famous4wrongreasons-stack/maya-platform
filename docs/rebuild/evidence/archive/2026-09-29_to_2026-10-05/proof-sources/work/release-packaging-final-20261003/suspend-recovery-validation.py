"""Reporting-only admission of explicit whole-partition recovery; never executes tests."""
from pathlib import Path
import datetime,hashlib,json,subprocess
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())
stamp=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00'))

def intervals(events,now):
    result=[];opened=None
    for event in events:
        t=stamp(event['utc'])
        if event['event']=='Sleep' and opened is None:opened=t
        elif event['event']=='Wake' and opened is not None:
            result.append((opened,t));opened=None
    if opened is not None:result.append((opened,now))
    return result

def overlaps(part,windows):
    a,b=stamp(part['startedAt']),stamp(part['finishedAt'])
    assert a<=b
    return any(a<=end and b>=begin for begin,end in windows)

def replacement(old,new,execution,windows):
    assert new['source_head']==old['source_head']==execution['candidate']
    for key in ['contract','battery_hashes','partition','batteries','steps','neutraliser_sets']:
        assert new[key]==old[key],key
    assert new['restrictions']==old['restrictions']=={'live_tests':None,'live_filter':None,'unit_tests':None}
    assert new['status']=='PARTITION-AS-DECLARED' and new['mismatches']==0 and new['baseline_red']==[]
    assert stamp(execution['startedAt'])<=stamp(new['startedAt'])<=stamp(new['finishedAt'])<=stamp(execution['completedAt'])
    assert new['mirror']!=old['mirror'] and new['jest_cache']!=old['jest_cache']
    assert not overlaps(new,windows),'Admitted partition overlaps host suspend'

def invalid_trace_match(cwd,a,b,invalid):
    # The native runner reuses a mirror across sequential jobs on one worker.
    # Both mirror identity AND the exact invalidated partition interval are needed.
    return [(begin,end) for mirror,begin,end in invalid
            if cwd.replace('/private/var/','/var/').startswith(mirror+'/') and a<=end and b>=begin]

def validate(root,events,now):
    w=root/'work/release-packaging-final-20261003';rw=root/'work/release-packaging-recovery-20261003';o=root/'outputs/release-packaging-final-20261003';r=o/'receipts';repo=root/'work/maya-controlled-integration'
    plan=read(o/'SUSPEND-RECOVERY-PLAN.json');execution=read(o/'SUSPEND-RECOVERY-EXECUTION.json');candidate=(w/'HEAD').read_text().strip()
    assert candidate==plan['candidate']==execution['candidate']=='77ecb3f5696583389e75592141f46fd0664d33d8'
    assert execution['status']=='PASS' and execution['exit']==0
    assert execution['planSha256']==sha(o/'SUSPEND-RECOVERY-PLAN.json')
    assert execution['restrictions'] is None and execution['timeoutsChanged'] is False
    assert execution['slots']==plan['affectedSlots']==['WR-part-3-of-4','WR-part-4-of-4']
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==candidate
    assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
    for row in plan['archive']:assert sha(o/row['archive'])==row['sha256'],row['archive']
    assert sha(root/plan['canonicalRunner']['path'])==plan['canonicalRunner']['sha256']
    for row in execution['sources']:assert sha(root/row['path'])==row['sha256'],row['path']
    assert sha(rw/'r06-child-trace.cjs')==sha(w/'r06-child-trace.cjs')
    assert len(plan['unchanged65Parts'])==65
    for row in plan['unchanged65Parts']+plan['otherExecutionReceiptsBeforeSuspend']:
        assert sha(o/row['path'])==row['sha256'],row['path']
    windows=intervals(events,now);assert windows
    archive=r/'suspend-invalidated/20261003-clamshell';fresh=[]
    for slot in execution['slots']:
        pp=r/'mutation-parts'/('widgets-mutation-part-'+slot+'.json');old=read(archive/pp.name);new=read(pp)
        assert overlaps(old,windows)
        replacement(old,new,execution,windows)
        receipt=r/('mutation-'+slot+'.receipt.json');rc=read(receipt)
        assert rc['candidate']==candidate and rc['exit']==0 and rc['seconds']<10800
        assert Path(rc['cwd']).parent in [rw/'mutation-recovery-worker-1',rw/'mutation-recovery-worker-2']
        partition='3/4' if slot=='WR-part-3-of-4' else '4/4'
        assert rc['command']==['node','scripts/widgets-mutation-battery.mjs','--gate','WR','--partition',partition,'--out',str(pp)]
        fresh.append({'slot':slot,'oldPartSha256':sha(archive/pp.name),'newPartSha256':sha(pp),'newReceiptSha256':sha(receipt),'startedAt':new['startedAt'],'finishedAt':new['finishedAt'],'wholeCanonicalPartition':True,'freshMirror':new['mirror']})
    parts=sorted((r/'mutation-parts').glob('*.json'));assert len(parts)==67
    assert not any(overlaps(read(p),windows) for p in parts),'Another admitted part overlaps sleep'
    # Original R06 traces remain raw diagnostics. Omit entries inside invalidated
    # exact part mirrors from current admission, even when those entries preceded sleep.
    invalid=[(read(archive/Path(row['path']).name)['mirror'].replace('/private/var/','/var/'),stamp(row['startedAt']),stamp(row['finishedAt'])) for row in plan['invalidatedParts']]
    traces=[]
    for p in sorted(r.glob('r06-native-worker-*.jsonl'))+sorted(r.glob('r06-recovery-worker-*.jsonl')):
        rows=[json.loads(line) for line in p.read_text().splitlines()];assert rows
        fresh_trace=p.name.startswith('r06-recovery-');kept=[];excluded=[]
        for d in rows:
            a=datetime.datetime.fromtimestamp(d['started']/1000,datetime.timezone.utc);b=a+datetime.timedelta(milliseconds=d['elapsedMs'])
            invalid_match=invalid_trace_match(d['cwd'],a,b,invalid)
            if not fresh_trace and invalid_match:
                assert len(invalid_match)==1 and invalid_match[0][0]<=a<=b<=invalid_match[0][1]
                excluded.append(d);continue
            assert d['status']==0 and d['signal'] is None and d['error'] is None and d['timeout']==20000
            assert not any(a<=end and b>=begin for begin,end in windows)
            if fresh_trace:assert stamp(execution['startedAt'])<=a<=b<=stamp(execution['completedAt'])
            kept.append(d)
        assert kept
        traces.append({'path':str(p.relative_to(o)),'sha256':sha(p),'admittedExecutions':len(kept),'excludedInvalidatedAttemptExecutions':len(excluded),'maxElapsedMs':max(d['elapsedMs'] for d in kept),'replacementTrace':fresh_trace})
    assert len(traces)==8 and sum(t['replacementTrace'] for t in traces)==2
    return {'candidate':candidate,'status':'PASS','checkedAt':now.isoformat(),'plan':{'path':'SUSPEND-RECOVERY-PLAN.json','sha256':sha(o/'SUSPEND-RECOVERY-PLAN.json')},'execution':{'path':'SUSPEND-RECOVERY-EXECUTION.json','sha256':sha(o/'SUSPEND-RECOVERY-EXECUTION.json')},'suspendIntervals':[{'from':a.isoformat(),'throughFullWake':b.isoformat()} for a,b in windows],'admittedPartitions':67,'unchangedSameProgrammePartitions':65,'wholePartitionsReexecuted':fresh,'admittedSleepOverlaps':0,'admittedRawR06Traces':traces,'timeoutsChanged':False,'productCandidateChanged':False,'originalSleepAndReceiptsRetained':True,'newWaivers':0,'bootstrapLogNote':'Recovery bootstrap reused migration-worker-1/2 log filenames; those bootstrap logs are not release-admission evidence. All original mutation part, test log and job receipts were retained. Replacement DB names and migration stdout remain recorded in recovery execution.'}
