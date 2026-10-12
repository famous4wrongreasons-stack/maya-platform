// Offline counterfactuals: committed sources, isolated copies, no credentials,
// provider, database or edits to the working checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend), out = process.argv[2];
assert.ok(out && path.isAbsolute(out) && !fs.existsSync(out));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(git('diff', 'HEAD', '--name-only', '--', 'maya-saas-backend/src',
  'maya-saas-backend/scripts/completed-receipt-authority-mutations.mjs'), '');
const head = git('rev-parse', 'HEAD');
const prior = '45a162a8a0c5f9135e494a7edc48f411587cc51a';
fs.mkdirSync(out, { mode: 0o700 });
execFileSync('tar', ['-x', '-C', out], { input: execFileSync('git', ['archive', head,
  'maya-saas-backend/src', 'maya-saas-backend/package.json', 'maya-saas-backend/tsconfig.json',
], { cwd: repo, maxBuffer: 128 * 1024 * 1024 }) });
const cwd = path.join(out, 'maya-saas-backend');
fs.symlinkSync(path.join(backend, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
const source = 'src/crm/crm.service.ts', spec = 'src/crm/client-appointment-status.spec.ts';
const file = path.join(cwd, source), original = fs.readFileSync(file, 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const specSha256 = sha(fs.readFileSync(path.join(cwd, spec)));
const report = { qualification: 'OFFLINE_OWNER_SEAMS_NOT_HTTP_PG_OR_LIVE_ACCEPTANCE',
  head, prior, specSha256, sourceSha256: sha(original), baseline: null, counterfactuals: [], restored: null };
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
function run(name) {
  const receipt = path.join(out, name + '.json'), log = path.join(out, name + '.log');
  const fd = fs.openSync(log, 'wx', 0o600);
  let child;
  try {
    child = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand',
      '--runTestsByPath', spec, '--json', '--outputFile=' + receipt],
    { cwd, env, stdio: ['ignore', fd, fd], timeout: 60_000 });
  } finally { fs.closeSync(fd); }
  assert.equal(child.error, undefined); assert.equal(child.signal, null);
  const r = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(r.numRuntimeErrorTestSuites, 0);
  assert.equal(r.numTotalTests, 13);
  assert.equal(sha(fs.readFileSync(path.join(cwd, spec))), specSha256);
  return { exit: child.status, passed: r.numPassedTests, failed: r.numFailedTests,
    failures: r.testResults.flatMap(s => s.assertionResults.filter(t => t.status === 'failed').map(t => t.fullName)),
    receiptSha256: sha(fs.readFileSync(receipt)), logSha256: sha(fs.readFileSync(log)) };
}
function counterfactual(name, code, operations) {
  fs.writeFileSync(file, code);
  const result = run(name);
  const expected = operations.map(op => 'explicit original Client appointment status refuses completed ' +
    op + ' if access is revoked while its durable result is read');
  const killed = result.exit === 1 && result.failed === expected.length &&
    expected.every(failure => result.failures.includes(failure));
  report.counterfactuals.push({ name, ...result, killed }); save();
  assert.ok(killed, 'survived or unrelated failure: ' + name);
  fs.writeFileSync(file, original);
}
try {
  report.baseline = run('baseline'); save(); assert.equal(report.baseline.exit, 0);
  counterfactual('exact-prior-owner', git('show', prior + ':maya-saas-backend/' + source) + '\n', ['create', 'reschedule']);
  for (const operation of ['create', 'reschedule']) {
    const start = original.indexOf(operation === 'create' ? '  async readClientCreateStatus(' : '  async readClientRescheduleStatus(');
    const end = original.indexOf('\n  async ', start + 1);
    assert.ok(start > 0 && end > start);
    const unit = original.slice(start, end), anchor = '      await authorize();\n      return result;';
    assert.equal(unit.split(anchor).length, 2);
    counterfactual('omit-' + operation + '-post-read-authority', original.slice(0, start) +
      unit.replace(anchor, '      return result;') + original.slice(end), [operation]);
  }
  report.restored = run('restored'); save(); assert.equal(report.restored.exit, 0);
} finally { fs.writeFileSync(file, original); save(); }
assert.equal(git('rev-parse', 'HEAD'), head);
assert.equal(git('diff', 'HEAD', '--name-only', '--', 'maya-saas-backend/src'), '');
console.log('Completed receipt authority: green baseline, 3/3 counterfactuals, green restored.');
