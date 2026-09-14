"""Verify the two R01 relay patches against pinned Git objects in disposable fixtures.

Only temporary local fixture files and the requested JSON output are written.
No PHP application code, database, network request or production mutation runs.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repository', default='/tmp/maya-b29-contour')
parser.add_argument('--output', required=True)
args = parser.parse_args()
repo = Path(args.repository).resolve()
output = Path(args.output).resolve()
base = '456888862a037f0866138fe9d69f218bbae52a95'
approved = '654028dd8115450723f466a7c79cbe5bedc50398'
upstream = '7ee1e670ed4fc503c632d2fc200c34dccd1561f8'
manifest = json.loads((repo / 'docs/rebuild/evidence/package5-wave-ra-r01-overlay-manifest.json').read_text())
rows = [row for row in manifest['overlays'] if row['kind'] == 'relay']
assert {row['target'] for row in rows} == {'mayaos/maya-platform-api.php', 'salon/app/maya-native-api.php'}
sha = lambda data: hashlib.sha256(data).hexdigest()


def blob(commit, file):
    return subprocess.check_output(['git', '-C', str(repo), 'show', commit + ':' + file])


def payload(patch):
    return b''.join(line for line in patch.splitlines(keepends=True) if not line.startswith(b'@@ '))


results = []
for row in rows:
    source = row['repositorySource']
    before, historical, expected = [blob(commit, source) for commit in [base, approved, upstream]]
    assert sha(before) == row['baselineSha256']
    assert sha(historical) == row['historicalR01CandidateSha256']
    assert sha(expected) == row['candidateSha256']
    assert row['expectedBaseCommit'] == base and row['expectedResultCommit'] == upstream
    assert (repo / source).read_bytes() == expected, 'Runtime must remain exact upstream bytes'
    patch = (repo / row['patch']).read_bytes()
    malformed = blob(upstream, row['patch'])
    assert payload(patch) == payload(malformed), 'Only hunk metadata repair is authorized'
    with tempfile.TemporaryDirectory(prefix='maya-r01-patch-proof-') as folder:
        fixture = Path(folder)
        target = fixture / row['target']
        target.parent.mkdir(parents=True)
        target.write_bytes(before)
        sentinel = fixture / 'unrelated.sentinel'
        sentinel.write_bytes(b'unchanged unrelated fixture file\n')

        def snapshot():
            return {str(p.relative_to(fixture)): sha(p.read_bytes()) for p in fixture.rglob('*') if p.is_file()}

        original = snapshot()
        commands = {}
        for label, flags in [('parse', ['--numstat']), ('check', ['--check']), ('apply', [])]:
            proc = subprocess.run(['git', 'apply', '--unidiff-zero'] + flags + ['-'], cwd=fixture,
                                  input=patch, capture_output=True)
            assert proc.returncode == 0, (row['target'], label, proc.stderr.decode())
            commands[label] = {'exit': proc.returncode, 'stdout': proc.stdout.decode(), 'stderr': proc.stderr.decode()}
            if label != 'apply':
                assert snapshot() == original, 'Parse/check must not write files'
        assert target.read_bytes() == expected, 'Result differs from pinned intended PHP content'
        after = snapshot()
        assert set(after) == set(original), 'Unexpected created/deleted file'
        assert [name for name in after if after[name] != original[name]] == [row['target']]
        # Negative control: this exact upstream defect must never pass the artifact proof.
        bad = subprocess.run(['git', 'apply', '--unidiff-zero', '--numstat', '-'], cwd=fixture,
                             input=malformed, capture_output=True)
        assert bad.returncode != 0 and b'patch fragment without header' in bad.stderr
        assert snapshot() == after
    assert not fixture.exists(), 'Owned disposable fixture was not removed'
    results.append({'target': row['target'], 'patch': row['patch'], 'expectedBaseCommit': base,
                    'baseSha256': sha(before), 'historicalR01Commit': approved,
                    'historicalR01Sha256': sha(historical), 'expectedResultCommit': upstream,
                    'expectedResultSha256': sha(expected), 'patchSha256': sha(patch),
                    'patchParses': True, 'applyCheck': 'PASS', 'apply': 'PASS',
                    'resultEqualsExpectedR01Content': True, 'unexpectedFileChanges': 0,
                    'patchPayloadUnchangedFromAcceptedUpstream': True,
                    'patchSemanticDeltaFromApprovedR01': 0,
                    'commands': commands, 'malformedNegativeControl': 'REJECTED', 'fixtureRemoved': True})

result = {'status': 'PASS', 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'patches': results, 'runtimeFilesChanged': 0, 'productionWrites': 0,
          'networkCalls': 0, 'databaseConnections': 0, 'processHygiene': 0}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': 'PASS', 'patches': len(results), 'unexpectedFileChanges': 0, 'fixturesRemaining': 0}))
