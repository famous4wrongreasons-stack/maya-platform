// Local synthetic mutation qualification only; no release admission or secrets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: { run: { type: 'boolean' }, output: { type: 'string' } },
});
assert(
  values.run === true &&
    values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
);
const directory = path.dirname(fileURLToPath(import.meta.url)),
  output = values.output;
const modulePath = path.join(directory, 'phone-native-create-egress.mjs');
const testPath = path.join(directory, 'phone-native-create-egress.test.mjs');
const helperPath = path.join(directory, 'local-yclients-read-transport.mjs');
const moduleBytes = fs.readFileSync(modulePath, 'utf8'),
  testBytes = fs.readFileSync(testPath, 'utf8'),
  helperBytes = fs.readFileSync(helperPath);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mutations = [
  {
    name: 'preservation',
    before: `    assert.deepEqual(value, {
      ...lifecycle.read.body,
      datetime: value.datetime,
    });`,
    after: '    // MUTATION: preservation check removed',
    expected: 'V2 time-only move refuses changed price',
  },
  {
    name: 'stale-read',
    before: 'now - lifecycle.read.at < 60000',
    after: 'true',
    expected: 'V2 missing/stale read cannot supply a move',
  },
  {
    name: 'echo-receipt',
    before: 'id(String(created.record_id)),',
    after: 'id(String(created.record_id ?? created.id)),',
    expected: 'V2 ambiguous/echo-only receipt never binds a record',
  },
  {
    name: 'unknown-to-rejection',
    before: '        res.destroy();',
    after:
      "        res.writeHead(403, { 'content-type': 'application/json' }).end(refused);",
    expected: 'V2 PUT response loss stays uncertain',
  },
  {
    name: 'uncertain-write',
    before: '!lifecycle.uncertain &&',
    after: 'true &&',
    expected: 'V2 PUT response loss stays uncertain',
  },
];
fs.mkdirSync(output, { mode: 0o700 });
const manifest = {
  contract: 'maya.phone-native-egress-mutation/1',
  runnerSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  status: 'running',
  moduleSha256: sha(moduleBytes),
  testSha256: sha(testBytes),
  helperSha256: sha(helperBytes),
  network: 'OS_LOOPBACK_ONLY',
  realProviderEffects: 0,
  certificate: 'NOT_ISSUED',
  release_admissible: false,
  runs: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
const sandbox =
  '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
async function run(name, bytes, expected) {
  const dir = path.join(output, name);
  fs.mkdirSync(dir, { mode: 0o700 });
  fs.writeFileSync(
    path.join(dir, 'phone-native-create-egress.mjs'),
    bytes.replace(
      "'./local-yclients-read-transport.mjs'",
      JSON.stringify(helperPath),
    ),
  );
  fs.writeFileSync(
    path.join(dir, 'phone-native-create-egress.test.mjs'),
    testBytes,
  );
  const log = path.join(dir, 'unit.tap'),
    fd = fs.openSync(log, 'wx', 0o600);
  const record = {
    name,
    mutatedSha256: sha(bytes),
    expectedFailure: expected ?? null,
  };
  manifest.runs.push(record);
  save();
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          sandbox,
          process.execPath,
          '--test',
          path.join(dir, 'phone-native-create-egress.test.mjs'),
        ],
        {
          cwd: dir,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: dir,
            TMPDIR: dir,
            NODE_ENV: 'test',
          },
          stdio: ['ignore', fd, fd],
          detached: true,
        },
      );
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
      }, 30000);
      const killer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 35000);
      child.once('error', (error) => {
        clearTimeout(timer);
        clearTimeout(killer);
        reject(error);
      });
      child.once('exit', (exitCode, signal) => {
        clearTimeout(timer);
        clearTimeout(killer);
        resolve({ exitCode, signal });
      });
    });
    Object.assign(record, result);
    assert.equal(result.signal, null);
    const tap = fs.readFileSync(log, 'utf8');
    record.tapSha256 = sha(tap);
    const count = (key) => {
      const m = new RegExp('^# ' + key + ' (\\d+)\\r?$', 'm').exec(tap);
      assert(m);
      return Number(m[1]);
    };
    record.tests = {
      pass: count('pass'),
      fail: count('fail'),
      skip: count('skipped'),
      cancelled: count('cancelled'),
    };
    assert.equal(count('tests'), 90);
    assert.equal(count('skipped'), 0);
    assert.equal(count('cancelled'), 0);
    if (expected) {
      assert.equal(result.exitCode, 1);
      assert(count('fail') > 0);
      assert(
        tap
          .split('\n')
          .some(
            (line) => line.startsWith('not ok ') && line.includes(expected),
          ),
        'Required semantic failure missing',
      );
      // Healthy native-shaped lifecycle remains the control for every mutation.
      assert(
        tap
          .split('\n')
          .some(
            (line) =>
              line.startsWith('ok ') && line.includes('V2 confirmed create'),
          ),
      );
      record.status = 'detected';
    } else {
      assert.equal(result.exitCode, 0);
      assert.equal(count('fail'), 0);
      record.status = 'passed';
    }
  } finally {
    fs.closeSync(fd);
    save();
  }
}
try {
  await run('baseline', moduleBytes);
  for (const mutation of mutations) {
    assert.equal(
      moduleBytes.split(mutation.before).length,
      2,
      'Mutation must be unique: ' + mutation.name,
    );
    await run(
      mutation.name,
      moduleBytes.replace(mutation.before, mutation.after),
      mutation.expected,
    );
  }
  assert.equal(sha(fs.readFileSync(modulePath)), sha(moduleBytes));
  assert.equal(sha(fs.readFileSync(testPath)), sha(testBytes));
  assert.equal(sha(fs.readFileSync(helperPath)), sha(helperBytes));
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
