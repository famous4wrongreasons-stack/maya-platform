// Counterfactuals run in disposable copied modules, never the working source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const scripts = path.dirname(fileURLToPath(import.meta.url));
const mutations = [
  ['company', 'scope', "assert.equal(s.companyId, '503759');", ''],
  ['expiry', 'scope', 'now < end &&', 'true &&'],
  ['duration', 'scope', 'end - start <= 1800000', 'true'],
  ['actor-role', 'scope', "user.role === 'tenant_owner' &&", 'true &&'],
  ['restart-fence', 'scope', "'.consumed', 'wx',", "'.consumed', 'w',"],
  [
    'scope-pin',
    'egress',
    "assert.equal(req.headers['x-maya-scope'], pin);",
    '',
  ],
  [
    'tenant',
    'egress',
    "assert.equal(req.headers['x-maya-tenant'], scope.tenantId);",
    '',
  ],
  [
    'user',
    'egress',
    "assert.equal(req.headers['x-maya-user'], scope.userId);",
    '',
  ],
  [
    'attempt-budget',
    'egress',
    "counts[body.purpose] < (body.purpose === 'link' ? 1 : 3)",
    'true',
  ],
  ['operation-binding', 'egress', 'op.id === body.operationId &&', 'true &&'],
  ['token-replay', 'egress', '!op.tokenSent,', 'true,'],
  ['page-order', 'egress', 'assert.equal(parsed.page, op.page + 1);', ''],
  ['row-bound', 'egress', 'json.data.length <= 200', 'true'],
  ['redirect-mode', 'egress', "redirect: 'error'", "redirect: 'follow'"],
  ['redirect-response', 'egress', '!response.redirected &&', 'true &&'],
];
const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-phone-telegram-mutations-'),
  ),
  results = [];
try {
  for (const [name, module, before, after] of [
    ['baseline'],
    ...mutations,
    ['restored'],
  ]) {
    const directory = path.join(temporary, name);
    fs.mkdirSync(directory);
    for (const f of fs.readdirSync(scripts))
      if (/\.(mjs|cjs)$/.test(f)) {
        if (f.startsWith('phone-telegram'))
          fs.copyFileSync(path.join(scripts, f), path.join(directory, f));
        else fs.symlinkSync(path.join(scripts, f), path.join(directory, f));
      }
    if (before) {
      const file = path.join(directory, 'phone-telegram-' + module + '.mjs'),
        source = fs.readFileSync(file, 'utf8');
      assert.equal(source.split(before).length, 2, 'anchor:' + name);
      fs.writeFileSync(file, source.replace(before, after));
    }
    const r = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', 'phone-telegram.test.mjs'],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30000,
        env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin' },
      },
    );
    assert.equal(r.error, undefined, 'harness:' + name);
    assert.equal(r.signal, null, 'signal:' + name);
    const output = r.stdout + r.stderr;
    assert.match(output, /# tests 31\b/, 'collection:' + name);
    assert.equal(r.status, before ? 1 : 0, 'exit:' + name);
    if (before) {
      assert.match(
        output,
        /failureType: 'testCodeFailure'/,
        'assertion:' + name,
      );
      assert.match(output, /# fail [1-9]/);
    } else assert.match(output, /# pass 31\b/);
    results.push({ name, exit: r.status, expected: true });
  }
  const sourceHashes = Object.fromEntries(
    ['scope', 'egress'].map((n) => [
      n,
      createHash('sha256')
        .update(
          fs.readFileSync(path.join(scripts, 'phone-telegram-' + n + '.mjs')),
        )
        .digest('hex'),
    ]),
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      sourceHashes,
      greenBaseline: true,
      greenRestored: true,
      mutantsKilled: mutations.length,
      realProviderCalls: 0,
      results,
    }),
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
