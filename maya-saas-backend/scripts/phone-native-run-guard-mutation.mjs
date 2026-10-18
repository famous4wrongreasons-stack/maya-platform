// Test-copy mutations only. No operator authority, credentials or network effects.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { run: { type: 'boolean' }, output: { type: 'string' } },
});
assert(
  values.run &&
    values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
);
const directory = path.dirname(fileURLToPath(import.meta.url));
const names = [
  'phone-native-run-guard.mjs',
  'phone-native-run-guard.test.mjs',
  'phone-native-create-egress.mjs',
  'local-yclients-read-transport.mjs',
  'local-yclients-read-profile.mjs',
  'local-yclients-read-status.mjs',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const originals = Object.fromEntries(
  names.map((name) => [name, fs.readFileSync(path.join(directory, name))]),
);
const source = originals[names[0]].toString(),
  tests = originals[names[1]].toString();
const mutations = [
  {
    name: 'claim-overwrite',
    before: 'fs.constants.O_EXCL |',
    after: 'fs.constants.O_TRUNC |',
    failure:
      'restart cannot reset budget even after the attempt ledger disappears',
  },
  {
    name: 'independent-authority',
    before:
      "assert(assertCurrent(scope) === true, 'independent_execution_admission');",
    after: 'assert((assertCurrent(scope), true));',
    failure: 'scope cannot replace false independent execution admission',
  },
  {
    name: 'scope-reread',
    before:
      'fresh.identity === initial.identity &&\n          hash(fresh.bytes) === scopeSha256',
    after: 'true',
    failure: 'current run refuses scope-change before dispatch',
  },
  {
    name: 'revocation-marker',
    before: 'assertNotRevoked(revocationPath);',
    after: '// MUTATION: marker ignored',
    failure: 'current run refuses marker before dispatch',
  },
  {
    name: 'poisoned-run',
    before: 'assert(!poisoned);',
    after: 'assert(true);',
    failure: 'restoring authority cannot revive a poisoned process',
  },
];
fs.mkdirSync(values.output, { mode: 0o700 });
const manifest = {
  contract: 'maya.native-run-guard-mutations/1',
  status: 'running',
  applicationCandidate: '6356db1875545337e34b6c8888b7ca858bb64361',
  runnerSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  sources: Object.fromEntries(
    names.map((name) => [name, sha(originals[name])]),
  ),
  network: 'OS_LOOPBACK_ONLY',
  independentAuthority: 'SYNTHETIC',
  realEffects: 0,
  certificate: 'NOT_ISSUED',
  releaseAdmissible: false,
  runs: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(values.output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
const relocate = (text) =>
  text.replace(
    "'./phone-native-create-egress.mjs'",
    JSON.stringify(path.join(directory, 'phone-native-create-egress.mjs')),
  );
async function run(name, bytes, expected) {
  const output = path.join(values.output, name);
  fs.mkdirSync(output, { mode: 0o700 });
  fs.writeFileSync(path.join(output, names[0]), relocate(bytes));
  fs.writeFileSync(path.join(output, names[1]), relocate(tests));
  const fd = fs.openSync(path.join(output, 'result.tap'), 'wx', 0o600);
  const row = {
    name,
    sourceSha256: sha(bytes),
    executedSha256: sha(relocate(bytes)),
    expectedFailure: expected ?? null,
  };
  manifest.runs.push(row);
  save();
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))',
          process.execPath,
          '--test',
          path.join(output, names[1]),
        ],
        {
          cwd: output,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: output,
            TMPDIR: output,
            NODE_ENV: 'test',
          },
          stdio: ['ignore', fd, fd],
          detached: true,
        },
      );
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 20000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ exitCode, signal });
      });
    });
    Object.assign(row, result);
    const tap = fs.readFileSync(path.join(output, 'result.tap'), 'utf8');
    row.tapSha256 = sha(tap);
    const count = (name) => {
      const match = new RegExp('^# ' + name + ' (\\d+)$', 'm').exec(tap);
      assert(match);
      return Number(match[1]);
    };
    row.tests = {
      pass: count('pass'),
      fail: count('fail'),
      skip: count('skipped'),
      cancelled: count('cancelled'),
    };
    assert.equal(count('tests'), 39);
    assert.equal(result.signal, null);
    assert.equal(row.tests.skip, 0);
    assert.equal(row.tests.cancelled, 0);
    assert(
      tap
        .split('\n')
        .some(
          (line) =>
            line.startsWith('ok ') &&
            line.includes('owned pinned scope plus independent admission'),
        ),
    );
    if (expected) {
      assert.equal(result.exitCode, 1);
      assert(row.tests.fail > 0);
      assert(
        tap
          .split('\n')
          .some(
            (line) => line.startsWith('not ok ') && line.includes(expected),
          ),
        'required semantic failure absent',
      );
      row.status = 'detected';
    } else {
      assert.equal(result.exitCode, 0);
      assert.equal(row.tests.fail, 0);
      row.status = 'passed';
    }
  } finally {
    fs.closeSync(fd);
    save();
  }
}
try {
  await run('baseline', source);
  for (const mutation of mutations) {
    assert.equal(
      source.split(mutation.before).length,
      2,
      'mutation must be unique: ' + mutation.name,
    );
    await run(
      mutation.name,
      source.replace(mutation.before, mutation.after),
      mutation.failure,
    );
  }
  for (const name of names)
    assert.equal(
      sha(fs.readFileSync(path.join(directory, name))),
      sha(originals[name]),
    );
  manifest.status = 'passed';
  manifest.detected = mutations.length;
} catch (error) {
  manifest.status = 'failed';
  manifest.failure = error.message;
  throw error;
} finally {
  save();
}
console.log(
  JSON.stringify({
    status: manifest.status,
    baseline: manifest.runs[0].tests,
    detected: manifest.detected,
  }),
);
