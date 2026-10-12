// Offline counterfactuals against committed sources in a disposable copy.
// Never edits the working checkout, loads credentials, or calls a provider.
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
assert.equal(git('diff', 'HEAD', '--name-only', '--', 'maya-saas-backend/src',
  'maya-saas-backend/scripts/personal-history-planner-mutations.mjs'), '');
const head = git('rev-parse', 'HEAD');
const prior = '16a7db260f8177cc76b3b3d99d48685b2fe30b7b';
fs.mkdirSync(out, { mode: 0o700 });
execFileSync('tar', ['-x', '-C', out], { input: execFileSync('git', [
  'archive', head, 'maya-saas-backend/src', 'maya-saas-backend/package.json',
  'maya-saas-backend/tsconfig.json',
], { cwd: repo, maxBuffer: 128 * 1024 * 1024 }) });
const cwd = path.join(out, 'maya-saas-backend');
fs.symlinkSync(path.join(backend, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
const files = {
  model: 'src/ai-tools/ai-core-model.service.ts',
  catalog: 'src/ai-tools/ai-tool.catalog.ts',
  taxonomy: 'src/conversation-intelligence/conversation-taxonomy.ts',
  registry: 'src/ai-tools/ai-tool-registry.service.ts',
};
const originals = Object.fromEntries(Object.entries(files).map(([key, file]) =>
  [key, fs.readFileSync(path.join(cwd, file), 'utf8')]));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const proofFile = 'src/ai-tools/personal-history-planner-contract.spec.ts';
const fixtureFile = 'src/ai-tools/__fixtures__/recorded-last-visit-invalid-tool-arguments.json';
const report = {
  qualification: 'OFFLINE_CONTRACT_REGRESSION_NOT_LIVE_ACCEPTANCE_OR_RELEASE_CERTIFICATION',
  head, prior, fixtureSha256: sha(fs.readFileSync(path.join(cwd, fixtureFile))),
  specSha256: sha(fs.readFileSync(path.join(cwd, proofFile))),
  baseline: null, counterfactuals: [], restored: null,
};
assert.equal(report.fixtureSha256, '75daca7820bf0e01f9b333849590cafd708088bd7bd337cfdf772192d3373379');
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
function run(name) {
  const receipt = path.join(out, name + '.json');
  const log = path.join(out, name + '.log');
  const fd = fs.openSync(log, 'wx', 0o600);
  let child;
  try {
    child = spawnSync(process.execPath, [
      'node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', proofFile,
      '--json', '--outputFile=' + receipt,
    ], { cwd, env, stdio: ['ignore', fd, fd], timeout: 60_000 });
  } finally { fs.closeSync(fd); }
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  const result = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(result.numTotalTests, 11);
  assert.equal(result.numRuntimeErrorTestSuites, 0);
  assert.equal(sha(fs.readFileSync(path.join(cwd, fixtureFile))), report.fixtureSha256);
  assert.equal(sha(fs.readFileSync(path.join(cwd, proofFile))), report.specSha256);
  return {
    exit: child.status, passed: result.numPassedTests, failed: result.numFailedTests,
    failures: result.testResults.flatMap((suite) => suite.assertionResults
      .filter((test) => test.status === 'failed').map((test) => test.fullName)),
    receiptSha256: sha(fs.readFileSync(receipt)), logSha256: sha(fs.readFileSync(log)),
  };
}
function restore() {
  for (const [key, file] of Object.entries(files)) fs.writeFileSync(path.join(cwd, file), originals[key]);
}
function replace(key, before, after) {
  assert.equal(originals[key].split(before).length, 2, 'exact mutation anchor');
  fs.writeFileSync(path.join(cwd, files[key]), originals[key].replace(before, after));
}
function record(name, expectedFailures, failurePattern) {
  const result = run(name);
  const killed = result.exit === 1 && result.failed === expectedFailures &&
    result.failures.every((name) => failurePattern.test(name));
  report.counterfactuals.push({ name, ...result, killed });
  save();
  assert.ok(killed, 'survived or unrelated failure: ' + name);
  restore();
}
try {
  report.baseline = run('baseline'); save(); assert.equal(report.baseline.exit, 0);
  for (const key of ['model', 'catalog', 'taxonomy']) fs.writeFileSync(
    path.join(cwd, files[key]), git('show', prior + ':maya-saas-backend/' + files[key]) + '\n');
  record('exact-prior-product', 2, /sends explicit semantic-only period instructions/);
  // A silent argument sanitizer would hide this failure and admit forged scope.
  replace('registry', "      case 'appointments.own.list':\n", "      case 'appointments.own.list':\n        return {};\n");
  record('silently-accept-unsupported-arguments', 6, /recorded refusal|refuses unsupported or caller-selected/);
  replace('catalog', "const EMPTY_OBJECT_SCHEMA = {\n  type: 'object',\n  additionalProperties: false,",
    "const EMPTY_OBJECT_SCHEMA = {\n  type: 'object',\n  additionalProperties: true,");
  record('weaken-empty-input-schema', 2, /sends explicit semantic-only period instructions/);
} finally {
  restore(); report.restored = run('restored'); save();
}
assert.equal(report.restored.exit, 0);
assert.equal(git('rev-parse', 'HEAD'), head);
console.log(JSON.stringify(report, null, 2));
