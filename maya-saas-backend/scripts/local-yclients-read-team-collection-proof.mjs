// Offline, isolated counterfactual/mutation proof. Never modifies the worktree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = '2f55da13a0b32f0d7cede07ccf27aa2fa58f4ff9';
const testFile = 'maya-saas-backend/scripts/local-yclients-read-team-collection.test.mjs';
const transportFile = 'maya-saas-backend/scripts/local-yclients-read-transport.mjs';
const statusFile = 'maya-saas-backend/scripts/local-yclients-read-status.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-team-collection-proof-'));
const copied = new Set();
function copyClosure(relative) {
  if (copied.has(relative)) return;
  assert.ok(!relative.startsWith('..') && relative.endsWith('.mjs'));
  const source = fs.readFileSync(path.join(repo, relative), 'utf8');
  copied.add(relative);
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), source);
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) copyClosure(path.normalize(path.join(path.dirname(relative), match[1])));
}
copyClosure(testFile);
// Import-only shared installed dependencies; all mutated source lives in root.
fs.symlinkSync(path.join(repo, 'maya-saas-backend/node_modules'), path.join(root, 'maya-saas-backend/node_modules'), 'dir');
const current = fs.readFileSync(path.join(root, transportFile), 'utf8');
const currentStatus = fs.readFileSync(path.join(root, statusFile), 'utf8');
const result = { contract: 'maya.team-collection-offline-proof/1', baseline, sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sources: Object.fromEntries([...copied].sort().map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(repo, p))).digest('hex')])), runs: [] };
function run(name, shouldPass, requiredFailure) {
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], { cwd: root, encoding: 'utf8', timeout: 30000 });
  const log = (child.stdout ?? '') + (child.stderr ?? '');
  fs.writeFileSync(path.join(root, name + '.log'), log);
  assert.equal(child.signal, null, name + ': no timeout/crash');
  assert.equal(child.error, undefined, name + ': process completed');
  const pass = Number(log.match(/^# pass (\d+)$/m)?.[1]);
  const fail = Number(log.match(/^# fail (\d+)$/m)?.[1]);
  assert.ok(Number.isFinite(pass) && Number.isFinite(fail) && pass + fail === 46, name + ': entire expected test corpus executed');
  assert.equal(child.status === 0, shouldPass, name);
  if (shouldPass) assert.equal(fail, 0);
  else assert.ok(fail > 0 && log.split('\n').some(line => line.startsWith('not ok ') && line.includes(requiredFailure)), name + ': expected assertion detects change');
  result.runs.push({ name, exit: child.status, pass, fail, logSha256: createHash('sha256').update(log).digest('hex') });
}
run('unmutated', true);
for (const file of [transportFile, statusFile]) fs.writeFileSync(path.join(root, file), execFileSync('git', ['show', baseline + ':' + file], { cwd: repo }));
run('historical-baseline', false, 'regression: exact unfiltered management collection');
fs.writeFileSync(path.join(root, statusFile), currentStatus);
for (const [name, before, after, failure] of [
  ['source-binding', 'return String(raw) === exact', 'return true', 'countless collection refuses deprecated endpoint'],
  ['company-witness', "(collection && !Object.hasOwn(item, 'company_id'))", 'false', 'countless collection refuses missing staff company'],
  ['metadata-shape', 'Object.keys(payload.meta).length === 0', 'true', 'countless collection refuses contradictory total'],
  ['duplicate-staff', '|| new Set(ids.map(String)).size !== ids.length', '|| false', 'countless collection refuses duplicate staff'],
  ['partial-response', '&& response.status === 200', '&& response.status >= 200', 'countless collection refuses partial HTTP'],
  ['current-actor', "scope.request.user.membershipStatus !== 'active'", 'false', 'countless collection refuses inactive principal'],
  ['private-evidence', 'sourceEvidence === MANAGEMENT_COLLECTION', 'true', 'standalone validation cannot obtain source authority'],
]) {
  assert.equal(current.split(before).length, 2, name + ': exact single mutation site');
  fs.writeFileSync(path.join(root, transportFile), current.replace(before, after));
  run(name, false, failure);
}
fs.writeFileSync(path.join(root, transportFile), current);
run('restored', true);
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: root, unmutated: 'PASS', historicalRegression: 'DETECTED', mutationsKilled: 7, restored: 'PASS' }));
