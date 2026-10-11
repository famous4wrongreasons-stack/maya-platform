// Run exclusively: transient mutations are restored; concurrent edits are never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
assert.ok(out && !fs.existsSync(out));
fs.mkdirSync(out, { mode: 0o700 });
const resolver = 'src/auth/telegram-client-binding.service.ts',
  social = 'src/auth/social-auth.service.ts',
  users = 'src/users/users.service.ts';
const originals = Object.fromEntries(
  [resolver, social, users].map((f) => [
    f,
    fs.readFileSync(path.join(cwd, f), 'utf8'),
  ]),
);
for (const [f, s] of Object.entries(originals))
  fs.writeFileSync(path.join(out, path.basename(f) + '.backup'), s, {
    mode: 0o600,
  });
const edits = [
  [
    'verified-phone',
    social,
    'claims.phone_number_verified === true',
    'claims.phone_number_verified !== undefined',
    'unverified phone claim',
  ],
  [
    'unique-client',
    resolver,
    'matches.length !== 1',
    'matches.length < 1',
    'non-exact source: duplicate',
  ],
  [
    'current-source',
    resolver,
    'hash(await this.source(tx, p.tenantId)) !== hash(source)',
    'false',
    'source switch',
  ],
  [
    'current-session',
    resolver,
    'const now = await this.assertLogin(tx, p);',
    'const now = new Date();',
    'session revocation after',
  ],
  [
    'immutable-revocation',
    resolver,
    'if (tips.some((l) => l.revokedAt))',
    'if (false)',
    'revoked historical',
  ],
  [
    'atomic-audit',
    resolver,
    'await tx.auditLog.create({',
    'await Promise.resolve({',
    'mandatory audit',
  ],
  [
    'serialization-retry',
    resolver,
    'if (attempt < 4 && this.retryable(error)) continue;',
    'if (false) continue;',
    'registration conflict',
  ],
  [
    'optional-profile',
    users,
    '.then((result) => result.clientId)',
    '.then((result) => result.profile.profile_id)',
    'signed login automatically',
  ],
];
const expected = { ...originals };
function restore(f) {
  assert.equal(
    fs.readFileSync(path.join(cwd, f), 'utf8'),
    expected[f],
    'Concurrent source edit: keep both local work and backup, do not overwrite ' +
      f,
  );
  fs.writeFileSync(path.join(cwd, f), originals[f]);
  expected[f] = originals[f];
}
const summary = {
  qualification: 'TARGETED_MUTATIONS_NOT_FULL_RELEASE_CERTIFICATION',
  mutations: [],
  baseline: null,
  restored: null,
};
function run(name) {
  const dir = path.join(out, name);
  const proc = spawnSync(
    process.execPath,
    [path.join(cwd, 'scripts/telegram-client-binding-proof.mjs'), dir],
    { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024 },
  );
  fs.writeFileSync(
    path.join(out, name + '.runner.log'),
    proc.stdout + '\n' + proc.stderr,
    { mode: 0o600 },
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dir, 'telegram-initial-jest.json'), 'utf8'),
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.sourceUnchanged, true);
  assert.equal(manifest.clusterStopped, true);
  return {
    exit: proc.status,
    passed: receipt.numPassedTests,
    failed: receipt.numFailedTests,
    names: receipt.testResults.flatMap((s) =>
      s.assertionResults
        .filter((t) => t.status === 'failed')
        .map((t) => t.fullName),
    ),
  };
}
function save() {
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    { mode: 0o600 },
  );
}
try {
  console.log('baseline');
  summary.baseline = run('baseline');
  save();
  assert.equal(summary.baseline.exit, 0);
  for (const [name, f, from, to, expectedTest] of edits) {
    assert.equal(
      originals[f].split(from).length,
      2,
      'exact unique mutation ' + name,
    );
    assert.equal(fs.readFileSync(path.join(cwd, f), 'utf8'), originals[f]);
    expected[f] = originals[f].replace(from, to);
    fs.writeFileSync(path.join(cwd, f), expected[f]);
    console.log(name);
    let r;
    try {
      r = run(name);
    } finally {
      restore(f);
    }
    const killed =
      r.exit !== 0 && r.failed > 0 && r.names.some((t) => t.includes(expectedTest));
    summary.mutations.push({ name, ...r, killed });
    save();
    assert.equal(
      killed,
      true,
      'mutation not killed by intended assertion ' + name,
    );
  }
  console.log('restored');
  summary.restored = run('restored');
  assert.equal(summary.restored.exit, 0);
  save();
} finally {
  for (const f of Object.keys(originals)) {
    restore(f);
  }
  save();
}
console.log(
  JSON.stringify({
    killed: summary.mutations.filter((x) => x.killed).length,
    total: edits.length,
    restored: summary.restored?.exit === 0,
  }),
);
