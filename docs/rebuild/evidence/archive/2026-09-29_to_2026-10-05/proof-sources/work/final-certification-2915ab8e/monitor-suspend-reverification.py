from pathlib import Path
import datetime
import json
import re

root = Path.cwd()
out = root / 'outputs/final-certification-2915ab8e'
receipts = out / 'receipts'
stage = receipts / 'suspend-reverification'
read = lambda p: json.loads(p.read_text())
cohort_path = out / 'SUSPEND-ORIGINAL-COHORT.json'
cohort = read(cohort_path) if cohort_path.exists() else None
parts = [read(p) for p in (stage / 'parts').glob('*.json')]
jobs = [read(p) for p in stage.glob('mutation-*.receipt.json')]
alerts = []
diagnostics = list((stage / 'diagnostics').glob('*.json'))
for path in diagnostics:
    data = read(path)
    for failure in data['failures']:
        if re.search(r'Exceeded timeout|socket hang up|ECONNRESET|EADDRINUSE', json.dumps(failure), re.I):
            alerts.append({'report': path.name, 'title': failure.get('title', failure.get('suite'))})
execution_path = receipts / 'suspend-reverification.orchestration.json'
result_path = out / 'SUSPEND-REEXECUTION.json'
print(json.dumps({
    'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'phase': 'reexecution' if cohort else 'waiting for original complete queue',
    'parts': len(parts), 'requiredParts': len(cohort['requiredSlots']) if cohort else None,
    'rawTestRuns': len(diagnostics),
    'failedJobs': [job['name'] for job in jobs if job['exit'] != 0],
    'baselineRed': [item for part in parts for item in part['baseline_red']],
    'mismatches': sum(part['mismatches'] for part in parts),
    'newTransportAlerts': alerts,
    'executionFinished': read(execution_path) if execution_path.exists() else None,
    'admissionStatus': read(result_path)['status'] if result_path.exists() else 'PENDING',
}))
