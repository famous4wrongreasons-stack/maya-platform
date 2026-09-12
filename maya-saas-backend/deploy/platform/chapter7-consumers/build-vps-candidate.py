"""Apply only approved C7 consumer hunks to an exact read-only VPS snapshot.
No network/publication. No full production HTML is committed. Beget pages are out of scope.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

base = Path(sys.argv[1])
output = Path(sys.argv[2])
root = Path(__file__).resolve().parent
repository = root.parents[3]
assert hashlib.sha256(base.read_bytes()).hexdigest() == '46e713c6cca82817b07697bdede877cd5e85ca940667299bab8db3a819360527'
assert not output.exists(), 'Do not overwrite an unknown candidate'
source = (repository / 'сайт и приложение/app.html').read_text()
helpers = source[source.index('function meMeasurementValue('):source.index('function ABusinessReportCard(')]
assert helpers.count('\nfunction ') == 1 and helpers.startswith('function meMeasurementValue(')
with tempfile.TemporaryDirectory(prefix='maya-c7-pwa-candidate-') as owned:
    owned = str(Path(owned).resolve())
    target = Path(owned) / 'app.html'
    target.write_bytes(base.read_bytes())
    args = ['git', 'apply', '--unsafe-paths', '--directory=' + owned, str(root / 'vps-cabinet-c7.patch')]
    subprocess.run(args[:2] + ['--check'] + args[2:], cwd=repository, check=True)
    subprocess.run(args, cwd=repository, check=True)
    result = target.read_text()
    # This certified VPS variant has no rich chat card; the server supplies its safe text.
    assert 'function ABusinessReportCard(' not in result
    assert result.count('function ABookFlow() {') == 1
    result = result.replace('function ABookFlow() {', helpers + 'function ABookFlow() {', 1)
    output.write_text(result)
print(json.dumps({'sourceSha256': hashlib.sha256(base.read_bytes()).hexdigest(),
                  'candidateSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                  'productionWrites': 0, 'maintenanceChanges': 0}))
