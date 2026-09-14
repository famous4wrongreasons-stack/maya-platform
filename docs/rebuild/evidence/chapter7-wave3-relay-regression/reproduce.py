"""Reproduce the observed R01 violation from sanitized, versioned evidence.

Pure local source inspection. Does not execute PHP, edit the fixture, access
production, create a database, or send an HTTP/provider request.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess

evidence = Path(__file__).resolve().parent
repo = evidence.parents[3]
receipt = json.loads((evidence / 'r01-ratchet.json').read_text())
fixture = repo / 'maya-saas-backend/test/fixtures/beget/api-proxy.sanitized.php'
before = fixture.read_text()
digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
assert digest(before) == receipt['certifiedSanitizedSha256']
lines = before.splitlines(keepends=True)
patch = (evidence / 'production-relay.delta.diff').read_text().splitlines(keepends=True)
out = []
cursor = 0
i = 2
while i < len(patch):
    header = re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n', patch[i])
    assert header, 'Unexpected patch header'
    start, old_count, new_start, new_count = map(int, header.groups())
    start -= 1
    assert start >= cursor
    out.extend(lines[cursor:start])
    assert len(out) == new_start - 1
    cursor = start
    removed = added = 0
    i += 1
    while i < len(patch) and not patch[i].startswith('@@ '):
        marker, content = patch[i][0], patch[i][1:]
        assert marker in ' +-'
        if marker in ' -':
            assert lines[cursor] == content, 'Exact base mismatch'
            cursor += 1
            removed += 1
        if marker in ' +':
            out.append(content)
            added += 1
        i += 1
    assert (removed, added) == (old_count, new_count)
out.extend(lines[cursor:])
current = ''.join(out)
assert digest(current) == receipt['currentSanitizedSha256']
guard = repo / 'maya-saas-backend/deploy/platform/beget-edge/client-initiator-boundary.cjs'
assert hashlib.sha256(guard.read_bytes()).hexdigest() == receipt['guardSha256']
node = r'''
const assert = require('node:assert/strict');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const guard = require(input.guard);
assert.equal(guard.assertRetiredPhp(input.before), true);
assert.throws(() => guard.assertRetiredPhp(input.current),
  {message: input.rejection});
console.log(JSON.stringify({evidenceReplay: 'PASS', certifiedFixture: 'PASS',
  currentProductionR01Ratchet: 'FAIL', expectedSecurityRejectionReproduced: true,
  phpApplicationExecutions: 0, networkRequests: 0, productionWrites: 0}));
'''
subprocess.run(['node', '-e', node], input=json.dumps({
    'guard': str(guard), 'before': before, 'current': current,
    'rejection': receipt['rejection'],
}), text=True, check=True)
