from pathlib import Path
import hashlib
import json
import re
import subprocess

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/final-certification-2141e245'
receipts = out / 'receipts'
candidate = '2141e24544b5157c6341b649661d0cd3a2c21c48'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

k15_path = receipts / 'k15-census.log'
k15 = json.loads(k15_path.read_text())
assert k15['clientSideAuthorityValuesInSuccessor'] == 0
assert k15['successorReadsClientStorage'] == []
assert k15['storageScan'] == 'ast+text'
assert k15['successorReflectiveAccess'] == []
for wanted in ['maya-chat-shell/src', 'maya-chat-shell/entry']:
    record = next(row for row in k15['successorRoots'] if row['root'] == wanted)
    assert record['present'] and record['files'] > 0

skips = {}
for name in ['runtime-full', 'node24-runtime-full']:
    path = receipts / (name + '.log')
    # Node 22's default reporter is TAP; Node 24's saved output is spec.
    # Preserve the original reports and audit the explicit skip marker in each.
    pattern = r'^\s*ok \d+ - .* # SKIP\b' if name == 'runtime-full' else r'^\s*﹣ .+ # '
    rows = [line.strip() for line in path.read_text().splitlines()
            if re.match(pattern, line)]
    assert len(rows) == 7
    assert all(re.search('not a pass', line, re.I) for line in rows)
    skips[name] = {'logSha256': digest(path), 'count': len(rows), 'unlabelled': 0, 'rows': rows,
                   'savedReporter': 'TAP' if name == 'runtime-full' else 'spec'}

build_config = repo / 'maya-saas-backend/tsconfig.build.json'
assert '"src/widget-contract"' in build_config.read_text()
runtime_manifest = repo / 'maya-chat-shell/dist/manifest.json'
assert runtime_manifest.read_bytes() == subprocess.check_output(
    ['git', 'show', candidate + ':maya-chat-shell/dist/manifest.json'], cwd=repo)

result = {
    'candidate': candidate,
    'scope': 'Assertions over fresh exact-candidate artifacts; no test rerun, no source changes, no certificate.',
    'k15WorkflowPostconditions': {'status': 'PASS', 'logSha256': digest(k15_path)},
    'runtimeSkipAudit': skips,
    'widgetContractBuildExclusion': {'status': 'PASS', 'configSha256': digest(build_config)},
    'runtimeManifestEqualsCommitted': {'status': 'PASS', 'manifestSha256': digest(runtime_manifest)},
    'status': 'PASS',
}
(out / 'CI-POSTCONDITIONS.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'status': 'PASS', 'skipAudits': 2, 'skipsPerRuntime': 7,
                  'k15': 'PASS', 'buildExclusion': 'PASS', 'committedManifest': 'PASS'}))
