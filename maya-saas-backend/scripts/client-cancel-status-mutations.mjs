// Offline counterfactuals in a disposable committed-source copy; no credentials,
// provider, database, release admission, browser or working-source mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend);
const out = process.argv[2];
assert.ok(out && path.isAbsolute(out) && !fs.existsSync(out));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(git('diff', 'HEAD', '--name-only', '--', 'maya-saas-backend/src', 'maya-saas-backend/scripts/client-cancel-status-mutations.mjs'), '');
const head = git('rev-parse', 'HEAD');
const prior = '14c6ed4489c996de6d2b5bcb2bfe31a873ad767d';
fs.mkdirSync(out, { mode: 0o700 });
execFileSync('tar', ['-x', '-C', out], { input: execFileSync('git', [
  'archive', head, 'maya-saas-backend/src', 'maya-saas-backend/package.json', 'maya-saas-backend/tsconfig.json',
], { cwd: repo, maxBuffer: 128 * 1024 * 1024 }) });
const cwd = path.join(out, 'maya-saas-backend');
fs.symlinkSync(path.join(backend, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
const specs = [
  'src/widgets/resolve/booking-cancel-receipt-read.spec.ts',
  'src/crm/client-cancel-status.spec.ts',
  'src/crm/client-appointment-cancel.service.spec.ts',
  'src/action-engine/client-appointment-status.runtime.spec.ts',
  'src/action-engine/client-reschedule-alias.kernel.spec.ts',
];
const files = {
  page: 'src/widgets/resolve/thread-page.service.ts',
  adapter: 'src/widgets/owner-ports/commit-booking.adapter.ts',
  runtime: 'src/action-engine/action-engine.runtime.ts',
  kernel: 'src/action-engine/action-engine.kernel.ts',
  crm: 'src/crm/crm.service.ts',
};
const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(cwd, file), 'utf8')]));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const specHashes = Object.fromEntries(specs.map(file => [file, sha(fs.readFileSync(path.join(cwd, file)))]));
const report = { qualification: 'OFFLINE_UNIT_OWNER_SEAMS_NOT_PROVIDER_DB_OR_RELEASE_CERTIFICATION', head, prior, specHashes, baseline: null, counterfactuals: [], restored: null };
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
function run(name) {
  const receipt = path.join(out, name + '.json');
  const log = path.join(out, name + '.log');
  const fd = fs.openSync(log, 'wx', 0o600);
  let child;
  try {
    child = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', ...specs, '--json', '--outputFile=' + receipt],
      { cwd, env, stdio: ['ignore', fd, fd], timeout: 60_000 });
  } finally { fs.closeSync(fd); }
  assert.equal(child.error, undefined); assert.equal(child.signal, null);
  const result = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(result.numRuntimeErrorTestSuites, 0);
  for (const file of specs) assert.equal(sha(fs.readFileSync(path.join(cwd, file))), specHashes[file]);
  if (report.baseline) assert.equal(result.numTotalTests, report.baseline.total);
  return { exit: child.status, total: result.numTotalTests, passed: result.numPassedTests, failed: result.numFailedTests,
    failures: result.testResults.flatMap(s => s.assertionResults.filter(t => t.status === 'failed').map(t => t.fullName)),
    receiptSha256: sha(fs.readFileSync(receipt)), logSha256: sha(fs.readFileSync(log)) };
}
function restore() { for (const [key, file] of Object.entries(files)) fs.writeFileSync(path.join(cwd, file), originals[key]); }
function replace(key, before, after) {
  assert.equal(originals[key].split(before).length, 2, 'unique mutation anchor: ' + key);
  fs.writeFileSync(path.join(cwd, files[key]), originals[key].replace(before, after));
}
function record(name, requiredFailure) {
  const result = run(name);
  const killed = result.exit === 1 && result.failed > 0 && result.failures.some(n => requiredFailure.test(n));
  report.counterfactuals.push({ name, ...result, killed }); save();
  assert.ok(killed, 'survived or unrelated failure: ' + name); restore();
}
try {
  report.baseline = run('baseline'); save(); assert.equal(report.baseline.exit, 0);
  for (const key of ['page', 'adapter']) fs.writeFileSync(path.join(cwd, files[key]), git('show', prior + ':maya-saas-backend/' + files[key]) + '\n');
  record('exact-prior-widget-wiring', /reaches only the cancel status reader/);
  replace('runtime', "        'crm.appointment.cancel.v1',\n", '');
  record('cancel-not-admitted-to-status-owner', /Finite verified Client cancel status/);
  replace('kernel', '      execution.capability !== capability ||\n', '');
  record('cross-capability-alias-accepted', /rejects a caller binding/);
  replace('crm', "      // Cancel preserves its source check even when the durable action is completed.\n      await this.assertAppointmentBranchWitness(\n        input.tenantId,\n        {\n          clientPrincipal: {\n            linkId: input.linkId,\n            appointmentId: input.appointmentId,\n          },\n        },\n        execution.id,\n        'crm.appointment.cancel.v1',\n      );", '      // Mutation: source witness bypassed.');
  record('completed-cancel-source-witness-removed', /completed action remains provider-free/);
  replace('crm', "      await authorize();\n      return result;\n    }\n    const plan = await this.cancelAppointmentActionPlan(", "      return result;\n    }\n    const plan = await this.cancelAppointmentActionPlan(");
  record('completed-result-post-read-authority-removed', /authority disappears during result retrieval/);
  replace('crm', "        source.execution.capability !== 'crm.appointment.cancel.v1' ||\n        principal.linkId !== input.linkId ||\n", "        source.execution.capability !== 'crm.appointment.cancel.v1' ||\n");
  record('original-cancel-link-binding-removed', /refuses substituted linkId/);
} finally { restore(); report.restored = run('restored'); save(); }
assert.equal(report.restored.exit, 0);
assert.equal(git('rev-parse', 'HEAD'), head);
console.log(JSON.stringify(report, null, 2));
