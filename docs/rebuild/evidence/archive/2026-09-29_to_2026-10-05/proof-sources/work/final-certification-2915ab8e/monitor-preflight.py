from pathlib import Path
import collections, datetime, json

root = Path.cwd()
out = root / 'outputs/final-certification-2915ab8e'
work = root / 'work/final-certification-2915ab8e'
records = [json.loads(p.read_text()) for p in (out / 'receipts').glob('*.receipt.json')
           if not p.name.startswith('L27-M')]
parts = [json.loads(p.read_text()) for p in (out / 'diagnostics/anchor-preflight/mutation-parts').glob('*.json')]
summary = out / 'DIAGNOSTIC-PREFLIGHT.json'
data = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'ordinaryReceipts': len(records),
        'ordinaryRed': [r['name'] for r in records if r['exit'] != 0],
        'diagnosticParts': len(parts), 'diagnosticTotal': 26,
        'diagnosticStatuses': dict(collections.Counter(p['status'] for p in parts)),
        'diagnosticMismatches': sum(p.get('mismatches', 0) for p in parts),
        'diagnosticBaselineRed': [r for p in parts for r in p.get('baseline_red', [])],
        'diagnosticDone': json.loads(summary.read_text()) if summary.exists() else None,
        'nativeStarted': (work / 'worker-1-pid').exists()}
print(json.dumps(data))
