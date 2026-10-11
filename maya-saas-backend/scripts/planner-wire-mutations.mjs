// Synthetic-only wire proofs in a private copy of committed sources. Never
// mutate the caller's checkout or use provider credentials/network/SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repo = path.dirname(backend);
const out = process.argv[2];
assert.ok(out && path.isAbsolute(out) && !fs.existsSync(out));
fs.mkdirSync(out, { mode: 0o700 });
const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(
  git(
    'diff',
    '--name-only',
    'HEAD',
    '--',
    'maya-saas-backend/src',
    'maya-saas-backend/scripts/planner-wire-mutations.mjs',
  ),
  '',
);
const head = git('rev-parse', 'HEAD');
const archive = execFileSync(
  'git',
  [
    'archive',
    head,
    'maya-saas-backend/src',
    'maya-saas-backend/package.json',
    'maya-saas-backend/tsconfig.json',
    'docs/rebuild/evidence/local-actual-model-20261008/runner/http-report.json',
    'docs/rebuild/evidence/local-actual-model-20261008/broker/model-responses.jsonl',
  ],
  { cwd: repo, maxBuffer: 128 * 1024 * 1024 },
);
execFileSync('tar', ['-x', '-C', out], { input: archive });
const cwd = path.join(out, 'maya-saas-backend');
fs.symlinkSync(
  path.join(backend, 'node_modules'),
  path.join(cwd, 'node_modules'),
  'dir',
);
const file = 'src/ai-tools/planner-wire-context.ts';
const original = fs.readFileSync(path.join(cwd, file), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const report = {
  qualification: 'TARGETED_SYNTHETIC_NOT_RELEASE_CERTIFICATION',
  head,
  sourceHash: sha(original),
  baseline: null,
  mutations: [],
  restored: null,
};
const save = () =>
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR'])
  if (process.env[key]) env[key] = process.env[key];
function run(name, pattern) {
  const receipt = path.join(out, name + '.json');
  const fd = fs.openSync(path.join(out, name + '.log'), 'wx', 0o600);
  let child;
  try {
    child = spawnSync(
      process.execPath,
      [
        'node_modules/jest/bin/jest.js',
        '--runInBand',
        '--runTestsByPath',
        'src/ai-tools/planner-wire-context.spec.ts',
        '--json',
        '--outputFile=' + receipt,
        ...(pattern ? ['--testNamePattern', pattern] : []),
      ],
      { cwd, env, stdio: ['ignore', fd, fd], timeout: 30_000 },
    );
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  const result = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  const failures = result.testResults.flatMap((suite) =>
    suite.assertionResults
      .filter((test) => test.status === 'failed')
      .map((test) => test.fullName),
  );
  return {
    exit: child.status,
    passed: result.numPassedTests,
    failed: result.numFailedTests,
    failures,
  };
}
try {
  report.baseline = run('baseline');
  save();
  assert.equal(report.baseline.exit, 0);
  const changes = [
    [
      'alias-loss',
      'values.push(value);',
      "values.push(key === 'slot_aliases' ? {} : value);",
    ],
    [
      'tool-substitution',
      'values.push(value);',
      "values.push(key === 'ready_tools' ? ['analytics.business.query'] : value);",
    ],
    [
      'readiness-loss',
      'values.push(value);',
      "values.push(key === 'readiness_note' ? null : value);",
    ],
    [
      'permission-escalation',
      ': intent[key],',
      ": key === 'allowed_for_role' ? true : intent[key],",
    ],
    [
      'reference-substitution',
      'dictionaryIndexes.get(key)!.get(JSON.stringify(intent[key]))!',
      '0',
    ],
  ];
  for (const [name, before, after] of changes) {
    assert.equal(
      original.split(before).length,
      2,
      'Mutation anchor must be exact: ' + name,
    );
    fs.writeFileSync(path.join(cwd, file), original.replace(before, after));
    const result = run(name);
    const killed =
      result.exit === 1 &&
      result.failed > 0 &&
      result.failures.some((name) =>
        /interns complete|preserves every tool field/.test(name),
      );
    report.mutations.push({ name, ...result, killed });
    save();
    assert.ok(killed, 'Survived or failed for unrelated reason: ' + name);
  }
  // Exact pre-repair product bytes, exercised ONLY against unchanged size duties.
  const old = execFileSync(
    'git',
    [
      'show',
      '2709baf65779c7f08169d6b2fdf41b7bc9953191:maya-saas-backend/' + file,
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  fs.writeFileSync(path.join(cwd, file), old);
  const result = run(
    'original-oversize',
    'fits the recorded owner|openai serializes occupancy',
  );
  report.mutations.push({
    name: 'original-oversize',
    originalHash: sha(old),
    ...result,
    killed: result.exit === 1 && result.failed === 2,
  });
  save();
  assert.ok(report.mutations.at(-1).killed);
} finally {
  fs.writeFileSync(path.join(cwd, file), original);
  report.restored = run('restored');
  save();
  assert.equal(report.restored.exit, 0);
  assert.equal(
    sha(fs.readFileSync(path.join(backend, file))),
    report.sourceHash,
  );
}
console.log(
  JSON.stringify({
    head,
    baseline: 'PASS',
    killed: report.mutations.length,
    restored: 'PASS',
  }),
);
