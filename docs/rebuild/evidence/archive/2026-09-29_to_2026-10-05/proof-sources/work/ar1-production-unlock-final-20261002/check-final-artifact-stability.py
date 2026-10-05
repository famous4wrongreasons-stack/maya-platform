from pathlib import Path
import datetime
import hashlib
import json

root = Path.cwd()
out = root / 'outputs/ar1-production-unlock-final-20261002'
candidate = '76df1766a74212f2c8a06ab879386fc8e4468d73'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
complete = read(out / 'COMPLETE-MUTATIONS.json')
assert complete['candidate'] == candidate and complete['status'] == 'PASS'
initial_path = out / 'INITIAL-ARTIFACT-HASH-PARITY.json'
final_path = out / 'ARTIFACT-HASH-PARITY.json'
initial, final = read(initial_path), read(final_path)
assert initial['candidate'] == final['candidate'] == candidate
assert initial['parity'] == final['parity'] == 'PASS'
assert initial['trees'] == final['trees'], 'Artifact content changed during certification'
result = {
    'candidate': candidate,
    'status': 'PASS',
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'initialReceiptSha256': sha(initial_path),
    'finalReceiptSha256': sha(final_path),
    'trees': [{
        'root': tree['root'],
        'files': tree['files'],
        'initialInventorySha256': tree['inventorySha256'],
        'finalInventorySha256': final['trees'][i]['inventorySha256'],
        'identical': True,
    } for i, tree in enumerate(initial['trees'])],
}
(out / 'FINAL-ARTIFACT-STABILITY.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'artifactStability': 'PASS'}))
