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
const scope = ['maya-saas-backend/scripts', 'maya-chat-shell/dev', 'maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html'];
assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', ...scope]), '', 'committed_sources_required');
const head = git(['rev-parse', 'HEAD']); fs.mkdirSync(out, { mode: 0o700 });
execFileSync('tar', ['-x', '-C', out], { input: execFileSync('git', ['archive', head, ...scope], { cwd: repo, maxBuffer: 32 * 1024 * 1024 }) });
const cwd = path.join(out, 'maya-saas-backend');
fs.symlinkSync(path.join(backend, 'dist'), path.join(cwd, 'dist'), 'dir');
fs.symlinkSync(path.join(backend, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
const files = Object.fromEntries([['policy','local-owner-history-review-policy.mjs'],['transport','local-owner-history-transport.mjs']].map(([name,file]) => [name,path.join(cwd,'scripts',file)]));
const originals = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
const report = { qualification: 'SYNTHETIC_LOCAL_GUARD_NOT_RELEASE_CERTIFICATION', head, hashes: Object.fromEntries(Object.entries(originals).map(([k,v]) => [k, createHash('sha256').update(v).digest('hex')])), baseline: null, mutations: [], restored: null };
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
function run(name) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/local-owner-history-review.test.mjs'], { cwd, env, encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  const log = result.stdout + result.stderr; fs.writeFileSync(path.join(out, name + '.log'), log, { mode: 0o600 });
  assert.equal(/SyntaxError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(log), false, 'infrastructure_failure');
  const count = key => Number(new RegExp('^# ' + key + ' (\\d+)$', 'm').exec(log)?.[1] ?? NaN);
  assert.ok(Number.isSafeInteger(count('pass')) && Number.isSafeInteger(count('fail')));
  return { exit: result.status, passed: count('pass'), failed: count('fail'), failures: [...log.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]), assertion: log.includes("code: 'ERR_ASSERTION'") };
}
const mutations = [
  ['import-admission','transport',"assert.ok(allowJournal, 'history_review_import_refused');",'', 'review transport cannot import'],
  ['model-results','policy','input.tool_results.length === 0','true','actual model wire'],
  ['model-memory','policy','input.remembered_notes.length === 0','true','actual model wire'],
  ['model-phase','policy',"input.phase === 'tool_planning'",'true','actual model wire'],
  ['model-retained-plan','policy','safeRetainedHistoryPlan(input.semantic_plan)','true','actual model wire'],
  ['model-assistant','policy',"m.role === 'user' && historyQuestions.includes(m.content)","['user','assistant'].includes(m.role) && (m.role === 'assistant' || historyQuestions.includes(m.content))",'actual model wire'],
  ['request-expiry','policy','!done && !closed && now() < expires','!done && !closed','serialized sequence'],
  ['request-overlap','policy','!closed && !busy && now() < expires','!closed && now() < expires','serialized sequence'],
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
  report.workingSourceUnchanged = Object.entries(files).every(([k, file]) => fs.readFileSync(path.join(backend, 'scripts', path.basename(file)), 'utf8') === originals[k]);
  save(); assert.equal(report.restored.exit, 0); assert.equal(report.workingSourceUnchanged, true);
}
console.log(JSON.stringify({ baseline: report.baseline.passed, killed: report.mutations.filter(m => m.killed).length, total: mutations.length, restored: report.restored.passed }));
