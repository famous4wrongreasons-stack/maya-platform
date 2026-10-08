#!/usr/bin/env python3
"""Finite offline evidence projection. Default describes; --build never runs gates.

No report/log arguments are executed. Raw reports retain exact bytes only after
closed metadata validation. Private logs, receipts, environment files and PG data
are never opened. Jest names are hashed; failure/console/error payloads are omitted.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

HERE = Path('/tmp/maya-unified-evidence-summary-20261008')
REPO = Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
MAIN = Path('/tmp/maya-unified-regression-20261008')
BASE = '3febab17'
DIAGNOSTIC_SOURCE_CHANGED = 'DIAGNOSTIC_ONLY_SOURCE_CHANGED_DURING_RUN'
SOURCE_CHANGE_NOTE_SHA = 'afe68d15cfb29416d53a332b97f95d2bcbe43b318314f34f9f4aafb1637f99b4'
ORIGINAL = 'c6a35e5c61975e9d101326e7b3970331f3c905d8'
PROTECTED_PREFIXES = ('maya-os-site/', 'сайт и приложение/', 'maya-ios-carrier/')
REVIEW_SHA = '5ef89535d76b311861062e1f4067812323456395af5927a2c17d89f195425116'
PREVIOUS_SHA = 'ce399c51ce87576746f92dbe711f8340fd145ef7026c8cd9e02969979096b66b'
# Finite filenames, not directory walks/globs. New stages require a reviewed edit.
MAIN_REPORTS = (
 'g1-report.json', 'g1-resume-report.json', 'g1-after-fixes-report.json',
 'g1-final-tail-report.json', 'g2-report.json', 'g2-resume-report.json',
 'census-report.json', 'census-after-fixes-report.json', 'census-loopback-report.json',
 'e2e-report.json', 'fixes-report.json', 'fixes-attempt2-report.json',
 'pg-report.json', 'post-pg-static-report.json', 'post-fixture-static-report.json',
 'candidate-final-static-report.json', 'candidate-final-static-2-report.json',
 'booking-followup-unit-report.json', 'service-correction-unit-report.json',
 'har5-preparation-report.json', 'planner-label-dictionaries-report.json',
 'launcher-boot-failure.json', 'candidate-final-census-report.json',
 'last-fixture-checks-report.json',
)
STAGES = [('main-' + n.removesuffix('.json'), MAIN / n) for n in MAIN_REPORTS]
STAGES += [(f'pg-attempt{n}', Path(f'/tmp/maya-unified-pg-20261008-attempt{n}/pg-report.json')) for n in (2, 3, 4, 5, 6)]
STAGES += [(f'smoke-attempt{n}', Path(f'/tmp/maya-unified-smoke-20261008-attempt{n}/manifest.json')) for n in (3, 4)]
STAGES += [('branch-original', Path('/tmp/maya-unified-branch-binding-20261008/wrapper-report.json')),
           ('branch-attempt2', Path('/tmp/maya-unified-branch-binding-20261008-attempt2/wrapper-report.json'))]
STAGES += [('goods-wrapper', Path('/tmp/maya-unified-goods-ui-wrapper-20261008/wrapper-report.json')),
           ('goods-proof', Path('/tmp/maya-unified-goods-ui-20261008/manifest.json'))]
JEST = {
 'main-census-report': ('backend-full.json',),
 'main-candidate-final-census-report': ('backend-final-census.json',),
 'goods-proof': ('prepare-jest.json','resume-jest.json','restore-jest.json','har13-jest.json'),
 'main-census-after-fixes-report': ('backend-full-after-fixes.json',),
 'main-census-loopback-report': ('backend-full-loopback.json',),
 'main-e2e-report': ('backend-e2e.json',),
 'main-fixes-report': ('regression-fixes.json',),
 'main-fixes-attempt2-report': ('regression-fixes-attempt2.json',),
 'main-post-pg-static-report': ('approval-tx-regressions.json',),
 'main-booking-followup-unit-report': ('booking-followup-unit.json',),
 'main-service-correction-unit-report': ('service-correction-unit.json',),
 'main-planner-label-dictionaries-report': ('planner-label-dictionaries.json',),
 **{f'pg-attempt{n}': ('widgets-live.json', 'combined-react.json') for n in (2,3,4,5,6)},
 'branch-original': ('prepare-jest.json', 'resume-jest.json'),
 'branch-attempt2': ('prepare-jest.json', 'resume-jest.json'),
}
JEST['pg-attempt2'] += ('http-cohort.json', 'events-live.json')
JEST['pg-attempt6'] += ('booking-and-capture-target.json',)
NODE_LOGS = (('main-g2-resume-report','shell-test.log'),
             ('main-g2-resume-report','react-tests.log'),
             ('main-g2-resume-report','react-release-tests.log'),
             ('main-har5-preparation-report','har5-prepare-tests.log'))
LAUNCHERS = tuple(MAIN / n for n in (
 'static-gates.mjs', 'static-gates.census-after-fixes.mjs', 'static-gates.loopback.mjs',
 'static-gates.pg-fixes.mjs', 'static-gates.final-fixtures.mjs',
 'static-gates.candidate-final.mjs', 'static-gates.candidate-census.mjs',
 'static-gates.booking-followup.mjs', 'static-gates.service-correction.mjs',
 'static-gates.last-fixtures.mjs',
 'pg-gates.mjs', 'smoke-only-gates.mjs', 'smoke-only-gates.attempt4.mjs',
 'branch-binding-gates.mjs', 'branch-binding-gates.attempt2.mjs',
 'planner-only.mjs', 'loopback-only.cjs', 'goods-ui-wrapper.mjs',
)) + tuple(Path(f'/tmp/maya-unified-pg-20261008-attempt{n}') / name
           for n in (2,3,4,5,6) for name in ('pg-gates.mjs', 'loopback-only.cjs'))
REPORT_KEYS = set('''stage source tree node started status launcherSha256 nodeFenceSha256
 heapMb workerCount externalNodeNetwork lockfiles commands completed failures error finished
 sourceAtEnd treeAtEnd dirtyAtEnd port httpPort cluster databases database clusterStopped
 pgSharedBuffersMb pgWorkMemMb pgMaxConnections smokeServer contract output caps sourceHashes
 compiledEntrySha256 compiledEntryBinding qualification smokeGroup pidfileAbsent
 compiledEntrySha256AtEnd launcherSha256AtEnd nodeFenceSha256AtEnd sourceUnchanged
 compiledEntryUnchanged harnessUnchanged cancelled runnerSha256 scope before after sourceStable
 cause fix appOrDatabaseProcessStarted cleanupError command proofStatus kind modelSelection
 photoParser goodsProvider externalFetchCalls realModelAcceptance externalProviderAcceptance
 certificate resources cancelledBy'''.split())
HASH_KEYS = {'launcherSha256', 'nodeFenceSha256', 'runnerSha256', 'compiledEntrySha256',
             'compiledEntrySha256AtEnd', 'launcherSha256AtEnd', 'nodeFenceSha256AtEnd'}
COUNT_KEYS = ('numTotalTestSuites','numPassedTestSuites','numFailedTestSuites',
 'numPendingTestSuites','numRuntimeErrorTestSuites','numTotalTests','numPassedTests',
 'numFailedTests','numPendingTests','numTodoTests')
STATUSES = {'passed','failed','pending','todo','skipped','disabled','focused'}
SAFE_NAME = re.compile(r'[A-Za-z0-9_.-]{1,180}\Z')
HEX64 = re.compile(r'[a-f0-9]{64}\Z')
ERROR_META = re.compile(r'[A-Za-z0-9_.-]+ exited [0-9]+; inspect its log\Z')
# Metadata only: these names refer to paths, never to their contents.
ENV_KEYS = {'NODE_OPTIONS','JEST_C9_OCCUPANCY_STAGE','JEST_C9_OCCUPANCY_RECEIPT','JEST_C9_OCCUPANCY_REPORT'}
FORBIDDEN_VALUE = re.compile(r'(?i)(bearer\s|-----BEGIN |(?:password|access_token|refresh_token|api_key|secret)\s*[:=]|https?://[^/\s]+:[^@\s]+@)')
PRIVATE_NAMES = ('private', 'smoke-seed', 'postgres', 'auth', '.env', 'receipt')

class Refused(Exception):
    pass

def need(ok, reason):
    if not ok:
        raise Refused(reason)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def safe_string(value, label, maximum=16000):
    need(isinstance(value, str) and len(value) <= maximum and '\x00' not in value,
         'invalid metadata string: ' + label)
    need(not FORBIDDEN_VALUE.search(value), 'non-public metadata refused: ' + label)
    return value

def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0

def closed(obj, keys, label):
    need(isinstance(obj, dict) and not (set(obj) - keys), 'unknown metadata fields: ' + label)

def hash_map(obj, label):
    need(isinstance(obj, dict) and len(obj) <= 100, 'invalid hash map: ' + label)
    for key, value in obj.items():
        safe_string(key, label + ' key', 600)
        need(isinstance(value, str) and HEX64.fullmatch(value), 'invalid hash: ' + label)

def validate_report(v):
    closed(v, REPORT_KEYS, 'stage report')
    need(str(v.get('status','')).lower() != 'running', 'report still RUNNING')
    need(not v.get('started') or bool(v.get('finished')), 'stage lacks finished marker')
    if 'status' in v:
        need(v['status'] in ('PASS','FAIL','FAIL_BEFORE_CHILD','CANCELLED','STOPPED','FAIL_SOURCE_CHANGED','passed','failed','failed-stop'), 'unknown stage status')
    for key, value in v.items():
        if key in HASH_KEYS:
            need(isinstance(value, str) and HEX64.fullmatch(value), 'invalid report hash')
        elif key in ('source','tree','sourceAtEnd','treeAtEnd'):
            need(isinstance(value, str) and re.fullmatch('[a-f0-9]{8,40}', value), 'invalid source binding')
        elif key in ('before','after','sourceHashes','lockfiles'):
            hash_map(value, key)
        elif key in ('commands','command','completed','failures','caps','resources','smokeGroup','smokeServer'):
            continue
        elif key in ('error','cleanupError'):
            need(value is None or (isinstance(value,str) and ERROR_META.fullmatch(value)), 'error payload requires review')
        elif isinstance(value, str):
            safe_string(value, key)
        elif isinstance(value, list):
            need(key == 'databases' and all(isinstance(x,str) and SAFE_NAME.fullmatch(x) for x in value), 'unknown list metadata')
        else:
            need(value is None or isinstance(value,bool) or numeric(value), 'unknown scalar metadata')
    for command in v.get('commands', []) + ([v['command']] if 'command' in v else []):
        closed(command, {'name','command','args','cwd','timeoutMs','env','exitCode','elapsedMs','sha256'}, 'command')
        need(isinstance(command.get('name'),str) and SAFE_NAME.fullmatch(command['name']), 'invalid command name')
        for key, value in command.items():
            if key == 'args':
                need(isinstance(value,list) and len(value)<=100, 'invalid command args')
                for item in value:
                    safe_string(item, 'command argument', 4000)
            elif key == 'env':
                closed(value, ENV_KEYS, 'finite process metadata')
                for field, text in value.items():
                    safe_string(text, field, 1000)
                    if field == 'NODE_OPTIONS':
                        need(re.fullmatch(r'--max-old-space-size=\d+ --require=/tmp/maya-unified-regression-20261008/loopback-only[.]cjs', text), 'unreviewed Node flags')
                    elif field == 'JEST_C9_OCCUPANCY_STAGE':
                        need(text in ('prepare','resume'), 'unknown branch stage')
                    else:
                        need(re.fullmatch(r'/tmp/maya-unified-branch-binding-20261008(?:-attempt2)?/(?:private-restart|prepare|resume)[.]json',text), 'unknown receipt/report reference')
            elif isinstance(value,str):
                safe_string(value, key, 4000)
            else:
                need(numeric(value), 'invalid command numeric metadata')
    for item in v.get('completed', []):
        if isinstance(item,str):
            need(SAFE_NAME.fullmatch(item), 'invalid completed name')
            continue
        closed(item, {'name','durationMs','elapsedMs'}, 'completed')
        need(isinstance(item.get('name'),str) and SAFE_NAME.fullmatch(item['name']), 'invalid completed name')
        need(all(k=='name' or numeric(x) for k,x in item.items()), 'invalid completed duration')
    for item in v.get('failures', []):
        closed(item, {'name','error','durationMs','elapsedMs'}, 'failure')
        need(isinstance(item.get('name'),str) and SAFE_NAME.fullmatch(item['name']), 'invalid failed name')
        need(isinstance(item.get('error'),str) and ERROR_META.fullmatch(item['error']), 'failure payload requires review')
        need(all(k in ('name','error') or numeric(x) for k,x in item.items()), 'invalid failed duration')
    if 'caps' in v:
        closed(v['caps'], set('nodeHeapMb pgSharedBuffersMb pgWorkMemMb pgMaxConnections pgStageMs nodeStageMs smokeMs smokeTermGraceMs smokeKillWaitMs pgCleanupMs'.split()), 'caps')
        need(all(numeric(x) for x in v['caps'].values()), 'invalid cap')
    if 'resources' in v:
        closed(v['resources'], {'nodeHeapMb','pgSharedBuffersMb','jestWorkers'}, 'goods resources')
        need(all(numeric(x) for x in v['resources'].values()), 'invalid goods resources')
    for key, keys in (
        ('smokeGroup', set('detached pid pgid closed groupAbsent exitCode signal error termSent killSent'.split())),
        ('smokeServer', set('source host port stopped pid exitCode signal'.split())),
    ):
        if key not in v:
            continue
        closed(v[key], keys, key)
        for field, value in v[key].items():
            if field == 'error':
                need(value is None, 'process error payload requires review')
            elif isinstance(value,str):
                safe_string(value, key+'.'+field, 200)
            else:
                need(value is None or isinstance(value,bool) or numeric(value), 'invalid process metadata')

class Inputs:
    def __init__(self):
        self.refs = {}
        self.stamps = {}
    def bytes(self, path, maximum=96*1024*1024):
        path = Path(path)
        need(not path.is_symlink(), 'symlink input refused: '+path.name)
        if not path.exists():
            self.refs[str(path)] = {'path':str(path),'status':'NOT_RUN','rawCopied':False}
            return None
        need(path.is_file() and path.stat().st_size <= maximum, 'invalid/oversize artifact: '+path.name)
        before = path.stat()
        data = path.read_bytes()
        after = path.stat()
        stamp = (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)
        need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==stamp, 'artifact changed during read: '+path.name)
        self.stamps[path] = stamp
        self.refs[str(path)] = {'path':str(path),'status':'PRESENT','bytes':len(data),'sha256':sha(data),'rawCopied':False}
        return data
    def digest_only(self, path):
        # Only explicitly named public artifacts reach here; never private logs/receipts.
        path=Path(path)
        need(not any(x in path.name.lower() for x in PRIVATE_NAMES), 'private artifact refused')
        self.bytes(path)
    def stable(self):
        for path, stamp in self.stamps.items():
            need(path.exists(), 'artifact disappeared before publication')
            now=path.stat()
            need((now.st_dev,now.st_ino,now.st_size,now.st_mtime_ns)==stamp, 'artifact changed before publication: '+path.name)
        for name, ref in self.refs.items():
            if ref['status']=='NOT_RUN':
                need(not Path(name).exists(), 'stage appeared during collection; invoke again after freeze')

def git(*args):
    result=subprocess.run(['git','--no-optional-locks',*args],cwd=REPO,
                          stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=15,check=False)
    need(result.returncode==0 and len(result.stdout)<=16*1024*1024,'bounded read-only Git query failed')
    return result.stdout

def source_snapshot():
    head=git('rev-parse','HEAD').decode().strip()
    git('merge-base','--is-ancestor',ORIGINAL,head)
    tree=git('rev-parse','HEAD^{tree}').decode().strip()
    baseline=git('rev-parse',BASE+'^{commit}').decode().strip()
    # Refuse uncommitted tracked source. Untracked artifacts are counted, never opened.
    need(git('diff','--name-only','HEAD')==b'', 'tracked source is dirty; freeze before building')
    changed=git('diff','--no-renames','--name-only','-z',baseline,head).split(b'\0')
    changed=[p.decode('utf-8') for p in changed if p]
    need(len(changed)<=20000,'changed-path limit exceeded')
    protected=[p for p in changed if p.startswith(PROTECTED_PREFIXES)]
    need(not protected,'website/native tracked paths changed against baseline')
    def tree_map(revision):
        rows={}
        for record in git('ls-tree','-r','-z',revision).split(b'\0'):
            if not record: continue
            left,path=record.split(b'\t',1)
            mode,kind,blob=left.decode().split()
            rows[path.decode('utf-8')]={'mode':mode,'kind':kind,'blob':blob}
        return rows
    before,after=tree_map(baseline),tree_map(head)
    return {'head':head,'tree':tree,'baseline':baseline,'originalSource':ORIGINAL,
            'originalIsAncestor':True,'protectedPrefixes':list(PROTECTED_PREFIXES),
            'changedWebsiteNativePaths':protected,'trackedClean':True,
            'protectedScopeQualification':'Tracked Git path diff only; no external-side-effect claim',
            'untrackedPathCount':len([p for p in git('ls-files','--others','--exclude-standard','-z').split(b'\0') if p]),
            'changedTrackedPaths':[{'path':p,'baseline':before.get(p),'final':after.get(p)} for p in changed],
            'binding':'Committed Git blob metadata only; no tracked source/environment content opened'}

def binding(report, final_head):
    source=report.get('source')
    return {'head':source,'tree':report.get('tree'),'headAtEnd':report.get('sourceAtEnd'),
            'treeAtEnd':report.get('treeAtEnd'),'dirtyAtEnd':report.get('dirtyAtEnd'),
            'reportedStableAndClean':bool(source and report.get('sourceAtEnd')==source and report.get('dirtyAtEnd')==''),
            'sameAsFinalHead':bool(source and source==final_head),
            'contentHashesOnly':report.get('before') if not source else None,
            'sourceHashStability':report.get('sourceStable'),
            'qualification':'No missing source/end binding is inferred from the final candidate'}

def command_rows(report):
    completed={x if isinstance(x,str) else x['name'] for x in report.get('completed',[])}
    failed={x['name'] for x in report.get('failures',[])}
    if isinstance(report.get('error'),str) and ERROR_META.fullmatch(report['error']):
        failed.add(report['error'].split(' exited ',1)[0])
    rows=[]
    for command in report.get('commands',[]) + ([report['command']] if 'command' in report else []):
        name=command['name']
        code=command.get('exitCode')
        status='FAIL' if name in failed or (code is not None and code!=0) else 'PASS' if name in completed or code==0 else 'PASS' if command is report.get('command') and report.get('status')=='PASS' else 'NOT_RECORDED_COMPLETE'
        rows.append({'name':name,'status':status,'recordedExitCode':code,
                     'timeoutMs':command.get('timeoutMs')})
    return rows

def suite_path(value):
    need(isinstance(value,str),'invalid Jest suite name')
    path=Path(value)
    if path.is_absolute():
        need(path.is_relative_to(REPO),'Jest suite outside declared repository')
        value=path.relative_to(REPO).as_posix()
    need(len(value)<1000 and '..' not in Path(value).parts and '\x00' not in value,'invalid Jest suite path')
    return value

def jest_projection(raw, stage, filename, source):
    value=json.loads(raw)
    need(isinstance(value,dict) and isinstance(value.get('testResults'),list),'invalid Jest report')
    counts={k:value.get(k) for k in COUNT_KEYS}
    need(all(x is None or (isinstance(x,int) and not isinstance(x,bool) and x>=0) for x in counts.values()), 'invalid Jest counts')
    need(isinstance(value.get('success'),bool),'missing Jest success')
    suites=[]
    ids=set()
    for suite_index,suite in enumerate(value['testResults']):
        path=suite_path(suite['name'])
        need(suite.get('status') in STATUSES,'unknown Jest suite status')
        tests=[]
        occurrences=collections.Counter()
        for test_index,test in enumerate(suite.get('assertionResults',[])):
            status=test.get('status')
            need(status in STATUSES,'unknown Jest test status')
            title=test.get('fullName')
            need(isinstance(title,str) and len(title)<64000,'invalid Jest test identity')
            identity=sha((path+'\0'+title).encode())
            occurrences[identity]+=1
            exact=identity+':'+str(occurrences[identity])
            ids.add(exact)
            tests.append({'ordinal':test_index,'identitySha256':identity,'occurrence':occurrences[identity],'status':status})
        suites.append({'ordinal':suite_index,'path':path,'status':suite['status'],
                       'countsByStatus':dict(sorted(collections.Counter(x['status'] for x in tests).items())),
                       'tests':tests})
    reported_status='PASS' if value['success'] else 'FAIL'
    result={'id':stage+'/'+filename,'stage':stage,'rawArtifact':filename,
            'status':DIAGNOSTIC_SOURCE_CHANGED if stage=='main-fixes-report' else reported_status,
            'reportedStatus':reported_status,
            'qualificationNote':'targeted-source-change.json' if stage=='main-fixes-report' else None,
            'source':source,'counts':counts,'suites':suites,
            'identityPolicy':'SHA256(repo-relative suite path + NUL + fullName), per-suite duplicate occurrence; no names or failure payloads copied',
            'rawCopied':False}
    return result, ids

def node_projection(raw, stage, filename, source):
    # Node spec reporter only: retain status/counters and hash labels; never copy log lines.
    counts={}; tests=[]; suites=[]; stack=[]
    occurrences=collections.Counter()
    for line in raw.decode('utf-8',errors='replace').splitlines():
        footer=re.fullmatch(r'[ℹ#]\s+(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)',line.strip())
        if footer:
            counts[footer[1]]=float(footer[2]) if '.' in footer[2] else int(footer[2])
            continue
        start=re.fullmatch(r'(\s*)▶ (.+)',line)
        if start:
            stack.append((len(start[1]),start[2])); continue
        event=re.fullmatch(r'(\s*)([✔✖﹣]) (.+) \([\d.]+ms\)(?: # .*)?',line)
        if not event: continue
        indent,marker,label=len(event[1]),event[2],event[3]
        status={'✔':'passed','✖':'failed','﹣':'skipped'}[marker]
        if stack and stack[-1]==(indent,label):
            identity=sha(('node-suite\0'+filename+'\0'+'\0'.join(x[1] for x in stack)).encode())
            suites.append({'identitySha256':identity,'status':status})
            stack.pop(); continue
        identity=sha(('node-test\0'+filename+'\0'+'\0'.join(x[1] for x in stack)+'\0'+label).encode())
        occurrences[identity]+=1
        tests.append({'ordinal':len(tests),'identitySha256':identity,
                      'occurrence':occurrences[identity],'status':status})
    observed=dict(collections.Counter(x['status'] for x in tests))
    complete=(counts.get('tests')==len(tests) and counts.get('suites')==len(suites)
              and counts.get('pass')==observed.get('passed',0)
              and counts.get('fail')==observed.get('failed',0)
              and counts.get('skipped')==observed.get('skipped',0) and not stack)
    return {'id':stage+'/'+filename,'stage':stage,'source':source,'counts':counts,
            'projectionStatus':'COMPLETE' if complete else 'PARTIAL_REPORTER_PARSE',
            'status':'FAIL' if counts.get('fail',0)>0 else 'PASS' if complete and counts.get('cancelled')==0 else 'NOT_FULLY_PROJECTED',
            'suites':suites,'tests':tests,'rawCopied':False,
            'qualification':'Reporter projection only; launcher command status is retained separately'}

def build(output):
    need(output.is_absolute() and output.parent.resolve().is_relative_to(Path('/tmp').resolve()), 'output must be a new directory under /tmp')
    need(not output.exists() and not output.is_symlink(),'output already exists; no overwrite')
    source=source_snapshot()
    inputs=Inputs()
    # Preflight every stage before creating a staging directory or reading Jest/logs.
    reports=[]
    for stage,path in STAGES:
        raw=inputs.bytes(path,256*1024)
        if raw is None:
            reports.append((stage,path,None,None)); continue
        value=json.loads(raw)
        validate_report(value)
        reports.append((stage,path,raw,value))
    report_by_id={stage:value for stage,_,_,value in reports}
    previous=inputs.bytes(HERE/'previous-gates.json',4*1024*1024)
    need(previous is not None and sha(previous)==PREVIOUS_SHA,'historical previous-gates inventory changed')
    # The previous inventory was independently prepared; preserve its exact bytes.
    review_path=MAIN/'code-review-record.json'
    review=inputs.bytes(review_path,128*1024)
    need(review is not None and sha(review)==REVIEW_SHA,'reviewed code-review record bytes changed')
    source_change_path=MAIN/'targeted-source-change.json'
    source_change_bytes=inputs.bytes(source_change_path,16*1024)
    need(source_change_bytes is not None and sha(source_change_bytes)==SOURCE_CHANGE_NOTE_SHA,
         'reviewed source-change note bytes changed')
    source_change=json.loads(source_change_bytes)
    source_change_keys={'qualifiedStatus','initialSource','paths','cause'}
    closed(source_change,source_change_keys,'source-change note')
    need(set(source_change)==source_change_keys, 'source-change note fields missing')
    need(source_change['qualifiedStatus']==DIAGNOSTIC_SOURCE_CHANGED, 'source-change qualification differs')
    need(isinstance(source_change['initialSource'],str) and re.fullmatch('[a-f0-9]{8,40}',source_change['initialSource']), 'invalid initial source')
    need(isinstance(source_change['paths'],list) and 0<len(source_change['paths'])<=16, 'invalid source-change paths')
    for path in source_change['paths']:
        need(suite_path(path)==path and not Path(path).is_absolute(), 'source-change path must be repository-relative')
    safe_string(source_change['cause'],'source-change cause',1000)
    changed_report=report_by_id.get('main-fixes-report')
    if changed_report:
        need(changed_report.get('source','').startswith(source_change['initialSource']), 'source-change note does not bind original fixes report')
    prior=json.loads(previous)
    need(prior.get('aggregateTotals') is None and prior.get('acceptance') is False,'invalid historical inventory contract')
    temp=Path(tempfile.mkdtemp(prefix='.maya-public-evidence-',dir=output.parent))
    try:
        (temp/'reports').mkdir()
        (temp/'jest').mkdir()
        (temp/'previous-gates.json').write_bytes(previous)
        (temp/'code-review-record.json').write_bytes(review)
        (temp/'targeted-source-change.json').write_bytes(source_change_bytes)
        inputs.refs[str(HERE/'previous-gates.json')].update(rawCopied=True,bundlePath='previous-gates.json')
        inputs.refs[str(review_path)].update(rawCopied=True,bundlePath='code-review-record.json')
        inputs.refs[str(source_change_path)].update(rawCopied=True,bundlePath='targeted-source-change.json')
        stages=[]; runs=[]; overlap_sets={}; schema=[]
        for stage,path,raw,report in reports:
            if report is None:
                stages.append({'id':stage,'status':'NOT_RUN','expectedReport':str(path),'reason':'finite optional stage report absent'})
                # Missing future stages are explicit; no report means no attributed PASS.
                continue
            copied=Path('reports')/(stage+'.json')
            (temp/copied).write_bytes(raw)
            inputs.refs[str(path)]['rawCopied']=True
            inputs.refs[str(path)]['bundlePath']=copied.as_posix()
            source_binding=binding(report,source['head'])
            if stage=='main-fixes-report':
                source_binding['sourceChangedDuringRun']=True
                source_binding['qualification']=DIAGNOSTIC_SOURCE_CHANGED
                source_binding['qualificationNote']='targeted-source-change.json'
            if stage=='goods-proof':
                wrapper=report_by_id.get('goods-wrapper')
                need(wrapper is not None, 'goods proof exists without source-qualified wrapper')
                if wrapper:
                    need(wrapper.get('output')==str(path.parent),'goods wrapper/output binding differs')
                    need(wrapper.get('proofStatus')==report.get('status'),'goods wrapper/proof status differs')
                    source_binding=binding(wrapper,source['head'])
                    source_binding['viaStage']='goods-wrapper'
                    source_binding['qualification']='Wrapper source/end attestations over the exact output directory; fixture-scoped counters only'
                else:
                    source_binding['qualification']='Goods wrapper absent: proof has no committed source binding'
            commands=command_rows(report)
            status=report.get('status','NOT_RECORDED')
            status={'passed':'PASS','failed':'FAIL','failed-stop':'FAIL'}.get(status,status)
            # HAR5 preparation records command exit codes without an aggregate status.
            if any(c['status']=='FAIL' for c in commands): status='FAIL'
            if stage=='main-fixes-report': status=DIAGNOSTIC_SOURCE_CHANGED
            stages.append({'id':stage,'status':status,'reportedStatus':report.get('status'),
                           'rawReport':copied.as_posix(),'source':source_binding,
                           'started':report.get('started'),'finished':report.get('finished'),
                           'commands':commands,'launcherSha256':report.get('launcherSha256'),
                           'nodeFenceSha256':report.get('nodeFenceSha256'),
                           'clusterStopped':report.get('clusterStopped'),
                           'limits':{k:report[k] for k in ('heapMb','workerCount','pgSharedBuffersMb','pgWorkMemMb','pgMaxConnections','caps','resources') if k in report}})
            for row in commands:
                name=row['name']
                # Hash only public command logs; never copy or extract arbitrary lines.
                log=path.parent/(name+'.log')
                if not any(x in log.name.lower() for x in PRIVATE_NAMES):
                    inputs.digest_only(log)
                if name.endswith('-diff'):
                    schema.append({'stage':stage,'command':name,'status':row['status'],
                                   'source':source_binding,'rawLog':str(log),
                                   'qualification':'Migration/status success does not override the schema-diff result'})
            for filename in JEST.get(stage,()):
                jest_path=path.parent/filename
                data=inputs.bytes(jest_path)
                if data is None:
                    runs.append({'id':stage+'/'+filename,'stage':stage,'status':'NOT_RUN','source':source_binding})
                    continue
                projected,ids=jest_projection(data,stage,filename,source_binding)
                dest=Path('jest')/(stage+'--'+filename)
                write_json(temp/dest,projected)
                runs.append({'id':projected['id'],'stage':stage,'status':projected['status'],
                             'reportedStatus':projected['reportedStatus'],
                             'qualificationNote':projected['qualificationNote'],
                             'source':source_binding,'counts':projected['counts'],'projection':dest.as_posix(),
                             'rawArtifact':str(jest_path)})
                overlap_sets[projected['id']]=ids
                inputs.digest_only(path.parent/('har13-diagnostic-placement.log' if filename=='har13-jest.json' else filename.replace('.json','.log').replace('-jest.log','.log')))
        node_runs=[]
        (temp/'node').mkdir()
        for stage,filename in NODE_LOGS:
            path=MAIN/filename
            raw=inputs.bytes(path)
            report=report_by_id.get(stage)
            if raw is None or report is None:
                node_runs.append({'id':stage+'/'+filename,'status':'NOT_RUN'}); continue
            projected=node_projection(raw,stage,filename,binding(report,source['head']))
            dest=Path('node')/(stage+'--'+filename.replace('.log','.json'))
            write_json(temp/dest,projected)
            node_runs.append({key:projected[key] for key in ('id','stage','source','counts','projectionStatus','status')} | {'projection':dest.as_posix(),'rawArtifact':str(path)})
        for path in LAUNCHERS:
            inputs.digest_only(path)
        launcher_bindings=[]
        for stage,_,_,report in reports:
            if not report or 'launcherSha256' not in report: continue
            matching=[str(p) for p in LAUNCHERS if inputs.refs.get(str(p),{}).get('sha256')==report['launcherSha256']]
            launcher_bindings.append({'stage':stage,'reportedSha256':report['launcherSha256'],
                                      'matchingCurrentFiniteArtifacts':matching,
                                      'qualification':'Historical recorded hash retained even if launcher bytes were later replaced; absent match is not a replay verification'})
        # Hash identities measure overlap; totals across runs are never summed.
        overlaps=[]
        names=sorted(overlap_sets)
        for i,left in enumerate(names):
            for right in names[i+1:]:
                shared=len(overlap_sets[left]&overlap_sets[right])
                if shared:
                    overlaps.append({'left':left,'right':right,'sharedTestIdentifiers':shared,
                                     'leftIsSubset':overlap_sets[left]<=overlap_sets[right],
                                     'rightIsSubset':overlap_sets[right]<=overlap_sets[left],
                                     'aggregateAllowed':False})
        write_json(temp/'source-binding.json',source)
        summary={'contract':'maya.unified-public-gates-bundle/1','status':'QUALIFIED_EVIDENCE_ONLY',
                 'acceptance':False,'aggregateTotals':None,'finalHead':source['head'],
                 'stages':stages,'jestRuns':runs,'nodeTestRuns':node_runs,'overlap':overlaps,'schemaDiffObservations':schema,
                 'schemaDiffOverall':'FAIL','schemaDiffReason':'Historical actual PublicBooking FK diff FAIL remains unresolved; this bundle grants no schema decision',
                 'historicalInventory':'previous-gates.json','independentCodeReview':'code-review-record.json',
                 'sourceChangeQualification':'targeted-source-change.json',
                 'limits':['No summed total across retries, corpora or candidates',
                           'PASS belongs to its recorded source, never reassigned to final HEAD',
                           'Missing stages are NOT_RUN; absent end binding stays unqualified',
                           'Heap settings are ceilings, not observed RSS/headroom',
                           'No real model/provider/language/release acceptance',
                           'The builder performs no gate, test, service, migration or network action'],
                 'privacy':{'rawJestCopied':False,'rawLogsCopied':False,'failurePayloadsCopied':False,
                            'privateReceiptsRead':False,'pgDataRead':False,'environmentFilesRead':False},
                 'launcherBindings':launcher_bindings,'rawArtifacts':list(inputs.refs.values())}
        write_json(temp/'summary.json',summary)
        (temp/'README.md').write_text('''# Qualified local gate evidence\n\nRead `summary.json` for independent stage results, `source-binding.json` for final committed HEAD and changed tracked paths against 3febab17, and `previous-gates.json` for the preserved historical inventory. Raw metadata reports retain exact input bytes. Jest projections contain counts and per-suite/test status; test names are hashed and error/console payloads are absent. Raw logs/Jest/launchers are referenced only by SHA-256 and bytes. Private logs, receipts, environment files and PG data are not opened.\n\nThe exact targeted-source-change note qualifies the first fixes stage/Jest as DIAGNOSTIC_ONLY_SOURCE_CHANGED_DURING_RUN regardless of raw counts; original report bytes and reported status are retained.\n\nThere is no combined test total. An earlier PASS is qualified to its own source, not the final candidate. Missing stages remain NOT_RUN. Actual historical schema-diff FAIL remains unresolved. This bundle is neither release certification nor real-model/provider/language acceptance.\n\nThe copied builder defaults to describe-only. It reads exact /tmp inputs and uses read-only Git metadata. Rebuild after a clean source freeze into another new /tmp directory; input hashes and output checksums make differing executions detectable.\n''')
        (temp/'build-public-bundle.py').write_bytes(Path(__file__).read_bytes())
        inputs.stable()
        need(source_snapshot()==source,'source changed during evidence projection')
        checks=[]
        for path in sorted(temp.rglob('*')):
            if path.is_file():
                checks.append({'path':path.relative_to(temp).as_posix(),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())})
        write_json(temp/'bundle-files.json',{'contract':'maya.evidence-files/1','files':checks,'selfExcluded':True})
        need(not output.exists(),'output appeared before publication')
        temp.rename(output)
        print(json.dumps({'output':str(output),'head':source['head'],'status':'QUALIFIED_EVIDENCE_ONLY',
                          'schemaDiffOverall':'FAIL','aggregateTotals':None,'newTestsRun':False}))
    finally:
        if temp.exists(): shutil.rmtree(temp)

def write_json(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--describe',action='store_true')
    mode.add_argument('--build',action='store_true')
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if not args.build:
        need(args.output is None,'--output requires --build')
        print(json.dumps({'mode':'DESCRIBE_ONLY','repo':str(REPO),'baseline':BASE,
                          'stages':[{'id':s,'report':str(p),'optionalIfAbsent':True} for s,p in STAGES],
                          'noTestsServicesNetwork':True,'runningStageBlocksBuild':True,
                          'rawReportPolicy':'closed metadata schema, exact bytes; unknown/error payload refuses',
                          'rawJestAndLogsCopied':False,'aggregateTotals':None},indent=2))
        return
    need(args.output is not None,'--build requires a new --output directory under /tmp')
    build(args.output)

if __name__=='__main__':
    try:
        main()
    except (Refused,ValueError,OSError,subprocess.SubprocessError) as exc:
        # Never print arbitrary JSON/decode/subprocess exception contents.
        message=str(exc) if isinstance(exc,Refused) else type(exc).__name__
        print(json.dumps({'status':'REFUSED','reason':message}),file=sys.stderr)
        sys.exit(2)
