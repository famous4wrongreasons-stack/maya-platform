// Finite restrictions-only mutations in an exclusive committed-source copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), repo = path.dirname(backend), out = process.argv[2];
assert.ok(process.argv.length === 3 && out && path.isAbsolute(out) && !fs.existsSync(out));
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const scope = ['maya-saas-backend/src', 'maya-saas-backend/package.json', 'maya-saas-backend/tsconfig.json', 'maya-saas-backend/tsconfig.build.json'];
assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', ...scope]), '', 'committed_sources_required');
const head = git(['rev-parse', 'HEAD']); fs.mkdirSync(out, { mode: 0o700 });
execFileSync('tar', ['-x', '-C', out], { input: execFileSync('git', ['archive', head, ...scope], { cwd: repo, maxBuffer: 32 * 1024 * 1024 }) });
const cwd = path.join(out, 'maya-saas-backend');

fs.symlinkSync(path.join(backend, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
const files = { read: path.join(cwd, 'src/package5-wave1/governed-settings.read.ts'), executor: path.join(cwd, 'src/package5-wave1/package5-wave1.service.ts') };
const originals = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
const report = { qualification: 'SYNTHETIC_H2_AUTHORITY_MUTATIONS_NOT_RELEASE_CERTIFICATION', head, hashes: Object.fromEntries(Object.entries(originals).map(([k,v]) => [k, createHash('sha256').update(v).digest('hex')])), baseline: null, mutations: [], restored: null };
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
function run(name) {
  const receipt = path.join(out, name + '.json');
  const result = spawnSync(process.execPath, [path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath', 'src/package5-wave1/governed-settings-history-trial.spec.ts', '--json', '--outputFile', receipt], { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  const log = result.stdout + result.stderr; fs.writeFileSync(path.join(out, name + '.log'), log, { mode: 0o600 });
  const d = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(d.numRuntimeErrorTestSuites, 0, 'infrastructure_failure');
  return { exit: result.status, passed: d.numPassedTests, failed: d.numFailedTests, failures: d.testResults.flatMap(r => r.assertionResults.filter(t => t.status === 'failed').map(t => t.title)), assertion: d.testResults.some(r => r.assertionResults.some(t => t.status === 'failed' && t.failureMessages.some(m => m.includes('expect(')))) };
}
const mutations = [
  ['trial-namespace', 'read', "namespace === 'client_capabilities' &&", 'true &&', 'does not widen'],
  ['full-trial-flag', 'read', 'member.tenant.trialFullAccess === true', 'true', 'setup-only'],
  ['trial-status', 'read', "member?.tenant.status === 'trial'", 'true', 'suspended'],
  ['trial-expiry', 'read', 'member.tenant.trialEndsAt.getTime() > Date.now()', 'true', 'exact expiry'],
  ['current-membership', 'read', "member.status !== 'active' ||\n      member.user.status !== 'active'", "false ||\n      member.user.status !== 'active'", 'missing/inactive'],
  ['current-user', 'read', "member.user.status !== 'active' ||\n      (member.tenant.status", "false ||\n      (member.tenant.status", 'missing/inactive'],
  ['terminal-receipt-authority', 'executor', 'return this.restoreCurrent(execution, registration.operation);', 'return this.restore(execution);', 'SUCCEEDED receipt'],
  ['locked-receipt-authority', 'executor', 'return this.restoreCurrent(locked, registration.operation, tx, input);', 'return this.restore(locked);', 'READY receipt'],
];
try {
  report.baseline = run('baseline'); save(); assert.equal(report.baseline.exit, 0);
  for (const [name, owner, from, to, expected] of mutations) {
    for (const [key, file] of Object.entries(files)) fs.writeFileSync(file, originals[key]);
    const original = originals[owner]; assert.equal(original.split(from).length, 2, 'exact_anchor_' + name);
    fs.writeFileSync(files[owner], original.replace(from, to));
    const result = run(name), killed = result.exit === 1 && result.failed > 0 && result.assertion && result.failures.some(test => test.includes(expected));
    report.mutations.push({ name, ...result, killed }); save(); assert.ok(killed, 'survived_or_unrelated_' + name);
  }
} finally {
  for (const [key, file] of Object.entries(files)) fs.writeFileSync(file, originals[key]);
  report.restored = run('restored');
  report.workingSourceUnchanged = Object.entries(files).every(([k, file]) => fs.readFileSync(path.join(backend, 'src/package5-wave1', path.basename(file)), 'utf8') === originals[k]);
  save(); assert.equal(report.restored.exit, 0); assert.equal(report.workingSourceUnchanged, true);
}
console.log(JSON.stringify({ baseline: report.baseline.passed, killed: report.mutations.filter(m => m.killed).length, total: mutations.length, restored: report.restored.passed }));
