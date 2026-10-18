// Test copies only. Every mutation requires a green control and named failure.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url)),
  out = process.argv[3];
assert.equal(process.argv[2], '--run');
assert(path.isAbsolute(out) && !fs.existsSync(out));
fs.mkdirSync(out, { mode: 0o700 });
const names = [
  'phone-native-execution.mjs',
  'phone-native-execution.test.mjs',
  'phone-native-run-guard.mjs',
  'phone-native-create-egress.mjs',
  'phone-native-model.mjs',
  'phone-native-channel.mjs',
  'phone-native-channel.test.mjs',
  'phone-native-packaging.mjs',
  'phone-native-packaging.test.mjs',
  'local-yclients-read-transport.mjs',
  'local-yclients-read-profile.mjs',
  'local-onboarding-profile.mjs',
  'local-yclients-read-status.mjs',
  'conversation-qualification/current-candidate-budget.mjs',
  'conversation-qualification/core-local-ab-checks.mjs',
];
const sources = Object.fromEntries(
  names.map((n) => [n, fs.readFileSync(path.join(here, n), 'utf8')]),
);
const signature = /  assert\(\n    verify\([\s\S]*?\n  \);/.exec(
  sources['phone-native-execution.mjs'],
)?.[0];
assert(signature);
const mutations = [
  [
    'forwarder-authorization',
    'phone-native-channel.mjs',
    '    assertLocal();',
    '    // mutant: ignore local authorization replacement',
    'changed authorization at forwarder dispatch refuses the network call',
  ],
  [
    'channel-dequeue',
    'phone-native-channel.mjs',
    '          await check();\n          const job',
    '          // mutant: no current check\n          const job',
    'revocation after enqueue is rechecked before network dispatch',
  ],
  [
    'external-backend-network',
    'phone-native-packaging.mjs',
    "app.networks = ['private'];",
    "app.networks = ['private', 'edge'];",
    'only pull-only forwarder gets external network',
  ],
  [
    'channel-redirect',
    'phone-native-channel.mjs',
    "redirect: 'error',",
    "redirect: 'follow',",
    'private pull-only channel carries immutable admitted request',
  ],
  [
    'signature',
    'phone-native-execution.mjs',
    signature,
    '  assert(true);',
    'bad signature cannot modify signed authority',
  ],
  [
    'review',
    'phone-native-execution.mjs',
    'assert.equal(a.independentHumanReview, false);',
    'assert(true);',
    'even operator-signed self review fails fixed admission',
  ],
  [
    'build',
    'phone-native-execution.mjs',
    'assert.equal(a[key], installed[key]);',
    'if (key !== "executorDigest") assert.equal(a[key], installed[key]);',
    'even operator-signed changed executor fails fixed admission',
  ],
  [
    'awaited-admission',
    'phone-native-run-guard.mjs',
    'await options.assertCurrent(state.scope),',
    '(await options.assertCurrent(state.scope), true),',
    'async current authority is awaited before claim; false cannot create a run',
  ],
  [
    'run-identity',
    'phone-native-run-guard.mjs',
    "? hash('maya.phone-native-execution/1:' + scope.runId)",
    '? scope.executionAuthorizationDigest',
    'same run ID with separately signed attachment cannot replenish budget',
  ],
  [
    'model-admission',
    'phone-native-model.mjs',
    'assert.equal(await assertCurrent(), true);',
    'await assertCurrent();',
    'model current refusal never calls provider',
  ],
  [
    'signed-attempt-limit',
    'phone-native-model.mjs',
    'gate.stats.attempts < a.maxModelAttempts &&',
    'true &&',
    'operator may narrow model attempts but cannot replenish them',
  ],
  [
    'signed-spend-limit',
    'phone-native-model.mjs',
    'a.maxSpendNanoUsd,',
    '2_000_000_000,',
    'signed spend ceiling refuses before dispatch and remains closed',
  ],
  [
    'immutable-pricing',
    'phone-native-execution.mjs',
    'pricing: Object.freeze(a.pricing)',
    'pricing: a.pricing',
    'nested verified pricing is immutable',
  ],
];
const hash = (x) => createHash('sha256').update(x).digest('hex');
const m = {
  contract: 'maya.native-execution-mutations/1',
  status: 'running',
  sources: Object.fromEntries(names.map((n) => [n, hash(sources[n])])),
  runs: [],
  externalEffects: 0,
  certificate: 'NOT_ISSUED',
};
const save = () =>
  fs.writeFileSync(
    path.join(out, 'manifest.json'),
    JSON.stringify(m, null, 2) + '\n',
  );
save();
async function run(name, changed, expected) {
  const dir = path.join(out, name);
  fs.mkdirSync(dir, { mode: 0o700 });
  for (const n of names) {
    const f = path.join(dir, n);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, changed?.[n] ?? sources[n]);
  }
  const log = path.join(dir, 'result.tap'),
    fd = fs.openSync(log, 'wx', 0o600);
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      const p = spawn(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*") (remote unix-socket))',
          process.execPath,
          '--test',
          '--test-reporter=tap',
          'phone-native-execution.test.mjs',
          'phone-native-channel.test.mjs',
          'phone-native-packaging.test.mjs',
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
        },
      );
      const timer = setTimeout(() => p.kill('SIGKILL'), 60000);
      p.once('error', reject);
      p.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
  } finally {
    fs.closeSync(fd);
  }
  const text = fs.readFileSync(log, 'utf8'),
    count = (label) =>
      Number(new RegExp('^# ' + label + ' (\\d+)$', 'm').exec(text)?.[1]);
  assert.equal(count('tests'), 83);
  assert.equal(count('skipped'), 0);
  assert.equal(count('cancelled'), 0);
  assert(
    text
      .split('\n')
      .some(
        (l) =>
          l.startsWith('ok ') && l.includes('signed fixed attachment verifies'),
      ),
  );
  if (expected) {
    assert.equal(exit.code, 1);
    assert(count('fail') > 0);
    assert(
      text
        .split('\n')
        .some((l) => l.startsWith('not ok ') && l.includes(expected)),
      expected,
    );
  } else {
    assert.equal(exit.code, 0);
    assert.equal(count('fail'), 0);
  }
  m.runs.push({
    name,
    ...exit,
    tests: count('tests'),
    pass: count('pass'),
    fail: count('fail'),
    status: expected ? 'detected' : 'passed',
    logSha256: hash(text),
  });
  save();
}
try {
  await run('baseline');
  for (const [name, file, before, after, expected] of mutations) {
    assert.equal(sources[file].split(before).length, 2, name);
    await run(name, { [file]: sources[file].replace(before, after) }, expected);
  }
  for (const n of names)
    assert.equal(hash(fs.readFileSync(path.join(here, n))), m.sources[n]);
  m.status = 'passed';
  m.detected = mutations.length;
} catch (e) {
  m.status = 'failed';
  m.failure = e.message;
  process.exitCode = 1;
} finally {
  save();
  console.log(
    JSON.stringify({
      status: m.status,
      detected: m.detected,
      failure: m.failure,
    }),
  );
}
