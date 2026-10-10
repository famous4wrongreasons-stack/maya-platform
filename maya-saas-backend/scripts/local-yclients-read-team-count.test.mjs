// Finite synthetic wire proof. No real provider, owner credentials or database.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createReadTransport, validateTeamResponse } from './local-yclients-read-transport.mjs';
import { createReadTrace, projectReadTrace } from './local-yclients-read-status.mjs';
import { createDiagnostic, runtimeObserver } from './local-yclients-read.mjs';

const payload = (count = 2, total = count) => ({ success: true, data: Array.from({ length: count }, (_, id) => ({ id: id + 1, company_id: 424242 })), meta: { total_count: total } });
const request = () => ({ method: 'POST', originalUrl: '/api/integrations/crm/connect', user: { tenantId: 'synthetic', userId: 'owner', membershipStatus: 'active' } });
const url = 'https://api.yclients.com/api/v1/company/424242/staff';

test('regression: exact decimal string total confirms the same complete team as an integer', () => {
  assert.doesNotThrow(() => validateTeamResponse(payload(2, '2'), new Headers(), 424242));
});

test('all admitted team sizes accept equal exact decimal strings and integers without rewriting wire data', async () => {
  for (let count = 0; count <= 50; count++) for (const total of [count, String(count)]) {
    const body = payload(count, total), before = JSON.stringify(body);
    assert.doesNotThrow(() => validateTeamResponse(body, new Headers(), 424242));
    assert.equal(JSON.stringify(body), before);
    const events = [], transport = createReadTransport(async () => new Response(before), async () => 424242, Date.now, createReadTrace(e => events.push(e)));
    await transport.run(request(), new EventEmitter(), async () => assert.equal(await (await transport.fetch(url)).text(), before));
    assert.equal(events.at(-1).stage, 'completed');
    assert.equal(events.at(-1).teamCountEncoding, typeof total === 'number' ? 'number' : 'decimal_string');
    assert.equal(transport.counters.calls, 1); assert.equal(transport.counters.refused, 0);
  }
});

test('missing, null, coercible, unsafe and ambiguous count representations remain refused', () => {
  for (const total of [null, true, false, '', ' ', '02', '+2', '2.0', '2e0', '0x2', '-0', '-2', ' 2', '2\n', '٢', [], [2], {}, -1, 2.5, NaN, Infinity, '9007199254740992', 9007199254740992]) {
    assert.throws(() => validateTeamResponse(payload(2, total), new Headers(), 424242));
  }
  const missing = payload(0); delete missing.meta.total_count;
  assert.throws(() => validateTeamResponse(missing, new Headers(), 424242));
  assert.throws(() => validateTeamResponse(payload(0, null), new Headers(), 424242));
});

test('exact decimal representation cannot admit incomplete, foreign, duplicate, paginated or oversized teams', async () => {
  const changes = [
    p => ({ ...p, meta: { total_count: '3' } }),
    p => ({ ...p, meta: { total_count: '1' } }),
    p => ({ ...p, meta: { total_count: '2', count: 1 } }),
    p => ({ ...p, meta: { total_count: '2', page: 2 } }),
    p => ({ ...p, meta: { total_count: '2', next_page: 2 } }),
    p => ({ ...p, data: [{ id: 1 }, { id: 1 }] }),
    p => ({ ...p, data: [{ id: 1 }, { id: 2, company_id: 424243 }] }),
    p => ({ ...p, pagination: {} }),
    () => payload(51, '51'),
  ];
  for (const change of changes) {
    const body = change(payload(2, '2'));
    const transport = createReadTransport(async () => new Response(JSON.stringify(body)), async () => 424242);
    await transport.run(request(), new EventEmitter(), async () => {
      await assert.rejects(transport.fetch(url), { code: 'LOCAL_YCLIENTS_READ_REFUSED' });
      await assert.rejects(transport.fetch('https://api.yclients.com/api/v1/book_staff/424242'));
    });
    assert.equal(transport.counters.calls, 1);
  }
});

test('closed count encoding distinguishes missing/null/number/string without retaining any provider value', async () => {
  for (const [value, encoding] of [[undefined, 'missing'], [null, 'null'], [-2, 'invalid_number'], ['PRIVATE_TOTAL', 'invalid_string'], [true, 'other'], ['3', 'decimal_string'], [3, 'number']]) {
    const body = payload(); if (value === undefined) delete body.meta.total_count; else body.meta.total_count = value;
    const events = [], transport = createReadTransport(async () => new Response(JSON.stringify(body)), async () => 424242, Date.now, createReadTrace(e => events.push(e)));
    // Missing totals at the deprecated endpoint still have no whole-collection proof.
    const source = value === undefined ? 'https://api.yclients.com/api/v1/staff/424242' : url;
    await transport.run(request(), new EventEmitter(), () => assert.rejects(transport.fetch(source)));
    assert.equal(events.at(-1).teamCountEncoding, encoding);
    assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  }
});

test('count encoding is context-bound, finite and survives launcher receipt persistence', async () => {
  const event = { type: 'read-trace', contract: 'maya.local-yclients-read-trace/1', sequence: 1, elapsedMs: 1, surface: 'provider', route: 'team', method: 'GET', stage: 'completed', status: 200, code: 'provider_response_read', teamCountEncoding: 'decimal_string' };
  assert.deepEqual(projectReadTrace(event), event);
  for (const change of [{ teamCountEncoding: 'PRIVATE_RAW' }, { teamCountEncoding: 2 }, { totalCount: 2 }, { stage: 'entered' }, { route: 'companies' }, { surface: 'http' }, { status: null }, { status: 400 }]) assert.equal(projectReadTrace({ ...event, ...change }), null);
  const d = createDiagnostic(false); let saved;
  const o = runtimeObserver(d, { origin: 'http://127.0.0.1:55432', providerAdmission: 'explicit_setup_reads_only' }, () => { saved = JSON.parse(JSON.stringify(d)); });
  o.accept(event);
  assert.equal(saved.readTrace[0].teamCountEncoding, 'decimal_string');
  assert.equal(saved.readTraceLimitReached, false);
});
