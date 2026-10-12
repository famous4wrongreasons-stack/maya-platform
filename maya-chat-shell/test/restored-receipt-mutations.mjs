// Counterfactuals in a disposable committed-source archive. No working-source mutation,
// credentials, database, browser, provider, model, release grant or release certification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const shell = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(shell), output = process.argv[2];
assert.ok(output && path.isAbsolute(output) && !fs.existsSync(output));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', 'maya-chat-shell'), '');
const head = git('rev-parse', 'HEAD');
fs.mkdirSync(output, { mode: 0o700 });
execFileSync('tar', ['-x', '-C', output], { input: execFileSync('git', ['archive', head, 'maya-chat-shell', 'maya-saas-backend/package.json'], { cwd: repo, maxBuffer: 128 * 1024 * 1024 }) });
fs.symlinkSync(path.join(repo, 'maya-saas-backend/node_modules'), path.join(output, 'maya-saas-backend/node_modules'), 'dir');
const cwd = path.join(output, 'maya-chat-shell');
const file = path.join(cwd, 'src/shell/intents.ts'), original = fs.readFileSync(file, 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const specs = ['test/intents.test.mjs', 'test/dom.test.mjs'];
const hashes = Object.fromEntries(specs.map(file => [file, sha(fs.readFileSync(path.join(cwd, file)))]));
const report = { qualification: 'OFFLINE_RESTORED_RECEIPT_RUNTIME_DOM_NOT_RELEASE', head, sourceSha256: sha(original), specHashes: hashes, baseline: null, mutations: [], restored: null };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
const env = { PATH: process.env.PATH, TZ: 'UTC', LANG: 'C' };
function run(name) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=restored receipt', ...specs], { cwd, env, encoding: 'utf8', timeout: 20000 });
  const log = (result.stdout ?? '') + (result.stderr ?? '');
  fs.writeFileSync(path.join(output, name + '.log'), log, { mode: 0o600 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  const total = Number(/^# tests (\d+)$/m.exec(log)?.[1]);
  assert.equal(total, 30, 'All applicable tests ran; syntax/import/runner failure is not a kill');
  for (const [file, hash] of Object.entries(hashes)) assert.equal(sha(fs.readFileSync(path.join(cwd, file))), hash);
  const failures = [...log.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  assert.ok(failures.every(name => name.startsWith('restored receipt')), 'Import/runner failure is not a kill');
  return { exit: result.status, total, passed: Number(/^# pass (\d+)$/m.exec(log)?.[1]), failed: Number(/^# fail (\d+)$/m.exec(log)?.[1]),
    failures, logSha256: sha(log) };
}
const mutations = [
  ['missing-restored-read', "deps.timeline.setReceiptRefresh(anchor, 'available');", '// no restored read chrome', /actual conversation restore/],
  ['tenant-substitution', 'current.envelope.tenant_id === tenant && ', '', /tenant substitution/],
  ['principal-substitution', 'current.envelope.integrity.principal_proof_hash === principal', 'true', /principal substitution/],
  ['turn-substitution', 'current.envelope.correlation.turn_id === turn', 'true', /turn substitution/],
  ['parent-substitution', 'current.envelope.correlation.parent_widget_id === parent', 'true', /parent substitution/],
  ['ambiguous-read', 'candidates.length === 1 ? candidates[0] : undefined', 'candidates[0]', /ambiguous rows/],
  ['concurrent-read', 'if (entry.inflight !== null) return;', '// concurrent reads admitted', /concurrent clicks/],
  ['changed-confirmed-identity', "(entry.confirmedReceiptRef !== null && !confirmed.has(entry.confirmedReceiptRef))", 'false', /confirmed identity cannot change/],
  ['restore-unbound', 'if (!page.tenant_bound) return;', '// unbound historical page admitted', /unbound page/],
  ['release-without-abort', 'restoredReceipts.get(itemId)?.inflight?.abort();', '// pending restored read leaked', /aborts read/],
  ['duplicate-outcome', 'if (published.has(key)) return null;', '// duplicate terminal outcome admitted', /actual conversation restore/],
];
try {
  report.baseline = run('baseline'); save(); assert.equal(report.baseline.exit, 0);
  for (const [name, from, to, expected] of mutations) {
    assert.equal(original.split(from).length, 2, 'unique mutation point: ' + name);
    fs.writeFileSync(file, original.replace(from, to));
    const result = run(name);
    const killed = result.exit === 1 && result.failed > 0 && result.failures.some(name => expected.test(name));
    report.mutations.push({ name, ...result, killed }); save();
    assert.ok(killed, 'survived or unrelated failure: ' + name);
    fs.writeFileSync(file, original);
  }
} finally {
  fs.writeFileSync(file, original); report.restored = run('restored'); save();
}
assert.equal(report.restored.exit, 0);
assert.equal(git('rev-parse', 'HEAD'), head);
assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', 'maya-chat-shell'), '');
console.log(JSON.stringify({ head, baseline: report.baseline.passed, killed: report.mutations.filter(m => m.killed).length, restored: report.restored.passed }));
