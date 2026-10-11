// Finite local HTTP-only mutations in a private committed-source copy.
// No owner database, provider credentials, live auth or production code edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend), out = process.argv[2];
assert.ok(process.argv.length === 3 && out && path.isAbsolute(out) && !fs.existsSync(out));
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const scopes = ['maya-saas-backend/scripts', 'maya-saas-backend/package.json',
  'maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html', 'maya-chat-shell/dev'];
assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', ...scopes]), '', 'committed_sources_required');
const head = git(['rev-parse', 'HEAD']);
fs.mkdirSync(out, { mode: 0o700 });
const archive = execFileSync('git', ['archive', head, ...scopes], { cwd: repo, maxBuffer: 32 * 1024 * 1024 });
execFileSync('tar', ['-x', '-C', out], { input: archive });
const cwd = path.join(out, 'maya-saas-backend');
fs.symlinkSync(path.join(backend, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
const filename = path.join(cwd, 'scripts/local-telegram-return.mjs');
const original = fs.readFileSync(filename, 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const report = { qualification: 'SYNTHETIC_LOCAL_HTTP_NOT_RELEASE_CERTIFICATION', head,
  sourceSha256: digest(original), baseline: null, mutations: [], restored: null };
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const env = { NODE_ENV: 'test', TZ: 'UTC', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
function run(name) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/local-telegram-return.test.mjs'],
    { cwd, env, encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  const log = result.stdout + result.stderr;
  fs.writeFileSync(path.join(out, name + '.log'), log, { mode: 0o600 });
  assert.equal(/SyntaxError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(log), false, 'test_infrastructure_failure');
  const counts = key => Number(new RegExp('^# ' + key + ' (\\d+)$', 'm').exec(log)?.[1] ?? NaN);
  assert.ok(Number.isSafeInteger(counts('pass')) && Number.isSafeInteger(counts('fail')), 'test_summary_required');
  return { exit: result.status, passed: counts('pass'), failed: counts('fail'),
    failures: [...log.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]),
    assertionFailure: log.includes("code: 'ERR_ASSERTION'") };
}
const changes = [
  ['cross-site-return-blocked', [["h['sec-fetch-site'] === 'cross-site'", "h['sec-fetch-site'] === 'none'"]], 'provider document return'],
  ['callback-script-csp-blocked', [["${sources('script')}", "'self'"]], 'callback header CSP'],
  ['foreign-host-admitted', [['h.host === host && h.origin === undefined', 'h.origin === undefined']], 'foreign host'],
  ['credential-bearing-return-admitted', [["|| ['authorization', 'cookie', 'x-session-token', 'x-telegram-initdata'].some(key => h[key] !== undefined)", '|| false']], 'session bearer'],
  ['subframe-admitted', [["h['sec-fetch-dest'] === 'document'", "['document', 'iframe'].includes(h['sec-fetch-dest'])"],
    ["h['sec-fetch-dest'] !== 'document'", "!['document', 'iframe'].includes(h['sec-fetch-dest'])"]], 'cross-origin subframe'],
  ['non-get-admitted', [["request.method !== 'GET'", 'false']], 'POST cannot'],
  ['callback-path-broadened', [["!(raw === route || raw.startsWith(route + '?'))", "!raw.startsWith('/')"]], 'cross-site API'],
  ['callback-bytes-substituted', [['response.end(bytes);', "response.end('<html>retired callback</html>');"]], 'provider document return'],
];
try {
  report.baseline = run('baseline'); save(); assert.equal(report.baseline.exit, 0);
  for (const [name, replacements, expected] of changes) {
    let source = original;
    for (const [from, to] of replacements) {
      assert.equal(source.split(from).length, 2, 'exact_mutation_anchor_required: ' + name);
      source = source.replace(from, to);
    }
    fs.writeFileSync(filename, source);
    const result = run(name);
    const killed = result.exit === 1 && result.failed > 0 && result.assertionFailure && result.failures.some(n => n.includes(expected));
    report.mutations.push({ name, ...result, killed }); save();
    assert.ok(killed, 'survived_or_unrelated_failure: ' + name);
  }
} finally {
  fs.writeFileSync(filename, original);
  report.restored = run('restored'); report.workingSourceUnchanged = fs.readFileSync(path.join(backend, 'scripts/local-telegram-return.mjs'), 'utf8') === original;
  save();
  assert.equal(report.restored.exit, 0); assert.equal(report.workingSourceUnchanged, true);
}
console.log(JSON.stringify({ baseline: report.baseline.passed, killed: report.mutations.filter(m => m.killed).length, total: changes.length, restored: report.restored.passed }));
