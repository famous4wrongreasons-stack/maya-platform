// Offline source-guard cost through the real bounded Telegram transport.
// No owner plan, retained database, credentials or network. The wire and database
// reread are synthetic; this cannot prove real provider latency or Client binding.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceBinding, READ_SOURCE_FILES } from './local-yclients-read.mjs';
import { createOwnerTelegramTransport } from './local-owner-telegram-transport.mjs';
import { TELEGRAM_LIMITS } from './local-owner-telegram-policy.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.argv[2];
assert.ok(process.argv.length === 3 && path.isAbsolute(output) && !fs.existsSync(output));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
const referenceCommit = '2fb2569147cf1910be0b4c01b7ad2735054abe6a';
const reference = git(['show', referenceCommit + ':maya-saas-backend/scripts/local-yclients-read.mjs']);
const referenceBase = git(['show', referenceCommit + ':maya-saas-backend/scripts/local-onboarding.mjs']);
const baseFrom = referenceBase.indexOf('const sourcePaths = [');
const baseUntil = referenceBase.indexOf('\nexport function sessionPlan(', baseFrom);
assert.ok(baseFrom >= 0 && baseUntil > baseFrom);
const oldBaseBinding = new Function('execFileSync', 'repo', 'assert', 'fs', 'path', 'createHash', 'digest',
  referenceBase.slice(baseFrom, baseUntil) + '\nreturn sourceBinding;')(execFileSync, repo, assert, fs, path, createHash, digest);
const from = reference.indexOf('export function readSourceBinding() {');
const until = reference.indexOf('\nexport function readSessionPlan(', from);
assert.ok(from >= 0 && until > from);
// Run the former algorithm on the same final committed files, not old bytes.
const oldBinding = new Function('sourceBinding', 'execFileSync', 'repo', 'READ_SOURCE_FILES', 'assert', 'fs', 'path', 'createHash', 'digest',
  'return (' + reference.slice(from + 'export '.length, until).trim() + ');')(
  oldBaseBinding, execFileSync, repo, READ_SOURCE_FILES, assert, fs, path, createHash, digest);
const source = readSourceBinding();
assert.deepEqual(oldBinding(), source);
const projectionDigest = digest(JSON.stringify(source));
const runtimeClient = fs.readFileSync(path.join(repo, 'maya-chat-shell/src/net/client.ts'), 'utf8');
const browserBudgetMs = Number(/REQUEST_TIMEOUT_MS\s*=\s*([\d_]+)/.exec(runtimeClient)?.[1].replaceAll('_', ''));
assert.ok(Number.isSafeInteger(browserBudgetMs) && browserBudgetMs > 0);
fs.mkdirSync(output, { mode: 0o700 });
const report = { qualification: 'OFFLINE_TRANSPORT_SOURCE_GUARD_COST_NOT_REAL_PROVIDER_OR_BINDING_PROOF',
  head: source.head, referenceCommit, sourceFiles: source.files.length, projectionDigest, projectionEqual: true,
  operationBudgetMs: TELEGRAM_LIMITS.operationMs, browserBudgetMs, providerCalls: 0, retainedDatabaseAccess: false, runs: [] };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
save();
for (const [name, read] of [['shared-scan', readSourceBinding], ['previous-algorithm', oldBinding]]) {
  let checks = 0, guardMs = 0, authorityRereads = 0, completedPages = 0;
  const check = () => {
    const start = performance.now();
    assert.equal(digest(JSON.stringify(read())), projectionDigest);
    guardMs += performance.now() - start; checks++;
  };
  const clientId = '123456789', companyId = '12345', origin = 'http://127.0.0.1:56151';
  const payload = JSON.stringify({ success: true, data: [], syntheticPadding: 'x'.repeat(16384) });
  const t = createOwnerTelegramTransport({ clientId, companyId, assertCurrent: check,
    // Match the two source checks surrounding each current database reread.
    // No database is opened here; database/provider latency remains unmeasured.
    verifyCurrent: async () => { check(); authorityRereads++; check(); },
    nativeFetch: async () => new Response(payload) });
  let completed = false;
  const start = performance.now();
  try {
    await t.run({ purpose: 'login', verifiedOwner: true, code: 'synthetic-code', verifier: 'synthetic-verifier', redirectUri: origin + '/oauth-callback.html' }, async () => {
      const token = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: 'synthetic-code',
        code_verifier: 'synthetic-verifier', redirect_uri: origin + '/oauth-callback.html' });
      await (await t.fetch('https://oauth.telegram.org/token', { method: 'POST', body: token })).text();
      await (await t.fetch('https://oauth.telegram.org/.well-known/jwks.json', { method: 'GET' })).text();
      for (let page = 1; page <= TELEGRAM_LIMITS.registryPages; page++) {
        const response = await t.fetch(`https://api.yclients.com/api/v1/company/${companyId}/clients/search`, { method: 'POST',
          body: JSON.stringify({ fields: ['id', 'name', 'phone', 'visits_count', 'sold_amount', 'last_visit_date'], filters: [], page, page_size: 200 }) });
        assert.equal(await response.text(), payload); completedPages++;
      }
    });
    completed = true;
  } catch (error) {
    // Only a known bounded transport refusal is an admissible timing outcome.
    assert.equal(error.message, 'local_telegram_transport_refused');
  } finally { t.stop(); }
  const elapsedMs = Math.round(performance.now() - start);
  report.runs.push({ name, elapsedMs, guardMs: Math.round(guardMs), sourceChecks: checks, authorityRereads,
    completedPages, completed, withinBrowserBudget: elapsedMs < browserBudgetMs, syntheticTransport: t.counters });
  save(); console.log(JSON.stringify(report.runs.at(-1)));
}
report.sourceUnchanged = digest(JSON.stringify(readSourceBinding())) === projectionDigest;
assert.equal(report.sourceUnchanged, true);
assert.equal(report.runs[0].completedPages, TELEGRAM_LIMITS.registryPages);
assert.equal(report.runs[0].withinBrowserBudget, true);
save();
