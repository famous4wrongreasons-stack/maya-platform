// Complete structural refusal diagnosis, no real provider/credential/database.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createReadTransport, teamCollectionCheck } from './local-yclients-read-transport.mjs';
import { createReadTrace, projectReadTrace } from './local-yclients-read-status.mjs';
import { createDiagnostic, runtimeObserver } from './local-yclients-read.mjs';

const url = 'https://api.yclients.com/api/v1/company/424242/staff';
const legacy = 'https://api.yclients.com/api/v1/staff/424242';
const init = { headers: { Accept: 'application/vnd.yclients.v2+json', Authorization: 'PRIVATE_AUTHORIZATION' } };
const body = () => ({ success: true, data: [{ id: 1, company_id: 424242, name: 'PRIVATE_NAME', phone: 'PRIVATE_PHONE' }], meta: {} });
const req = () => ({ method: 'POST', originalUrl: '/api/integrations/crm/connect', user: { tenantId: 'synthetic', userId: 'owner', membershipStatus: 'active' } });
const exact = { requestRoute: 'management_exact', v2Accept: true, responseUrl: 'exact', http200: true, redirected: false, metaFields: [], outerFields: ['success', 'data', 'meta'], paginationHeader: false, everyRowCompanyPresent: true };
function response(p, { status = 200, headers, responseUrl = url, redirected = false } = {}) {
  const r = new Response(JSON.stringify(p), { status, headers });
  Object.defineProperty(r, 'url', { value: responseUrl }); Object.defineProperty(r, 'redirected', { value: redirected }); return r;
}
const changes = [
  ['exact collection', {}, p => p, true],
  ['count metadata', {}, p => ({ ...p, meta: { count: 1 } }), false],
  ['page metadata', {}, p => ({ ...p, meta: { page: 1 } }), false],
  ['both metadata fields', {}, p => ({ ...p, meta: { count: 1, page: 1 } }), false],
  ['extra outer field', {}, p => ({ ...p, PRIVATE_FIELD: 'PRIVATE_VALUE' }), false],
  ['legacy source', { source: legacy }, p => p, false],
  ['missing accept', { init: {} }, p => p, false],
  ['substituted response URL', { responseUrl: 'https://other.invalid/PRIVATE' }, p => p, false],
  ['empty pagination header', { headers: { link: '' } }, p => p, false],
  ['partial response', { status: 206 }, p => p, false],
  ['redirect', { redirected: true }, p => p, false],
  ['missing company', {}, p => ({ ...p, data: [{ id: 1 }] }), false],
  ['explicit total', {}, p => ({ ...p, meta: { total_count: 1 } }), true],
  ['explicit total mismatch', {}, p => ({ ...p, meta: { total_count: 2 } }), false],
  ['missing meta', {}, p => ({ success: p.success, data: p.data }), false],
  ['array meta', {}, p => ({ ...p, meta: [] }), false],
  ['unknown metadata', {}, p => ({ ...p, meta: { PRIVATE_META: 'PRIVATE_VALUE' } }), false],
  ['unknown row', {}, p => ({ ...p, data: [null] }), false],
];
async function observe(makeTransport, options, payload, observerThrows = false) {
  const events = []; let calls = 0, outcome;
  const transport = makeTransport(async () => { calls++; return response(payload, options); }, async () => 424242, Date.now, observerThrows ? () => { throw Error('PRIVATE_OBSERVER'); } : createReadTrace(e => events.push(e)));
  await transport.run(req(), new EventEmitter(), async () => {
    try { const r = await transport.fetch(options.source ?? url, options.init ?? init); outcome = { status: r.status, body: await r.text() }; }
    catch (e) {
      outcome = { code: e.code, message: e.message };
      await assert.rejects(transport.fetch(legacy, init));
    }
  });
  assert.equal(calls, 1);
  return { events, outcome, counters: transport.counters };
}

test('all source predicates are closed booleans/enums, with no raw provider or header values', () => {
  const p = body();
  assert.deepEqual(teamCollectionCheck(url, init, response(p), p, 424242), exact);
  const changed = { ...p, PRIVATE_FIELD: 'PRIVATE_VALUE', meta: { page: 1, count: 1, PRIVATE_META: 'PRIVATE_VALUE' } };
  const d = teamCollectionCheck(legacy, {}, response(changed, { responseUrl: 'https://other.invalid/PRIVATE', status: 206, redirected: true, headers: { link: 'PRIVATE_HEADER' } }), changed, 424242);
  assert.deepEqual(d, { ...exact, requestRoute: 'legacy_exact', v2Accept: false, responseUrl: 'other', http200: false, redirected: true, metaFields: ['count', 'page', 'other'], outerFields: ['success', 'data', 'meta', 'other'], paginationHeader: true });
  assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
});

for (const [name, options, change, accepted] of changes) test(`diagnosis: ${name}; original refusal/acceptance and no fallback preserved`, async () => {
  const p = change(body()), result = await observe(createReadTransport, options, p);
  assert.equal(result.outcome.code === undefined, accepted);
  const d = result.events.find(e => e.teamCollectionCheck)?.teamCollectionCheck;
  if (accepted) assert.equal(d, undefined, 'diagnosis is refusal-only');
  else assert.deepEqual(d, teamCollectionCheck(options.source ?? url, options.init ?? init, response(p, options), p, 424242));
  assert.equal(JSON.stringify(result.events).includes('PRIVATE'), false);
  assert.equal(result.events.at(-1).teamCollectionCheck, undefined, 'poisoned fallback has no inherited diagnosis');
});

test('projector refuses raw values, missing fields, unsorted/duplicate keys and foreign contexts', () => {
  const e = { type: 'read-trace', contract: 'maya.local-yclients-read-trace/1', sequence: 1, elapsedMs: 1, surface: 'provider', route: 'team', method: 'GET', stage: 'refused', status: 200, code: 'provider_scope_refused', teamCollectionCheck: exact };
  assert.deepEqual(projectReadTrace(e), e);
  for (const altered of [null, [], {}, { ...exact, PRIVATE_FIELD: true }, { ...exact, requestRoute: 'PRIVATE_URL' }, { ...exact, responseUrl: 'PRIVATE_URL' }, { ...exact, v2Accept: 1 }, { ...exact, http200: false }, { ...exact, everyRowCompanyPresent: 'PRIVATE_ID' }, { ...exact, metaFields: ['PRIVATE_META'] }, { ...exact, metaFields: ['count', 'count'] }, { ...exact, metaFields: ['page', 'count'] }, { ...exact, outerFields: ['success', 'PRIVATE_FIELD'] }, { ...exact, outerFields: {} }]) assert.equal(projectReadTrace({ ...e, teamCollectionCheck: altered }), null);
  for (const altered of [{ route: 'company' }, { method: 'POST' }, { stage: 'completed' }, { status: null }, { status: 400 }, { status: 206 }, { surface: 'http' }, { code: 'provider_response_read' }]) assert.equal(projectReadTrace({ ...e, ...altered }), null);
  const projected = projectReadTrace(e); projected.teamCollectionCheck.metaFields.push('count');
  assert.deepEqual(exact.metaFields, []);
});

test('complete structural diagnosis survives launcher receipt persistence', async () => {
  const p = body(); p.meta = { count: 1, page: 1 };
  const result = await observe(createReadTransport, {}, p);
  const d = createDiagnostic(false); let saved;
  const observer = runtimeObserver(d, { origin: 'http://127.0.0.1:55432', providerAdmission: 'explicit_setup_reads_only' }, () => { saved = JSON.parse(JSON.stringify(d)); });
  for (const event of result.events) observer.accept(event);
  assert.deepEqual(saved.readTrace.find(e => e.teamCollectionCheck).teamCollectionCheck.metaFields, ['count', 'page']);
  assert.equal(saved.firstFailure, null);
  assert.equal(JSON.stringify(saved).includes('PRIVATE'), false);
});

test('all admission predicates are byte-identical and the complete matrix matches prior committed transport', async () => {
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(scripts, '../..');
  const base = execFileSync('git', ['show', 'f3aceca9e5a1609545be9ce519e240c9cf201286:maya-saas-backend/scripts/local-yclients-read-transport.mjs'], { cwd: repo, encoding: 'utf8' });
  const current = fs.readFileSync(path.join(scripts, 'local-yclients-read-transport.mjs'), 'utf8');
  const predicates = s => s.slice(s.indexOf('const MANAGEMENT_COLLECTION'), s.indexOf('// Called only AFTER'));
  assert.equal(predicates(current), predicates(base));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-team-source-admission-'));
  const file = path.join(dir, 'baseline.mjs');
  fs.writeFileSync(file, base.replaceAll("'./local-yclients-read-profile.mjs'", JSON.stringify(pathToFileURL(path.join(scripts, 'local-yclients-read-profile.mjs')).href)).replaceAll("'./local-yclients-read-status.mjs'", JSON.stringify(pathToFileURL(path.join(scripts, 'local-yclients-read-status.mjs')).href)));
  const prior = await import(pathToFileURL(file).href);
  for (const [, options, change] of changes) {
    const p = change(body());
    const before = await observe(prior.createReadTransport, options, p);
    for (const throws of [false, true]) {
      const after = await observe(createReadTransport, options, p, throws);
      assert.deepEqual(after.outcome, before.outcome);
      assert.deepEqual(after.counters, before.counters);
    }
  }
});
