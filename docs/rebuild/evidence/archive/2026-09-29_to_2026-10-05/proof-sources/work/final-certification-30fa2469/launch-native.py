from pathlib import Path
import json, subprocess, time

root = Path.cwd()
work = root / 'work/final-certification-30fa2469'
out = root / 'outputs/final-certification-30fa2469/receipts'
candidate = '30fa24698f3ae277c22209e8edfd448c29e4f872'
for name in ['backend-full', 'widgets-live-full', 'legacy-python-full', 'e2e', 'k5-exit', 'carrier-capacitor-build']:
    path = out / (name + '.receipt.json')
    while not path.exists():
        time.sleep(1)
    result = json.loads(path.read_text())
    assert result['candidate'] == candidate and result['exit'] == 0, name
for name, field, expected in [('main-programme-status.json', 'exits', [0]*8), ('l27-runtime-mutations.json', 'status', 'PASS')]:
    path = out / name
    while not path.exists() or (name.startswith('l27-') and json.loads(path.read_text()).get('status') is None):
        time.sleep(1)
    result = json.loads(path.read_text())
    assert result['candidate'] == candidate and result[field] == expected, name
diagnostic = out.parent / 'DIAGNOSTIC-PREFLIGHT.json'
while not diagnostic.exists():
    time.sleep(1)
assert json.loads(diagnostic.read_text())['status'] == 'PASS', 'Diagnostic survivor must be resolved before final full corpus'
statepath = work / 'STATE.json'
state = json.loads(statepath.read_text())
state.update(phase='FULL NATIVE MUTATION CORPUS', ordinaryProgramme='PASS', l27Mutations='8/8 KILLED')
statepath.write_text(json.dumps(state, indent=2)+'\n')
print('Fresh component gates passed; launching complete native corpus.', flush=True)
raise SystemExit(subprocess.run(['python3', str(work/'run-all-mutations-isolated.py')], cwd=root).returncode)
