"""Regression proof of the actual reporting guard; no product or evidence mutation."""
from pathlib import Path
import ast
import copy
import datetime
import hashlib
import json

root = Path.cwd()
work = root / 'work/ar1-single-operator-final-20261005'
out = root / 'outputs/ar1-single-operator-final-20261005'
source = work / 'finalize-receipts.py'
candidate = (work / 'HEAD').read_text().strip()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
guards = [n for n in ast.walk(ast.parse(source.read_text())) if isinstance(n, ast.Assert)
          and any(isinstance(x, ast.Name) and x.id == 'd' for x in ast.walk(n))
          and 'source_head' in ast.unparse(n)]
assert len(guards) == 1
code = compile(ast.fix_missing_locations(ast.Module(body=guards, type_ignores=[])), str(source), 'exec')
plan = json.loads((out / 'receipts/mutation-plan.json').read_text())
assert plan['candidate'] == candidate and len(plan['jobs']) == 68
partitions = {'widgets-mutation-part-' + j['slot'] + '.json': j['partition'] for j in plan['jobs']}
rows = []
for name, partition in partitions.items():
    p = out / 'receipts/mutation-parts' / name
    d = json.loads(p.read_text())
    exec(code, {'p': p, 'd': d, 'candidate': candidate, 'partitions': partitions})
    rows.append({'path': str(p.relative_to(out)), 'sha256': sha(p), 'status': d['status']})

cases = []
def check(name, filename, mutate):
    p = out / 'receipts/mutation-parts' / filename
    d = copy.deepcopy(json.loads(p.read_text()))
    mutate(d)
    refused = False
    try:
        exec(code, {'p': p, 'd': d, 'candidate': candidate, 'partitions': partitions})
    except (AssertionError, KeyError):
        refused = True
    assert refused, name
    cases.append({'name': name, 'refused': refused})

whole = 'widgets-mutation-part-NS.json'
part = 'widgets-mutation-part-6-part-1-of-4.json'
check('partition promoted to whole', part, lambda d: d.update(status='AS-DECLARED'))
check('whole substituted with partition', whole, lambda d: d.update(status='PARTITION-AS-DECLARED'))
check('wrong candidate', whole, lambda d: d.update(source_head='0' * 40))
check('red baseline', part, lambda d: d.update(baseline_red=['live']))
check('missing status', part, lambda d: d.pop('status'))
check('failed whole result', whole, lambda d: d.update(status='FAIL'))
value = {'candidate': candidate, 'status': 'PASS',
         'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'sourceSha256': sha(source), 'driverSha256': sha(Path(__file__)),
         'beforeProof': {'path': 'REPORT-FINALIZER-BEFORE.json', 'sha256': sha(out / 'REPORT-FINALIZER-BEFORE.json')},
         'actualParts': rows, 'negativeChecks': cases,
         'scope': 'Reporting adapter only; raw bytes and canonical strict collector unchanged; complete corpus still mandatory.',
         'productChanged': False, 'productionEffects': 0}
(out / 'REPORT-FINALIZER-PROOF.json').write_text(json.dumps(value, indent=2) + '\n')
print('Reporting guard: 68 real parts PASS, 6 substitutions/refusals PASS; no product change.')
