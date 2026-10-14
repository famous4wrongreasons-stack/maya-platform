// Scoped network-boundary mutations. Synthetic fetch only; no provider keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(scripts, 'phone-catalog-egress.mjs'), 'utf8');
const mutations = [
  ['method', '{ method: req.method }', "{ method: 'GET' }"],
  ['expiry', '!revoked && clock() >= Date.parse(scope.notBefore) && clock() < Date.parse(scope.expiresAt)', '!revoked'],
  ['budget', 'counters.attempted < scope.maxCalls && counters.inFlight < 4', 'counters.inFlight < 4'],
  ['redirect', "redirect: 'error'", "redirect: 'follow'"],
  ['revocation', 'revoked = true; for (const controller', 'revoked = false; for (const controller'],
  ['body', "assert.ok(req.headers['content-length'] === undefined || req.headers['content-length'] === '0', 'catalog_body');", '// mutation: allow a request body'],
];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-phone-catalog-mutations-'));
const results = [];
try {
  for (const item of [['baseline'], ...mutations, ['restored']]) {
    const [name, before, after] = item;
    const directory = path.join(temporary, name); fs.mkdirSync(directory);
    for (const entry of fs.readdirSync(scripts)) {
      if (/\.(mjs|cjs)$/.test(entry) && entry !== 'phone-catalog-egress.mjs')
        fs.symlinkSync(path.join(scripts, entry), path.join(directory, entry));
    }
    // The test must resolve the changed source in this directory, not the
    // original source relative to a symlink's real path.
    const test = 'phone-catalog-egress.test.mjs';
    fs.unlinkSync(path.join(directory, test));
    fs.copyFileSync(path.join(scripts, test), path.join(directory, test));
    if (before) assert.equal(source.split(before).length, 2, `mutation anchor: ${name}`);
    fs.writeFileSync(path.join(directory, 'phone-catalog-egress.mjs'), before ? source.replace(before, after) : source);
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', test], {
      cwd: directory, encoding: 'utf8', timeout: 30000,
      env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin' },
    });
    assert.equal(run.error, undefined, `${name}: harness error`);
    assert.equal(run.signal, null, `${name}: unexpected signal`);
    const output = run.stdout + run.stderr;
    assert.match(output, /# tests 31\b/, `${name}: complete test collection`);
    if (before) {
      assert.equal(run.status, 1, `${name}: survived or harness failed`);
      assert.match(output, /# fail [1-9][0-9]*\b/, `${name}: no assertion failure`);
      assert.match(output, /failureType: 'testCodeFailure'/, `${name}: not an assertion failure`);
    } else {
      assert.equal(run.status, 0, `${name}: baseline failed`);
      assert.match(output, /# pass 31\b/);
    }
    results.push({ name, exit: run.status, expected: true });
  }
  console.log(JSON.stringify({ status: 'PASS', sourceSha256: createHash('sha256').update(source).digest('hex'),
    greenBaseline: true, greenRestored: true, mutantsKilled: mutations.length, realProviderCalls: 0, results }, null, 2));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
