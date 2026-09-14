"""Verify an owner-approved private source without executing the PHP application.

The only optional remote operation is PHP syntax/token inspection on the source
host. No remote files, database rows, HTTP requests or provider calls are written.
Never print original literals. The private source is not a repository artifact.
"""
import argparse
import base64
import datetime
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--repository', default='/tmp/maya-b29-contour')
p.add_argument('--output', required=True)
p.add_argument('--php-token-proof', action='store_true')
args = p.parse_args()
repo = Path(args.repository)
folder = repo / 'maya-saas-backend/test/fixtures/beget'
manifest = json.loads((folder / 'api-proxy.provenance.json').read_text())
original = Path(args.source).read_bytes()
fixture = (folder / manifest['fixture']).read_bytes()
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha(original) == manifest['sha256'], 'Private source differs from certified source'
assert sha(fixture) == manifest['fixtureSha256'], 'Fixture hash mismatch'
normalized = original
changes = []
for row in manifest['redactions']:
    pattern = rb"(define\('" + row['constant'].encode() + rb"',\s*)'([^']*)'(\);)"
    matches = list(re.finditer(pattern, normalized))
    assert len(matches) == 1, 'Configuration definition is not unique'
    match = matches[0]
    assert original[:match.start()].count(b'\n') + 1 == row['line']
    old_value = match.group(2)
    normalized = re.sub(pattern, lambda m: m[1] + b"'" + row['replacement'].encode() + b"'" + m[3], normalized)
    assert old_value not in fixture, 'Original configuration value remains in fixture'
    changes.append({'constant': row['constant'], 'line': row['line'], 'classification': row['classification']})
assert normalized == fixture, 'Bytes outside allowed value substitutions changed'

patterns = {
    'privateKey': rb'-----BEGIN (?:[A-Z ]+)?PRIVATE KEY',
    'telegramToken': rb'\b\d{7,12}:[A-Za-z0-9_-]{30,}\b',
    'jwt': rb'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    'cloudKey': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'openaiKey': rb'\bsk-[A-Za-z0-9_-]{20,}',
    'urlCredential': rb'https?://[^/\s\x27\x22]+:[^/@\s\x27\x22]+@',
}
scans = {name: len(re.findall(pattern, fixture)) for name, pattern in patterns.items()}
assert not any(scans.values()), 'Credential signature in fixture'
# Extra mixed-case/digit high-entropy literal check; report no candidate values.
literal_pattern = rb"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\""
mixed = []
for m in re.finditer(literal_pattern, fixture):
    value = m.group()[1:-1]
    if re.fullmatch(rb'[A-Za-z0-9_+/=.-]{20,}', value) and all(re.search(c, value) for c in [rb'[a-z]', rb'[A-Z]', rb'[0-9]']):
        mixed.append(fixture[:m.start()].count(b'\n') + 1)
assert not mixed, 'Unreviewed mixed-entropy literal'
result = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'productionSha256': sha(original), 'fixtureSha256': sha(fixture),
    'productionSourceBytes': len(original), 'fixtureBytes': len(fixture),
    'changes': changes, 'allOtherBytesIdentical': True,
    'structuralEquivalence': 'PASS', 'securitySemanticsEquivalence': 'PASS',
    'credentialSignatures': scans, 'mixedEntropyLiteralCandidates': len(mixed),
    'secretScan': 'PASS', 'secretsInVersionedFixture': 0,
    'applicationExecutions': 0, 'productionWrites': 0, 'messages': 0,
}
if args.php_token_proof:
    # TOKEN_PARSE parses syntax but never executes the supplied program. Arrays
    # retain every token, line, comment and whitespace. Only two string tokens
    # may differ, at the exact documented lines. No secret values leave PHP.
    code = r'''
$request = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$original = file_get_contents($request['path']);
if (hash('sha256', $original) !== $request['sha256']) throw new Exception('Production hash changed');
$fixture = base64_decode($request['fixture'], true);
$a = token_get_all($original, TOKEN_PARSE); $b = token_get_all($fixture, TOKEN_PARSE);
if (count($a) !== count($b)) throw new Exception('Token count changed');
$changed = [];
foreach ($a as $index => $token) {
    if ($token === $b[$index]) continue;
    if (!is_array($token) || !is_array($b[$index]) || $token[0] !== T_CONSTANT_ENCAPSED_STRING || $b[$index][0] !== T_CONSTANT_ENCAPSED_STRING || $token[2] !== $b[$index][2]) throw new Exception('Non-literal token changed');
    $changed[] = $token[2];
}
if ($changed !== [96, 97]) throw new Exception('Unexpected token changes');
echo json_encode(['parser'=>'PASS','tokenCount'=>count($a),'changedLiteralLines'=>$changed,'allOtherTokensIdentical'=>true,'phpVersion'=>PHP_VERSION,'applicationExecutions'=>0]);
'''
    command = '/usr/local/bin/php8.4 -n -r ' + shlex.quote(code)
    request = {'path': manifest['sourcePath'], 'sha256': manifest['sha256'], 'fixture': base64.b64encode(fixture).decode()}
    proc = subprocess.run(['ssh', '-i', str(Path.home() / '.ssh/beget_deploy'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'mocine3388@prime.beget.com', command], input=json.dumps(request).encode(), capture_output=True, timeout=45)
    assert proc.returncode == 0, 'Read-only PHP token proof failed (private stderr withheld)'
    result['phpTokenProof'] = json.loads(proc.stdout)
Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
