"""Build finite public projections from completed local gates; never reads private logs/PG data."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
RAW = Path('/tmp/maya-exact-time-validation-20261008')
OUT = Path('/tmp/maya-exact-time-public-20261008')
BASE = 'e5113addc422de7f5ced655ab438d0415b4c2681'
CANDIDATE = 'b60dd55ffacba86fd2f81476e6708de439886770'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

assert git('rev-parse', 'HEAD') == CANDIDATE
assert not git('status', '--porcelain')
assert not OUT.exists()
protected = ['maya-saas-backend/prisma', 'maya-saas-backend/src/appointments/public-booking.repository.ts', 'maya-saas-backend/src/appointments/public-booking.service.ts', 'maya-saas-backend/src/crm/adapters/yclients-crm.adapter.ts', 'сайт и приложение', 'maya-os-site', 'maya-ios-carrier', 'maya-chat-shell', 'maya-carrier-react']
assert not git('diff', '--name-only', BASE, CANDIDATE, '--', *protected)
OUT.mkdir(mode=0o700)
inputs = []

def write(name, value):
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def bind(source, output=None, mode='digest only'):
    data = source.read_bytes()
    item = {'source': str(source), 'sha256': sha(data), 'bytes': len(data), 'mode': mode}
    if output:
        target = OUT / output
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        item['output'] = output
    inputs.append(item)
    return data

stages = []
for folder, filename in [('local-attempt1','report.json'),('local-attempt2','report.json'),('local-attempt3','report.json'),('http-attempt1','pg-report.json')]:
    data = bind(RAW/folder/filename, 'reports/'+folder+'.json', 'byte-exact reviewed metadata')
    report = json.loads(data)
    assert report['status'] != 'RUNNING' and report.get('finished')
    assert report['source'] == report['sourceAtEnd'] and not report['dirtyAtEnd']
    assert report['harnessUnchanged']
    assert all(g['closed'] and g['groupAbsent'] for g in report['groups'].values())
    stages.append({'id': folder, 'source': report['source'], 'status': report['status'], 'functionalStatus': report.get('functionalStatus'), 'schemaDiffStatus': report.get('schemaDiffStatus'), 'sourceAndHarnessStable': True, 'ownedGroupsClosedAndAbsent': True, 'report':'reports/'+folder+'.json'})
    raw_jest = RAW/folder/('booking-and-capture-target.json' if folder.startswith('http') else 'targeted-unit.json')
    raw_data = bind(raw_jest)
    result = json.loads(raw_data)
    projection = {
        'contract': 'maya.qualified-jest-status-projection/1',
        'source': report['source'], 'rawSha256': sha(raw_data),
        'qualification': 'Counts and hashed test identities only; failure/console/auth payloads omitted. Repeated cohorts overlap; not additive.',
        'counts': {key: value for key, value in result.items() if key.startswith('num')},
        'suites': [{'path': str(Path(s['name']).relative_to(ROOT)), 'status': s['status'], 'assertions': [{'identitySha256': sha(t['fullName'].encode()), 'status': t['status']} for t in s.get('assertionResults', [])]} for s in result['testResults']],
    }
    write('jest/'+folder+'.json', projection)
    stages[-1]['jest'] = 'jest/'+folder+'.json'
    stages[-1]['counts'] = projection['counts']

http = json.loads((RAW/'http-attempt1/pg-report.json').read_text())
assert http['functionalStatus'] == 'PASS' and http['schemaDiffStatus'] == 'FAIL'
assert http['clusterStopped'] and http['pidfileAbsent']
assert len(http['failures']) == 1 and http['failures'][0]['name'].endswith('-diff')
diff = RAW/'http-attempt1/maya_widget_gate_proof_exact_time-diff.log'
diff_text = diff.read_text()
assert diff_text.count('[*] Changed the') == 3
assert all('`'+name+'`' in diff_text for name in ['PublicBookingAttempt','PublicBookingQuote','PublicBookingSession'])
for filename in ['schema-guest_constraints.log','schema-guest_migrations.log','maya_widget_gate_proof_exact_time-diff.log']:
    bind(RAW/'http-attempt1'/filename, 'schema/'+filename, 'byte-exact reviewed public schema metadata')
for filename in ['local-gates.mjs','http-gates.mjs','owned-stage.mjs','loopback-only.cjs','supervisor-probe.mjs']:
    bind(RAW/filename,'launchers/'+filename,'byte-exact reviewed historical launcher; absolute paths are provenance, not portable commands')
bind(RAW/'supervisor-probe/report.json','reports/supervisor-probe.json','byte-exact harmless child/grandchild probe metadata')
bind(Path(__file__),'build-public-evidence.py','byte-exact evidence builder')

changed = git('diff','--name-only',BASE,CANDIDATE).splitlines()
write('source-binding.json', {'contract':'maya.exact-time-source-binding/1','base':BASE,'candidate':CANDIDATE,'tree':git('rev-parse','HEAD^{tree}'),'cleanAtCollection':True,'protectedUnchangedPaths':protected,'changedPaths':[{'path':p,'blob':git('rev-parse',CANDIDATE+':'+p),'sha256':sha((ROOT/p).read_bytes())} for p in changed]})
write('summary.json', {
    'contract':'maya.exact-time-qualified-checkpoint/1','candidate':CANDIDATE,
    'status':'QUALIFIED_LOCAL_FUNCTIONAL_PASS_WITH_UNRESOLVED_SCHEMA_DIFF','aggregateTests':None,
    'stages':stages,'schemaDiff':'FAIL','httpOwnedPgStopped':True,
    'failureQualifications':[
        'local-attempt1 at4bac6a30:467pass/1fail of468; observed loss of exact time after service correction.',
        'local-attempt2 atb768c9aa:469unitpass and backend/widgets types pass; three TypeScript generic-comma lint errors stopped later static stages.',
        'local-attempt3 atb60dd55f:469/7unit, types/lint/contract/K3 pass.',
        'http-attempt1 atb60dd55f:13/3HTTP pass; migration validate/deploy/status pass; overall runner FAIL solely for three unchanged PublicBookingFK differences.'
    ],
    'limits':[
        'Finite exact-time selected-staff slice only. Ambiguous DST instants are refused, not fully supported.',
        'A durable exact alias UNKNOWN test proves routing only; no new persistence/provider UNKNOWN acceptance.',
        'HTTP uses actual local Nest/PostgreSQL and a separate Node headless carrier; no new actual browser/PG restart proof.',
        'Intentional synthetic/internal DB and AE fixture effects occur; no global zero-effects claim.',
        'Scripted model selections and synthetic sources are not real language/model/provider acceptance.',
        'No correction migration or upgrade fixture: parent replacement semantics remain an exact owner decision.',
        'Earlier7237/645backend and562/57HTTP aggregate results belong to4023c4d5; they were not rerun or relabeled.',
        'Historical unified package document hashes bind e5113add docs, not later map revisions.',
        'No website source, published migration, provider adapter, production, SSH, paid call, push or merge changes.',
        'No C10 autonomy or release/certificate acceptance.'
    ]
})
write('input-artifacts.json',{'contract':'maya.exact-time-input-digests/1','inputs':inputs})
for item in inputs:
    data=Path(item['source']).read_bytes()
    assert sha(data)==item['sha256'] and len(data)==item['bytes']
assert git('rev-parse','HEAD')==CANDIDATE and not git('status','--porcelain')
write('bundle-files.json',{'contract':'maya.exact-time-evidence-files/1','selfExcluded':'bundle-files.json','files':[{'path':str(p.relative_to(OUT)),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in sorted(OUT.rglob('*')) if p.is_file()]})
print(json.dumps({'output':str(OUT),'status':'PASS','files':len(list(OUT.rglob('*'))),'candidate':CANDIDATE}))
