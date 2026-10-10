// Real transport code, synthetic native wire only. No token, owner DB or network.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createReadTransport, validateTeamResponse } from './local-yclients-read-transport.mjs';
import { createReadTrace, projectReadTrace } from './local-yclients-read-status.mjs';
import { createDiagnostic, runtimeObserver } from './local-yclients-read.mjs';

const url = 'https://api.yclients.com/api/v1/company/424242/staff';
const request = () => ({ method: 'POST', originalUrl: '/api/integrations/crm/connect', user: { tenantId: 'synthetic', userId: 'owner', membershipStatus: 'active' } });
const body = (count = 2) => ({ success: true, data: Array.from({ length: count }, (_, i) => ({ id: i + 1, company_id: 424242 })), meta: {} });
async function exercise(payload = body(), { source = url, init = { headers: { Accept: 'application/vnd.yclients.v2+json' } }, status = 200, headers, selected = 424242, req = request(), responseUrl, redirected, observerThrows = false } = {}, accept = false) {
  const events = [], wire = JSON.stringify(payload);
  const transport = createReadTransport(async (_raw, nativeInit) => {
    assert.equal(nativeInit.redirect, 'error');
    const response = new Response(wire, { status, headers });
    if (responseUrl !== undefined) Object.defineProperty(response, 'url', { value: responseUrl });
    if (redirected !== undefined) Object.defineProperty(response, 'redirected', { value: redirected });
    return response;
  }, async () => selected, Date.now, observerThrows ? () => { throw Error('PRIVATE_OBSERVER'); } : createReadTrace(e => events.push(e)));
  await transport.run(req, new EventEmitter(), async () => {
    if (accept) assert.equal(await (await transport.fetch(source, init)).text(), wire);
    else {
      await assert.rejects(transport.fetch(source, init), { code: 'LOCAL_YCLIENTS_READ_REFUSED' });
      const calls = transport.counters.calls;
      await assert.rejects(transport.fetch('https://api.yclients.com/api/v1/staff/424242'));
      assert.equal(transport.counters.calls, calls, 'refusal poisons scope before adapter fallback');
    }
  });
  return { events, transport };
}

test('regression: exact unfiltered management collection accepts empty meta without inventing a count', async () => {
  const payload = body(); payload.data[0].name = 'PRIVATE_NAME';
  const { events, transport } = await exercise(payload, { responseUrl: url }, true);
  assert.equal(transport.counters.calls, 1);
  assert.equal(transport.counters.refused, 0);
  assert.equal(events.at(-1).teamCompleteness, 'management_collection_contract');
  assert.equal(events.at(-1).teamCountEncoding, 'missing');
  assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  assert.deepEqual(payload.meta, {});
});

test('all bounded collection sizes 0..50 preserve exact wire bytes and staff identities', async () => {
  for (let count = 0; count <= 50; count++) await exercise(body(count), {}, true);
});

test('standalone validation cannot obtain source authority from flags, copied strings or a new Symbol', () => {
  for (const forged of [undefined, true, 'management_collection_contract', Symbol('management_collection_contract'), { source: url, complete: true }]) {
    assert.throws(() => validateTeamResponse(body(), new Headers(), 424242, forged));
  }
});

for (const [name, options, calls] of [
  ['deprecated endpoint', { source: 'https://api.yclients.com/api/v1/staff/424242' }, 1],
  ['bookable subset', { source: 'https://api.yclients.com/api/v1/book_staff/424242' }, 0],
  ['single staff', { source: url + '/1' }, 0],
  ['pagination query', { source: url + '?page=1' }, 0],
  ['filter query', { source: url + '?fired=0' }, 0],
  ['foreign company', { source: url.replace('424242', '424243') }, 0],
  ['foreign selected company', { selected: 424243 }, 0],
  ['other host', { source: url.replace('.com', '.ru') }, 0],
  ['normalized path', { source: url.replace('/staff', '/ignored/../staff') }, 1],
  ['POST', { init: { method: 'POST' } }, 0],
  ['GET body', { init: { body: '{}' } }, 0],
  ['unspecified API version', { init: {} }, 1],
  ['different API version', { init: { headers: { Accept: 'application/vnd.yclients.v1+json' } } }, 1],
  ['partial HTTP', { status: 206 }, 1],
  ['unexpected success status', { status: 201 }, 1],
  ['redirected response', { redirected: true }, 1],
  ['substituted response URL', { responseUrl: url.replace('424242', '424243') }, 1],
  ['no current principal', { req: { ...request(), user: undefined } }, 0],
  ['inactive principal', { req: { ...request(), user: { ...request().user, membershipStatus: 'revoked' } } }, 0],
]) test(`countless collection refuses ${name}`, async () => {
  const { transport } = await exercise(body(), options);
  assert.equal(transport.counters.calls, calls);
});

for (const [name, change] of [
  ['missing meta', p => { delete p.meta; }],
  ['null meta', p => { p.meta = null; }],
  ['array meta', p => { p.meta = []; }],
  ['contradictory total', p => { p.meta.total_count = 3; }],
  ['null total', p => { p.meta.total_count = null; }],
  ['malformed total', p => { p.meta.total_count = '2.0'; }],
  ['count without total', p => { p.meta.count = 2; }],
  ['first page without total', p => { p.meta.page = 1; }],
  ['pagination metadata', p => { p.meta.next_page = 2; }],
  ['pagination object', p => { p.pagination = {}; }],
  ['has more flag', p => { p.has_more = false; }],
  ['cursor', p => { p.next_cursor = null; }],
  ['caller completeness flag', p => { p.complete = true; }],
  ['foreign staff', p => { p.data[0].company_id = 424243; }],
  ['missing staff company', p => { delete p.data[0].company_id; }],
  ['duplicate staff', p => { p.data[1].id = '1'; }],
  ['invalid staff id', p => { p.data[0].id = 0; }],
  ['null row', p => { p.data[0] = null; }],
  ['too many staff', p => { p.data = body(51).data; }],
]) test(`countless collection refuses ${name} without fallback`, async () => {
  const p = body(); change(p);
  const { events } = await exercise(p);
  assert.equal(events.some(e => e.stage === 'completed'), false);
});

test('any pagination header, including empty, refuses the countless collection', async () => {
  for (const header of ['link', 'content-range']) for (const value of ['', 'PRIVATE_HEADER']) {
    const { events } = await exercise(body(), { headers: { [header]: value } });
    assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  }
});

test('explicit number/string totals remain distinct and authoritative; no collection fallback', async () => {
  for (const total of [2, '2']) {
    const p = body(); p.meta.total_count = total;
    for (const source of [url, 'https://api.yclients.com/api/v1/staff/424242']) {
      const { events } = await exercise(p, { source }, true);
      assert.equal(events.at(-1).teamCompleteness, 'explicit_total');
    }
  }
});

test('missing company diagnosis remains truthful without claiming an absent count was mandatory', async () => {
  const p = body(); delete p.data[0].company_id;
  const { events } = await exercise(p);
  assert.deepEqual(events.find(e => e.route === 'team' && e.stage === 'refused').teamIssues, ['foreign_company']);
});

test('throwing observer never changes collection acceptance or refusal', async () => {
  await exercise(body(), { observerThrows: true }, true);
  await exercise(body(), { source: 'https://api.yclients.com/api/v1/staff/424242', observerThrows: true });
});

test('closed completeness diagnosis is context-bound and survives receipt projection', () => {
  const event = { type: 'read-trace', contract: 'maya.local-yclients-read-trace/1', sequence: 1, elapsedMs: 1, surface: 'provider', route: 'team', method: 'GET', stage: 'completed', status: 200, code: 'provider_response_read', teamCountEncoding: 'missing', teamCompleteness: 'management_collection_contract' };
  assert.deepEqual(projectReadTrace(event), event);
  for (const changes of [{ teamCompleteness: true }, { teamCompleteness: 'PRIVATE' }, { teamCompleteness: 'explicit_total' }, { teamCountEncoding: 'number' }, { teamCountEncoding: undefined }, { method: 'POST' }, { route: 'companies' }, { stage: 'refused' }, { status: 206 }, { status: null }, { surface: 'http' }, { code: 'provider_scope_refused' }, { raw: 'PRIVATE' }]) assert.equal(projectReadTrace({ ...event, ...changes }), null);
  const d = createDiagnostic(false); let saved;
  const o = runtimeObserver(d, { origin: 'http://127.0.0.1:55432', providerAdmission: 'explicit_setup_reads_only' }, () => { saved = JSON.parse(JSON.stringify(d)); });
  o.accept(event);
  assert.equal(saved.readTrace[0].teamCompleteness, 'management_collection_contract');
});
