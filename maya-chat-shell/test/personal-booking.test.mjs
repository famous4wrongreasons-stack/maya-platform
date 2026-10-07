import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalBooking } from '../src/shell/personal-booking.ts';
import { projectPersonalBranches, projectPersonalPreview, projectPersonalResults } from '../src/net/personal.ts';
import { createTransport } from '../src/net/client.ts';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const ok = (value) => ({ ok: true, value });
const start = '2026-10-15T09:00:00.000Z';
const preview = { factsHash: 'a'.repeat(64), services: [{ name: 'Стрижка', price: 1000, currency: 'RUB', durationMinutes: 30 }], staff: 'Мастер', start, timezone: 'Europe/Moscow', source: 'internal', asOf: '2026-10-07T00:00:00Z', existing: false, requestState: null };
const empty = { results: [], hasPending: false, hasMore: false };
function setup(branches = []) {
  let shell = { fullscreen: null }, signedIn = true, result = empty, exact = preview;
  const ws = new Set(), ss = new Set(), calls = [];
  const transport = {
    personalBranches: async () => ok(branches),
    personalServices: async () => ok([{ id: 'service', name: 'Стрижка' }, { id: 'service2', name: 'Борода' }]),
    personalStaff: async () => ok([{ id: 'staff', name: 'Мастер' }, { id: 'staff2', name: 'Другой мастер' }]),
    personalSlots: async (date, serviceId, staffId, signal, branchId) => { calls.push(['slots', { date, serviceId, staffId, branchId }]); return ok([{ start, staffId: 'staff', branchId: 'branch' }]); },
    personalPreview: async (s) => { calls.push(['preview', structuredClone(s)]); return ok(exact); },
    personalResults: async () => { calls.push(['results']); return ok(result); },
    personalCreate: async (s) => { calls.push(['create', structuredClone(s)]); return ok(true); },
  };
  const widgets = { view: () => shell, subscribe: (l) => { ws.add(l); return () => ws.delete(l); } };
  const session = { view: () => ({ signedIn }), subscribe: (l) => { ss.add(l); return () => ss.delete(l); } };
  const port = createPersonalBooking({ transport, widgets, session, newAbort: () => new AbortController() });
  const show = (receiver = 'personal_booking') => { shell = { fullscreen: { phase: 'open', itemId: 'child', receiver } }; for (const l of ws) l(shell); };
  const close = () => { shell = { fullscreen: null }; for (const l of ws) l(shell); };
  return { port, transport, calls, show, close, result(v) { result = v; }, exact(v) { exact = v; }, signOut() { signedIn = false; for (const l of ss) l({ signedIn }); } };
}
async function ready(f) {
  f.show(); await flush();
  f.port.chooseService('service'); f.port.chooseStaff('staff'); f.port.date('2026-10-15');
  await f.port.slots(); await f.port.preview(0);
  assert.equal(f.port.view().phase, 'preview');
}
test('only admitted personal child opens; closing/sign-out/expiry invalidation drops form and ignores late reads', async () => {
  const f = setup(); f.show(undefined); // default is personal: first close before response
  f.close(); await flush(); assert.equal(f.port.view().phase, 'closed');
  f.show('other'); await flush(); assert.equal(f.port.view().phase, 'closed');
  f.show(); await flush(); assert.equal(f.port.view().phase, 'choose');
  f.signOut(); assert.equal(f.port.view().phase, 'closed'); f.port.dispose();
});
test('selection invalidates preview, unknown choices cannot alter it, confirmation requires a fresh preview', async () => {
  const f = setup(); await ready(f);
  f.port.chooseService('foreign'); assert.equal(f.port.view().phase, 'preview');
  f.port.date('2026-10-16'); assert.equal(f.port.view().preview, null);
  await f.port.confirm(); assert.equal(f.calls.filter(c => c[0] === 'create').length, 0); f.port.dispose();
});
test('explicit branch selection preserves all other choices, filters exact branch and binds preview/create', async () => {
  const branches = [{ id: 'branch', name: 'Первый', timezone: 'Europe/Moscow' }, { id: 'branch2', name: 'Второй', timezone: 'Asia/Yekaterinburg' }];
  const f = setup(branches); f.show(); await flush();
  f.port.chooseService('service'); f.port.chooseStaff('staff'); f.port.date('2026-10-15');
  await f.port.slots(); assert.equal(f.calls.some((c) => c[0] === 'slots'), false);
  f.port.chooseBranch('foreign'); assert.equal(f.port.view().branchId, '');
  f.port.chooseBranch('branch');
  f.transport.personalSlots = async (date, serviceId, staffId, signal, branchId) => {
    f.calls.push(['slots', { date, serviceId, staffId, branchId }]);
    return ok([{ start, staffId: 'staff', branchId: null }, { start, staffId: 'staff', branchId: 'branch2' }, { start, staffId: 'staff2', branchId: 'branch' }, { start, staffId: 'staff', branchId: 'branch' }]);
  };
  await f.port.slots(); assert.deepEqual(f.calls.find((c) => c[0] === 'slots')[1], { date: '2026-10-15', serviceId: 'service', staffId: 'staff', branchId: 'branch' });
  assert.equal(f.port.view().slots.length, 1); assert.match(f.port.view().notice, /Europe\/Moscow/);
  await f.port.preview(0); assert.equal(f.calls.find((c) => c[0] === 'preview')[1].branchId, 'branch');
  f.port.chooseBranch('foreign'); assert.equal(f.port.view().phase, 'preview');
  f.port.chooseBranch('branch2');
  assert.equal(f.port.view().preview, null); assert.equal(f.port.view().slots.length, 0);
  assert.deepEqual([f.port.view().branchId, f.port.view().serviceId, f.port.view().staffId, f.port.view().date], ['branch2', 'service', 'staff', '2026-10-15']);
  await f.port.confirm(); assert.equal(f.calls.some((c) => c[0] === 'create'), false);
  f.port.chooseService('service2'); assert.deepEqual([f.port.view().branchId, f.port.view().staffId, f.port.view().date], ['branch2', 'staff', '2026-10-15']);
  f.port.chooseStaff('staff2'); assert.deepEqual([f.port.view().branchId, f.port.view().serviceId, f.port.view().date], ['branch2', 'service2', '2026-10-15']);
  f.port.date('2026-10-16'); assert.deepEqual([f.port.view().branchId, f.port.view().serviceId, f.port.view().staffId], ['branch2', 'service2', 'staff2']);
  f.port.chooseBranch('branch'); f.port.chooseService('service'); f.port.chooseStaff('staff'); await f.port.slots(); await f.port.preview(0);
  await f.port.confirm(); assert.equal(f.calls.find((c) => c[0] === 'create')[1].branchId, 'branch'); f.port.dispose();
});
test('empty branch list preserves unscoped flow; selected unbound branch surfaces server failure without dispatch', async () => {
  const f = setup(); await ready(f);
  assert.equal(f.calls.find((c) => c[0] === 'slots')[1].branchId, undefined); f.port.dispose();
  const g = setup([{ id: 'unbound', name: 'Филиал без привязки', timezone: null }]);
  g.show(); await flush(); g.port.chooseBranch('unbound'); g.port.chooseService('service'); g.port.chooseStaff('staff'); g.port.date('2026-10-15');
  g.transport.personalSlots = async () => ({ ok: false, failure: { reason: 'branch_unavailable' } });
  await g.port.slots(); await g.port.confirm();
  assert.equal(g.port.view().phase, 'unavailable'); assert.match(g.port.view().notice, /Источник записи для выбранного филиала недоступен/);
  assert.equal(g.calls.some((c) => c[0] === 'create' || c[0] === 'preview'), false); g.port.dispose();
});
test('branch projection keeps only server list display fields and rejects invalid/duplicate zones or identities', () => {
  const valid = { id: 'branch', name: 'Филиал', timezone: 'Europe/Moscow' };
  assert.deepEqual(projectPersonalBranches([{ ...valid, tenant_id: 'PRIVATE', phone: 'PRIVATE', address: 'PRIVATE', provider: 'PRIVATE' }]), [valid]);
  assert.deepEqual(projectPersonalBranches([{ ...valid, timezone: null }]), [{ ...valid, timezone: null }]);
  assert.equal(projectPersonalBranches([{ ...valid, timezone: 'not/a-zone' }]), null);
  assert.equal(projectPersonalBranches([valid, valid]), null);
  assert.equal(projectPersonalBranches([{ ...valid, id: '' }]), null);
});
test('double confirmation sends exact frozen selection once; only same canonical selection SUCCEEDED confirms', async () => {
  const f = setup(); await ready(f); f.exact({ ...preview, existing: true, requestState: 'SUCCEEDED' });
  await Promise.all([f.port.confirm(), f.port.confirm()]);
  assert.deepEqual(f.calls.find(c => c[0] === 'create')[1], { staffId: 'staff', serviceIds: ['service'], start, branchId: 'branch', previewFactsHash: preview.factsHash });
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
  assert.equal(f.port.view().notice, 'Запись подтверждена.'); f.port.dispose();
});
test('unrelated success cannot confirm UNKNOWN; refresh and recreated runtime never dispatch', async () => {
  const f = setup(); await ready(f); f.exact({ ...preview, existing: true, requestState: 'UNKNOWN' });
  f.result({ results: [{ id: 'other', state: 'SUCCEEDED' }], hasPending: true, hasMore: false });
  f.transport.personalCreate = async () => { f.calls.push(['create']); return { ok: false, failure: { reason: 'unknown' } }; };
  await f.port.confirm(); await f.port.confirm(); await f.port.refresh();
  assert.match(f.port.view().notice, /не подтверждён/); assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
  f.close(); f.show(); await flush(); await f.port.confirm();
  assert.equal(f.port.view().phase, 'outcome'); assert.equal(f.calls.filter(c => c[0] === 'create').length, 1); f.port.dispose();
  const restarted = setup(); restarted.result({ ...empty, hasPending: true }); restarted.show(); await flush(); await restarted.port.confirm();
  assert.equal(restarted.port.view().phase, 'outcome'); assert.equal(restarted.calls.some(c => c[0] === 'create'), false); restarted.port.dispose();
});
test('revocation at preview prevents create; a pending older result blocks new booking even outside page', async () => {
  const f = setup(); f.result({ ...empty, hasPending: true }); f.show(); await flush();
  assert.equal(f.port.view().phase, 'outcome'); assert.equal(f.port.view().services.length, 0); f.port.dispose();
  const g = setup(); g.show(); await flush(); g.port.chooseService('service'); g.port.chooseStaff('staff'); g.port.date('2026-10-15'); await g.port.slots();
  g.transport.personalPreview = async () => ({ ok: false, failure: { reason: 'forbidden' } }); await g.port.preview(0); await g.port.confirm();
  assert.equal(g.port.view().phase, 'unavailable'); assert.equal(g.calls.some(c => c[0] === 'create'), false); g.port.dispose();
});
test('wire projection rejects malformed pending/result states and strips private preview extras', () => {
  assert.equal(projectPersonalResults({ contract: 'maya.personal-booking.results/1', results: [{ id: 'a', state: 'UNKNOWN', recordedAt: start }], hasPending: false, hasMore: false }), null);
  const value = projectPersonalPreview({ ...preview, contract: 'maya.personal-booking.preview/1', availability: 'available_at_read', clientPhone: 'PRIVATE', clientId: 'PRIVATE' });
  assert.ok(value); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});
test('fixed personal wire adds literal header only on personal routes, encodes query and drops identity fields', async () => {
  const calls = [], savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return new Response(JSON.stringify(url.includes('results') ? { contract: 'maya.personal-booking.results/1', ...empty } : []), { status: 200 }); };
  try {
    const net = createTransport({ authorize: async () => ({ kind: 'bearer', bearer: 'synthetic', serial: 1 }) });
    const signal = new AbortController().signal;
    await net.personalServices(signal); await net.personalStaff(signal); await net.personalResults(signal);
    await net.personalSlots('2026-10-15', 's&clientId=foreign', 'p', signal, 'b&tenantId=foreign');
    await net.personalPreview({ staffId: 'p', serviceIds: ['s'], start, role: 'admin', clientId: 'foreign', clientPhone: 'PRIVATE' }, signal);
    await net.personalCreate({ staffId: 'p', serviceIds: ['s'], start, role: 'admin' }, signal);
    assert.equal(calls[0].headers['X-Maya-Authority-Context'], undefined);
    assert.equal(calls[2].headers['X-Maya-Authority-Context'], 'personal_client');
    assert.match(calls[3].url, /serviceIds=s%26clientId%3Dforeign/);
    assert.match(calls[3].url, /branchId=b%26tenantId%3Dforeign/);
    assert.deepEqual(JSON.parse(calls[4].body), { staffId: 'p', serviceIds: ['s'], start });
    assert.deepEqual(JSON.parse(calls[5].body), { staffId: 'p', serviceIds: ['s'], start });
    assert.equal(calls.filter(c => c.method === 'POST').length, 2);
    await net.personalBranches(signal);
    assert.equal(calls[6].url, '/api/branches'); assert.equal(calls[6].method, 'GET'); assert.equal(calls[6].body, null);
    assert.equal(calls[6].headers.Authorization, 'Bearer synthetic'); assert.equal(calls[6].headers['X-Maya-Authority-Context'], undefined);
  } finally { globalThis.fetch = savedFetch; }
});
test('forbidden at result read clears prior private facts even after exact succeeded', async () => {
  const f = setup(); await ready(f); f.exact({ ...preview, existing: true, requestState: 'SUCCEEDED' });
  f.transport.personalResults = async () => ({ ok: false, failure: { reason: 'forbidden' } });
  await f.port.confirm();
  assert.equal(f.port.view().phase, 'unavailable'); assert.equal(f.port.view().results, null); assert.equal(f.port.view().preview, null);
  assert.equal(f.port.view().services.length, 0); assert.doesNotMatch(f.port.view().notice, /Запись подтверждена/); f.port.dispose();
});
test('material fact refusal stays distinct from unknown after a transport or provider failure', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const transport = createTransport({ authorize: async () => ({ kind: 'bearer', bearer: 'synthetic', serial: 1 }) });
    const selected = { staffId: 'p', serviceIds: ['s'], start, previewFactsHash: preview.factsHash };
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'booking_service_facts_unavailable' } }), { status: 503 });
    assert.deepEqual(await transport.personalCreate(selected, new AbortController().signal), { ok: false, failure: { reason: 'facts_unavailable' } });
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'booking_branch_source_unavailable' } }), { status: 503 });
    assert.deepEqual(await transport.personalSlots('2026-10-15', 's', 'p', new AbortController().signal, 'branch'), { ok: false, failure: { reason: 'branch_unavailable' } });
    assert.deepEqual(await transport.personalCreate(selected, new AbortController().signal), { ok: false, failure: { reason: 'branch_unavailable' } });
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'crm_outcome_unknown' } }), { status: 503 });
    assert.deepEqual(await transport.personalCreate(selected, new AbortController().signal), { ok: false, failure: { reason: 'unknown' } });
  } finally { globalThis.fetch = originalFetch; }
});
