from pathlib import Path
import datetime, json, subprocess

root = Path.cwd()
work = root / 'work/final-certification-705d57cd'
out = root / 'outputs/final-certification-705d57cd'
r = out / 'receipts'
data = json.loads(subprocess.check_output(['python3', str(work / 'status.py')], cwd=root, text=True))
ordinary = [json.loads(p.read_text()) for p in r.glob('*.receipt.json') if not p.name.startswith('L27-M') and not p.name.startswith('mutation-')]
orchestrations = [json.loads(p.read_text()) for p in r.glob('*.orchestration.json')]
native = next((x for x in orchestrations if x['name'] == 'complete-native'), None)
result = {
    'utc': data['utc'], 'ordinaryReceipts': len(ordinary),
    'ordinaryRed': [x['name'] for x in ordinary if x['exit'] != 0],
    'orchestrationRed': [x['name'] for x in orchestrations if x['exit'] != 0],
    'nativeStarted': (work / 'worker-1-pid').exists(),
    'parts': data['parts'], 'totalParts': 65,
    'completedDeclarations': data['completedDeclarations'],
    'declarationStatuses': data['declarationStatuses'],
    'baselineRed': data['baselineRed'], 'mismatches': data['mismatches'],
    'observedTestRuns': data['testRuns'],
    'transportFailureAlerts': data['transportFailureAlerts'],
    'nativeFinished': native,
}
print(json.dumps(result))
