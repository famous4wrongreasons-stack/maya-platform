"""Counterfactual checks of the actual hosted-import admission assertions."""
from pathlib import Path
import ast
import copy
import datetime
import hashlib
import json

root = Path.cwd()
work = root / 'work/ar1-single-operator-final-20261005'
out = root / 'outputs/ar1-single-operator-final-20261005'
candidate = (work / 'HEAD').read_text().strip()
source_path = work / 'import-hosted-mutations.py'
source = source_path.read_text()
guards = [node for node in ast.parse(source).body if isinstance(node, ast.Assert)
          and any(isinstance(name, ast.Name) and name.id in {'publication', 'run', 'jobs'}
                  for name in ast.walk(node))]
assert len(guards) == 4
code = compile(ast.fix_missing_locations(ast.Module(body=guards, type_ignores=[])),
               str(source_path), 'exec')
base = {'candidate': candidate,
        'publication': {'candidate': candidate, 'status': 'PASS', 'productionOperations': 0},
        'run': {'headSha': candidate, 'conclusion': 'success'},
        'jobs': [{'conclusion': 'success'} for _ in range(70)]}

def check(name, modify, admitted):
    env = copy.deepcopy(base)
    modify(env)
    try:
        exec(code, env)
        observed = True
    except (AssertionError, KeyError):
        observed = False
    assert observed is admitted, name
    return {'name': name, 'admitted': observed, 'expected': admitted}

rows = [
    check('complete exact candidate control', lambda e: None, True),
    check('pending publication refused', lambda e: e['publication'].update(status='AWAITING HOSTED CI'), False),
    check('missing publication result refused', lambda e: e['publication'].pop('status'), False),
    check('wrong candidate refused', lambda e: e['publication'].update(candidate='a' * 40), False),
    check('production effect refused', lambda e: e['publication'].update(productionOperations=1), False),
    check('wrong hosted head refused', lambda e: e['run'].update(headSha='b' * 40), False),
    check('failed workflow refused', lambda e: e['run'].update(conclusion='failure'), False),
    check('incomplete job set refused', lambda e: e['jobs'].pop(), False),
    check('failed job refused', lambda e: e['jobs'][0].update(conclusion='failure'), False),
    check('in-progress job refused', lambda e: e['jobs'][0].update(conclusion=None), False),
    check('missing job conclusion refused', lambda e: e['jobs'][0].pop('conclusion'), False),
]
part_guards = [node for node in ast.walk(ast.parse(source)) if isinstance(node, ast.Assert)
               and any(isinstance(name, ast.Name) and name.id == 'part'
                       for name in ast.walk(node))]
assert len(part_guards) == 3
part_code = compile(ast.fix_missing_locations(ast.Module(body=part_guards, type_ignores=[])),
                    str(source_path), 'exec')
def check_part(name, partition, status, modify, admitted):
    part = {'source_head': candidate, 'status': status, 'baseline_red': [],
            'mismatches': 0, 'restrictions': {'live_tests': None, 'live_filter': None, 'unit_tests': None}}
    modify(part)
    try:
        exec(part_code, {'candidate': candidate, 'declared': {'partition': partition}, 'part': part})
        observed = True
    except (AssertionError, KeyError):
        observed = False
    assert observed is admitted, name
    return {'name': name, 'admittedForStrictReassembly': observed, 'expected': admitted}
part_rows = [
    check_part('complete battery control', '', 'AS-DECLARED', lambda p: None, True),
    check_part('partition control', '1/4', 'PARTITION-AS-DECLARED', lambda p: None, True),
    check_part('partition promoted to whole refused', '1/4', 'AS-DECLARED', lambda p: None, False),
    check_part('whole substituted with partition refused', '', 'PARTITION-AS-DECLARED', lambda p: None, False),
    check_part('red baseline refused', '', 'AS-DECLARED', lambda p: p.update(baseline_red=['live']), False),
    check_part('mismatched outcomes refused', '', 'AS-DECLARED', lambda p: p.update(mismatches=1), False),
    check_part('filtered tests refused', '', 'AS-DECLARED', lambda p: p['restrictions'].update(live_tests=['one']), False),
    check_part('foreign source refused', '', 'AS-DECLARED', lambda p: p.update(source_head='c'*40), False),
    check_part('missing part result refused', '', 'AS-DECLARED', lambda p: p.pop('status'), False),
]
actual_parts = []
for slot, partition in [('NS', ''), ('6-part-1-of-4', '1/4')]:
    path = work / 'hosted-shape-inspection' / ('widgets-mutation-part-' + slot + '.json')
    part = json.loads(path.read_text())
    exec(part_code, {'candidate': candidate, 'declared': {'partition': partition}, 'part': part})
    actual_parts.append({'slot': slot, 'status': part['status'],
                         'artifactSha256': hashlib.sha256(path.read_bytes()).hexdigest()})
result = {'candidate': candidate, 'status': 'PASS',
          'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'source': str(source_path.relative_to(root)),
          'sourceSha256': hashlib.sha256(source.encode()).hexdigest(),
          'proofDriverSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'checks': rows, 'partChecks': part_rows, 'actualHostedPartChecks': actual_parts,
          'adapterBeforeProof': str((work / 'hosted-shape-inspection/PARTITION-IMPORT-BEFORE.json').relative_to(root)),
          'admissionOfPartialReport': False,
          'scope': 'Actual current importer assertion AST with synthetic metadata. This creates no real evidence or certificate; complete fresh raw parts and unchanged canonical strict release collector remain mandatory.',
          'productionEffects': 0}
(out / 'HARNESS-INTERMEDIATE-RECEIPT.json').write_text(json.dumps(result, indent=2) + '\n')
print('Actual current hosted admission guards: 20/20 PASS plus 2 real artifact checks; no partial certificate admitted.')
