// Synthetic provider only. No owner state, real credential or network.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createReadTransport, validateTeamResponse } from './local-yclients-read-transport.mjs';
import { createReadTrace, projectReadTrace } from './local-yclients-read-status.mjs';

const complete = () => ({ success: true, data: [{ id: 1, company_id: 424242 }, { id: 2, company_id: 424242 }], meta: { total_count: 2 } });
const request = () => ({ method: 'POST', originalUrl: '/api/integrations/crm/connect', user: { tenantId: 'synthetic', userId: 'owner', membershipStatus: 'active' } });
const cases = [
  ['non-object', () => null, ['payload_shape']],
  ['unconfirmed success', p => ({ ...p, success: 1 }), ['success_unconfirmed']],
  ['non-array', p => ({ ...p, data: {} }), ['data_shape']],
  ['over limit', p => ({ ...p, data: Array.from({ length: 51 }, (_, i) => ({ id: i + 1 })), meta: { total_count: 51 } }), ['member_limit']],
  ['pagination', p => ({ ...p, pagination: {} }), ['pagination_present']],
  ['missing meta', p => ({ ...p, meta: undefined }), ['meta_shape']],
  ['array meta', p => ({ ...p, meta: [] }), ['meta_shape']],
  ['empty meta', p => ({ ...p, meta: {} }), ['total_count_type']],
  ['nondecimal string total', p => ({ ...p, meta: { total_count: '2.0' } }), ['total_count_type']],
  ['total mismatch', p => ({ ...p, meta: { total_count: 3 } }), ['total_count_mismatch']],
  ['count mismatch', p => ({ ...p, meta: { total_count: 2, count: 3 } }), ['count_mismatch']],
  ['non-first page', p => ({ ...p, meta: { total_count: 2, page: 2 } }), ['page_not_first']],
  ['extra meta', p => ({ ...p, meta: { total_count: 2, PRIVATE_METADATA: 'PRIVATE_VALUE' } }), ['unknown_meta_fields']],
  ['invalid id', p => ({ ...p, data: [{ id: 'PRIVATE_ID' }, { id: 2 }] }), ['invalid_staff_id']],
  ['duplicate id', p => ({ ...p, data: [{ id: 1 }, { id: 1 }] }), ['duplicate_staff_id']],
  ['foreign company', p => ({ ...p, data: [{ id: 1, company_id: 424243 }, { id: 2 }] }), ['foreign_company']],
  ['combined faults', p => ({ ...p, pagination: {}, data: [{ id: 1, company_id: 424243 }, { id: 1 }], meta: { total_count: 3, page: 2, PRIVATE_METADATA: 'PRIVATE_VALUE' } }), ['pagination_present', 'unknown_meta_fields', 'total_count_mismatch', 'page_not_first', 'duplicate_staff_id', 'foreign_company']],
];
for (const [name, change, issues] of cases) test(`team refusal diagnosis: ${name}; original denial and no fallback preserved`, async () => {
  const payload = change(complete());
  if (payload?.data?.[0]) Object.assign(payload.data[0], { name: 'PRIVATE_NAME', phone: 'PRIVATE_PHONE', email: 'PRIVATE_EMAIL', token: 'PRIVATE_TOKEN' });
  const events = [];
  const transport = createReadTransport(async () => new Response(JSON.stringify(payload), { status: 200 }), async () => 424242, Date.now, createReadTrace(e => events.push(e)));
  assert.throws(() => validateTeamResponse(payload, new Headers(), 424242));
  await transport.run(request(), new EventEmitter(), async () => {
    await assert.rejects(transport.fetch('https://api.yclients.com/api/v1/company/424242/staff'), { code: 'LOCAL_YCLIENTS_READ_REFUSED' });
    await assert.rejects(transport.fetch('https://api.yclients.com/api/v1/staff/424242'));
  });
  const refusal = events.find(e => e.route === 'team' && e.stage === 'refused');
  assert.equal(refusal.code, 'provider_scope_refused');
  assert.deepEqual(refusal.teamIssues, issues);
  assert.equal(transport.counters.calls, 1);
  assert.equal(events.filter(e => e.stage === 'entered').length, 1);
  assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  assert.equal(events.at(-1).teamIssues, undefined);
});

test('valid team still passes unchanged; failed observer changes neither acceptance nor denial', async () => {
  for (const valid of [true, false]) {
    const payload = complete(); if (!valid) payload.meta = {};
    const transport = createReadTransport(async () => new Response(JSON.stringify(payload)), async () => 424242, Date.now, () => { throw Error('PRIVATE_OBSERVER'); });
    await transport.run(request(), new EventEmitter(), async () => {
      const promise = transport.fetch('https://api.yclients.com/api/v1/company/424242/staff');
      if (valid) assert.deepEqual(await (await promise).json(), payload);
      else await assert.rejects(promise, { code: 'LOCAL_YCLIENTS_READ_REFUSED' });
    });
    assert.equal(transport.counters.calls, 1);
    assert.equal(transport.counters.refused, valid ? 0 : 1);
  }
});

test('team diagnostic projection refuses raw values, extra keys, duplicates and wrong event context', () => {
  const event = { type: 'read-trace', contract: 'maya.local-yclients-read-trace/1', sequence: 1, elapsedMs: 1, surface: 'provider', route: 'team', method: 'GET', stage: 'refused', status: 200, code: 'provider_scope_refused', teamIssues: ['meta_shape'] };
  assert.deepEqual(projectReadTrace(event), event);
  const projected = projectReadTrace(event); event.teamIssues.push('PRIVATE_RAW');
  assert.deepEqual(projected.teamIssues, ['meta_shape']);
  for (const changed of [
    { teamIssues: ['PRIVATE_RAW'] }, { teamIssues: [] }, { teamIssues: ['meta_shape', 'meta_shape'] },
    { teamIssues: ['foreign_company', 'meta_shape'] }, { teamIssues: { meta_shape: 'PRIVATE_RAW' } },
    { body: 'PRIVATE_RAW' }, { surface: 'http' }, { route: 'company' }, { stage: 'completed' },
    { status: null }, { status: 400 }, { code: 'provider_transport_unavailable' },
  ]) assert.equal(projectReadTrace({ ...projected, ...changed }), null);
});

test('pagination headers are diagnosed without exposing header values', async () => {
  for (const header of ['link', 'content-range']) {
    const events = [];
    const transport = createReadTransport(async () => new Response(JSON.stringify(complete()), { headers: { [header]: 'PRIVATE_HEADER' } }), async () => 424242, Date.now, createReadTrace(e => events.push(e)));
    await transport.run(request(), new EventEmitter(), () => assert.rejects(transport.fetch('https://api.yclients.com/api/v1/company/424242/staff')));
    assert.deepEqual(events.at(-1).teamIssues, ['pagination_present']);
    assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  }
});
